import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MetricsStore, newUsage, usageContext, reportUsage } from '../src/core/metrics.js';

test('quota reserves concurrent slots, releases failures and survives restart', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'marc-metrics-test-'));
  try {
    const options = {file:path.join(temp,'metrics.json'),libraryId:'A',limit:1};
    const store = new MetricsStore(options);
    const first = store.reserve();
    assert.throws(()=>store.reserve(),{status:429});
    store.finish(first,{success:false,format:'book',usage:{...newUsage(),inputTokens:100,outputTokens:10,calls:1}});
    assert.equal(store.snapshot().remaining,1);
    const second = store.reserve();
    store.finish(second,{success:true,format:'book',usage:{...newUsage(),inputTokens:50,outputTokens:10,calls:1}});
    store.finish(second,{success:true,format:'book',usage:newUsage()});
    const restarted = new MetricsStore(options);
    assert.equal(restarted.snapshot().completed,1);
    assert.equal(restarted.snapshot().failed,1);
    assert.equal(restarted.snapshot().totalTokens,170);
    assert.throws(()=>restarted.reserve(),{status:429});
    assert.throws(()=>new MetricsStore({...options,libraryId:'B'}));
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
test('usage contexts isolate simultaneous libraries/requests and flag missing usage', async () => {
  const a = newUsage(), b = newUsage();
  await Promise.all([
    usageContext.run(a,async()=>{await Promise.resolve();reportUsage({input_tokens:10,output_tokens:5}); reportUsage(null);}),
    usageContext.run(b,async()=>{await Promise.resolve();reportUsage({input_tokens:20,output_tokens:7});})
  ]);
  assert.equal(a.inputTokens,10); assert.equal(a.unreportedCalls,1);
  assert.equal(b.inputTokens,20); assert.equal(b.outputTokens,7);
});
test('demo has no quota; zero quota blocks before processing', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'marc-quota-test-'));
  try {
    const demo = new MetricsStore({file:path.join(temp,'demo.json')});
    assert.equal(demo.snapshot().limit,null);
    assert.ok(demo.reserve()); assert.ok(demo.reserve());
    const blocked = new MetricsStore({file:path.join(temp,'blocked.json'),limit:0});
    assert.throws(()=>blocked.reserve(),{status:429});
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});

test('book average excludes failed requests and other materials; totals survive retention and restart', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'marc-book-metrics-'));
  try {
    const options = {file:path.join(temp,'metrics.json')};
    const store = new MetricsStore(options);
    const finish = (format,success,inputTokens,outputTokens,usedOcr=false) => store.finish(store.reserve(),{format,success,title:'Prueba',usedOcr,usage:{...newUsage(),inputTokens,outputTokens}});
    finish('book',true,100,20,true); finish('book',true,200,40);
    finish('article',true,1000,100); finish('book',false,10,5);
    let snapshot = store.snapshot();
    assert.equal(snapshot.bookTokens,360);
    assert.equal(snapshot.averageTokensPerBook,180);
    assert.equal(snapshot.averageInputTokensPerBook,150);
    assert.equal(snapshot.averageOutputTokensPerBook,30);
    assert.equal(snapshot.booksWithOcr,1);
    assert.equal(snapshot.ocrBookRate,0.5);
    assert.equal(snapshot.retryRate,0);
    assert.equal(snapshot.failureRate,0.25);
    assert.equal(snapshot.totalTokens,1475);
    assert.equal(snapshot.bookUsageComplete,true);
    assert.equal(snapshot.recent[0].title,'Prueba');
    for (let i=0;i<101;i++) finish('article',true,0,0);
    snapshot = new MetricsStore(options).snapshot();
    assert.equal(snapshot.bookTokens,360);
    assert.equal(snapshot.averageTokensPerBook,180);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
test('legacy migration labels incomplete book history and does not double count', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'marc-legacy-metrics-'));
  try {
    const options = {file:path.join(temp,'metrics.json')};
    const store = new MetricsStore(options);
    store.finish(store.reserve(),{success:true,format:'book',usage:{...newUsage(),inputTokens:10,outputTokens:5}});
    const legacy = JSON.parse(fs.readFileSync(options.file,'utf8'));
    delete legacy.bookUsage; legacy.byType.book=3; legacy.completed=3;
    fs.writeFileSync(options.file,JSON.stringify(legacy));
    const migrated = new MetricsStore(options);
    assert.equal(migrated.snapshot().bookTokens,15);
    assert.equal(migrated.snapshot().bookUsage.count,1);
    assert.equal(migrated.snapshot().bookUsageComplete,false);
    migrated.save();
    assert.equal(new MetricsStore(options).snapshot().bookTokens,15);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
