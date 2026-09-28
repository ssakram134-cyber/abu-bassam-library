(()=>{
'use strict';
if(window.__ABU_TOUCH_STABILITY_V2__)return;
window.__ABU_TOUCH_STABILITY_V2__=true;
window.__ABU_TOUCH_STABILITY_V1__=true;

const STYLE_ID='abuTouchStabilityStyleV2';
function installCssGuards(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
html,body,.app{touch-action:auto!important}
button,a,label,input,select,textarea,[role="button"],[onclick]{touch-action:manipulation!important}
#splash.hide,#splash[aria-hidden="true"],#busyOverlay:not(.show),.busy:not(.show),.sheet-backdrop:not(.show),.sheet:not(.show),.paper-zoom:not(.show),.nat-modal:not(.show),.nat-zoom:not(.show),.abu-device-modal:not(.show),.cs-modal:not(.show),.v-modal:not(.show),.v-busy:not(.show),.abu-settings-modal:not(.show),.abu-security-gate.hide,#abuRecoveryModal[style*="display: none"]{pointer-events:none!important}
`;
  (document.head||document.documentElement).appendChild(style);
}
function signalReady(){
  try{
    if(window.ReactNativeWebView&&typeof window.ReactNativeWebView.postMessage==='function'){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'webBootReady',source:'touch-stability-v2',at:Date.now()}));
    }
  }catch(_){}
}
function start(){
  try{installCssGuards()}catch(_){}
  signalReady();
}
window.AbuBassamTouchStability={version:2,repair:start};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.addEventListener('pageshow',signalReady,{passive:true});
})();
