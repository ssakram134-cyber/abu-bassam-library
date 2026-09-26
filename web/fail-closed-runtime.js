(()=>{
'use strict';
if(window.__ABU_FAIL_CLOSED_RUNTIME_V1__)return;
window.__ABU_FAIL_CLOSED_RUNTIME_V1__=true;
const VAULT_ERROR='VAULT_GATEWAY_NOT_READY';
const SECURE_ERROR='SECURE_STORAGE_REQUIRED';
const sensitiveButtons=new Set(['acctRecoveryGenerate','acctRecoverDo']);
function vaultError(){return new Error(VAULT_ERROR)}
function secureBridgeReady(){return !!(window.Android&&typeof Android.security==='function')}
function setAccountMessage(text){const e=document.getElementById('acctMsg');if(e){e.textContent=text;e.style.color='#a52e3b'}else alert(text)}
function armVault(){
  const cloud=window.AbuBassamCloud;
  if(!cloud||cloud.__abuBranchVaultPatched||cloud.__abuVaultFailClosed)return false;
  const originals={
    list:typeof cloud.list==='function'?cloud.list.bind(cloud):null,
    get:typeof cloud.get==='function'?cloud.get.bind(cloud):null,
    upsert:typeof cloud.upsert==='function'?cloud.upsert.bind(cloud):null,
    removeKind:typeof cloud.removeKind==='function'?cloud.removeKind.bind(cloud):null
  };
  cloud.__abuVaultFailClosed=true;
  cloud.__abuVaultFailClosedOriginal=originals;
  cloud.uploadVault=async()=>{throw vaultError()};
  cloud.downloadVault=async()=>{throw vaultError()};
  cloud.removeVault=async()=>{throw vaultError()};
  if(originals.list)cloud.list=(kind,limit)=>String(kind)==='vault'?Promise.reject(vaultError()):originals.list(kind,limit);
  if(originals.get)cloud.get=(kind,id)=>String(kind)==='vault'?Promise.reject(vaultError()):originals.get(kind,id);
  if(originals.upsert)cloud.upsert=(kind,id,data)=>String(kind)==='vault'?Promise.reject(vaultError()):originals.upsert(kind,id,data);
  if(originals.removeKind)cloud.removeKind=kind=>String(kind)==='vault'?Promise.reject(vaultError()):originals.removeKind(kind);
  return true
}
function blockSensitiveClick(event){
  const target=event.target?.closest?.('button');
  if(!target||!sensitiveButtons.has(target.id)||secureBridgeReady())return;
  event.preventDefault();
  event.stopImmediatePropagation();
  setAccountMessage('أوقفت العملية لأن التخزين الآمن الأصلي غير متاح على هذا الجهاز. لا يتم حفظ سر الجهاز في localStorage.')
}
function patchAccountApi(){
  const account=window.AbuBassamAccount;
  if(!account||secureBridgeReady())return false;
  if(account.__abuSecureStoreFailClosed)return true;
  const deny=async()=>{setAccountMessage('هذه العملية تحتاج SecureStore الأصلي على Android لحماية سر الجهاز.');throw new Error(SECURE_ERROR)};
  account.recoverPhone=deny;
  account.generateRecovery=deny;
  account.__abuSecureStoreFailClosed=true;
  return true
}
function verifyVaultGateway(){
  const cloud=window.AbuBassamCloud;
  if(!cloud)return;
  if(cloud.__abuBranchVaultPatched)return;
  armVault()
}
function boot(){
  document.addEventListener('click',blockSensitiveClick,true);
  armVault();patchAccountApi();
  [0,50,150,400,900,1800,3500].forEach(ms=>setTimeout(()=>{verifyVaultGateway();patchAccountApi()},ms));
  setInterval(()=>{verifyVaultGateway();patchAccountApi()},3000);
  document.addEventListener('abu-bassam-auth-changed',()=>setTimeout(()=>{verifyVaultGateway();patchAccountApi()},50))
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
