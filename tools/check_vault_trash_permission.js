'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const runtime = fs.readFileSync('web/document-vault-runtime.js', 'utf8');
const start = runtime.indexOf('async function purgeExpiredTrash(){');
const end = runtime.indexOf('\nasync function restoreTrash(', start);
assert.ok(start >= 0 && end > start, 'Canonical trash expiry function must exist');
const implementation = runtime.slice(start, end);
assert.ok(implementation.includes("!vaultAllowed('vaultDelete')"),
  'Viewing the archive must never grant deletion');
assert.ok(implementation.includes("isCurrent=()=>") &&
  implementation.includes("vaultAllowed('vaultDelete')"),
  'The delete permission must be rechecked after asynchronous reads');

function makeHarness({ permission = false, scopeAllowed = true, rows = [], beforeReturn = null, afterDelete = null } = {}) {
  let allowed = permission, scopeOk = scopeAllowed, scope = 'first';
  const events = [];
  const purge = new Function('vaultScopeOk', 'vaultAllowed', 'syncScope',
    'dbAll', 'dbDisposeTrashIfCurrent', 'vaultSessionEpoch',
    implementation + '\nreturn purgeExpiredTrash'
  )(
    () => scopeOk,
    key => key === 'vaultView' ? true : key === 'vaultDelete' && allowed,
    () => scope,
    async () => {
      events.push('read');
      if (beforeReturn) await beforeReturn({ setAllowed: v => { allowed = v; }, setScope: v => { scope = v; } });
      return rows;
    },
    async (item, permanent, isCurrent) => {
      events.push('delete:' + item.id);
      assert.equal(permanent, false);
      assert.ok(isCurrent(), 'No commit may occur if permission or account was revoked');
      afterDelete?.({ setAllowed: v => { allowed = v; }, setScope: v => { scope = v; } });
    },
    0
  );
  return { purge, events, setAllowed: value => { allowed = value; }, setScope: value => { scope = value; } };
}
async function check() {
  const deleted = [{id:'expired1',deleted:true},{id:'normal',deleted:false},{id:'expired2',deleted:true}];
  const viewOnly = makeHarness({permission:false,rows:deleted});
  await viewOnly.purge();
  assert.deepEqual(viewOnly.events, [], 'View-only user must not even enumerate trash for purging');

  const deniedScope = makeHarness({permission:true,scopeAllowed:false,rows:deleted});
  await deniedScope.purge();
  assert.deepEqual(deniedScope.events, [], 'Untrusted branch must not purge anything');

  const authorized = makeHarness({permission:true,rows:deleted});
  await authorized.purge();
  assert.deepEqual(authorized.events,['read','delete:expired1','delete:expired2']);

  const revokedBeforeRead = makeHarness({
    permission:true,rows:deleted,
    beforeReturn: ({setAllowed})=>setAllowed(false)
  });
  await revokedBeforeRead.purge();
  assert.deepEqual(revokedBeforeRead.events,['read'], 'Revoked permission must stop late trash deletion');

  const switchedAccount = makeHarness({
    permission:true,rows:deleted,
    beforeReturn: ({setScope})=>setScope('other-account')
  });
  await switchedAccount.purge();
  assert.deepEqual(switchedAccount.events,['read'], 'Account switch must stop late deletion');

  const revokedDuringCleanup = makeHarness({
    permission:true,rows:deleted,
    afterDelete: ({setAllowed})=>setAllowed(false)
  });
  await revokedDuringCleanup.purge();
  assert.deepEqual(revokedDuringCleanup.events,['read','delete:expired1'],
    'Permission revoke between items must block remaining deletions');

  console.log('Vault automatic trash permissions passed: 6 view/delete, identity and async revocation scenarios.');
}
check().catch(e=>{console.error(e);process.exitCode=1});
