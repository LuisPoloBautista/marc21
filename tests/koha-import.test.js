import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../docs/koha-staff-integration.js', import.meta.url),'utf8');
function helpers(document = {}) {
  const context = {document};
  const fragment = source.slice(source.indexOf('  function dispatchValue'),source.indexOf('  function importRecord'));
  vm.runInNewContext(fragment+';globalThis.helpers={occurrences,editorForSubfield};',context);
  return context.helpers;
}
test('Koha import excludes managed control fields and includes 883', () => {
  const rows = helpers().occurrences({leader:'leader','001':'id','005':'date','008':'data','245':{a:'Title'},'883':{u:'old-id'}});
  assert.equal(Array.from(rows,r=>r.tag).join(','),'000,008,245,883');
});
test('000 and 008 can use their actual editor without a hidden code input', () => {
  const editor = {value:''};
  for (const tag of ['000','008']) {
    const node = {querySelector: selector => selector === 'input.input_marceditor, textarea.input_marceditor, select.input_marceditor' ? editor : null};
    assert.equal(helpers().editorForSubfield(node,tag,'@'),editor);
  }
});
test('missing 040 b does not accidentally select another subfield', () => {
  const node = {querySelector: () => null};
  assert.equal(helpers().editorForSubfield(node,'040','b'),null);
});
