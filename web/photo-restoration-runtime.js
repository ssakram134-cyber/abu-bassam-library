(()=>{
'use strict';
// Entire repair happens locally. Original File and its object URL remain untouched.
if(window.AbuBassamPhotoRestoration)return;
const LIMIT=4000000,STEPS=3;
const $=id=>document.getElementById(id);
let surface,context,untouched,edited,record=null,undo=[],redo=[],stroke=null,active=false,busy=false;
function clamp(n,a,b){return Math.min(b,Math.max(a,n))}
function med(v){return v.sort((a,b)=>a-b)[Math.floor(v.length/2)]}
function lum(p,i){return p[i]*.2126+p[i+1]*.7152+p[i+2]*.0722}
function clearSpecks(src,w,h,level=3){
 const result=new Uint8ClampedArray(src),power=clamp(level,1,5);
 const threshold=46-5*power,maxVariation=18+3*power;
 let repaired=0;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const index=4*(y*w+x);if(src[index+3]<250)continue;
  const neighbors=[-w-1,-w,-w+1,-1,1,w-1,w,w+1].map(v=>index+4*v);
  const values=neighbors.map(i=>lum(src,i)),sorted=[...values].sort((a,b)=>a-b),m=sorted[4];
  if(sorted[6]-sorted[1]>maxVariation||Math.abs(lum(src,index)-m)<threshold)continue;
  const similar=neighbors.filter((i,j)=>Math.abs(values[j]-m)<maxVariation);
  if(similar.length<6)continue;
  for(let channel=0;channel<3;channel++){
   const replacement=med(similar.map(i=>src[i+channel])),strength=.68+power*.055;
   result[index+channel]=src[index+channel]*(1-strength)+replacement*strength
  }
  repaired++
 }
 return{pixels:result,repaired}
}
function healAt(dst,source,w,h,cx,cy,radius=14,intensity=3){
 const r=clamp(Math.round(radius),2,65),sample=Math.round(r*1.5)+2,power=clamp(intensity,1,5);
 let affected=0;
 for(let y=Math.max(0,cy-r);y<=Math.min(h-1,cy+r);y++)for(let x=Math.max(0,cx-r);x<=Math.min(w-1,cx+r);x++){
  const d=Math.hypot(x-cx,y-cy);if(d>=r)continue;
  const pos=4*(y*w+x);if(source[pos+3]<12)continue;
  const near=[
   4*(y*w+clamp(x-sample,0,w-1)),4*(y*w+clamp(x+sample,0,w-1)),
   4*(clamp(y-sample,0,h-1)*w+x),4*(clamp(y+sample,0,h-1)*w+x)
  ];
  const mix=(1-d/r)*(.3+.12*power);
  for(let c=0;c<3;c++)dst[pos+c]=dst[pos+c]*(1-mix)+med(near.map(i=>source[i+c]))*mix;
  affected++
 }
 return affected
}
function status(t){const e=$('restoreStatus');if(e)e.textContent=t}
function draw(data){if(context&&surface&&data)context.putImageData(new ImageData(new Uint8ClampedArray(data),surface.width,surface.height),0,0)}
function view(before=false){draw(before?untouched:edited)}
function capture(){undo.push(new Uint8ClampedArray(edited));if(undo.length>STEPS)undo.shift();redo=[]}
function refreshButtons(){
 for(const id of ['restoreAuto','restoreReset','restoreSave','restoreSize','restoreStrength','restoreFormat'])
  if($(id))$(id).disabled=busy||!edited;
 if($('restoreUndo'))$('restoreUndo').disabled=busy||!undo.length;
 if($('restoreRedo'))$('restoreRedo').disabled=busy||!redo.length
}
function items(){return window.AbuBassamCompressorRestoreBridge?.items?.()||[]}
async function openSource(id){
 if(busy)return;
 const item=items().find(i=>String(i.id)===String(id));if(!item)return status('أضف صورة إلى القائمة أولاً');
 busy=true;refreshButtons();status('جارٍ تحميل الصورة...');
 try{
  const image=new Image();
  await new Promise((ok,fail)=>{image.onload=ok;image.onerror=()=>fail(Error('تعذر فتح الصورة'));image.src=item.url});
  const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
  if(!iw||!ih)throw Error('أبعاد غير صالحة');
  const scale=Math.min(1,Math.sqrt(LIMIT/(iw*ih)));
  surface=$('restoreCanvas');surface.width=Math.max(1,Math.round(iw*scale));surface.height=Math.max(1,Math.round(ih*scale));
  context=surface.getContext('2d',{willReadFrequently:true});
  if(!context)throw Error('تعذر إنشاء سطح الترميم');
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  context.drawImage(image,0,0,surface.width,surface.height);
  untouched=new Uint8ClampedArray(context.getImageData(0,0,surface.width,surface.height).data);
  edited=new Uint8ClampedArray(untouched);record=item;undo=[];redo=[];stroke=null;active=false;
  $('restoreFormat').value=item.file.type==='image/png'?'image/png':'image/jpeg';
  $('restoreInfo').textContent=surface.width+'×'+surface.height+' بكسل'+(scale<1?' • نسخة عمل مصغّرة لحماية الذاكرة؛ الأصل محفوظ':'');
  status('اختر تنظيفًا تلقائيًا أو مرر الفرشاة فوق الخدوش.');view()
 }catch(err){untouched=null;edited=null;record=null;status('تعذر فتح الصورة: '+err.message)}
 finally{busy=false;refreshButtons()}
}
function position(event){
 const r=surface.getBoundingClientRect();if(!r.width||!r.height)return null;
 return{x:clamp(Math.round((event.clientX-r.left)*surface.width/r.width),0,surface.width-1),
 y:clamp(Math.round((event.clientY-r.top)*surface.height/r.height),0,surface.height-1)}
}
function strokeAt(event){
 if(!stroke||!edited)return;const p=position(event);if(!p)return;
 healAt(edited,stroke,surface.width,surface.height,p.x,p.y,Number($('restoreSize').value),Number($('restoreStrength').value));view()
}
async function runAuto(){
 if(busy||!edited)return;busy=true;refreshButtons();status('جارٍ تحليل الغبار والبقع الصغيرة محليًا...');
 const source=new Uint8ClampedArray(edited);
 try{
  await new Promise(ok=>setTimeout(ok,0));
  const clean=clearSpecks(source,surface.width,surface.height,Number($('restoreStrength').value));
  if(clean.repaired){capture();edited=clean.pixels;view()}
  status(clean.repaired?'تم إصلاح '+clean.repaired+' بقعة محتملة. راجع التفاصيل قبل الحفظ.':'لم تظهر بقع منفردة واضحة. استخدم الفرشاة على الخدوش الطويلة.')
 }catch(e){status('تعذر التنظيف: '+e.message)}
 finally{busy=false;refreshButtons()}
}
function goBack(){
 if(!edited||busy||!undo.length)return;
 redo.push(new Uint8ClampedArray(edited));edited=undo.pop();view();refreshButtons()
}
function goForward(){
 if(!edited||busy||!redo.length)return;
 undo.push(new Uint8ClampedArray(edited));if(undo.length>STEPS)undo.shift();edited=redo.pop();view();refreshButtons()
}
function reset(){
 if(!edited||busy)return;capture();edited=new Uint8ClampedArray(untouched);view();refreshButtons()
}
async function save(){
 if(!edited||!record||busy)return;
 if(!items().some(i=>String(i.id)===String(record.id)))return status('الصورة حُذفت من القائمة؛ أعد اختيارها');
 busy=true;refreshButtons();status('جارٍ تجهيز النسخة...');
 try{
  view();const mime=$('restoreFormat').value;
  if(mime==='image/jpeg'&&record.file.type==='image/png')throw Error('لحفظ شفافية PNG استخدم إخراج PNG');
  const blob=await new Promise((ok,fail)=>surface.toBlob(b=>b&&b.type===mime?ok(b):fail(Error('فشل إنشاء الصورة')),mime,mime==='image/jpeg'?.95:undefined));
  await window.AbuBassamCompressorRestoreBridge.commit({blob,id:record.id,width:surface.width,height:surface.height,mime});
  status('نجح الترميم. النسخة الجديدة في النتائج؛ اضغط «حفظ النتائج». الأصل محفوظ دون تغيير.')
 }catch(e){status('تعذر حفظ النسخة: '+e.message)}
 finally{busy=false;refreshButtons()}
}
function init(){
 const open=$('restoreOpenBtn'),after=$('selectedList');if(!open||!after)return;
 const panel=document.createElement('section');panel.id='photoRestorePanel';panel.hidden=true;
 panel.innerHTML='<h2>🩹 ترميم الصور القديمة — وضع متقدم</h2>'+
  '<p>تنظيف غبار صغير تلقائيًا • فرشاة معالجة الخدوش يدويًا • المعالجة دون إنترنت • لا تغيير للأصل</p>'+
  '<label>اختر الصورة <select id="restoreSource"></select></label>'+
  '<div class="restoreTools"><label>القوة <input id="restoreStrength" type="range" min="1" max="5" value="3"></label>'+
  '<label>حجم الفرشاة <input id="restoreSize" type="range" min="3" max="65" value="14"></label></div>'+
  '<button id="restoreAuto">✨ تنظيف الغبار تلقائيًا</button><small id="restoreInfo"></small>'+
  '<div class="restoreStage"><canvas id="restoreCanvas" aria-label="الصورة الجاري ترميمها"></canvas></div>'+
  '<div class="restoreTools"><button id="restoreBefore">الضغط لرؤية الأصل</button><button id="restoreUndo">↶ تراجع</button>'+
  '<button id="restoreRedo">↷ إعادة</button><button id="restoreReset">استعادة الأصل</button></div>'+
  '<div class="restoreTools"><label>صيغة الحفظ <select id="restoreFormat"><option value="image/jpeg">JPEG</option>'+
  '<option value="image/png">PNG</option></select></label><button id="restoreSave">💾 حفظ النسخة المرممة</button></div>'+
  '<div id="restoreStatus" role="status" aria-live="polite"></div>'+
  '<button id="restoreClose">إغلاق الترميم</button>';
 after.parentNode.insertBefore(panel,after);
 const selector=$('restoreSource');
 open.onclick=()=>{
  if(busy)return;
  panel.hidden=!panel.hidden;
  if(!panel.hidden){
   selector.textContent='';
   for(const item of items()){const option=document.createElement('option');option.value=String(item.id);option.textContent=item.file.name;selector.appendChild(option)}
   if(items().length)void openSource(selector.value);else status('أضف صورة أولًا');
   panel.scrollIntoView?.({block:'nearest',behavior:'smooth'})
  }
 };
 selector.onchange=()=>{void openSource(selector.value)};
 $('restoreClose').onclick=()=>{if(!busy)panel.hidden=true};
 $('restoreAuto').onclick=()=>{void runAuto()};
 $('restoreUndo').onclick=goBack;$('restoreRedo').onclick=goForward;$('restoreReset').onclick=reset;
 $('restoreSave').onclick=()=>{void save()};
 const before=$('restoreBefore');before.addEventListener('pointerdown',e=>{e.preventDefault();view(true)});
 for(const e of ['pointerup','pointercancel','pointerleave'])before.addEventListener(e,()=>view());
 const c=$('restoreCanvas');
 c.addEventListener('pointerdown',e=>{
  if(!edited||busy||e.button>0)return;
  e.preventDefault();capture();stroke=new Uint8ClampedArray(edited);active=true;
  c.setPointerCapture?.(e.pointerId);strokeAt(e);refreshButtons()
 });
 c.addEventListener('pointermove',e=>{if(active){e.preventDefault();strokeAt(e)}});
 for(const ev of ['pointerup','pointercancel'])c.addEventListener(ev,()=>{active=false;stroke=null});
 refreshButtons()
}
window.AbuBassamPhotoRestoration=Object.freeze({clearSpecks,healAt,open:()=>$('restoreOpenBtn')?.click()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init()
})();