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
