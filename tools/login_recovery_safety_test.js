'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const source=read('web/app-security-runtime.js'),recovery=read('web/password-recovery-runtime.js');
const classifier=source.match(/function isCredentialFailure\(error\)\{[\s\S]*?\n\}/)?.[0];
const login=source.match(/async function login\(\)\{[\s\S]*?\n\}/)?.[0];
const verifier=recovery.match(/async function verifyRecoveryAccount\(c\)\{[\s\S]*?\n\}/)?.[0];
const save=recovery.match(/async function saveNewPassword\(\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(classifier&&login&&verifier&&save,'canonical login/recovery functions missing');
const isCredentialFailure=new Function(classifier+'\nreturn isCredentialFailure;')();
let tested=0;
const eq=(a,b,m)=>{assert.equal(a,b,m);tested++};
async function simulateLogin(error,throws){
 const state={failure:0,requests:0};
 const setup=[
 "const MAIN_USERNAME='owner',MAIN_EMAIL='owner@example.test';let busy=false,currentDevice=null,unlocked=false;",
 "const $=id=>({value:id==='abuLoginUser'?'owner':'LongPassword#123'});",
 "const loginRemaining=()=>0,formatWait=String,setError=()=>{},authError=e=>String(e?.message||e?.code||e);",
 "const recordCredentialFailure=()=>state.failure++,clearCredentialFailures=()=>{};",
 "const client=()=>({auth:{signInWithPassword:async()=>{state.requests++;if(throws)throw error;return{error,data:null}}}});",
 "const fetchDeviceInfo=async()=>{},registerDevice=async()=>{},hideGate=()=>{},pullAppearanceIfNeeded=async()=>{};",
 "const roleLabel=()=> 'owner',log=()=>{};",classifier,login,"return login;"
 ].join('\n');
 await new Function('error','throws','state',setup)(error,throws,state)();
 return state;
}
function simulateRecovery(email,err){
 const counts={updates:0,signouts:0};
 const auth={
 getUser:async()=>({data:{user:email===null?null:{email}},error:err||null}),
 updateUser:async()=>{counts.updates++;return{data:{user:{email:'owner@example.test'}},error:null}},
 signOut:async()=>{counts.signouts++}
 };
 const setup=[
 "const accountEmail=()=> 'owner@example.test',client=()=>({auth});",
 "const window={AbuBassamStrongPasswordWeakness:()=>''};let passwordBusy=false;",
 "const controls={abuNewPassword:{value:'LongPassword#123'},abuNewPasswordConfirm:{value:'LongPassword#123'},abuSaveNewPassword:{disabled:false},abuLoginPass:{focus:()=>{}}};",
 "const $=id=>controls[id]||null,resetStatus=()=>{},setLoginMessage=()=>{},closeResetModal=async()=>{};",
 verifier,save,"return saveNewPassword;"
 ].join('\n');
 return{run:new Function('auth','counts',setup)(auth,counts),counts};
}
(async()=>{
 for(const [e,want] of [
 [{code:'invalid_credentials',message:'Invalid login credentials'},true],
 [{code:'request_timeout',message:'timeout'},false],
 [{code:'over_request_rate_limit',message:'too many requests'},false],
 [{code:'email_not_confirmed'},false],
 [{code:'unexpected_failure',message:'Invalid login credentials'},false],
 [{message:'Invalid login credentials'},true],
 [{message:'Failed to fetch'},false],[null,false]
 ])eq(isCredentialFailure(e),want,'credential classifier');
 for(const [error,throws,want] of [
 [{code:'invalid_credentials',message:'Invalid login credentials'},false,1],
 [{code:'request_timeout',message:'timeout'},false,0],
 [{code:'over_request_rate_limit',message:'too many requests'},false,0],
 [{code:'email_not_confirmed',message:'Unconfirmed'},false,0],
 [{message:'Invalid login credentials'},false,1],
 [new Error('Failed to fetch'),true,0]
 ]){const state=await simulateLogin(error,throws);eq(state.failure,want,'login lockout');eq(state.requests,1,'single login request')}
 for(const [email,error,want] of [
 ['stranger@example.test',null,0],
 [null,null,0],
 ['owner@example.test',new Error('server unavailable'),0],
 ['OWNER@example.test',null,1]
 ]){const x=simulateRecovery(email,error);await x.run();eq(x.counts.updates,want,'password update authorization')}
 assert.match(recovery,/if\(!email\|\|email!==accountEmail\(\)\)\{/);tested++;
 assert.match(recovery,/if\(email&&email===accountEmail\(\)\)openResetModal\(\)/);tested++;
 assert.match(recovery,/await verifyRecoveryAccount\(c\);\s*const \{data,error\}=await c\.auth\.updateUser\(\{password\}\)/);tested++;
 console.log('Auth regression checks: '+tested+'/'+tested+' passed');
})().catch(error=>{console.error(error);process.exitCode=1});
