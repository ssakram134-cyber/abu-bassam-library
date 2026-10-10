(()=>{
'use strict';
if(window.AbuNationalQualityReview)return;
const $=id=>document.getElementById(id);
let busy=false,approved=false,lastText='';
function glare(pixel,w,h){
 if(!pixel||!w||!h)return{suspicious:false,hits:0,total:0};
 let hits=0,total=0,step=Math.max(2,Math.round(Math.min(w,h)/120));
 const bright=i=>pixel[i]>245&&pixel[i+1]>245&&pixel[i+2]>245;
 const dark=i=>(pixel[i]+pixel[i+1]+pixel[i+2])/3<208;
 for(let y=Math.floor(h*.12);y<h*.88;y+=step)for(let x=Math.floor(w*.12);x<w*.88;x+=step){
  total++;const i=4*(y*w+x);if(!bright(i))continue;
  const k=Math.max(5,Math.round(Math.min(w,h)*.08));
  if(dark(4*(y*w+Math.max(0,x-k)))||dark(4*(y*w+Math.min(w-1,x+k)))||
     dark(4*(Math.max(0,y-k)*w+x))||dark(4*(Math.min(h-1,y+k)*w+x)))hits++
 }
 return{suspicious:hits>Math.max(3,Math.round(total*.012)),hits,total}
}
function info(text){if($('natReviewStatus'))$('natReviewStatus').textContent=String(text)}
function source(){return window.Nat?.reviewData?.()||null}
function canStart(){return !busy&&!!source()?.src}
function drawCheck(){
 const item=source();if(!item)return info('اختر صورة في قسم البطاقة الوطنية أولاً');
 try{
  const cut=item.detection?.state==='red'&&item.detection?.reason||'';
  info(cut?'⚠️ احتمال نقص في تأطير المستمسك: '+cut:'لم يكشف محرك التأطير فقدانًا واضحًا للحواف. راجع المعاينة يدويًا.');
  const img=new Image();img.onload=()=>{
   const factor=Math.min(1,520/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height)),cv=document.createElement('canvas');
   cv.width=Math.max(1,Math.round(img.width*factor));cv.height=Math.max(1,Math.round(img.height*factor));
   const ctx=cv.getContext('2d',{willReadFrequently:true});if(!ctx)return;
   ctx.drawImage(img,0,0,cv.width,cv.height);
   const result=glare(ctx.getImageData(0,0,cv.width,cv.height).data,cv.width,cv.height);
   const level=result.suspicious?'⚠️ انعكاس أو منطقة بيضاء مشبوهة؛ أعد التصوير إذا أخفت الكتابة.':'لم يُرصد انعكاس شديد واضح، راجع النصوص بعينك.';
   info((cut?'⚠️ الأطراف: '+cut+'. ':'')+level)
  };
  img.onerror=()=>info('تعذر فحص الإضاءة');img.src=item.src
 }catch(e){info('تعذر فحص المستمسك: '+String(e.message||e))}
}
async function loadOCR(){
 if(window.Tesseract?.createWorker)return;
 await new Promise((ok,fail)=>{
  const script=document.createElement('script');
  script.src='vendor/tesseract/tesseract.min.js';script.onload=ok;script.onerror=()=>fail(Error('ملفات OCR المحلية غير موجودة'));
  document.head.appendChild(script)
 });
 if(!window.Tesseract?.createWorker)throw Error('محرك OCR المحلي غير متاح')
}
async function recognize(){
 if(!canStart())return info('اختر صورة أولاً أو أكمل العملية الحالية');
 busy=true;approved=false;lastText='';info('جارٍ استخراج النص محلياً، دون إرسال الصور إلى خادم...');
 $('natReviewApprove').disabled=true;
 let worker;
 try{
  const item=source();await loadOCR();
  worker=await window.Tesseract.createWorker('ara+eng',1,{
   workerPath:'vendor/tesseract/worker.min.js',langPath:'vendor/tesseract/lang',
   corePath:'vendor/tesseract/core'
  });
  const result=await worker.recognize(item.src);
  const value=String(result?.data?.text||'').replace(/\r/g,'').slice(0,6000).trim();
  if(!value)throw Error('لم يُكتشف نص واضح في المستمسك');
  $('natReviewOcr').value=value;lastText=value;
  $('natReviewApprove').disabled=false;
  info('تم استخراج نص مبدئي. راجع الحروف والأرقام وصححها يدويًا ثم اضغط اعتماد النص. لم يُحفظ شيء تلقائياً.')
 }catch(e){info('تعذر التعرف على النص: '+String(e?.message||e))}
 finally{busy=false;try{await worker?.terminate?.()}catch(_){}}
}
function approve(){
 if(busy||!lastText)return info('استخرج النص أولًا وراجعه');
 const text=String($('natReviewOcr').value||'').trim().slice(0,6000);
 if(!text)return info('النص فارغ؛ لن يُحفظ');
 approved=true;lastText=text;info('تم اعتماد النص بعد المراجعة؛ لا يُحفظ إلا إذا ضغطت زر «حفظ النص».')
}
function save(){
 if(!approved||!lastText||String($('natReviewOcr').value).trim()!==lastText)return info('اعتمد النص بعد آخر تعديل قبل حفظه');
 const data='data:text/plain;base64,'+btoa(unescape(encodeURIComponent(lastText)));
 const filename='National_OCR_Reviewed_'+Date.now()+'.txt';
 if(window.Android?.saveBase64)window.Android.saveBase64(filename,'text/plain',data);
 else{const a=document.createElement('a');a.href=data;a.download=filename;document.body.appendChild(a);a.click();a.remove()}
 info('تم إرسال النص الذي اعتمدته إلى خيار الحفظ. لا يوجد حفظ تلقائي أو رفع سحابي.')
}
function build(){
 const center=$('nationalCenter');if(!center||$('natReviewPanel'))return;
 const box=document.createElement('section');box.id='natReviewPanel';
 box.innerHTML='<h3>📷 مساعد تصوير البطاقة الوطنية وتدقيقها</h3>'+
 '<p>الخطوة 1: تصوير الأمام كاملاً. الخطوة 2: تصوير الخلف. الخطوة 3: مراجعة الحواف والانعكاس. الخطوة 4: قراءة النص اختياريًا قبل الحفظ.</p>'+
 '<button id="natReviewCamera">📷 تصوير الوجه ثم الظهر</button>'+
 '<button id="natReviewCheck">🔎 فحص الأطراف واللمعان</button>'+
 '<button id="natReviewRead">🔤 قراءة النص العربي والإنجليزي (محلي)</button>'+
 '<div id="natReviewStatus" role="status"></div>'+
 '<label>النص المستخرج قابل للتصحيح <textarea id="natReviewOcr" rows="5" dir="auto" placeholder="لن يتم حفظ أي نص دون اعتمادك"></textarea></label>'+
 '<button id="natReviewApprove" disabled>✓ اعتماد النص بعد المراجعة</button>'+
 '<button id="natReviewSave">💾 حفظ النص المُعتمد TXT</button>';
 center.appendChild(box);
 $('natReviewCamera').onclick=()=>window.Nat?.maker?.();
 $('natReviewCheck').onclick=drawCheck;$('natReviewRead').onclick=()=>{void recognize()};
 $('natReviewApprove').onclick=approve;$('natReviewSave').onclick=save;
 $('natReviewOcr').oninput=()=>{approved=false;$('natReviewApprove').disabled=!lastText}
}
window.AbuNationalQualityReview=Object.freeze({glare,drawCheck,recognize});
window.addEventListener('DOMContentLoaded',build)
})();