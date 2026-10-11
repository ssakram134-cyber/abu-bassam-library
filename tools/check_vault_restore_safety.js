'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const raw=fs.readFileSync('web/document-vault-hardening-runtime.js','utf8');
const native=fs.readFileSync('index.js','utf8');
new Function(raw);
assert.ok(native.includes("inject('AbuBassamNativeFileSaveResult', result)"),'Native must acknowledge vault export completion');
const original='window.AbuDocumentVaultHardening=Object.freeze({';
const injected=raw.replace(original,`all=async()=>window.records;backupBytes=async()=>new Uint8Array([7,8,9]);blobDataUrl=async()=> 'data:application/zip;base64,BwgJ';applyAtomic=async(items,opts)=>{window.saved={items,opts};window.saves++};window.__vaultTest={safeRestore,saveBlob};${original}`);
assert.notEqual(injected,raw,'Unable to inject isolated vault audit functions');
let userId='owner-one',nonce=0;
const saveMessages=[],alerts=[],timers=new Map(),window={
 records:[{id:'existing',name:'previous.pdf',category:'file',mime:'application/pdf',size:3,blob:{size:3},deleted:false}],
 saved:null,saves:0,JSZip:null,
 AbuBassamCloud:{session:()=>({user:{id:userId}})},
 AbuBassamSecurity:{role:()=> 'owner',device:()=>({device_id:'branch-1'})},
 AbuBassamBranchVault:{localScopeOk:()=>true},
 Android:{saveBase64:(...args)=>saveMessages.push(args)},
 DocumentVault:{onShow:async()=>{}}
};
const zip={
 file:path=>{
  if(path==='manifest.json')return {async:async()=>JSON.stringify({format:'AbuBassamVault',branchDeviceId:'branch-1',items:[{id:'new',name:'new.pdf',mime:'application/pdf',category:'file',path:'files/new/new.pdf',size:3}]})};
  if(path==='files/new/new.pdf')return {_data:{uncompressedSize:3},async:async()=>({size:3,type:'application/pdf'})};
  return null
 }
};
const JSZip={loadAsync:async()=>zip};window.JSZip=JSZip;
const document={getElementById:()=>null};
const localStorage={length:0,key:()=>null,getItem:()=>null,setItem(){},removeItem(){}};
new Function('window','document','localStorage','JSZip','crypto','TextEncoder','Blob','Uint8Array','setTimeout','clearTimeout','alert','confirm','prompt','btoa','atob',injected)(
 window,document,localStorage,JSZip,{randomUUID:()=> 'random'},
 TextEncoder,Blob,Uint8Array,
 (fn,ms)=>{const id=++nonce;timers.set(id,{fn,ms});return id},
 id=>timers.delete(id),m=>alerts.push(String(m)),()=>true,()=>null,x=>Buffer.from(x,'binary').toString('base64'),x=>Buffer.from(x,'base64').toString('binary')
);
const file={size:100,arrayBuffer:async()=>new Uint8Array([80,75,3]).buffer};
async function waitForMessage(n){for(let i=0;i<50&&saveMessages.length<n;i++)await Promise.resolve();assert.equal(saveMessages.length,n,'Native safety backup must be requested')}
(async()=>{
 const first=window.__vaultTest.safeRestore(file,{mode:'snapshot',silentConfirm:true,silentError:true,silentSuccess:true});
 await waitForMessage(1);
 assert.equal(window.saves,0,'Snapshot may not replace archive before file save acknowledgement');
 const req=saveMessages[0][3];window.AbuBassamNativeFileSaveResult({requestId:req,ok:false,error:'cancelled'});
 assert.equal(await first,false,'Cancelled folder picker must cancel destructive restore');
 assert.equal(window.saves,0);
 const second=window.__vaultTest.safeRestore(file,{mode:'snapshot',silentConfirm:true,silentError:true,silentSuccess:true});
 await waitForMessage(2);
 const req2=saveMessages[1][3];
 window.AbuBassamNativeFileSaveResult({requestId:req,ok:true});
 assert.equal(window.saves,0,'Stale acknowledgement may not authorize restore');
 window.AbuBassamNativeFileSaveResult({requestId:req2,ok:true});
 assert.equal(await second,true);
 assert.equal(window.saves,1);
 const third=window.__vaultTest.safeRestore(file,{mode:'snapshot',silentConfirm:true,silentError:true,silentSuccess:true});
 await waitForMessage(3);userId='different-account';
 window.AbuBassamNativeFileSaveResult({requestId:saveMessages[2][3],ok:true});
 assert.equal(await third,false,'Account switch must stop restore after file save but before archive write');
 assert.equal(window.saves,1);
 assert.equal(timers.size,0,'All acknowledged save requests must release their timers');
 console.log('Vault restore safety checks passed: cancelled, stale and cross-account confirmations cannot commit a replacement; a confirmed save permits one atomic restore.');
})().catch(e=>{console.error(e);process.exitCode=1});
