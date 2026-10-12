'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','web/security-hardening-runtime.js'),'utf8');
const i=src.indexOf('async function revalidateOfflineSession(){'),j=src.indexOf('\nfunction patchSecurity(){',i);
assert.ok(i>=0&&j>i,'missing device revalidation');
const f=src.slice(i,j);
const access=['effectiveRole','effectiveDevice','effectiveCan'].map(k=>{
 const line=src.split('\n').find(s=>s.startsWith('function '+k+'('));
 assert.ok(line,'missing '+k);return line;
}).join('\n');
function harness(options={}){
 const state={events:[],rpc:0,seals:0,grants:0,locks:0};
 const row=options.row===undefined?{device_id:'A',active:true,role:'secondary',permissions:{print:true}}:options.row;
 let release;
 const window={AbuBassamSecurity:{__offlineTrust:{device_id:'A',role:'secondary',permissions:{print:true}},__baseDevice:()=>({device_id:'A',role:'owner'}),__baseCan:()=>true},AbuBassamCloud:{client:{rpc:async()=>{state.rpc++;state.events.push('rpc');if(options.delay)return new Promise(r=>{release=r});return{data:row,error:options.error||null}}}}};
 const code=[
  'let offlineSession=true,revalidationPromise=null;',
  "const SECRET_KEY='secret',APP_VERSION='4.3.2';",
  "const currentId=()=>'A';const online=()=>options.online!==false;",
  "const nativeRequest=async()=>options.secret===undefined?'secret':options.secret;",
  "const normalizeDevice=r=>r?{device_id:r.device_id,active:r.active===true,role:r.role,permissions:r.permissions||{}}:null;",
  "const seal=async()=>{state.seals++;state.events.push('seal');if(options.sealError)throw Error('write');return options.seal!==false};",
  "const applyOfflineDevice=r=>{state.grants++;state.events.push('grant');window.AbuBassamSecurity.__offlineTrust=r};",
  "const lockOffline=()=>{state.locks++;state.events.push('lock');offlineSession=false;window.AbuBassamSecurity.__offlineTrust=null};",
  f,access,"return{run:revalidateOfflineSession,role:effectiveRole,device:effectiveDevice,can:effectiveCan,cancel:()=>offlineSession=false};"
 ].join('\n');
 return{...new Function('window','state','options',code)(window,state,options),state,release(v={data:row,error:options.error||null}){assert.ok(release,'RPC pending');release(v)}};
}
let n=0;const eq=(a,b,m)=>{assert.equal(a,b,m);n++};
async function verify(label,opts,want){
 const h=harness(opts),r=await h.run();eq(r,want,label);eq(h.state.grants,want?1:0,label+' grants');eq(h.state.locks,want?0:1,label+' locks');return h;
}
(async()=>{
 const good=await verify('valid active device',{},true);
 assert.deepEqual(good.state.events,['rpc','seal','grant']);n++;
 await verify('revoked',{row:{device_id:'A',active:false}},false);
 await verify('wrong ID',{row:{device_id:'B',active:true,role:'owner'}},false);
 await verify('active absent',{row:{device_id:'A'}},false);
 await verify('active string',{row:{device_id:'A',active:'true'}},false);
 await verify('missing row',{row:null},false);
 await verify('RPC refused',{error:{code:'DEVICE_DISABLED'}},false);
 await verify('secret absent',{secret:''},false);
 await verify('seal failed',{seal:false},false);
 await verify('seal threw',{sealError:true},false);
 const stale=harness();
 eq(stale.role(),'secondary','lease role wins');
 eq(stale.device().role,'secondary','lease device wins');
 eq(stale.can('edit'),false,'no stale-owner edit');
 eq(stale.can('print'),true,'explicit print');
 eq(stale.can('delete'),false,'implicit deny');
 stale.cancel();eq(stale.role(),'owner','live role when no lease');
 const co=harness({delay:true}),p=co.run(),q=co.run();
 await Promise.resolve();await Promise.resolve();
 eq(co.state.rpc,1,'concurrent request dedupe');
 co.release();assert.deepEqual(await Promise.all([p,q]),[true,true]);n++;
 eq(co.state.seals,1,'concurrent persistence dedupe');
 const logout=harness({delay:true}),pending=logout.run();
 await Promise.resolve();await Promise.resolve();logout.cancel();logout.release();
 eq(await pending,false,'late response after logout rejected');
 eq(logout.state.grants,0,'no resurrection of logout');
 const disconnected=harness({online:false});
 eq(await disconnected.run(),true,'offline lease remains usable');
 eq(disconnected.state.rpc,0,'no network call while disconnected');
 console.log('Offline device revalidation checks: '+n+'/'+n+' passed');
})().catch(error=>{console.error(error);process.exitCode=1});
