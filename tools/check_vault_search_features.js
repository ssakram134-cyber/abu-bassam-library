'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const file = name => fs.readFileSync(path.join(root, 'web', name), 'utf8');
const lib = file('vault-search-utils.js');
const vault = file('document-vault-runtime.js');
const index = file('index.html');
new vm.Script(lib, { filename: 'vault-search-utils.js' });
new vm.Script(vault, { filename: 'document-vault-runtime.js' });
const ctx = { window: {} };
vm.runInNewContext(lib, ctx);
const { matches, normalize, tokenize } = ctx.window.AbuVaultSearch;
const cases = [
  ['احمد', 'أَحْمَد', 'all', true],
  ['ملاك', 'مــلاك', 'all', true],
  ['07829667521', '٠٧٨٢٩٦٦٧٥٢١', 'all', true],
  ['078', '۰۷۸', 'all', true],
  ['"كتاب رسمي"', 'نسخة كتاب رسمي رقم 12', 'all', true],
  ['"كتاب رسمي"', 'كتاب جديد رسمي', 'all', false],
  ['كتاب رسمي', 'كتاب تعميم رسمي', 'all', true],
  ['كتاب مفقود', 'كتاب تعميم رسمي', 'all', false],
  ['كتاب مفقود', 'كتاب تعميم رسمي', 'any', true],
  ['كتاب -مؤجل', 'كتاب مؤجل رقم 2', 'all', false],
  ['كتاب -"قيد المتابعة"', 'نسخة كتاب قيد المتابعة', 'all', false],
  ['-سري', 'ملف خاص', 'all', true],
  ['-سري', 'ملف سري', 'all', false]
];
for (const [query, value, mode, expected] of cases) {
  assert.equal(matches(query, value, mode), expected, JSON.stringify({ query, value, mode }));
}
assert.equal(normalize('إِسْتِمَارَة ۱۲٣'), 'استمارة 123');
assert.equal(Array.from(tokenize('"كتاب رسمي" -مؤجل')).length, 2);
assert.ok(index.includes('<script src="vault-search-utils.js"></script>'));
assert.ok(index.indexOf('vault-search-utils.js') < index.indexOf('document-vault-runtime.js'));
assert.ok(vault.includes('AbuVaultSearch.matches('), 'vault must actually call new matcher');
assert.ok(vault.includes('id="vSearchMode"'), 'all/any selector must be visible');
console.log('Vault search tests passed: 13 search cases, normalization, quoted phrase/exclusion, all/any mode, load order and integration.');
