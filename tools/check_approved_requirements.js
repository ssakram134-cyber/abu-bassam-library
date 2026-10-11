'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const contract = read('docs/FEATURE-EXPANSION-2026-10-11.md');
const decisions = read('docs/APPROVED-DECISIONS-UNIFIED-2026-10-12.md');
const master = read('docs/PROJECT-MASTER-SPEC.md');
const agents = read('AGENTS.md');

const range = (start, end) => Array.from({length:end-start+1},(_,i)=>start+i);
function section(startHeader, endHeader) {
  const begin = contract.indexOf(startHeader);
  assert.ok(begin >= 0, 'missing section: ' + startHeader);
  const end = contract.indexOf(endHeader, begin+startHeader.length);
  assert.ok(end > begin, 'missing end header: ' + endHeader);
  return contract.slice(begin+startHeader.length, end);
}
function listNumbers(src) {
  return [...src.matchAll(/^(\d{1,3})\.\s+\S.+$/gm)].map(m=>Number(m[1]));
}
assert.deepEqual(listNumbers(section('## الأساسيات الإحدى عشرة المعتمدة','## تفاصيل الميزات المعتمدة سابقاً 1–100')),range(1,11),'missing/duplicate/reordered core requirement');
assert.deepEqual(listNumbers(section('## تفاصيل الميزات المعتمدة سابقاً 1–100','# الميزات الإضافية المعتمدة 101–200')),range(1,100),'missing/duplicate/reordered approved 1–100');
assert.deepEqual(listNumbers(section('# الميزات الإضافية المعتمدة 101–200','## قواعد إلزامية للتنفيذ')),range(101,200),'missing/duplicate/reordered approved 101–200');
assert.ok(contract.includes('مستند متطلبات وليس تنفيذًا برمجياً'),'requirements cannot be called implemented');
for (const token of ['ssakram134-cyber/abu-bassam-library','akramy1992/abu-bassam-library','30 يوماً','Supabase','211']) {
  assert.ok(decisions.includes(token),'missing additional approved policy: '+token);
}
for (const token of ['docs/FEATURE-EXPANSION-2026-10-11.md','docs/APPROVED-DECISIONS-UNIFIED-2026-10-12.md','ssakram134-cyber/abu-bassam-library']) {
  assert.ok(master.includes(token),'master must reference binding approved source: '+token);
  assert.ok(agents.includes(token),'AGENTS must reference binding approved source: '+token);
}
const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.main,'index-auth.js','preserve working authenticated entrypoint');
assert.ok(fs.existsSync(path.join(root,'index-auth.js')),'do not drop authentication entrypoint');
assert.ok(fs.existsSync(path.join(root,'web/vault-search-utils.js')),'search engine transferred');
assert.ok(fs.existsSync(path.join(root,'tools/check_vault_search.js')),'search tests transferred');
assert.ok(pkg.scripts['check:web'].includes('tools/check_vault_search.js'),'search verification must be registered');
console.log('Approved feature contract passed: 11 core + 200 numbered requirements; canonical repo, supplementary policies, auth entrypoint and search intact.');
