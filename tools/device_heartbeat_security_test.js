'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','web/app-security-runtime.js'),'utf8');
const normal=source.match(/function normalizeDevice\(data,expectedId\)\{[\s\S]*?\n\}/)?.[0];
const heartbeat=source.match(/async function touchDevice\(\)\{[^\n]*\}/)?.[0];
assert.ok(normal&&heartbeat,'canonical device functions missing');
const normalizeDevice=new Function(normal+'\nreturn normalizeDevice')();
let checks=0;
function eq(a,b,label){assert.equal(a,b,label);checks++}
function validate(row,allowed){
 let passed=false;
 try{const d=normalizeDevice(row,'device-A');eq(d.device_id,'device-A','identity');passed=true}
 catch(error){assert.match(error.message,/DEVICE_NOT_AUTHORIZED/);checks++}
 eq(passed,allowed,'device row validated');
}
function mock(options={}){
 const state={rpc:0,locks:[],saved:[]};
 let resolveRemote;
 const runner=[
 "const APP_VERSION='4.3.2',DEVICE_NAME_KEY='abuBassamLockedDeviceNameV3';",
 "let unlocked=true,currentDevice=null;const navigator={onLine:options.online!==false};",
 "const cloud=()=>({isConnected:()=>options.connected!==false});",
 "const getSecret=async()=> 'secret';const identity=()=>({id:'device-A'});",
 "const localStorage={getItem:()=>''};const deviceInfo={model:'Android',os:'Android'};",
 "const client=()=>({rpc:async()=>{state.rpc++;if(options.delay)return new Promise(r=>resolveRemote=r);if(options.rejection)throw Error(options.rejection);return {data:options.row===undefined?{device_id:'device-A',active:true,role:'secondary'}:options.row,error:options.error||null}}});",
 "const saveTrust=device=>state.saved.push(device);",
 "const lock=reason=>{state.locks.push(reason);unlocked=false};",
 normal,heartbeat,
 "return{run:touchDevice,getDevice:()=>currentDevice,logout:()=>{unlocked=false;currentDevice=null},release:reply=>resolveRemote(reply)}"
 ].join('\n');
 return {state,...new Function('options','state',runner)(options,state)};
}
async function caseRun(label,options,saves,locks,rpcs){
 const e=mock(options);await e.run();
 eq(e.state.saved.length,saves,label+' saved');
 eq(e.state.locks.length,locks,label+' locked');
 eq(e.state.rpc,rpcs,label+' requests');
 return e;
}
(async()=>{
 validate({device_id:'device-A',active:true,role:'owner'},true);
 validate([{device_id:'device-A',active:true,role:'secondary'}],true);
 for(const bad of [null,[],{device_id:'other',active:true,role:'owner'},{device_id:'device-A',active:false,role:'owner'},{device_id:'device-A',active:'true',role:'owner'},{device_id:'device-A',active:true},{device_id:'device-A',active:true,role:'admin'},'invalid'])validate(bad,false);
 const good=await caseRun('valid',{},1,0,1);
 eq(good.getDevice().device_id,'device-A','stored exact device');
 await caseRun('disabled',{row:{device_id:'device-A',active:false,role:'secondary'}},0,1,1);
 await caseRun('wrong ID',{row:{device_id:'wrong',active:true,role:'owner'}},0,1,1);
 await caseRun('missing active',{row:{device_id:'device-A',role:'secondary'}},0,1,1);
 await caseRun('wrong role',{row:{device_id:'device-A',active:true,role:'admin'}},0,1,1);
 await caseRun('empty',{row:null},0,1,1);
 await caseRun('server disabled',{error:{message:'DEVICE_DISABLED'}},0,1,1);
 await caseRun('network issue',{rejection:'network offline'},0,0,1);
 await caseRun('offline',{online:false},0,0,0);
 await caseRun('cloud inactive',{connected:false},0,0,0);
 const delayed=mock({delay:true});
 const pending=delayed.run();
 await Promise.resolve();await Promise.resolve();
 delayed.logout();
 delayed.release({data:{device_id:'device-A',active:true,role:'owner'},error:null});
 await pending;
 eq(delayed.state.saved.length,0,'late result cannot restore trust after logout');
 eq(delayed.getDevice(),null,'late result cannot restore authorized device');
 console.log('Connected device heartbeat security: '+checks+'/'+checks+' focused checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
