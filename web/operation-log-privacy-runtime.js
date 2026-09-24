(()=>{
'use strict';
if(window.__ABU_OPERATION_LOG_PRIVACY_V1__)return;
window.__ABU_OPERATION_LOG_PRIVACY_V1__=true;
const OPS_KEY='abuBassamOpsV4';
const TABLE='abu_bassam_sync_secure';
let cleaned=false;
function role(){return window.AbuBassamSecurity?.role?.()||''}
function device(){return window.AbuBassamSecurity?.device?.()||window.AbuBassamDevices?.ensure?.()||{}}
function deviceName(){return String(device().device_name||device().name||(typeof window.AbuBassamDeviceName==='function'?window.AbuBassamDeviceName():'')).trim()}
function readOps(){try{const x=JSON.parse(localStorage.getItem(OPS_KEY)||'[]');return Array.isArray(x)?x:[]}catch(_){return[]}}
function writeOps(list){try{localStorage.setItem(OPS_KEY,JSON.stringify((Array.isArray(list)?list:[]).slice(0,500)))}catch(_){}}
function cleanSecondaryLocal(){if(cleaned||role()!=='secondary')return false;const name=deviceName();if(!name)return false;const before=readOps(),own=before.filter(item=>String(item?.deviceName||'').trim()===name);if(own.length!==before.length)writeOps(own);cleaned=true;return true}
function wrapBuilder(target,state={kind:''}){
  if(!target||typeof target!=='object')return target;
  return new Proxy(target,{
    get(obj,prop){
      if(prop==='then'&&state.kind==='operation')return (resolve,reject)=>Promise.resolve({data:[],error:null,count:0}).then(resolve,reject);
      const value=Reflect.get(obj,prop,obj);
      if(typeof value!=='function')return value;
      if(prop==='upsert')return (rows,options)=>{
        const list=Array.isArray(rows)?rows:[rows];
        const keep=list.filter(row=>String(row?.kind||'')!=='operation');
        if(!keep.length)return Promise.resolve({data:null,error:null,count:0});
        return value.call(obj,Array.isArray(rows)?keep:keep[0],options);
      };
      return (...args)=>{
        const next=value.apply(obj,args),nextState={...state};
        if(prop==='eq'&&String(args[0])==='kind')nextState.kind=String(args[1]||'');
        if(next&&typeof next==='object')return wrapBuilder(next,nextState);
        return next;
      };
    }
  })
}
function installClientBoundary(){const cloud=window.AbuBassamCloud,c=cloud?.client;if(!c||typeof c.from!=='function')return false;if(c.from.__abuOperationPrivacy)return true;const original=c.from.bind(c);const wrapped=function(table){const b=original(table);return String(table)===TABLE?wrapBuilder(b,{kind:''}):b};wrapped.__abuOperationPrivacy=true;wrapped.__abuOriginal=original;c.from=wrapped;return true}
function boot(){let attempts=0;const timer=setInterval(()=>{attempts++;const a=installClientBoundary();cleanSecondaryLocal();if(a){try{window.AbuBassamOps?.sync?.()}catch(_){}if(cleaned||role()==='owner'||attempts>80)clearInterval(timer)}else if(attempts>120)clearInterval(timer)},120);window.addEventListener('online',()=>{installClientBoundary();cleanSecondaryLocal()})}
window.AbuBassamOperationPrivacy={install:installClientBoundary,clean:cleanSecondaryLocal};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
