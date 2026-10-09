'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web','account-center-runtime.js'),'utf8');
new vm.Script(source,{filename:'account-center-runtime.js'});
const begin=source.indexOf('async function handleCallback()');
const end=source.indexOf('\nfunction patchSettings()',begin);
assert.ok(begin>=0&&end>begin,'Expected account callback function');
const fn=source.slice(begin,end);
async function scenario(flow){
  const views=[],removed=[];
  let profileCalls=0;
  function FakeURL(){this.protocol='abu-bassam-library:';this.host='auth';this.pathname='/callback';
    this.searchParams={get:key=>key==='flow'?flow:key==='code'?'verified-code':null}}
  const callback=new Function('native','ready','ensureProfile','show','setMsg','message','CALLBACK_KEY','CALLBACK','URL',
    'let callbackFails=0;'+fn+'\nreturn handleCallback;')(
    async(action)=>{if(action==='secureGet')return 'valid-callback';if(action==='secureDelete'){removed.push(true);return true}},
    async()=>({auth:{exchangeCodeForSession:async()=>({error:null})}}),
    async()=>{profileCalls++;throw Error('PROFILE_UNAVAILABLE')},
    page=>views.push(page),()=>{},String,'callback-key','abu-bassam-library://auth/callback',FakeURL);
  return{success:await callback(),views,removed,profileCalls}
}
(async()=>{
  const reset=await scenario('recovery');
  assert.equal(reset.success,true);
  assert.deepEqual(reset.views,['newpass'],'Valid reset callback opens reset form without a profile query');
  assert.equal(reset.profileCalls,0,'Password recovery cannot depend on the profile table');
  assert.equal(reset.removed.length,1,'Consumed callback must be removed');
  const google=await scenario('google');
  assert.equal(google.success,true);
  assert.deepEqual(google.views,['home'],'Google auth remains signed in without falsely claiming profile loaded');
  assert.equal(google.profileCalls,1);
  assert.equal(google.removed.length,1);
  console.log('Recovery callback remains available during profile outage');
})().catch(error=>{console.error(error);process.exitCode=1});
