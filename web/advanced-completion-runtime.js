(()=>{
'use strict';
if(window.__ABU_ADVANCED_COMPLETION_V1__)return;
window.__ABU_ADVANCED_COMPLETION_V1__=true;
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));

/* ---------- shared image history / undo-redo / flip ---------- */
function selectedPhoto(){try{return selectedIndex>=0&&uploadedImages?.[selectedIndex]?uploadedImages[selectedIndex]:null}catch(_){return null}}
function history(it){if(!it)return null;if(!Array.isArray(it.__abuUndo))it.__abuUndo=[];if(!Array.isArray(it.__abuRedo))it.__abuRedo=[];return it}
function pushUndo(it,src){it=history(it);if(!it||!src)return;if(it.__abuUndo[it.__abuUndo.length-1]!==src)it.__abuUndo.push(src);if(it.__abuUndo.length>20)it.__abuUndo.shift();it.__abuRedo=[]}
async function setPhotoSource(it,src){if(!it||!src)return false;let im=new Image();await new Promise((res,rej)=>{im.onload=res;im.onerror=rej;im.src=src});it.src=src;it.img=im;if(typeof refreshPeople==='function')refreshPeople();if(typeof renderPaper==='function')renderPaper();return true}
async function undoPhoto(){let it=history(selectedPhoto());if(!it||!it.__abuUndo.length)return alert('لا توجد خطوة سابقة');let prev=it.__abuUndo.pop();it.__abuRedo.push(it.src);await setPhotoSource(it,prev)}
async function redoPhoto(){let it=history(selectedPhoto());if(!it||!it.__abuRedo.length)return alert('لا توجد خطوة لاحقة');let next=it.__abuRedo.pop();it.__abuUndo.push(it.src);await setPhotoSource(it,next)}
async function flipPhoto(axis){let it=history(selectedPhoto());if(!it||!it.img)return alert('حدد صورة أولاً');let before=it.src,im=it.img,w=im.naturalWidth||im.width,h=im.naturalHeight||im.height,cv=document.createElement('canvas');cv.width=w;cv.height=h;let c=cv.getContext('2d');c.save();if(axis==='x'){c.translate(w,0);c.scale(-1,1)}else{c.translate(0,h);c.scale(1,-1)}c.drawImage(im,0,0,w,h);c.restore();pushUndo(it,before);await setPhotoSource(it,cv.toDataURL(String(before).startsWith('data:image/png')?'image/png':'image/jpeg',.98))}
function wrapAsync(api,name){if(!api||typeof api[name]!=='function'||api[name].__abuWrapped)return;let orig=api[name];let wrapped=async function(...args){let it=selectedPhoto(),before=it?.src||'';let out=await orig.apply(this,args);if(it&&before&&it.src!==before)pushUndo(it,before);return out};wrapped.__abuWrapped=true;api[name]=wrapped}
function installPhotoHistory(){
  if(window.AbuPhotoGeometry){wrapAsync(AbuPhotoGeometry,'apply')}
  if(window.AbuPhotoAdvanced){wrapAsync(AbuPhotoAdvanced,'applyEnhance');wrapAsync(AbuPhotoAdvanced,'restoreOriginal')}
  let geo=document.querySelector('#abuGeoModal .abu-geo-actions');if(geo&&!$('abuGeoHistoryBtns')){let box=document.createElement('div');box.id='abuGeoHistoryBtns';box.className='abu-geo-actions';box.innerHTML='<button onclick="AbuAdvancedCompletion.undoPhoto()">↶ تراجع</button><button onclick="AbuAdvancedCompletion.redoPhoto()">↷ إعادة</button><button onclick="AbuAdvancedCompletion.flipPhoto(\'x\')">↔ قلب أفقي</button><button onclick="AbuAdvancedCompletion.flipPhoto(\'y\')">↕ قلب عمودي</button>';geo.parentNode.insertBefore(box,geo.nextSibling)}
  let enh=document.querySelector('#abuEnhanceModal .abu-adv-actions');if(enh&&!$('abuEnhanceHistoryBtns')){let box=document.createElement('div');box.id='abuEnhanceHistoryBtns';box.className='abu-adv-actions';box.innerHTML='<button onclick="AbuAdvancedCompletion.undoPhoto()">↶ تراجع</button><button onclick="AbuAdvancedCompletion.redoPhoto()">↷ إعادة</button><button onclick="AbuAdvancedCompletion.flipPhoto(\'x\')">↔ قلب أفقي</button><button onclick="AbuAdvancedCompletion.flipPhoto(\'y\')">↕ قلب عمودي</button>';enh.parentNode.insertBefore(box,enh.nextSibling)}
}

/* ---------- design studio layers / hide / copy style / print-bound warning ---------- */
const STYLE_KEYS=['fontFamily','fontSize','fontWeight','fontStyle','textDecoration','color','textAlign','lineHeight','letterSpacing','background','backgroundColor','border','borderColor','borderWidth','borderStyle','borderRadius','boxShadow','opacity'];
let copiedStyle=null;
function dsSelected(){return document.querySelector('#dsCanvas .ds-el.selected')}
function ensureDesignCompletion(){let canvas=$('dsCanvas'),bar=$('dsAdvancedBar');if(!canvas||!bar||$('dsCompLayers'))return false;let style=document.createElement('style');style.id='dsCompletionStyle';style.textContent='.ds-outside-print{outline:3px solid #ef4444!important}.ds-layer-modal{position:fixed;inset:0;z-index:30000;background:#000c;display:none;align-items:center;justify-content:center;padding:12px}.ds-layer-modal.show{display:flex}.ds-layer-card{width:min(650px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;padding:12px;color:#1f2937}.ds-layer-row{display:grid;grid-template-columns:1fr repeat(4,auto);gap:5px;align-items:center;border:1px solid #cbd5e1;border-radius:9px;padding:7px;margin:5px 0}.ds-layer-row button{border:0;border-radius:7px;padding:7px;font-size:8px}.ds-layer-hidden{opacity:.55}';document.head.appendChild(style);bar.insertAdjacentHTML('beforeend','<button id="dsCompHide">👁 إخفاء</button><button id="dsCompLayers">☰ الطبقات</button><button id="dsCompCopy">نسخ تنسيق</button><button id="dsCompPaste">لصق تنسيق</button>');$('dsCompHide').onclick=toggleHideSelected;$('dsCompLayers').onclick=openLayers;$('dsCompCopy').onclick=copySelectedStyle;$('dsCompPaste').onclick=pasteSelectedStyle;document.body.insertAdjacentHTML('beforeend','<div id="dsLayerModal" class="ds-layer-modal"><div class="ds-layer-card"><div style="display:flex;justify-content:space-between;align-items:center"><b>☰ طبقات التصميم</b><button onclick="AbuAdvancedCompletion.closeLayers()" style="width:36px;height:36px;border:0;border-radius:50%">×</button></div><div id="dsLayerList"></div></div></div>');new MutationObserver(()=>{markOutside();if($('dsLayerModal')?.classList.contains('show'))renderLayers()}).observe(canvas,{subtree:true,childList:true,attributes:true,attributeFilter:['style','data-hidden']});markOutside();return true}
function toggleHideSelected(){let el=dsSelected();if(!el)return alert('حدد عنصرًا أولاً');el.dataset.hidden='1';el.style.visibility='hidden';el.classList.remove('selected');renderLayers()}
function copySelectedStyle(){let el=dsSelected();if(!el)return alert('حدد عنصرًا أولاً');copiedStyle={};STYLE_KEYS.forEach(k=>{let v=el.style[k];if(v)copiedStyle[k]=v});$('dsCompCopy').textContent='✓ تم نسخ التنسيق'}
function pasteSelectedStyle(){let el=dsSelected();if(!el)return alert('حدد عنصرًا أولاً');if(!copiedStyle)return alert('انسخ تنسيق عنصر أولاً');Object.entries(copiedStyle).forEach(([k,v])=>el.style[k]=v)}
function openLayers(){renderLayers();$('dsLayerModal')?.classList.add('show')}function closeLayers(){$('dsLayerModal')?.classList.remove('show')}
function layerName(el,i){let kind=el.dataset.kind||'عنصر',txt=(el.textContent||'').replace('↙','').trim().slice(0,24);return `${i+1}. ${kind}${txt?' — '+txt:''}`}
function renderLayers(){let list=$('dsLayerList'),els=[...document.querySelectorAll('#dsCanvas .ds-el')];if(!list)return;list.innerHTML=els.map((el,i)=>`<div class="ds-layer-row ${el.dataset.hidden==='1'?'ds-layer-hidden':''}"><span>${layerName(el,i)}</span><button onclick="AbuAdvancedCompletion.layerToggle(${i})">${el.dataset.hidden==='1'?'إظهار':'إخفاء'}</button><button onclick="AbuAdvancedCompletion.layerUp(${i})">↑</button><button onclick="AbuAdvancedCompletion.layerDown(${i})">↓</button><button onclick="AbuAdvancedCompletion.layerDelete(${i})">حذف</button></div>`).join('')||'<div>لا توجد عناصر.</div>'}
function layerEl(i){return [...document.querySelectorAll('#dsCanvas .ds-el')][i]}
function layerToggle(i){let el=layerEl(i);if(!el)return;let hide=el.dataset.hidden!=='1';el.dataset.hidden=hide?'1':'0';el.style.visibility=hide?'hidden':'visible';renderLayers()}
function layerUp(i){let el=layerEl(i);if(!el)return;el.style.zIndex=String((Number(el.style.zIndex)||10)+10);renderLayers()}
function layerDown(i){let el=layerEl(i);if(!el)return;el.style.zIndex=String(Math.max(1,(Number(el.style.zIndex)||10)-10));renderLayers()}
function layerDelete(i){let el=layerEl(i);if(!el)return;if(confirm('حذف هذا العنصر؟')){el.remove();renderLayers()}}
function markOutside(){document.querySelectorAll('#dsCanvas .ds-el').forEach(el=>{let x=parseFloat(el.style.left)||0,y=parseFloat(el.style.top)||0,w=parseFloat(el.style.width)||0,h=parseFloat(el.style.height)||0;el.classList.toggle('ds-outside-print',x<0||y<0||x+w>100||y+h>100)})}

function boot(){let tries=0,t=setInterval(()=>{installPhotoHistory();ensureDesignCompletion();if(++tries>120)clearInterval(t)},100)}
window.AbuAdvancedCompletion={undoPhoto,redoPhoto,flipPhoto,closeLayers,layerToggle,layerUp,layerDown,layerDelete};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
