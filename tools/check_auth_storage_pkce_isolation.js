'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web','secure-sync-runtime.js'),'utf8');
new vm.Script(source,{filename:'secure-sync-runtime.js'});
const begin=source.indexOf('  function authSecureKey(');
const end=source.indexOf('\n  const client = window.supabase?.createClient',begin);
assert.ok(begin>0&&end>begin,'Native auth storage section must exist');
const selected=source.slice(begin,end);
const storageKey='abu_bassam_auth_session_v1';
const keyAllowed=/^abu_bassam_[a-z0-9_]{3,80}$/i;
const nativeStore=new Map();
const api=new Function('AUTH_KEY','authMemory','nativeAvailable','nativeRequest',selected+'\nreturn {authStorage,authSecureKey};')(
  storageKey,new Map(),()=>true,async(action,payload)=>{
    assert.match(payload.key,keyAllowed,'Native key must meet allowlist');
    if(action==='secureGet')return nativeStore.get(payload.key)||'';
    if(action==='secureSet'){nativeStore.set(payload.key,payload.value);return true}
    if(action==='secureDelete'){nativeStore.delete(payload.key);return true}
    throw Error('Unexpected operation');
  });
const session=storageKey;
const pkce=storageKey+'-code-verifier';
assert.equal(api.authSecureKey(session),session,'Preserve old session key across upgrades');
assert.notEqual(api.authSecureKey(session),api.authSecureKey(pkce),'PKCE cannot reuse session key');
assert.throws(()=>api.authSecureKey('another_token'),'Unauthorized storage key must fail closed');
assert.throws(()=>api.authSecureKey(session+'-bad/suffix'),'Unsafe suffix must fail closed');
const run=(async()=>{
  await api.authStorage.setItem(session,'old-user-session');
  await api.authStorage.setItem(pkce,'random-verifier/PASSWORD_RECOVERY');
  assert.equal(await api.authStorage.getItem(session),'old-user-session');
  assert.equal(await api.authStorage.getItem(pkce),'random-verifier/PASSWORD_RECOVERY');
  await api.authStorage.removeItem(pkce);
  assert.equal(await api.authStorage.getItem(pkce),'');
  assert.equal(await api.authStorage.getItem(session),'old-user-session','Deleting PKCE must not log user out');
  await api.authStorage.removeItem(session);
  assert.equal(await api.authStorage.getItem(session),'');
  const offline=new Function('AUTH_KEY','authMemory','nativeAvailable','nativeRequest',selected+'\nreturn authStorage;')(
    storageKey,new Map(),()=>false,async()=>{throw Error('Native unavailable')});
  await offline.setItem(session,'session');
  await offline.setItem(pkce,'verifier');
  assert.equal(await offline.getItem(session),'session');
  assert.equal(await offline.getItem(pkce),'verifier');
  console.log('Supabase native PKCE / session storage isolation checks passed')
})();
run.catch(error=>{console.error(error);process.exitCode=1});
