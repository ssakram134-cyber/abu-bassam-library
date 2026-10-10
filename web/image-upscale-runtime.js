(()=>{
'use strict';
if(window.AbuBassamImageUpscale)return;
const $=id=>document.getElementById(id);
const PRESETS=Object.freeze({QCIF:[176,144],CIF:[352,288],VGA:[640,480],SVGA:[800,600],HD:[1280,720],FHD:[1920,1080],QHD:[2560,1440],UHD4K:[3840,2160],K5:[5120,2880],UHD8K:[7680,4320]});
let busy=false,previewUrl='';
function geometry(w,h,key,mode='contain'){
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('UPSCALE_INVALID_SOURCE');
 const p=PRESETS[key];if(!p)throw Error('UPSCALE_INVALID_PRESET');
 const portrait=h>w,tw=portrait?p[1]:p[0],th=portrait?p[0]:p[1];
 const scale=mode==='cover'?Math.max(tw/w,th/h):Math.min(tw/w,th/h);
 return{width:tw,height:th,x:(tw-w*scale)/2,y:(th-h*scale)/2,drawWidth:w*scale,drawHeight:h*scale,scale};
}
function maxPixels(deviceMemory){return Number(deviceMemory)>=8?36000000:18000000}
function safeSize(w,h,budget=maxPixels(navigator.deviceMemory)){
 return Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&w*h<=budget;
}
function say(v){const out=$('upscaleStatus');if(out)out.textContent=String(v)}
function sources(){return window.AbuBassamCompressorRestoreBridge?.items?.()||[]}
function release(){if(previewUrl){try{URL.revokeObjectURL(previewUrl)}catch(_){}previewUrl=''}}
function refresh(){
 const list=$('upscaleSource'),previous=list.value;list.textContent='';
 for(const item of sources()){const e=document.createElement('option');e.value=String(item.id);e.textContent=item.file?.name||'صورة';list.appendChild(e)}
 if(sources().some(x=>String(x.id)===previous))list.value=previous;
}
function state(v){busy=v;for(const id of ['upscaleSource','upscalePreset','upscaleMode','upscaleMime','upscaleRun'])if($(id))$(id).disabled=v}
async function run(){
 if(busy)return false;
 const item=sources().find(x=>String(x.id)===String($('upscaleSource').value));
 if(!item){say('أضف صورة أولًا في قسم الضغط.');return false}
 state(true);release();say('جارٍ تكبير الصورة دون اتصال بالإنترنت...');
 try{
  const image=new Image();
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('تعذر فتح الصورة'));image.src=item.url});
  const dim=geometry(image.naturalWidth||image.width,image.naturalHeight||image.height,$('upscalePreset').value,$('upscaleMode').value);
  if(!safeSize(dim.width,dim.height))throw Error('UPSCALE_MEMORY_LIMIT: هذه الدقة قد تتجاوز ذاكرة الهاتف؛ اختر دقة أصغر.');
  if(dim.scale<=1)throw Error('الدقة المختارة لا تزيد أبعاد الصورة. اختر دقة أعلى.');
  const mime=$('upscaleMime').value,cv=document.createElement('canvas');
  cv.width=dim.width;cv.height=dim.height;
  const context=cv.getContext('2d',{alpha:mime==='image/png'});
  if(!context)throw Error('تعذر تشغيل معالج رفع الدقة');
  if(mime!=='image/png'){context.fillStyle='#ffffff';context.fillRect(0,0,cv.width,cv.height)}
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  context.drawImage(image,dim.x,dim.y,dim.drawWidth,dim.drawHeight);
  const blob=await new Promise((resolve,reject)=>cv.toBlob(b=>b&&b.size>0&&b.type===mime?resolve(b):reject(Error('تعذر إنشاء النسخة بالصيغة المختارة')),mime,mime==='image/png'?undefined:.92));
  if(!sources().some(x=>String(x.id)===String(item.id)))throw Error('الصورة الأصلية لم تعد ضمن القائمة');
  const handler=window.AbuBassamCompressorRestoreBridge?.commit;
  if(!handler)throw Error('خدمة الحفظ غير جاهزة');
  await handler({blob,id:item.id,width:dim.width,height:dim.height,mime,kind:'upscaled',preset:$('upscalePreset').value});
  previewUrl=URL.createObjectURL(blob);$('upscaleBefore').src=item.url;$('upscaleAfter').src=previewUrl;$('upscalePreview').hidden=false;
  say('تم إنشاء نسخة بدقة '+dim.width+'×'+dim.height+' بكسل. اضغط «حفظ النتائج» لتنزيلها. الأصل لم يتغير، ولم تُستعد تفاصيل مفقودة.');
  return true;
 }catch(e){say('تعذر رفع الدقة: '+String(e?.message||e));return false}
 finally{state(false)}
}
function mount(){
 const button=$('upscaleOpenBtn'),list=$('selectedList');if(!button||!list)return;
 const box=document.createElement('section');box.id='upscalePanel';box.hidden=true;
 box.innerHTML='<h2>✨ رفع دقة الصورة حتى 8K</h2>'+
 '<p>رفع عدد البكسلات بالاستيفاء عالي الجودة؛ لا يمكن اختراع التفاصيل المفقودة.</p>'+
 '<label>الصورة <select id="upscaleSource"></select></label>'+
 '<label>الدقة <select id="upscalePreset"></select></label>'+
 '<label>التناسب <select id="upscaleMode"><option value="contain">حفظ كامل الصورة</option><option value="cover">ملء الإطار وقص الحواف</option></select></label>'+
 '<label>الصيغة <select id="upscaleMime"><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>'+
 '<button id="upscaleRun">✨ تكبير الصورة</button><div id="upscaleStatus" role="status"></div>'+
 '<div id="upscalePreview" hidden><img id="upscaleBefore" alt="الأصل"><img id="upscaleAfter" alt="بعد التكبير"></div>'+
 '<button id="upscaleClose">إغلاق</button>';
 list.parentNode.insertBefore(box,list);
 for(const [key,dims] of Object.entries(PRESETS)){const option=document.createElement('option');option.value=key;option.textContent=key+' — '+dims[0]+'×'+dims[1];$('upscalePreset').appendChild(option)}
 $('upscalePreset').value='FHD';
 button.onclick=()=>{if(busy)return;box.hidden=!box.hidden;if(!box.hidden)refresh()};
 $('upscaleClose').onclick=()=>{if(!busy)box.hidden=true};
 $('upscaleRun').onclick=()=>{void run()};
 say('10 مقاسات من QCIF إلى 8K. تصدير 8K مشروط بذاكرة الهاتف؛ الصورة الأصلية لا تُعدل.')
}
window.AbuBassamImageUpscale=Object.freeze({PRESETS,geometry,maxPixels,safeSize,run});
window.addEventListener('beforeunload',release);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount()
})();