'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web','password-recovery-runtime.js'),'utf8');
new vm.Script(source,{filename:'password-recovery-runtime.js'});
function extract(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'Missing '+start);return source.slice(a,b)}
assert.match(source,/function accountEmail\(\)\{return DEFAULT_ACCOUNT_EMAIL\}/);
const verifySrc=extract('async function verifyOwnerSession(','\nfunction native(');
const consumeSrc=extract('async function consumeRecoveryCallback()','\nasync function saveNewPassword()');
const changeSrc=extract('async function saveNewPassword()','\nfunction installAuthListener()');
const listenerSrc=extract('function installAuthListener()','\nfunction installAppStateHook()');
assert.match(listenerSrc,/void consumeRecoveryCallback\(\)/,'Auth event only retries pending callback');
assert.doesNotMatch(listenerSrc,/openResetModal\(/,'Auth event alone must not open reset form');
const ownerEmail='owner@example.test',otherEmail='foreign@example.test';
const verify=new Function('accountEmail',verifySrc+'\nreturn verifyOwnerSession')(()=>ownerEmail);
async function checkIdentity(email,userId='owner-1',serverError=null){
 return verify({auth:{getUser:async()=>({data:{user:userId?{id:userId,email}:null},error:serverError})}})
}
async function callbackScenario({flow='password-recovery',email=ownerEmail,session=true,accessToken=true}={}){
 const opened=[],removed=[],messages=[];let exchanges=0,signOuts=0;
 const native=async action=>{if(action==='secureGet')return 'abu-bassam-library://auth/callback?code=test&flow='+flow;if(action==='secureDelete'){removed.push(true);return true}};
 const clientObj={auth:{exchangeCodeForSession:async()=>{exchanges++;return {data:{session:session?{user:{id:'user-1',email},access_token:accessToken?'token':undefined}:null},error:null}},signOut:async()=>{signOuts++;return {error:null}}}};
 const callback=new Function('native','cloud','client','setLoginMessage','openResetModal','accountEmail','URL',
   "const CALLBACK='abu-bassam-library://auth/callback', CALLBACK_KEY='callback', FLOW='password-recovery';let callbackBusy=false;"+consumeSrc+'\nreturn consumeRecoveryCallback')(
    native,()=>({ready:async()=>true}),()=>clientObj,(text,bad)=>messages.push({text,bad}),()=>opened.push(true),()=>ownerEmail,URL);
 await callback();return{opened:opened.length,removed:removed.length,messages,exchanges,signOuts}
}
async function passwordScenario(email){
 let mutations=0,signouts=0,errors=[];
 const controls={abuNewPassword:{value:'ExampleStrong123@'},abuNewPasswordConfirm:{value:'ExampleStrong123@'},abuSaveNewPassword:{disabled:false},abuLoginPass:{focus(){}}};
 const obj={auth:{getUser:async()=>({data:{user:{id:'user-id',email}},error:null}),updateUser:async()=>{mutations++;return{data:{user:{email}},error:null}},signOut:async()=>{signouts++;return {error:null}}}};
 const mutate=new Function('$','window','client','verifyOwnerSession','accountEmail','resetStatus','closeResetModal','setLoginMessage',
  'let passwordBusy=false;'+changeSrc+'\nreturn saveNewPassword')(
    id=>controls[id]||null,{AbuBassamStrongPasswordWeakness:()=>''},()=>obj,verify,()=>ownerEmail,
    m=>errors.push(String(m)),async()=>{},()=>{});
 await mutate();return{mutations,signouts,errors}
}
(async()=>{
 assert.equal((await checkIdentity(ownerEmail)).email,ownerEmail);
 await assert.rejects(checkIdentity(otherEmail),/الحساب المفتوح/);
 await assert.rejects(checkIdentity(ownerEmail,''),/الحساب المفتوح/);
 await assert.rejects(checkIdentity(ownerEmail,'owner-1',new Error('AUTH_SERVER_UNAVAILABLE')),/AUTH_SERVER_UNAVAILABLE/);
 const valid=await callbackScenario();
 assert.equal(valid.opened,1,'Verified owner callback opens reset form');
 assert.equal(valid.removed,1);
 for(const options of [{email:otherEmail},{session:false},{accessToken:false}]){
   const r=await callbackScenario(options);
   assert.equal(r.opened,0,'Incomplete/foreign session must not open reset form');
   assert.ok(r.removed>=1,'Invalid callback must be cleared');
 }
 const personal=await callbackScenario({flow:'recovery'});
 assert.equal(personal.exchanges,0,'Owner handler must not consume personal-account reset');
 assert.equal(personal.opened,0);
 const wrong=await passwordScenario(otherEmail);
 assert.equal(wrong.mutations,0,'Never change another account password before identity verification');
 const correct=await passwordScenario(ownerEmail);
 assert.equal(correct.mutations,1);
 assert.equal(correct.signouts,1);
 console.log('Recovery owner identity checks passed: callback, session, provider event and updateUser guard')
})().catch(error=>{console.error(error);process.exitCode=1});
