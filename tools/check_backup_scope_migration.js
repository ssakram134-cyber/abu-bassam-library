'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const source=fs.readFileSync('web/backup-center-runtime.js','utf8');
const start=source.indexOf('const AUTO=');
const end=source.indexOf('const $=id=>',start);
assert.ok(start>=0&&end>start,'Backup state scope implementation missing');
const definitions=source.slice(start,end);
const store=new Map([
 ['abuBassamBackupAutoV1','0'],
 ['abuBassamBackupCadenceV1','weekly'],
 ['abuBassamBackupRetentionV1','30'],
 ['abuBassamBackupLastSuccessV1','9999999999999'],
 ['abuBassamBackupLastFingerprintV1','old-other-account-fingerprint'],
 ['abuBassamBackupLastErrorV1','previous account error'],
 ['abuBassamBackupRetryAfterV1','9999999999999']
]);
const localStorage={
 getItem:key=>store.has(key)?store.get(key):null,
 setItem:(key,value)=>store.set(key,String(value)),
 removeItem:key=>store.delete(key)
};
let user='owner',branch='branch1';
const window={
 AbuBassamCloud:{session:()=>({user:{id:user}})},
 AbuBassamSecurity:{device:()=>({device_id:branch})}
};
const api=new Function('window','localStorage',definitions+
 ';return {stateGet,stateSet,stateRemove,stateScope,AUTO,CAD,KEEP,LAST,LASTFP,LASTERR,RETRY};'
)(window,localStorage);
const {stateGet,stateSet,stateRemove,AUTO,CAD,KEEP,LAST,LASTFP,LASTERR,RETRY}=api;

for(const key of [LAST,LASTFP,LASTERR,RETRY])
 assert.equal(stateGet(key),null,'Legacy operational state must never migrate: '+key);
assert.equal(stateGet(AUTO),'0','Owner keeps old automatic preference');
assert.equal(stateGet(CAD),'weekly','Owner keeps old backup cadence');
assert.equal(stateGet(KEEP),'30','Owner keeps old retention preference');
assert.equal(store.get('abuBassamBackupLegacyPreferencesScopeV1'),'owner:branch1');
assert.equal(stateGet(LASTFP),null,'Legacy backup fingerprint cannot suppress first backup');

stateSet(LAST,'10');
stateSet(LASTFP,'owner-fingerprint');
assert.equal(stateGet(LAST),'10');
assert.equal(stateGet(LASTFP),'owner-fingerprint');
assert.equal(store.get(LAST),'9999999999999','Do not overwrite the old legacy status key');

user='another-user';
for(const key of [LAST,LASTFP,LASTERR,RETRY,AUTO,CAD,KEEP])
 assert.equal(stateGet(key),null,'A second user must start with independent backup settings and status: '+key);
stateSet(LAST,'20');
stateSet(LASTFP,'second-fingerprint');
assert.equal(stateGet(LAST),'20');
assert.equal(stateGet(LASTFP),'second-fingerprint');

user='owner';
assert.equal(stateGet(LAST),'10','Switching back restores original account status');
assert.equal(stateGet(LASTFP),'owner-fingerprint');

branch='branch2';
assert.equal(stateGet(LAST),null,'New branch must not inherit owner first-branch backup status');
assert.equal(stateGet(LASTFP),null,'New branch must not inherit owner first-branch fingerprint');
assert.equal(stateGet(AUTO),null,'Migration must not clone first-branch preferences');
stateSet(RETRY,'60');
assert.equal(stateGet(RETRY),'60');

branch='branch1';
assert.equal(stateGet(RETRY),null);
stateRemove(LAST);
assert.equal(stateGet(LAST),null,'Removing a scoped timestamp must not resurrect a legacy global value');
assert.equal(store.get('abuBassamBackupLastSuccessV1:another-user:branch1'),'20');
console.log('Backup state scoping passed: legacy preferences migrate once; timestamps, fingerprints, errors and retry delays stay per user and branch.');
