'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { validateExternalScript } = require('./check_html_scripts.js');
const root = path.resolve(__dirname,'..');
const html = path.join(root,'web','index.html');
const project = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const actual = fs.readFileSync(html,'utf8');
const match = actual.match(/<script\b[^>]*\bsrc=["']([^"']+)["']/i);
assert.ok(match,'index.html must refer to at least one external local script');
assert.ok(fs.existsSync(validateExternalScript(html,match[1])),'Current local asset must resolve');
for (const bad of ['missing-script-that-does-not-exist.js','../tools/check_project.js','https://cdn.example.net/library.js','javascript:alert(1)']) {
  assert.throws(()=>validateExternalScript(html,bad),undefined,'Unsafe or absent HTML script should fail: '+bad);
}
const validator = fs.readFileSync(path.join(root,'tools','validate_imported_source.js'),'utf8');
assert.ok(!validator.includes("'web/fail-closed-runtime.js'"),'Validator must not require deleted fail-closed patch runtime');
assert.ok(!validator.includes("const repair=String(pkg.scripts?.['repair:source']"),'Validator must not depend on obsolete source repair');
for (const marker of ["'web/secure-sync-runtime.js'","'web/app-security-runtime.js'","'await loadSecurity();'","'await loadBranchVault();'","'VAULT_GATEWAY_NOT_READY'"]) {
  assert.ok(validator.includes(marker),'Current fail-closed source requirement absent: '+marker);
}
assert.ok(String(project.scripts?.['check:web']||'').includes('node tools/check_tools_audit.js'),'Tool regression must be part of checks');
console.log('Tools audit checks passed: local HTML scripts exist, remote/traversal references blocked, and ZIP import validator uses current fail-closed security layout.');
