(()=>{
'use strict';
if(window.__ABU_PHOTO_GEOMETRY_V1__)return;window.__ABU_PHOTO_GEOMETRY_V1__=true;
const $=id=>document.getElementById(id);let mode='crop',pts=null,drag=-1,drawToken=0,geoTarget=null,geoSourceAtOpen='',geometryBusy=false,geoOperationId=0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
function item(){try{return selectedIndex>=0&&uploadedImages?.[selectedIndex]?uploadedImages[selectedIndex]:null}catch(_){return null}}
function css(){if($('abuGeometryStyle'))return;let s=document.createElement('style');s.id='abuGeometryStyle';s.textContent=`
.abu-geo-launch{background:linear-gradient(135deg,#b45309,#f59e0b)!important;color:#fff!important;border:0!important}.abu-ruler-launch{background:linear-gradient(135deg,#1d4ed8,#0ea5e9)!important;color:#fff!important;border:0!important}.abu-geo-modal{position:fixed;inset:0;z-index:26500;background:#000d;display:none;align-items:center;justify-content:center;padding:10px}.abu-geo-modal.show{display:flex}.abu-geo-card{width:min(760px,100%);max-height:96vh;overflow:auto;background:#f8fafc;border-radius:18px;padding:12px;color:#1f2937}.abu-geo-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.abu-geo-head button{width:36px;height:36px;border:0;border-radius:50%;font-size:20px}.abu-geo-modes{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:8px 0}.abu-geo-modes button{min-height:40px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;font-weight:900}.abu-geo-modes button.on{background:#b45309;color:#fff;border-color:#b45309}.abu-geo-stage{position:relative;background:#111;border-radius:12px;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:260px}.abu-geo-stage canvas{display:block;max-width:100%;max-height:62vh}.abu-geo-handle{position:absolute;width:30px;height:30px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 2px 8px #0008;transform:translate(-50%,-50%);touch-action:none;z-index:4}.abu-geo-line{position:absolute;height:2px;background:#f59e0b;transform-origin:0 50%;z-index:3;pointer-events:none}.abu-geo-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.abu-geo-actions button{min-height:42px;border:0;border-radius:10px;background:#475569;color:#fff;font-weight:900}.abu-geo-actions .ok{background:#0f766e}.abu-geo-note{font-size:9px;color:#64748b;line-height:1.7;margin-top:7px}.abu-ruler-wrap{position:relative;margin:12px auto;background:#fff;box-shadow:0 8px 24px #0004;max-width:90%;}.abu-ruler-paper{position:absolute;inset:0;background-size:contain;background-position:center;background-repeat:no-repeat}.abu-ruler-safe{position:absolute;border:2px dashed #ef4444;pointer-events:none}.abu-ruler-top{position:absolute;left:0;right:0;top:-24px;height:22px;background:repeating-linear-gradient(90deg,#111 0 1px,transparent 1px 10%,#111 10% 10.6%,transparent 10.6% 20%);font-size:8px}.abu-ruler-left{position:absolute;top:0;bottom:0;left:-24px;width:22px;background:repeating-linear-gradient(180deg,#111 0 1px,transparent 1px 10%,#111 10% 10.6%,transparent 10.6% 20%)}.abu-ruler-caption{font-size:10px;font-weight:900;text-align:center;padding:8px;background:#e0f2fe;border-radius:9px;color:#075985}@media(max-width:430px){.abu-geo-actions{grid-template-columns:1fr 1fr}.abu-geo-handle{width:34px;height:34px}}
`;document.head.appendChild(s)}
function build(){css();let grid=document.querySelector('.panel .grid');if(grid&&!$('abuGeoLaunch')){let b=document.createElement('button');b.id='abuGeoLaunch';b.className='ctl abu-geo-launch';b.textContent='✂ قص حر / منظور';b.onclick=openGeo;let r=document.createElement('button');r.id='abuRulerLaunch';r.className='ctl abu-ruler-launch';r.textContent='📐 معاينة القياسات';r.onclick=openRuler;let extra=[...grid.children].find(x=>x.classList?.contains('extra'));grid.insertBefore(b,extra||null);grid.insertBefore(r,extra||null)}inject()}
function inject(){if($('abuGeoModal'))return;document.body.insertAdjacentHTML('beforeend',`<div id="abuGeoModal" class="abu-geo-modal"><div class="abu-geo-card"><div class="abu-geo-head"><b>✂ القص المباشر وتصحيح المنظور</b><button onclick="AbuPhotoGeometry.close('abuGeoModal')">×</button></div><div class="abu-geo-modes"><button id="abuModeCrop" class="on" onclick="AbuPhotoGeometry.setMode('crop')">قص مستطيل حر</button><button id="abuModePerspective" onclick="AbuPhotoGeometry.setMode('perspective')">تصحيح منظور 4 زوايا</button></div><div id="abuGeoStage" class="abu-geo-stage"><canvas id="abuGeoCanvas"></canvas></div><div class="abu-geo-actions"><button onclick="AbuPhotoGeometry.reset()">إعادة الزوايا</button><button class="ok" onclick="AbuPhotoGeometry.apply()">اعتماد</button></div><div class="abu-geo-note">اسحب الدوائر الأربع مباشرة فوق الصورة. في القص المستطيل تبقى الحواف متوازية. في وضع المنظور تتحرك كل زاوية بحرية ثم تُسوّى المنطقة المحددة إلى مستطيل للطباعة.</div></div></div><div id="abuRulerModal" class="abu-geo-modal"><div class="abu-geo-card"><div class="abu-geo-head"><b>📐 معاينة الورقة والهوامش بالملم</b><button onclick="AbuPhotoGeometry.close('abuRulerModal')">×</button></div><div id="abuRulerCaption" class="abu-ruler-caption"></div><div id="abuRulerWrap" class="abu-ruler-wrap"><div class="abu-ruler-top"></div><div class="abu-ruler-left"></div><div id="abuRulerPaper" class="abu-ruler-paper"></div><div id="abuRulerSafe" class="abu-ruler-safe"></div></div><div class="abu-geo-note">الإطار الأحمر المتقطع يمثل الهامش المحدد. المقاس النهائي يأتي من إعداد الورقة الفعلي، وليس من حجم شاشة الهاتف.</div></div></div>`)}
function openGeo(){if(geometryBusy)return;let it=item();if(!it)return alert('أضف صورة وحددها أولاً');if(!it.__abuGeometryOriginal)it.__abuGeometryOriginal=it.src;geoTarget=it;geoSourceAtOpen=it.src;mode='crop';$('abuModeCrop').classList.add('on');$('abuModePerspective').classList.remove('on');pts=[{x:.05,y:.05},{x:.95,y:.05},{x:.95,y:.95},{x:.05,y:.95}];draw();$('abuGeoModal').classList.add('show')}
function close(id){$(id)?.classList.remove('show');if(id==='abuGeoModal'){geoTarget=null;geoSourceAtOpen='';drawToken++;geoOperationId++}}
function setMode(m){if(geometryBusy)return;mode=m==='perspective'?'perspective':'crop';$('abuModeCrop').classList.toggle('on',mode==='crop');$('abuModePerspective').classList.toggle('on',mode==='perspective');reset()}
function reset(){if(geometryBusy)return;pts=[{x:.05,y:.05},{x:.95,y:.05},{x:.95,y:.95},{x:.05,y:.95}];draw()}
function draw(){let it=geoTarget,cv=$('abuGeoCanvas'),stage=$('abuGeoStage');if(!it||!cv||!stage)return;let im=it.img,w=im.naturalWidth||im.width,h=im.naturalHeight||im.height,sc=Math.min(1,1000/Math.max(w,h));cv.width=Math.round(w*sc);cv.height=Math.round(h*sc);let c=cv.getContext('2d');c.drawImage(im,0,0,cv.width,cv.height);stage.querySelectorAll('.abu-geo-handle,.abu-geo-line').forEach(n=>n.remove());const token=++drawToken;requestAnimationFrame(()=>{if(token!==drawToken||!stage.isConnected)return;let sr=stage.getBoundingClientRect(),cr=cv.getBoundingClientRect(),ox=cr.left-sr.left,oy=cr.top-sr.top;let local=pts.map(p=>({x:ox+p.x*cr.width,y:oy+p.y*cr.height}));local.forEach((p,i)=>{let h=document.createElement('span');h.className='abu-geo-handle';h.style.left=p.x+'px';h.style.top=p.y+'px';h.dataset.i=i;stage.appendChild(h);bind(h,i,cr,sr,ox,oy)});for(let i=0;i<4;i++){let a=local[i],b=local[(i+1)%4],line=document.createElement('span');line.className='abu-geo-line';let dx=b.x-a.x,dy=b.y-a.y;line.style.left=a.x+'px';line.style.top=a.y+'px';line.style.width=Math.hypot(dx,dy)+'px';line.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;stage.appendChild(line)}})}
function bind(h,i,cr,sr,ox,oy){h.addEventListener('pointerdown',e=>{if(geometryBusy)return;e.preventDefault();e.stopPropagation();if(drag!==-1)return;drag=i;const pointerId=e.pointerId;let move=ev=>{if(geometryBusy||ev.pointerId!==pointerId)return;let x=clamp((ev.clientX-cr.left)/cr.width,0,1),y=clamp((ev.clientY-cr.top)/cr.height,0,1);if(mode==='crop'){if(i===0){pts[0]={x,y};pts[1].y=y;pts[3].x=x}else if(i===1){pts[1]={x,y};pts[0].y=y;pts[2].x=x}else if(i===2){pts[2]={x,y};pts[1].x=x;pts[3].y=y}else{pts[3]={x,y};pts[0].x=x;pts[2].y=y}let l=Math.min(pts[0].x,pts[3].x),r=Math.max(pts[1].x,pts[2].x),t=Math.min(pts[0].y,pts[1].y),b=Math.max(pts[2].y,pts[3].y);pts=[{x:l,y:t},{x:r,y:t},{x:r,y:b},{x:l,y:b}]}else pts[i]={x,y};draw()};let up=ev=>{if(ev?.pointerId!=null&&ev.pointerId!==pointerId)return;drag=-1;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('blur',up)};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('blur',up)})}
async function apply(){
 if(geometryBusy)return;
 const it=geoTarget,originalSrc=geoSourceAtOpen;
 if(!it||!uploadedImages.includes(it)||it.src!==originalSrc||item()!==it)return alert('تغيّرت الصورة منذ فتح المحرر؛ أعد فتح القص حتى لا تُعدل صورة أخرى.');
 geometryBusy=true;
 const operationId=++geoOperationId;
 let out=null;
 const cancelled=()=>operationId!==geoOperationId||geoTarget!==it||it.src!==originalSrc||item()!==it||!uploadedImages.includes(it);
 try{
  if(typeof setBusy==='function')setBusy(true,mode==='crop'?'جاري القص...':'جاري تصحيح المنظور...');
  await new Promise(r=>setTimeout(r,30));
  if(cancelled())throw new Error('تغيّرت الصورة أثناء المعالجة؛ تم إلغاء النتيجة القديمة.');
  out=mode==='crop'?cropFull(it.img):await warpFull(it.img,cancelled);
  const mime=String(originalSrc).startsWith('data:image/png')?'image/png':'image/jpeg';
  const data=out.toDataURL(mime,mime==='image/png'?undefined:.98),im=new Image();
  await new Promise((res,rej)=>{im.onload=res;im.onerror=rej;im.src=data});
  if(cancelled())throw new Error('تغيّرت الصورة قبل اعتماد القص؛ لم يتم استبدالها.');
  it.src=data;it.img=im;geoSourceAtOpen=data;
  if(typeof refreshPeople==='function')refreshPeople();
  if(typeof renderPaper==='function')renderPaper();
  window.AbuPhotoAdvanced?.invalidatePosterPages?.();close('abuGeoModal')
 }catch(e){alert('تعذر تنفيذ العملية: '+(e.message||e))}
 finally{if(out){out.width=0;out.height=0}geometryBusy=false;if(typeof setBusy==='function')setBusy(false)}
}
function cropFull(im){let w=im.naturalWidth||im.width,h=im.naturalHeight||im.height,l=pts[0].x,t=pts[0].y,r=pts[2].x,b=pts[2].y,cv=document.createElement('canvas');let ow=Math.max(1,Math.round((r-l)*w)),oh=Math.max(1,Math.round((b-t)*h)),scale=Math.min(1,Math.sqrt(12_000_000/(ow*oh)),5200/Math.max(ow,oh));cv.width=Math.max(1,Math.round(ow*scale));cv.height=Math.max(1,Math.round(oh*scale));const ctx=cv.getContext('2d');if(!ctx)throw new Error('محرك القص غير متاح');ctx.drawImage(im,l*w,t*h,(r-l)*w,(b-t)*h,0,0,cv.width,cv.height);return cv}
function dist(a,b,w,h){return Math.hypot((a.x-b.x)*w,(a.y-b.y)*h)}
function projectiveCoefficients(corners){
 const [p0,p1,p2,p3]=corners;
 const cross=(a,b,c)=>(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
 const turns=[cross(p0,p1,p2),cross(p1,p2,p3),cross(p2,p3,p0),cross(p3,p0,p1)];
 if(turns.some(t=>!Number.isFinite(t)||Math.abs(t)<0.000001||t*turns[0]<0))throw new Error('نقاط المنظور متقاطعة أو متقاربة جدًا؛ أعد ترتيب الزوايا الأربع.');
 const dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x;
 const dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y;
 let g=0,h=0;
 if(Math.abs(dx3)+Math.abs(dy3)>1e-10){
  const denominator=dx1*dy2-dx2*dy1;
  if(Math.abs(denominator)<1e-10)throw new Error('زوايا المنظور لا تكوّن مساحة قابلة للتصحيح.');
  g=(dx3*dy2-dx2*dy3)/denominator;
  h=(dx1*dy3-dx3*dy1)/denominator;
 }
 const a=p1.x-p0.x+g*p1.x,b=p3.x-p0.x+h*p3.x,c=p0.x;
 const d=p1.y-p0.y+g*p1.y,e=p3.y-p0.y+h*p3.y,f=p0.y;
 if([1,1+g,1+h,1+g+h].some(z=>!Number.isFinite(z)||z<=1e-8))throw new Error('المنظور شديد التشوه؛ قرّب الزوايا من حواف الورقة.');
 return {a,b,c,d,e,f,g,h}
}
async function warpFull(im,shouldCancel=()=>false){
 const originalW=im.naturalWidth||im.width,originalH=im.naturalHeight||im.height;
 if(!originalW||!originalH)throw new Error('أبعاد الصورة غير صالحة');
 const corners=pts.map(p=>({x:p.x,y:p.y}));
 const coeff=projectiveCoefficients(corners);
 let ow=Math.round((dist(corners[0],corners[1],originalW,originalH)+dist(corners[3],corners[2],originalW,originalH))/2);
 let oh=Math.round((dist(corners[0],corners[3],originalW,originalH)+dist(corners[1],corners[2],originalW,originalH))/2);
 if(ow<8||oh<8)throw new Error('منطقة المنظور صغيرة جدًا.');
 const sc=Math.min(1,Math.sqrt(8_000_000/Math.max(1,ow*oh)),5200/Math.max(ow,oh));
 ow=Math.max(1,Math.round(ow*sc));oh=Math.max(1,Math.round(oh*sc));
 const inputScale=Math.min(1,Math.sqrt(8_000_000/(originalW*originalH)),5200/Math.max(originalW,originalH));
 const sw=Math.max(1,Math.round(originalW*inputScale)),sh=Math.max(1,Math.round(originalH*inputScale));
 const source=document.createElement('canvas');
 let output=null,finished=false;
 try{
  if(shouldCancel())throw new Error('أُلغيت معالجة المنظور قبل البدء.');
  source.width=sw;source.height=sh;
  const ctx=source.getContext('2d');if(!ctx)throw new Error('محرك المنظور غير متاح');
  ctx.drawImage(im,0,0,sw,sh);
  const pixels=ctx.getImageData(0,0,sw,sh).data;
  // The source pixels now own their independent buffer; discard the source canvas backing store.
  source.width=0;source.height=0;
  if(shouldCancel())throw new Error('أُلغيت معالجة المنظور أثناء قراءة الصورة.');
  output=document.createElement('canvas');output.width=ow;output.height=oh;
  const outCtx=output.getContext('2d');if(!outCtx)throw new Error('ذاكرة المعالجة غير كافية');
  const {a,b,c,d,e,f,g,h}=coeff;
  // A full 8MP ImageData could allocate another 32 MB. Render strips of up to 65k pixels.
  const stripRows=Math.max(4,Math.min(32,Math.floor(65536/ow)));
  for(let startY=0;startY<oh;startY+=stripRows){
   if(shouldCancel())throw new Error('أُلغيت معالجة المنظور قبل اكتمالها.');
   const rows=Math.min(stripRows,oh-startY);
   const strip=outCtx.createImageData(ow,rows),dst=strip.data;
   for(let offsetY=0;offsetY<rows;offsetY++){
    const y=startY+offsetY,v=oh<=1?0:y/(oh-1);
    for(let x=0;x<ow;x++){
     const u=ow<=1?0:x/(ow-1),z=1+g*u+h*v;
     if(z<=1e-8)continue;
     const px=(a*u+b*v+c)/z,py=(d*u+e*v+f)/z;
     const ix=clamp(Math.round(px*(sw-1)),0,sw-1),iy=clamp(Math.round(py*(sh-1)),0,sh-1);
     const si=(iy*sw+ix)*4,di=(offsetY*ow+x)*4;
     dst[di]=pixels[si];dst[di+1]=pixels[si+1];dst[di+2]=pixels[si+2];dst[di+3]=pixels[si+3]
    }
   }
   outCtx.putImageData(strip,0,startY);
   if(startY+rows<oh)await new Promise(resolve=>requestAnimationFrame(resolve));
  }
  if(shouldCancel())throw new Error('أُلغيت معالجة المنظور قبل اعتماد النتيجة.');
  finished=true;
  return output
 }finally{
  source.width=0;source.height=0;
  if(!finished&&output){output.width=0;output.height=0}
 }
}
function openRuler(){if(!pageCanvases?.length)return alert('أنشئ معاينة للطباعة أولاً');let pd=pagePrintMeta?.paper||(typeof getPaperSize==='function'?getPaperSize():{w:210,h:297}),margin=Math.max(0,Number(pagePrintMeta?.kind==='poster'?pagePrintMeta?.margin:$('marginInput')?.value)||0),wrap=$('abuRulerWrap'),paper=$('abuRulerPaper'),safe=$('abuRulerSafe'),caption=$('abuRulerCaption'),maxW=Math.min(560,window.innerWidth-70),ratio=pd.h/pd.w,w=maxW,h=w*ratio;if(h>window.innerHeight*.65){h=window.innerHeight*.65;w=h/ratio}wrap.style.width=w+'px';wrap.style.height=h+'px';paper.style.backgroundImage=`url(${pageCanvases[currentPage||0].toDataURL('image/png')})`;let pxX=w/pd.w,pxY=h/pd.h;safe.style.left=margin*pxX+'px';safe.style.right=margin*pxX+'px';safe.style.top=margin*pxY+'px';safe.style.bottom=margin*pxY+'px';let dpi=typeof currentDpi==='function'?currentDpi():0;caption.textContent=`ورقة ${pd.w} × ${pd.h} ملم • هامش ${margin} ملم • ${Math.round(dpi)} DPI • الإطار الأحمر = منطقة آمنة تقريبية`;$('abuRulerModal')?.classList.add('show')}
window.AbuPhotoGeometry={close,setMode,reset,apply};
window.openAbuPhotoRuler=openRuler;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});else build();
})();
