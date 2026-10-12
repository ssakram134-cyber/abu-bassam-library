'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','web/app-security-runtime.js'),'utf8');
const hard=fs.readFileSync(path.join(__dirname,'..','web/security-hardening-runtime.js'),'utf8');
const line=(s,p)=>{const m=s.split('\n').filter(x=>x.startsWith(p));assert.equal(m.length,1,p);return m[0]};
const begin=app.indexOf('window.AbuBassamNativeAppState=function(payload){');
const close=app.indexOf('\n};',begin);
assert.ok(begin>=0&&close>begin,'canonical native lifecycle handler');
const native=app.slice(begin,close+3);
const sFun=line(app,'function sessionUnlocked()');
const lockDelay=line(app,'function lockMinutes()');
const clickGuard=line(app,'function guardClicks()');
const classify=line(app,'function permissionForTarget(');
const hDelay=line(hard,'function configuredLockMinutes()');
const unlock=line(hard,'async function secureOfflineUnlock()');
const visibility=line(hard,'function onVisibility()');
assert.match(app,/function back\(fromHardware=false\)\{if\(!sessionUnlocked\(\)\)/);
assert.match(hard,/sec\.offlineActive=\(\)=>offlineSession&&!!sec\.__offlineTrust/);
let count=2;
const eq=(a,b,description)=>{assert.equal(a,b,description);count++};
function appHarness(cfg={}){
 const state={time:100000,locked:[],blocked:0,handler:null},gateHidden=cfg.hidden!==false;
 const window={AbuBassamSecurity:{offlineActive:()=>cfg.offline!==false,role:()=>cfg.role||'secondary',can:()=>cfg.granted===true}};
 const $=()=>({classList:{contains:s=>s==='hide'&&gateHidden}});
 const document={addEventListener:(type,fn)=>{if(type==='click')state.handler=fn}};
 const localStorage={getItem:()=>cfg.timeout===undefined?'5':cfg.timeout};
 const code=[
 "let unlocked=baseUnlocked,lastBackgroundAt=0;const LOCK_MINUTES_KEY='abuBassamSecurityLockMinutesV1';",
 'const lock=why=>state.locked.push(why),toast=()=>{};',
 sFun,lockDelay,classify,clickGuard,native,
 'return{active:sessionUnlocked,minutes:lockMinutes,appState:window.AbuBassamNativeAppState,guard:guardClicks};'
 ].join('\n');
 const methods=new Function('baseUnlocked','window','document','$','localStorage','Date','state',code)(cfg.unlocked===true,window,document,$,localStorage,{now:()=>state.time},state);
 return{...methods,state,advance:ms=>{state.time+=ms},click:()=>{
  const button={id:'opsClear',getAttribute:()=>''};const event={target:{closest:()=>button},preventDefault:()=>{state.blocked++},stopImmediatePropagation:()=>{}};
  state.handler(event);
 }};
}
function hardHarness(cfg={}){
 const state={time:100000,visibility:'visible',events:[],locks:[]};
 const $=id=>({
  abuLoginError:{textContent:''},abuSecurityGate:{classList:{add:value=>state.events.push('gate:'+value)}},
  abuLoginDevice:{textContent:''}
 }[id]||null);
 const window={AbuBassamOps:{add:()=>{}}};
 const document={get visibilityState(){return state.visibility},dispatchEvent:e=>state.events.push('event:'+e.detail.state)};
 const localStorage={getItem:()=>cfg.timeout===undefined?'5':cfg.timeout};
 const code=[
 "let offlineSession=false,offlineBackgroundAt=0;const LOCK_MINUTES_KEY='abuBassamSecurityLockMinutesV1',OFFLINE_GRACE_MS=43200000;",
 'const online=()=>false;',
 "const loadTrust=async()=>({device_id:'A',role:'secondary',permissions:{edit:false}});",
 "const biometricCheck=async()=>{if(cfg.biometric===false)throw Error('denied')};",
 "const applyOfflineDevice=()=>{state.events.push('apply');return true};",
 'const lockOffline=why=>{state.locks.push(why);offlineSession=false};',
 'const updateOfflineButton=()=>{},enforceOfflineSession=()=>{},sealIfOnlineUnlocked=()=>{};',
 hDelay,unlock,visibility,'return {unlock:secureOfflineUnlock,minutes:configuredLockMinutes,visible:onVisibility,active:()=>offlineSession};'
 ].join('\n');
 const methods=new Function('cfg','$','window','document','localStorage','Date','CustomEvent','state',code)(cfg,$,window,document,localStorage,{now:()=>state.time},function(type,options){this.detail=options.detail},state);
 return{...methods,state,background:()=>{state.visibility='hidden';methods.visible()},foreground:ms=>{state.time+=ms;state.visibility='visible';methods.visible()}};
}
(async()=>{
 for(const [offline,hidden,want] of [[true,true,true],[true,false,false],[false,true,false]])eq(appHarness({offline,hidden}).active(),want,'validated offline flag and gate');
 eq(appHarness({unlocked:true,offline:false,hidden:false}).active(),true,'normal online session');
 for(const [value,want] of [[null,5],['0',0],['1',1],['5',5],['15',15],['bogus',5],['-5',5],['NaN',5]]){
  eq(appHarness({timeout:value}).minutes(),want,'app lock configuration');
  eq(hardHarness({timeout:value}).minutes(),want,'offline lock configuration');
 }
 for(const [ms,timeout,want] of [[0,'0',1],[59000,'1',0],[60000,'1',1],[299999,'5',0],[300000,'5',1]]){
  const v=appHarness({timeout});v.appState({state:'background',at:v.state.time});v.advance(ms);v.appState({state:'active',at:v.state.time});eq(v.state.locked.length,want,'native app resume lock');
 }
 const locked=appHarness({offline:false});locked.appState({state:'background',at:locked.state.time});locked.advance(300001);locked.appState({state:'active',at:locked.state.time});eq(locked.state.locked.length,0,'no redundant lock');
 for(const [cfg,want] of [
  [{offline:true,hidden:true,granted:false},1],
  [{offline:true,hidden:true,granted:true},0],
  [{offline:true,hidden:true,role:'owner',granted:false},0],
  [{offline:false,hidden:true,granted:false},0],
  [{offline:true,hidden:false,granted:false},0]
 ]){
  const v=appHarness(cfg);v.guard();v.click();eq(v.state.blocked,want,'secondary click check');
 }
 const approved=hardHarness();eq(await approved.unlock(),true,'secure offline unlock');
 eq(approved.active(),true,'offline lease enabled after verification');
 assert.deepEqual(approved.state.events.slice(0,3),['apply','gate:hide','event:unlocked']);count++;
 const denied=hardHarness({biometric:false});eq(await denied.unlock(),false,'biometric failure');
 eq(denied.active(),false,'biometric failure leaves session disabled');
 eq(denied.state.events.filter(x=>x.startsWith('event:')).length,0,'no forged unlock event');
 const instant=hardHarness({timeout:'0'});await instant.unlock();instant.background();instant.foreground(0);eq(instant.state.locks.length,1,'immediate lock');
 const short=hardHarness();await short.unlock();short.background();short.foreground(299999);eq(short.state.locks.length,0,'short background preserves lease');
 const expired=hardHarness();await expired.unlock();expired.background();expired.foreground(300000);eq(expired.state.locks.length,1,'expired background locks');
 console.log('Offline lock / native lifecycle: '+count+'/'+count+' focused checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
