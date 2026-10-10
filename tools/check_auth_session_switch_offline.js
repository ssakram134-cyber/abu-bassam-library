'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const base=read('web/app-security-runtime.js'),hard=read('web/security-hardening-runtime.js'),acct=read('web/account-center-runtime.js');
for(const source of [base,hard,acct])new vm.Script(source);
function part(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'Missing '+a);return s.slice(i,j)}
(async()=>{
  const flag='abuBassamOfflineSignedOutV1',items=new Map();
  const storage={getItem:k=>items.get(k)||null,setItem:(k,v)=>items.set(k,String(v)),removeItem:k=>items.delete(k)};
  let uid='owner',locks=0;
  const guards=part(base,'function sessionUserId()','function identity()');
  const main=new Function('cloud','localStorage','lock','OFFLINE_SIGNED_OUT_KEY',
    'let unlocked=true,unlockedUserId="owner",currentDevice={role:"owner"};'+guards+';return {check:onAuthAccountChanged,device:()=>currentDevice}')(
    ()=>({session:()=>uid?{user:{id:uid}}:null}),storage,()=>{locks++},flag);
  main.check();assert.equal(locks,0,'Same-user refresh does not lock');
  uid='other';main.check();assert.equal(locks,1,'Account switch relocks the app');
  assert.equal(main.device(),null,'Stale owner role must be cleared');
  assert.equal(storage.getItem(flag),'1');
  const allowed=base.split('\n').find(s=>s.startsWith('function offlineAllowed(){'));
  assert.ok(allowed);
  const trust={device_id:'dev-1',active:true,verifiedAt:Date.now()};
  const checkOffline=new Function('localStorage','localTrust','identity','OFFLINE_SIGNED_OUT_KEY','OFFLINE_GRACE_MS',
    allowed+';return offlineAllowed')(storage,()=>trust,()=>({id:'dev-1'}),flag,72*3600000);
  assert.equal(checkOffline(),false,'Signed-out identity cannot reuse stale offline trust');
  storage.removeItem(flag);assert.equal(checkOffline(),true,'Preexisting offline grace still applies');
  const secureTrust=new Function('localStorage','OFFLINE_SIGNED_OUT_KEY','nativeAvailable',
    part(hard,'async function loadTrust()','async function clearTrust()')+';return loadTrust')(storage,flag,()=>false);
  storage.setItem(flag,'1');assert.equal(await secureTrust(),null,'HMAC offline trust blocks signed-out sessions');
  assert.match(hard,/if\(navigator\.onLine\)throw new Error/,'Connected users must not bypass login via offline button');
  assert.match(hard,/const completed=await baseLogout/,'Cancelled logout must preserve offline trust');
  let offlineLocks=0;
  const hardFn=part(hard,'function onAuthChanged()','function onSecurityState(');
  const onAuth=new Function('localStorage','OFFLINE_SIGNED_OUT_KEY','currentAccountId','lockOffline','refreshLimit','updateOfflineButton','online','sealIfOnlineUnlocked',
    'let offlineSession=true,offlineSessionUserId="owner";'+hardFn+';return onAuthChanged')(
    storage,flag,()=>uid,()=>{offlineLocks++},()=>{},()=>{},()=>false,()=>{});
  storage.removeItem(flag);uid='owner';onAuth();assert.equal(offlineLocks,0);
  uid='other';onAuth();assert.equal(offlineLocks,1,'Switching account invalidates active offline session');
  const cb=part(acct,'async function handleCallback()','function patchSettings()');
  async function checkCallback(flow,valid=true){
    let exchanges=0,profiles=0;const views=[];
    const url={protocol:'abu-bassam-library:',host:'auth',pathname:'/callback',searchParams:{get:k=>k==='flow'?flow:k==='code'?'code':null}};
    const client={auth:{exchangeCodeForSession:async()=>{exchanges++;return {data:{session:valid?{user:{id:'id1'},access_token:'token'}:null},error:null}}}};
    const callback=new Function('native','ready','ensureProfile','show','setMsg','message','CALLBACK_KEY','CALLBACK','URL',
      'let callbackFails=0;'+cb+';return handleCallback')(
      async action=>action==='secureGet'?'uri':true,async()=>client,
      async(_,uid)=>{profiles++;assert.equal(uid,'id1')},name=>views.push(name),()=>{},String,'key','abu-bassam-library://auth/callback',
      class{constructor(){return url}});
    return {ok:await callback(),exchanges,profiles,views}
  }
  const invalid=await checkCallback('google',false);assert.equal(invalid.ok,false);assert.equal(invalid.profiles,0);
  const google=await checkCallback('google',true);assert.equal(google.ok,true);assert.equal(google.profiles,1);assert.deepEqual(google.views,['profile']);
  const unknown=await checkCallback('unsafe-flow');assert.equal(unknown.exchanges,0);
  const ownerCb=await checkCallback('password-recovery');assert.equal(ownerCb.exchanges,0);
  assert.match(acct,/AUTH_ACCOUNT_MISMATCH/);
  console.log('Session switch, offline trust and Google callback checks passed')
})().catch(error=>{console.error(error);process.exitCode=1});
