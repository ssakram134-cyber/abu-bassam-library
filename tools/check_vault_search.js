'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const search = require('../web/vault-search-utils.js');

const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root,'web/index.html'),'utf8');
const vault = fs.readFileSync(path.join(root,'web/document-vault-runtime.js'),'utf8');
const item = {
  name:'كِتاب تأييد مدرسة القادسية رقم ۱۲٥.pdf',
  folder:'الرعاية الاجتماعية',
  notes:'هاتف المراجع: +964 782 966 7521',
  mime:'application/pdf',
  documentNumber:'١٢٥'
};

assert.equal(search.normalize('إِكْرَام ۱۲٣'), 'اكرام 123');
assert.equal(search.normalize('مَدْرَسَة'), 'مدرسه');
assert.equal(search.phone('07829667521'), '07829667521');
assert.equal(search.phone('+9647829667521'), '07829667521');
assert.equal(search.phone('009647829667521'), '07829667521');
assert.equal(search.phone('12345'), '');
for (const q of ['تأييد','الرعايه','125','"مدرسة القادسية"','+9647829667521','07829667521','تأييد مدرسة','تأييد -المحكمه']) {
  assert.equal(search.matches(item,q),true,'expected match: '+q);
}
for (const q of ['تأييد -الرعاية','تأييد لايوجد']) {
  assert.equal(search.matches(item,q),false,'unexpected match: '+q);
}
assert.equal(search.matches({name:'ملف',token:'SECRET_VALUE'},'SECRET_VALUE'),false,'do not index unapproved credential fields');
assert.equal(search.parse('كلمة -مستبعد "عبارة كاملة"').length,3);

const first = shell.indexOf('<script src="vault-search-utils.js"></script>');
const second = shell.indexOf('<script src="document-vault-runtime.js"></script>');
assert.ok(first >= 0 && second > first,'search utility must load before vault');
assert.ok(shell.includes('DocumentVault.openSearch()'),'home search must open vault search');
assert.ok(vault.includes('function openSearch()') && vault.includes('function clearSearch()'),'search controls wired');
assert.ok(vault.includes("typeof engine.matches==='function'"),'matcher is connected to vault');
assert.ok(vault.includes("if(!vaultScopeOk(false)||!vaultAllowed('vaultView'))return []"),'search must respect account/branch permissions');
assert.ok(vault.includes("state.filter==='trash'?item.deleted&&!!item.blob:!item.deleted"),'recycle bin list must be preserved');
assert.ok(vault.includes('function restoreTrash(') && vault.includes('function purgeExpiredTrash('),'recycle bin preservation');
assert.ok(vault.includes('function clearVaultPrivateView()'),'account-change privacy preserved');
new Function(vault);
console.log('Unified Arabic vault search tests passed: query behavior, protected fields, permissions, archive trash, and UI loader.');
