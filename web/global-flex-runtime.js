(()=>{
'use strict';
if(window.__ABU_GLOBAL_FLEX_V1__)return;
window.__ABU_GLOBAL_FLEX_V1__=true;

const IS_TOP=window.top===window.self;
const SETTINGS_KEY='abuGlobalFlexSettingsV1';
const ZOOM_KEY='abuGlobalFlexZoomMapV1';
const MIN_ZOOM=.6;
const MAX_ZOOM=2.5;
const STEP=.1;
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const dist=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
const interactive='input,textarea,select,button,a,[contenteditable="true"],[role="button"],label';
const ownGesture='.paper-zoom,.paper-zoom-stage,.nat-zoom,.nat-zoom-actions';
const protectedDrag='#natCropCanvas,#dsCropCanvas,.v-edit-canvas,.drag-move-handle,.img-resize-handle,.ds-resize,.ds-el,.draggable-item';
const surfaceSelector=[
  '[data-abu-flex-surface]',
  '.ds-stage','.ds-paper-wrap','.ds-paper','.ds-crop',
  '.cs-preview-wrap','.cs-dialog-body','.cs-dialog',
  '.nat-stage','.nat-work','.nat-doc','.nat-residence-block','.nat-card',
  '.v-view','.v-body','.v-grid','.v-dialog','.v-edit-canvas',
  '.abu-settings-dialog','.abu-settings-body','.abu-text-sheet','.abu-text-body',
  '.productivity-frame-wrap',
  '.preview','.ai-pro-preview','.crop-wrap',
  '#workspace','#pages-container',
  '[id$="Center"]','section','.panel','.sheet','.ds-sheet','.ds-app'
].join(',');

let settings={move:false,sensitivity:1,showHints:true};
let zoomMap={};
try{settings=Object.assign(settings,JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'))}catch(e){}
try{zoomMap=JSON.parse(localStorage.getItem(ZOOM_KEY)||'{}')||{}}catch(e){zoomMap={}}
let activeSurface=null;
let pinch=null;
let pan=null;
let lastTouch=0;

function arNumber(value){
  const digits='٠١٢٣٤٥٦٧٨٩';
  return String(value).replace(/\d/g,d=>digits[Number(d)]);
}
function percent(value){return arNumber(Math.round(value*100))+'٪'}
function persistSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings))}catch(e){}}
function persistZoom(){try{localStorage.setItem(ZOOM_KEY,JSON.stringify(zoomMap))}catch(e){}}
function visible(el){if(!el||!el.isConnected)return false;const s=getComputedStyle(el);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;const r=el.getBoundingClientRect();return r.width>2&&r.height>2}
function labelFor(el){
  if(!el)return 'القسم الحالي';
  if(el.id){const labels={nationalCenter:'البطاقة الوطنية',cardsCenter:'الباركود والكروت',vaultCenter:'الحفظ والمستندات',questionsCenter:'صياغة الأسئلة',compressorCenter:'ضغط الصور',workspace:'ورقة الأسئلة',pages-container:'ورقة الأسئلة',dsCanvas:'مساحة التصميم'};return labels[el.id]||el.id}
  if(el.classList.contains('preview'))return 'معاينة الصور';
  if(el.classList.contains('nat-stage'))return 'معاينة البطاقة الوطنية';
  if(el.classList.contains('nat-card'))return 'نافذة البطاقة الوطنية';
  if(el.classList.contains('cs-preview-wrap'))return 'معاينة الكروت والباجات';
  if(el.classList.contains('v-view'))return 'عارض المستندات';
  if(el.classList.contains('abu-settings-dialog'))return 'الإعدادات';
  if(el.classList.contains('abu-text-sheet'))return 'محرر الخطوط والنصوص';
  if(el.classList.contains('ds-stage')||el.classList.contains('ds-paper-wrap')||el.classList.contains('ds-paper'))return document.body.dataset.studioMode==='certificate'?'شهادة التقدير':'تصميم الظرف';
  if(el.classList.contains('ds-crop')||el.classList.contains('crop-wrap'))return 'القص والتحرير';
  if(el.classList.contains('productivity-frame-wrap'))return 'مساحة العمل';
  return 'القسم الحالي';
}
function keyFor(el){
  if(!el)return 'none';
  const path=location.pathname.split('/').pop()||'index';
  if(el.id)return `${path}#${el.id}`;
  const mode=document.body.dataset.studioMode||'';
  const cls=[...el.classList].find(c=>!c.startsWith('show')&&!c.includes('selected')&&!c.includes('active'))||el.tagName.toLowerCase();
  const siblings=el.parentElement?[...el.parentElement.children].filter(x=>x.tagName===el.tagName).indexOf(el):0;
  return `${path}:${mode}:${cls}:${siblings}`;
}
function scaleOf(el){
  if(!el)return 1;
  const data=Number(el.dataset.abuFlexZoom);
  if(data>0)return clamp(data,MIN_ZOOM,MAX_ZOOM);
  const saved=Number(zoomMap[keyFor(el)]);
  return saved>0?clamp(saved,MIN_ZOOM,MAX_ZOOM):1;
}
function cleanupZoomClass(){
  const any=[...document.querySelectorAll('[data-abu-flex-zoom]')].some(el=>Number(el.dataset.abuFlexZoom)>1.01&&visible(el));
  document.documentElement.classList.toggle('abu-flex-has-zoom',any);
  document.body.classList.toggle('abu-flex-has-zoom',any);
}
function applyScale(el,value,save=true){
  if(!el)return;
  const scale=clamp(value,MIN_ZOOM,MAX_ZOOM);
  el.dataset.abuFlexZoom=String(+scale.toFixed(3));
  el.style.zoom=String(scale);
  el.style.transformOrigin='top center';
  el.classList.toggle('abu-flex-zoomed',Math.abs(scale-1)>.015);
  if(save){zoomMap[keyFor(el)]=+scale.toFixed(3);persistZoom()}
  cleanupZoomClass();
  if(activeSurface===el)updateUi();
}
function resetSurface(){const el=currentSurface();if(el)applyScale(el,1)}
function surfaceFrom(target){
  const node=target&&target.nodeType===1?target:target?.parentElement;
  if(!node)return defaultSurface();
  if(node.closest(ownGesture))return null;
  if(node.closest('#pages-container')&&window.AbuQuestionGestures)return null;
  const exact=node.closest(surfaceSelector);
  if(exact&&visible(exact))return exact;
  return defaultSurface();
}
function defaultSurface(){
  const preferred=[
    '.ds-stage','.cs-preview-wrap','.nat-stage','.v-view','.abu-settings-dialog','.abu-text-sheet','.productivity-frame-wrap',
    '#questionsCenter','#compressorCenter','#vaultCenter','#cardsCenter','#nationalCenter','.preview','.panel'
  ];
  for(const selector of preferred){const list=[...document.querySelectorAll(selector)];const item=list.find(visible);if(item)return item}
  return document.querySelector('.app')||document.body;
}
function setActive(el){if(!el||!visible(el))return;activeSurface=el;updateUi()}
function currentSurface(){if(activeSurface&&visible(activeSurface))return activeSurface;activeSurface=defaultSurface();return activeSurface}

function addCss(){
  if($('abuGlobalFlexStyle'))return;
  const s=document.createElement('style');s.id='abuGlobalFlexStyle';s.textContent=`
html.abu-flex-has-zoom,body.abu-flex-has-zoom{overflow-x:auto!important;overscroll-behavior:none}.app{transition:none!important}.abu-flex-zoomed{will-change:zoom}.abu-flex-moving{cursor:grabbing!important;user-select:none!important;-webkit-user-select:none!important}.abu-flex-fab{position:fixed;z-index:29500;left:10px;bottom:${IS_TOP?'78':'12'}px;border:0;border-radius:22px;background:linear-gradient(135deg,#0f766e,#155d86);color:#fff;box-shadow:0 7px 22px #0005;min-width:${IS_TOP?'88':'42'}px;height:42px;padding:0 11px;font-family:Tajawal,Tahoma,Arial,sans-serif;font-size:10px;font-weight:900}.abu-flex-panel{position:fixed;z-index:29501;left:8px;right:8px;bottom:${IS_TOP?'126':'60'}px;background:#0f172af2;color:#fff;border:1px solid #ffffff25;border-radius:16px;padding:10px;box-shadow:0 14px 35px #0008;display:none;direction:rtl}.abu-flex-panel.show{display:block}.abu-flex-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.abu-flex-head b{font-size:11px}.abu-flex-head small{font-size:8px;color:#cbd5e1;display:block;margin-top:2px}.abu-flex-close{width:32px;height:32px;border:0;border-radius:50%;background:#ffffff18;color:#fff;font-size:18px}.abu-flex-controls{display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center}.abu-flex-controls button{min-width:38px;height:38px;border:0;border-radius:9px;background:#ffffff18;color:#fff;font-size:17px;font-weight:900}.abu-flex-controls input[type=range]{width:100%}.abu-flex-value{text-align:center;font-size:10px;font-weight:900;margin:5px 0}.abu-flex-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:7px}.abu-flex-actions button,.abu-flex-actions select{min-height:38px;border:0;border-radius:9px;background:#ffffff18;color:#fff;font-family:Tajawal,Tahoma,Arial,sans-serif;font-size:9px;font-weight:900;padding:5px}.abu-flex-actions select option{color:#111}.abu-flex-actions button.active{background:#f59e0b;color:#172033}.abu-flex-hint{font-size:8px;color:#bfdbfe;line-height:1.7;margin-top:7px}.abu-flex-focus{scroll-margin-top:130px!important;scroll-margin-bottom:220px!important}.drag-move-handle,.img-resize-handle,.ds-resize{touch-action:none!important;min-width:34px!important;min-height:34px!important}.abu-flex-target{outline:2px solid #0ea5e955;outline-offset:2px}@media print{.abu-flex-fab,.abu-flex-panel{display:none!important}[data-abu-flex-zoom]{zoom:1!important}.abu-flex-target{outline:none!important}}
  `;document.head.appendChild(s)
}
function panelHtml(){return `<button id="abuFlexFab" class="abu-flex-fab" type="button" aria-label="أدوات المرونة">${IS_TOP?'↔ المرونة':'↔'}</button><div id="abuFlexPanel" class="abu-flex-panel"><div class="abu-flex-head"><div><b>المرونة والتكبير</b><small id="abuFlexSurfaceName">القسم الحالي</small></div><button id="abuFlexClose" class="abu-flex-close" type="button">×</button></div><div class="abu-flex-controls"><button id="abuFlexMinus" type="button">−</button><input id="abuFlexRange" type="range" min="60" max="250" step="5" value="100"><button id="abuFlexPlus" type="button">+</button></div><div id="abuFlexValue" class="abu-flex-value">١٠٠٪</div><div class="abu-flex-actions"><button id="abuFlexReset" type="button">١٠٠٪</button><button id="abuFlexMove" type="button">✥ تحريك</button><select id="abuFlexSensitivity" title="حساسية التحريك"><option value="0.65">حركة دقيقة</option><option value="1">حركة عادية</option><option value="1.45">حركة سريعة</option></select></div><div class="abu-flex-hint">إصبعان للتكبير والتصغير في مساحة العمل • فعّل «تحريك» للسحب بإصبع واحد عندما تكون المساحة مكبرة • الكتابة والحقول تبقى قابلة للمس بشكل طبيعي.</div></div>`}
function addUi(){
  if($('abuFlexFab'))return;
  document.body.insertAdjacentHTML('beforeend',panelHtml());
  $('abuFlexFab').onclick=()=>{$('abuFlexPanel').classList.toggle('show');setActive(currentSurface())};
  $('abuFlexClose').onclick=()=>$('abuFlexPanel').classList.remove('show');
  $('abuFlexMinus').onclick=()=>applyScale(currentSurface(),scaleOf(currentSurface())-STEP);
  $('abuFlexPlus').onclick=()=>applyScale(currentSurface(),scaleOf(currentSurface())+STEP);
  $('abuFlexReset').onclick=resetSurface;
  $('abuFlexMove').onclick=()=>{settings.move=!settings.move;persistSettings();updateUi()};
  $('abuFlexRange').oninput=e=>applyScale(currentSurface(),Number(e.target.value)/100);
  $('abuFlexSensitivity').value=String(settings.sensitivity||1);
  $('abuFlexSensitivity').onchange=e=>{settings.sensitivity=clamp(Number(e.target.value)||1,.5,2);persistSettings();updateUi()};
  updateUi()
}
function updateUi(){
  const el=currentSurface(),scale=scaleOf(el);
  if($('abuFlexValue'))$('abuFlexValue').textContent=percent(scale);
  if($('abuFlexRange'))$('abuFlexRange').value=String(Math.round(scale*100));
  if($('abuFlexSurfaceName'))$('abuFlexSurfaceName').textContent=labelFor(el);
  if($('abuFlexMove')){$('abuFlexMove').classList.toggle('active',!!settings.move);$('abuFlexMove').textContent=settings.move?'✎ كتابة/تمرير':'✥ تحريك'}
  if($('abuFlexSensitivity'))$('abuFlexSensitivity').value=String(settings.sensitivity||1)
}

function beginPinch(e){
  if(e.touches.length!==2)return;
  const a=e.touches[0],b=e.touches[1];
  if(a.target?.closest?.(ownGesture)||b.target?.closest?.(ownGesture))return;
  if(window.AbuQuestionGestures&&(a.target?.closest?.('#pages-container')||b.target?.closest?.('#pages-container')))return;
  let s1=surfaceFrom(a.target),s2=surfaceFrom(b.target);
  let surface=s1&&s1===s2?s1:(s1||s2||defaultSurface());
  if(!surface)return;
  setActive(surface);
  pinch={surface,start:Math.max(1,dist(a,b)),scale:scaleOf(surface)};
  e.preventDefault();
}
function movePinch(e){
  if(!pinch||e.touches.length<2)return;
  const ratio=dist(e.touches[0],e.touches[1])/pinch.start;
  applyScale(pinch.surface,pinch.scale*ratio,false);
  e.preventDefault();
}
function endPinch(e){
  if(!pinch||e.touches.length>=2)return;
  zoomMap[keyFor(pinch.surface)]=+scaleOf(pinch.surface).toFixed(3);persistZoom();
  pinch=null;updateUi()
}

function pointerDown(e){
  const surface=surfaceFrom(e.target);if(surface)setActive(surface);
  if(!settings.move||!surface||scaleOf(surface)<=1.01)return;
  if(e.target?.closest?.(interactive)||e.target?.closest?.(ownGesture)||e.target?.closest?.(protectedDrag))return;
  if(e.pointerType==='mouse'&&e.button!==0)return;
  pan={id:e.pointerId,x:e.clientX,y:e.clientY,scrollX:window.scrollX,scrollY:window.scrollY,surface};
  document.body.classList.add('abu-flex-moving');
  try{surface.setPointerCapture(e.pointerId)}catch(err){}
  e.preventDefault()
}
function pointerMove(e){
  if(!pan||pan.id!==e.pointerId)return;
  const gain=settings.sensitivity||1;
  window.scrollTo(pan.scrollX+(pan.x-e.clientX)*gain,pan.scrollY+(pan.y-e.clientY)*gain);
  e.preventDefault()
}
function pointerUp(e){
  if(!pan||pan.id!==e.pointerId)return;
  try{pan.surface.releasePointerCapture(e.pointerId)}catch(err){}
  pan=null;document.body.classList.remove('abu-flex-moving')
}
function focusIn(e){
  const field=e.target?.closest?.('input,textarea,select,[contenteditable="true"]');if(!field)return;
  field.classList.add('abu-flex-focus');
  setTimeout(()=>{try{field.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'})}catch(err){}},220)
}
function tapSelect(e){
  const now=Date.now();if(now-lastTouch<80)return;lastTouch=now;
  const s=surfaceFrom(e.target);if(s)setActive(s)
}
function wheelZoom(e){
  if(!e.ctrlKey)return;
  const s=surfaceFrom(e.target)||currentSurface();if(!s)return;
  setActive(s);applyScale(s,scaleOf(s)+(e.deltaY<0?STEP:-STEP));e.preventDefault()
}

function restoreKnown(){
  const all=new Set();
  document.querySelectorAll(surfaceSelector).forEach(el=>all.add(el));
  all.add(document.querySelector('.app')||document.body);
  all.forEach(el=>{if(!el)return;const saved=Number(zoomMap[keyFor(el)]);if(saved>0&&Math.abs(saved-1)>.015)applyScale(el,saved,false)})
}
function injectFrame(frame){
  if(!frame||frame.dataset.abuFlexFrame==='1'||frame.id==='csPrintFrame')return;
  frame.dataset.abuFlexFrame='1';
  const run=()=>{
    try{
      const doc=frame.contentDocument;if(!doc||doc.getElementById('abuGlobalFlexExternal'))return;
      const script=doc.createElement('script');script.id='abuGlobalFlexExternal';script.src='global-flex-runtime.js';(doc.head||doc.documentElement).appendChild(script)
    }catch(e){}
  };
  frame.addEventListener('load',()=>setTimeout(run,40));setTimeout(run,80)
}
function scanFrames(){document.querySelectorAll('iframe').forEach(injectFrame)}
function observe(){
  new MutationObserver(()=>{restoreKnown();scanFrames();if(!activeSurface||!activeSurface.isConnected)activeSurface=defaultSurface()}).observe(document.documentElement,{childList:true,subtree:true})
}
function init(){
  addCss();addUi();restoreKnown();scanFrames();observe();setActive(defaultSurface());
  document.addEventListener('touchstart',beginPinch,{capture:true,passive:false});
  document.addEventListener('touchmove',movePinch,{capture:true,passive:false});
  document.addEventListener('touchend',endPinch,{capture:true,passive:false});
  document.addEventListener('touchcancel',endPinch,{capture:true,passive:false});
  document.addEventListener('pointerdown',pointerDown,true);
  document.addEventListener('pointermove',pointerMove,{capture:true,passive:false});
  document.addEventListener('pointerup',pointerUp,true);
  document.addEventListener('pointercancel',pointerUp,true);
  document.addEventListener('focusin',focusIn,true);
  document.addEventListener('click',tapSelect,true);
  document.addEventListener('wheel',wheelZoom,{capture:true,passive:false});
  window.addEventListener('resize',updateUi);
}

window.AbuGlobalFlex={
  setActive,
  zoomIn:()=>applyScale(currentSurface(),scaleOf(currentSurface())+STEP),
  zoomOut:()=>applyScale(currentSurface(),scaleOf(currentSurface())-STEP),
  reset:resetSurface,
  move:value=>{settings.move=typeof value==='boolean'?value:!settings.move;persistSettings();updateUi()},
  current:()=>({label:labelFor(currentSurface()),zoom:scaleOf(currentSurface()),move:settings.move,sensitivity:settings.sensitivity})
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
