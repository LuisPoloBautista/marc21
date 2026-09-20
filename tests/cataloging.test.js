import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StructuringAgent } from '../src/agents/structuring-agent.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectEvidence, compactEvidence, usableText } from '../src/core/evidence.js';
import { buildStructuringPrompt } from '../src/core/prompt-builder.js';
import { cleanLlmOutput } from '../src/core/llm-parser.js';
import { buildMarcRecord } from '../src/core/marc-builder.js';

test('finds evidence beyond initial pages and retains final scanned pages', () => {
  const pages = Array.from({length:100}, (_,i) => ({page:i+1,text:''}));
  pages[49].text = 'ISBN 9781234567897 Editorial Universidad © 2020 Segunda edición';
  const selected = selectEvidence(pages);
  assert.ok(selected.some(p => p.page === 50));
  assert.ok(selected.some(p => p.page === 100));
  assert.ok(selected.length <= 10);
  assert.equal(usableText(''), false);

});
test('context budget retains evidence from the tenth text page', () => {
  const raw = Array.from({length:10},(_,i)=>`[Página ${i+1}]\n`+'Datos '.repeat(2000)).join('\n');
  const packed = compactEvidence(raw);
  assert.ok(packed.length <= 18000);
  assert.ok(packed.includes('[Página 10]'));
});
test('no invented dates, edition, extent, agency, thesaurus or classification', () => {
  const metadata = cleanLlmOutput({title:'Historia',author:[],subjects:['Historia'],pages:'xii, 126',year:null}, 'Copyright 1999. Segunda reimpresión. 300 p.', {pageCount:350,formatType:'thesis'});
  assert.equal(metadata.year,null);
  assert.equal(metadata.pages,'xii, 126');
  assert.equal(metadata.edition,undefined);
  const marc = buildMarcRecord(metadata,{pageCount:350,formatType:'thesis'});
  assert.match(marc['300'].a,/xii, 126/);
  assert.equal(marc['040'].a,undefined);
  assert.equal(marc['050'],undefined);
  assert.equal(marc['082'],undefined);
  assert.ok(!JSON.stringify(marc).includes('embnm'));
  assert.equal(marc['650'][0].ind2,'4');
});
test('preserves material-specific metadata and analytic pagination', () => {
  const metadata = {title:'Capítulo',author:['Ana Pérez'],hostTitle:'Libro',pages:'115-130',isbn:'9781234567897',edition:'Segunda edición',degree:'Doctorado',institution:'Universidad',meetingName:'Congreso'};
  const chapter = buildMarcRecord(metadata,{formatType:'chapter',pageCount:16});
  assert.equal(chapter['020'],undefined);
  assert.ok(chapter['773']);
  assert.match(chapter['300'].a,/115-130/);
  assert.ok(buildMarcRecord(metadata,{formatType:'thesis'})['502']);
  assert.ok(buildMarcRecord(metadata,{formatType:'proceedings'})['111']);
  assert.ok(buildStructuringPrompt('', 'spa','thesis').includes('degree, institution, advisor'));
  assert.ok(!buildStructuringPrompt('', 'spa','book').split('Valores:')[0].includes('hostTitle'));
});
test('API includes all OCR batches and verifies source-specific citations', async () => {
  const originalFetch = globalThis.fetch;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'marc-api-test-'));
  process.env.METRICS_FILE = path.join(temp, 'metrics.json');
  process.env.LIBRARY_RECORD_LIMIT = '1';
  process.env.PORT = '0'; process.env.OPENAI_API_KEY = 'test-only';
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.openai.com/')) return originalFetch(url,options);
    const body = JSON.parse(options.body);
    const content = body.input[0].content;
    const prompt = content[0].text;
    calls++;
    let response;
    if (content.some(c=>c.type==='input_image')) {
      const labels = prompt.split('Imágenes en orden: ')[1];
      response = labels.split(', ').map(label=>label+'\nEditorial de prueba').join('\n');
    } else {
      assert.ok(prompt.includes('[Imagen 5]'));
      response = JSON.stringify({title:'Prueba',publisher:'Editorial de prueba',author:[],evidence:{publisher:{source:'Imagen 5',quote:'Editorial de prueba',status:'observed'},title:{source:'Imagen 1',quote:'Cita inventada',status:'observed'}}});
    }
    return new Response(JSON.stringify({output_text:response,usage:{input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:10}}}),{status:200});
  };
  const {server} = await import('../server.js');
  try {
    if (!server.listening) await new Promise(resolve=>server.once('listening',resolve));
    const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/extract-metadata`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format:'book',images:Array.from({length:5},(_,i)=>({label:`Imagen ${i+1}`,data:'aGVsbG8='}))})});
    const result = await response.json();
    assert.equal(response.status,200,JSON.stringify(result));
    assert.equal(calls,3);
    assert.equal(result.source.evidence.publisher.verified,true);
    assert.equal(result.source.evidence.title.verified,false);
    assert.equal(result.metrics.completed,1);
    assert.equal(result.metrics.inputTokens,300);
    assert.equal(result.metrics.outputTokens,60);
    assert.equal(result.metrics.cachedTokens,30);
    assert.match(result.result['883'].u,/^urn:uuid:/);
    assert.ok(result.source._provenance.id);
    assert.ok(result.metrics.recent[0].id);
    const base = `http://127.0.0.1:${server.address().port}`;
    const send = (endpoint, body) => originalFetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const reformatted = await send('/api/format',{source:result.source});
    assert.deepEqual((await reformatted.json()).result['883'],result.result['883']);
    assert.equal((await send('/api/extract-metadata',{text:'Nuevo libro'})).status,429);
    assert.equal((await send('/api/extract-metadata',{text:'Libro',images:Array.from({length:6},()=>({data:'x'}))})).status,400);
    assert.equal((await send('/api/extract-metadata',{text:'Libro',previous:result.source,missing:['year']})).status,400);
    assert.equal((await send('/api/ocr',{images:[{data:'x'}]})).status,410);
    const snapshot = await (await originalFetch(base+'/api/metrics')).json();
    assert.equal(snapshot.completed,1);
    assert.equal(snapshot.totalTokens,360);
    assert.equal(snapshot.remaining,0);
    assert.equal(calls,3);
  } finally { globalThis.fetch=originalFetch; await new Promise(resolve=>server.close(resolve)); fs.rmSync(temp,{recursive:true,force:true}); }
});

test('initial search without evidence reports actionable error without repeated costs', async () => {
  let calls = 0;
  const agent = new StructuringAgent({generate: async () => { calls++; return {response:'{"title":null,"author":[],"evidence":{}}'}; }});
  await assert.rejects(agent.structure('Página sin datos bibliográficos'), {code:'NO_BIBLIOGRAPHIC_EVIDENCE'});
  assert.equal(calls, 1);
});
test('unrecognized nested response is not silently accepted as empty evidence', async () => {
  let calls = 0;
  const agent = new StructuringAgent({generate: async () => { calls++; return {response: calls === 1 ? '{"metadata":{"title":"Libro"}}' : '{"title":"Libro"}'}; }});
  const result = await agent.structure('Libro');
  assert.equal(result.metadata.title,'Libro');
  assert.equal(calls,2);
});

test('copyright year fills missing year without replacing publication year', () => {
  const ev = {source:'Página 2',quote:'Copyright Year 2021',status:'observed'};
  const source = {copyrightYear:'2021',evidence:{copyrightYear:ev}};
  const fallback = cleanLlmOutput(structuredClone(source),'Copyright Year 2021');
  assert.equal(fallback.year,'2021');
  assert.equal(fallback.evidence.year.basis,'copyright');
  assert.equal(cleanLlmOutput({...source,year:'2023'},'').year,'2023');
});
test('all summaries have strict 100 word cap even with an abstract', () => {
  const long = Array.from({length:140},(_,i)=>`word${i}`).join(' ');
  const generated = cleanLlmOutput({notes:long,notesKind:'generated'},'');
  assert.equal(generated.notes.split(/\s+/).length,100);
  assert.equal(generated.evidence.notes.status,'proposed');
  const original = cleanLlmOutput({notes:long,notesKind:'transcribed',evidence:{notes:{source:'Página 1'}}},'Abstract\n'+long);
  assert.equal(original.notes.split(/\s+/).length,100);
  assert.equal(original.evidence.notes.quote,null);
  assert.equal(original.notesKind,'generated');
  assert.equal(buildMarcRecord(original)['520'].a,original.notes);
});
test('Dewey is a subject-based proposal; LC is removed from metadata and MARC', () => {
  const meta = cleanLlmOutput({subjects:['Educación'],dewey:'370',lcClassification:'LB'},'');
  assert.equal(meta.dewey,'370');
  assert.equal(meta.evidence.dewey.status,'proposed');
  assert.equal(meta.lcClassification,undefined);
  const marc = buildMarcRecord({...meta,lcClassification:'LB'});
  assert.equal(marc['050'],undefined);
  assert.equal(marc['082'].a,'370');
  assert.equal(cleanLlmOutput({dewey:'370',subjects:[]},'').dewey,null);
});

test('provenance generates the requested 883 marker', () => {
  const marc = buildMarcRecord({title:'Libro',_provenance:{id:'old-id',date:'2026-01-01',library:'demo'}});
  assert.equal(marc['883'].u,'urn:uuid:old-id');
  assert.equal(marc['883'].a,'Catalogación automática MARC21');
});
