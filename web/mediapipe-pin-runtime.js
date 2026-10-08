(()=>{
'use strict';
if(window.__ABU_MEDIAPIPE_PIN_V2__)return;
window.__ABU_MEDIAPIPE_PIN_V2__=true;
const VERSION='0.1.1675465747';
const LOCAL_BASE='vendor/mediapipe/';
const REMOTE_BASE=`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@${VERSION}/`;
function nativeBridgeAvailable(){return !!(window.Android&&typeof window.Android.security==='function')}
const BASE=nativeBridgeAvailable()?LOCAL_BASE:REMOTE_BASE;
window.getSelfie=async function(){
  if(typeof selfieModel!=='undefined'&&selfieModel)return selfieModel;
  if(typeof loadScript!=='function')throw new Error('أداة إزالة الخلفية غير جاهزة');
  if(nativeBridgeAvailable()&&!BASE.startsWith('vendor/'))throw new Error('رفض تحميل مكوّن خارجي داخل طبقة Android الآمنة');
  await loadScript(BASE+'selfie_segmentation.js');
  if(!window.SelfieSegmentation)throw new Error(nativeBridgeAvailable()?'تعذر تشغيل مكوّن إزالة الخلفية المحلي. أعد فتح التطبيق.':'تعذر تشغيل إزالة الخلفية. تحقق من الإنترنت.');
  selfieModel=new SelfieSegmentation({locateFile:file=>BASE+file});
  selfieModel.setOptions({modelSelection:1});
  selfieModel.onResults(result=>{
    if(typeof selfieResolve!=='undefined'&&selfieResolve){const resolve=selfieResolve;selfieResolve=null;resolve(result)}
  });
  return selfieModel;
};
window.AbuBassamMediaPipe={version:VERSION,base:BASE,mode:nativeBridgeAvailable()?'embedded':'remote-browser-only'};
})();
