(()=>{
'use strict';
if(window.__ABU_DOCUMENT_VAULT_OFFLINE_OCR_V1__)return;
window.__ABU_DOCUMENT_VAULT_OFFLINE_OCR_V1__=true;
let workerPromise=null,lastImage='',idleTimer=0,imageTimer=0,busy=false,recognizeEpoch=0;
const MAX_OCR_SOURCE_BYTES=12*1024*1024,MAX_OCR_DATA_CHARS=18*1024*1024;
const $=id=>document.getElementById(id);
function setProgress(t){const e=$('vOcrProgress');if(e)e.textContent=t||''}
function clearTimers(){clearTimeout(idleTimer);clearTimeout(imageTimer)}
async function terminate(){clearTimeout(idleTimer);if(busy){idleTimer=setTimeout(terminate,30000);return false}const p=workerPromise;workerPromise=null;if(p){try{const w=await p;await w?.terminate?.()}catch(_){}}return true}
function scheduleIdle(ms=120000){clearTimeout(idleTimer);idleTimer=setTimeout(terminate,ms);clearTimeout(imageTimer);imageTimer=setTimeout(()=>{lastImage=''},10*60*1000)}
function loadLocalScript(){return new Promise((resolve,reject)=>{if(window.Tesseract)return resolve();const old=document.getElementById('abuLocalTesseract');if(old){old.addEventListener('load',resolve,{once:true});old.addEventListener('error',()=>reject(new Error('تعذر تحميل OCR المحلي')),{once:true});return}const s=document.createElement('script');s.id='abuLocalTesseract';s.src='vendor/tesseract/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('ملفات OCR المحلية غير موجودة في هذه النسخة'));document.head.appendChild(s)})}
async function worker(){clearTimeout(idleTimer);if(workerPromise)return workerPromise;workerPromise=(async()=>{await loadLocalScript();if(!window.Tesseract?.createWorker)throw new Error('محرك OCR المحلي غير جاهز');return Tesseract.createWorker('ara+eng',1,{workerPath:'vendor/tesseract/worker.min.js',langPath:'vendor/tesseract/lang',corePath:'vendor/tesseract/core',logger:m=>{if(m?.status==='recognizing text')setProgress('جاري قراءة النص محليًا... '+Math.round((m.progress||0)*100)+'%');else if(m?.status)setProgress('OCR محلي: '+m.status)}})})();try{return await workerPromise}catch(e){workerPromise=null;throw e}}
async function recognize(dataUrl){
 if(!dataUrl)return;
 const job=++recognizeEpoch,img=$('vOcrImage'),text=$('vOcrText');
 if(typeof dataUrl!=='string'||!/^data:image\/(?:png|jpeg|webp|bmp);base64,/i.test(dataUrl)||dataUrl.length>MAX_OCR_DATA_CHARS){setProgress('الصورة كبيرة أو بصيغة غير مدعومة؛ اختر صورة أصغر من 12MB.');return}
 lastImage=dataUrl;
 if(img){img.src=dataUrl;img.style.display='block'}
 if(text)text.value='';
 setProgress('جاري تشغيل OCR العربي والإنجليزي محليًا...');
 busy=true;
 try{
  const w=await worker(),result=await w.recognize(dataUrl);
  if(job!==recognizeEpoch)return;
  const out=String(result?.data?.text||'').replace(/\r/g,'').trim();
  if(text)text.value=out;
  setProgress(out?'تم استخراج النص محليًا بدون إنترنت ✓':'لم يظهر نص واضح؛ جرّب صورة أوضح.');
  try{window.AbuBassamOps?.add?.({type:'ocr',title:'OCR محلي',details:out?out.length+' حرف':'بدون نتيجة',section:'الحفظ والمستندات'})}catch(_){}
 }catch(error){if(job===recognizeEpoch)setProgress('تعذر OCR المحلي: '+(error?.message||error))}
 finally{if(job===recognizeEpoch){busy=false;scheduleIdle()}}
}
function fileToData(file){return new Promise((resolve,reject)=>{
 if(!file||file.size>MAX_OCR_SOURCE_BYTES||!/^image\/(png|jpeg|webp|bmp)$/i.test(file.type||'')){reject(new Error('صيغة الصورة غير مدعومة أو حجمها يتجاوز 12MB'));return}
 const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error||new Error('تعذر قراءة الصورة'));reader.readAsDataURL(file)
})}
async function inputChanged(event){const file=event?.target?.files?.[0];if(!file)return;try{await recognize(await fileToData(file))}catch(error){setProgress(String(error?.message||error))}finally{if(event?.target)event.target.value=''}}
function bind(){const input=$('vOcrInput');if(input&&input.dataset.abuOfflineOcr!=='1'){input.dataset.abuOfflineOcr='1';input.onchange=inputChanged}if(window.DocumentVault&&!DocumentVault.__abuOfflineOcrPatched){DocumentVault.__abuOfflineOcrPatched=true;const oldRe=DocumentVault.reOcr;DocumentVault.reOcr=()=>{const src=lastImage||$('vOcrImage')?.src;if(src)return recognize(src);if(typeof oldRe==='function')return oldRe()}}
const prev=window.AbuBassamNativeCameraResult;if(prev&&!prev.__abuOfflineOcrWrapped){const wrap=function(result){if(result&&result.mode==='ocr'&&result.dataUrl){recognize(result.dataUrl);return}return prev(result)};wrap.__abuOfflineOcrWrapped=true;window.AbuBassamNativeCameraResult=wrap}}
function boot(){bind();let n=0,t=setInterval(()=>{n++;bind();if(n>240)clearInterval(t)},100);new MutationObserver(bind).observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')scheduleIdle(15000)})}
window.AbuDocumentVaultOfflineOcr={recognize,ready:()=>!!window.Tesseract,terminate};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();