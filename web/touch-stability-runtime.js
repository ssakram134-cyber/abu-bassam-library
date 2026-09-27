(()=>{
'use strict';
if(window.__ABU_TOUCH_STABILITY_V1__)return;
window.__ABU_TOUCH_STABILITY_V1__=true;

const STYLE_ID='abuTouchStabilityStyle';
const GUARDED='abuTouchGuarded';
let scheduled=false;

function addStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
html,body,.app{touch-action:auto!important}
button,a,label,input,select,textarea,[role="button"],[onclick]{touch-action:manipulation!important}
#splash.hide,#splash[aria-hidden="true"],#busyOverlay:not(.show),.busy:not(.show),.sheet-backdrop:not(.show),.sheet:not(.show),.paper-zoom:not(.show),.nat-modal:not(.show),.nat-zoom:not(.show),.abu-device-modal:not(.show),.abu-security-gate.hide{pointer-events:none!important}
`;
  (document.head||document.documentElement).appendChild(style);
}

function hiddenByStyle(el){
  if(!el||el.hidden)return true;
  try{
    const style=getComputedStyle(el);
    return style.display==='none'||style.visibility==='hidden'||(Number(style.opacity)===0&&el.id==='splash');
  }catch(_){return false}
}

function shouldBeDisabled(el){
  if(!el)return false;
  if(hiddenByStyle(el))return true;
  if(el.id==='splash')return el.classList.contains('hide')||el.getAttribute('aria-hidden')==='true';
  if(el.id==='busyOverlay'||el.classList.contains('busy'))return !el.classList.contains('show');
  if(el.classList.contains('sheet-backdrop')||el.classList.contains('sheet')||el.classList.contains('paper-zoom')||el.classList.contains('nat-modal')||el.classList.contains('nat-zoom')||el.classList.contains('abu-device-modal'))return !el.classList.contains('show');
  if(el.classList.contains('abu-security-gate'))return el.classList.contains('hide');
  return false;
}

function guardElement(el){
  if(!el)return;
  if(shouldBeDisabled(el)){
    if(el.dataset[GUARDED]!=='1'){
      el.dataset[GUARDED]='1';
      el.style.pointerEvents='none';
      try{el.inert=true}catch(_){}
    }
    return;
  }
  if(el.dataset[GUARDED]==='1'){
    delete el.dataset[GUARDED];
    el.style.removeProperty('pointer-events');
    try{el.inert=false}catch(_){}
  }
}

function repair(){
  scheduled=false;
  try{
    addStyle();
    if(document.documentElement.style.touchAction!=='auto')document.documentElement.style.touchAction='auto';
    if(document.body&&document.body.style.touchAction!=='auto')document.body.style.touchAction='auto';
    document.querySelectorAll('#splash,#busyOverlay,.busy,.sheet-backdrop,.sheet,.paper-zoom,.nat-modal,.nat-zoom,.abu-device-modal,.abu-security-gate').forEach(guardElement);
  }catch(_){}
}

function scheduleRepair(){
  if(scheduled)return;
  scheduled=true;
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(repair);else setTimeout(repair,0);
}

function start(){
  repair();
  try{
    const observer=new MutationObserver(scheduleRepair);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden']});
  }catch(_){}
  ['pageshow','focus','resize'].forEach(type=>window.addEventListener(type,scheduleRepair,{passive:true}));
  document.addEventListener('visibilitychange',scheduleRepair,{passive:true});
  document.addEventListener('pointerup',scheduleRepair,{capture:true,passive:true});
  document.addEventListener('touchend',scheduleRepair,{capture:true,passive:true});
  [100,400,1000,2500].forEach(ms=>setTimeout(repair,ms));
  try{
    if(window.ReactNativeWebView&&typeof window.ReactNativeWebView.postMessage==='function'){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'webBootReady'}));
    }
  }catch(_){}
}

window.AbuBassamTouchStability={repair:scheduleRepair};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
