'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const native=fs.readFileSync(path.join(root,'index-auth.js'),'utf8');
const android=fs.readFileSync(path.join(root,'index.js'),'utf8');
const owner=fs.readFileSync(path.join(root,'web/password-recovery-runtime.js'),'utf8');
const account=fs.readFileSync(path.join(root,'web/account-center-runtime.js'),'utf8');
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
const CALLBACK='abu-bassam-library://auth/callback';
const KEY='abu_bassam_auth_callback_v1';
const EVENT='abu-bassam-auth-callback-saved';
assert.equal(app.expo.scheme,'abu-bassam-library','Android deep-link scheme');
assert.match(native,/DeviceEventEmitter\.emit\('abu-bassam-auth-callback-saved'\)/);
assert.match(android,/DeviceEventEmitter\.addListener\('abu-bassam-auth-callback-saved'/);
assert.match(owner,/resetPasswordForEmail\(accountEmail\(\),\{redirectTo:\x60\$\{CALLBACK\}\?flow=\$\{FLOW\}\x60\}\)/);
assert.match(account,/resetPasswordForEmail\(email,\{redirectTo:\x60\$\{CALLBACK\}\?flow=recovery\x60\}\)/);
assert.ok(owner.includes("const CALLBACK='"+CALLBACK+"'"));
assert.ok(account.includes("CALLBACK='"+CALLBACK+"'"));
const begin=native.indexOf('function validAuthCallback(');
const end=native.indexOf("\nLinking.getInitialURL()",begin);
assert.ok(begin>=0&&end>begin,'Native deep-link handler must exist');
const androidBegin=android.indexOf('  useEffect(() => {\n    if (!webReady) return undefined;\n    let mounted = true;\n    const notifyIfPending = async () => {');
const androidEnd=android.indexOf('\n\n  const openCamera',androidBegin);
assert.ok(androidBegin>=0&&androidEnd>androidBegin,'Android secure callback notification lifecycle');
const hook=android.slice(androidBegin,androidEnd);
const store=new Map(),events=new Map(),injections=[];
const secure={getItemAsync:async key=>store.get(key)||'',setItemAsync:async(key,value)=>{store.set(key,value)},deleteItemAsync:async key=>{store.delete(key)}};
const emitter={
  emit(name){for(const listener of events.get(name)||[])listener()},
  addListener(name,listener){const handlers=events.get(name)||[];handlers.push(listener);events.set(name,handlers);return{remove:()=>events.set(name,(events.get(name)||[]).filter(f=>f!==listener))}}
};
const capture=new Function('SecureStore','DeviceEventEmitter','URL',
  'const AUTH_CALLBACK_KEY='+JSON.stringify(KEY)+';const AUTH_CALLBACK_PREFIX='+JSON.stringify(CALLBACK)+';let lastCallback="";'+native.slice(begin,end)+';return captureAuthCallback;'
)(secure,emitter,URL);
function startWebview(ready){
  let cleanup;
  new Function('useEffect','webReady','SecureStore','DeviceEventEmitter','inject','AUTH_CALLBACK_KEY',hook)(
    action=>{cleanup=action()},ready,secure,emitter,(name,payload)=>injections.push({name,payload}),KEY);
  return cleanup
}
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve()};
(async()=>{
  const link=CALLBACK+'?flow=password-recovery&code=one-time-code';
  await capture('phone-max://reset-password?code=other-app');
  assert.equal(store.size,0,'Must ignore links belonging to Phone Max');
  await capture(link);
  assert.equal(store.get(KEY),link,'Persist library recovery callback');
  assert.equal(injections.length,0,'Before WebView ready, keep callback pending');
  let cleanup=startWebview(true);
  await flush();
  assert.equal(injections.length,1,'Cold-start callback wakes the library WebView');
  assert.equal(injections[0].name,'AbuBassamNativeAppState');
  assert.equal(injections[0].payload.authCallbackPending,true);
  assert.equal(JSON.stringify(injections).includes('one-time-code'),false,'Never leak auth codes in WebView events');
  cleanup();
  store.delete(KEY);
  cleanup=startWebview(true);await flush();
  const newer=CALLBACK+'?flow=recovery&code=another-code';
  await capture(newer);await flush();
  assert.equal(store.get(KEY),newer);
  assert.equal(injections.length,2,'Warm-link callback is delivered without AppState change');
  assert.equal(JSON.stringify(injections).includes('another-code'),false);
  cleanup();
  console.log('Library recovery deep-link tests passed: scheme isolation, cold start, warm start, and zero code leakage');
})().catch(error=>{console.error(error);process.exitCode=1});
