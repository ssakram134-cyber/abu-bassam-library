(()=>{
'use strict';
if(window.__ABU_DOCUMENT_VAULT_OFFLINE_OCR_V1__)return;
window.__ABU_DOCUMENT_VAULT_OFFLINE_OCR_V1__=true;
let workerPromise=null,lastImage='',idleTimer=0,imageTimer=0,busy=false,requestVersion=0,queue=Promise.resolve();
const $=id=>document.getElementById(id);
function setProgress(t){const e=$('vOcrProgress');if(e)e.textContent=t||''}
function clearTimers(){clearTimeout(idleTimer);clearTimeout(imageTimer)}
async function terminate(){clearTimeout(idleTimer);if(busy){idleTimer=setTimeout(terminate,30000);return false}const p=workerPromise;workerPromise=null;if(p){try{const w=await p;await w?.terminate?.()}catch(_){}}return true}
function scheduleIdle(ms=120000){clearTimeout(idleTimer);idleTimer=setTimeout(terminate,ms);clearTimeout(imageTimer);imageTimer=setTimeout(()=>{lastImage=''},10*60*1000)}
function loadLocalScript(){return new Promise((resolve,reject)=>{if(window.Tesseract)return resolve();const old=document.getElementById('abuLocalTesseract');if(old){old.addEventListener('load',resolve,{once:true});old.addEventListener('error',()=>reject(new Error('تعذر تحميل OCR المحلي')),{once:true});return}const s=document.createElement('script');s.id='abuLocalTesseract';s.src='vendor/tesseract/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('ملفات OCR المحلية غير موجودة في هذه النسخة'));document.head.appendChild(s)})}
async function worker(){clearTimeout(idleTimer);if(workerPromise)return workerPromise;workerPromise=(async()=>{await loadLocalScript();if(!window.Tesseract?.createWorker)throw new Error('محرك OCR المحلي غير جاهز');return Tesseract.createWorker('ara+eng',1,{workerPath:'vendor/tesseract/worker.min.js',langPath:'vendor/tesseract/lang',corePath:'vendor/tesseract/core',logger:m=>{if(m?.status==='recognizing text')setProgress('جاري قراءة النص محليًا... '+Math.round((m.progress||0)*100)+'%');else if(m?.status)setProgress('OCR محلي: '+m.status)}})})();try{return await workerPromise}catch(e){workerPromise=null;throw e}}
async function recognize(dataUrl){if(!dataUrl)return;lastImage=dataUrl;const img=$('vOcrImage'),text=$('vOcrText');if(img){img.src=dataUrl;img.style.display='block'}if(text)text.value='';setProgress('جاري تشغيل OCR العربي والإنجليزي من ملفات التطبيق المحلية...');busy=true;try{const w=await worker(),result=await w.recognize(dataUrl),out=String(result?.data?.text||'').replace(/\r/g,'').trim();if(text)text.value=out;setProgress(out?'تم استخراج النص محليًا بدون إنترنت ✓':'لم يظهر نص واضح؛ جرّب صورة أوضح أو استخدم القص والتوضيح أولًا.');try{window.AbuBassamOps?.add?.({type:'ocr',title:'OCR محلي',details:out?out.length+' حرف':'بدون نتيجة',section:'الحفظ والمستندات'})}catch(e){}}catch(e){setProgress('تعذر OCR المحلي: '+(e.message||e)+'. أعد بناء APK لتضمين ملفات OCR المحلية.')}finally{busy=false;scheduleIdle()}}
function cancel(){
  requestVersion++;
  lastImage='';
  clearTimeout(imageTimer);
  imageTimer=0
}
function boot(){
  document.addEventListener('abu-bassam-auth-changed',cancel);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')scheduleIdle(15000)})
}
window.AbuDocumentVaultOfflineOcr={recognize,cancel,ready:()=>!!window.Tesseract?.createWorker,terminate};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();