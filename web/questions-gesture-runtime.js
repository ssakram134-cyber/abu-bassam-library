(()=>{
'use strict';
if(window.__ABU_QUESTION_GESTURES_V1__)return;
window.__ABU_QUESTION_GESTURES_V1__=true;

const $=id=>document.getElementById(id);
const ZOOM_KEY='abuQuestionCanvasZoomV1';
const MIN_PAPER_ZOOM=.6;
const MAX_PAPER_ZOOM=2.5;
const MIN_QUESTION_SCALE=.55;
const MAX_QUESTION_SCALE=1.8;
let paperZoom=1;
try{paperZoom=Math.max(MIN_PAPER_ZOOM,Math.min(MAX_PAPER_ZOOM,Number(localStorage.getItem(ZOOM_KEY))||1))}catch(e){}
let selectedQuestion=null;
let moveMode=false;
let moving=null;
let pinch=null;

const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
const distance=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
const qScale=q=>clamp(Number(q?.dataset?.abuScale)||1,MIN_QUESTION_SCALE,MAX_QUESTION_SCALE);
const qX=q=>Number(q?.dataset?.abuMoveX)||0;
const qY=q=>Number(q?.dataset?.abuMoveY)||0;

function savePaperZoom(){try{localStorage.setItem(ZOOM_KEY,String(paperZoom))}catch(e){}}
function scheduleDraft(){try{if(typeof scheduleQuestionDraft==='function')scheduleQuestionDraft()}catch(e){}}

function addCss(){
  if($('abuQuestionGestureStyle'))return;
  const style=document.createElement('style');
  style.id='abuQuestionGestureStyle';
  style.textContent=`
#pages-container{zoom:var(--abu-question-paper-zoom,1)}
body.abu-paper-zoomed{overflow-x:auto!important}
.question-container{transition:outline-color .12s ease,box-shadow .12s ease;transform-origin:top right}
.question-container.abu-q-selected{outline:3px solid #0ea5e9;outline-offset:3px;box-shadow:0 0 0 5px #0ea5e920,0 5px 18px #0002}
body.abu-question-move-mode .question-container.abu-q-selected{cursor:grab;touch-action:none!important;user-select:none;-webkit-user-select:none}
body.abu-question-moving .question-container.abu-q-selected{cursor:grabbing;transition:none!important}
.abu-gesture-row{width:100%;display:flex;align-items:center;gap:4px;overflow-x:auto;white-space:nowrap;padding:3px 1px 0;direction:rtl;scrollbar-width:none}
.abu-gesture-row::-webkit-scrollbar{display:none}.abu-gesture-row .abu-g-label{color:#dbeafe;font-size:9px;font-weight:900;padding:0 3px}.abu-gesture-row button{flex:0 0 auto;min-width:30px;height:30px;border:1px solid #ffffff35;border-radius:8px;background:#ffffff18;color:#fff;font-family:Tajawal,sans-serif;font-size:10px;font-weight:900;padding:0 7px}.abu-gesture-row button.active{background:#f59e0b;color:#172033;border-color:#fbbf24}.abu-gesture-row button.primary{background:#087f72}.abu-gesture-row .abu-g-value{min-width:42px;text-align:center;color:#fff;font-size:9px;font-weight:900}.abu-gesture-row .abu-g-sep{width:1px;height:20px;background:#ffffff35;flex:0 0 1px}.abu-gesture-row .abu-g-hint{font-size:8px;color:#bfdbfe;padding-inline:4px}
[contenteditable="true"]{caret-color:#0f172a;-webkit-user-select:text;user-select:text;scroll-margin-top:145px;scroll-margin-bottom:220px}
@media print{#pages-container{zoom:1!important}.abu-gesture-row{display:none!important}.question-container.abu-q-selected{outline:none!important;box-shadow:none!important}}
  `;
  document.head.appendChild(style);
}

function addToolbar(){
  const controls=$('controls');
  if(!controls||$('abuQuestionGestureRow'))return;
  const row=document.createElement('div');
  row.id='abuQuestionGestureRow';
  row.className='abu-gesture-row';
  row.innerHTML=`
    <span class="abu-g-label">الورقة</span>
    <button type="button" onclick="AbuQuestionGestures.paper(-.1)" title="تصغير الورقة">−</button>
    <span id="abuPaperZoomValue" class="abu-g-value">١٠٠٪</span>
    <button type="button" onclick="AbuQuestionGestures.paper(.1)" title="تكبير الورقة">+</button>
    <button type="button" onclick="AbuQuestionGestures.paperReset()" title="إعادة تكبير الورقة">١٠٠٪</button>
    <span class="abu-g-sep"></span>
    <span class="abu-g-label">السؤال</span>
    <button type="button" onclick="AbuQuestionGestures.question(-.05)" title="تصغير السؤال">−</button>
    <span id="abuQuestionZoomValue" class="abu-g-value">—</span>
    <button type="button" onclick="AbuQuestionGestures.question(.05)" title="تكبير السؤال">+</button>
    <button id="abuQuestionMoveBtn" type="button" class="primary" onclick="AbuQuestionGestures.move()" title="تحريك السؤال بحرية">✥ نقل</button>
    <button type="button" onclick="AbuQuestionGestures.resetQuestion()" title="إعادة حجم ومكان السؤال">↺ السؤال</button>
    <span class="abu-g-hint">إصبعان على الورقة للتكبير • إصبعان على السؤال لتغيير حجمه</span>`;
  controls.appendChild(row);
  try{if(typeof fitToScreen==='function')setTimeout(fitToScreen,30)}catch(e){}
}

function arabicPercent(value){
  const digits='٠١٢٣٤٥٦٧٨٩';
  return `${Math.round(value*100)}`.replace(/\d/g,d=>digits[Number(d)])+'٪';
}

function updateToolbar(){
  const pv=$('abuPaperZoomValue');if(pv)pv.textContent=arabicPercent(paperZoom);
  const qv=$('abuQuestionZoomValue');if(qv)qv.textContent=selectedQuestion?arabicPercent(qScale(selectedQuestion)):'—';
  const mb=$('abuQuestionMoveBtn');
  if(mb){mb.classList.toggle('active',moveMode);mb.textContent=moveMode?'✎ كتابة':'✥ نقل'}
}

function applyPaperZoom(value,save=true){
  paperZoom=clamp(value,MIN_PAPER_ZOOM,MAX_PAPER_ZOOM);
  document.documentElement.style.setProperty('--abu-question-paper-zoom',String(paperZoom));
  document.body.classList.toggle('abu-paper-zoomed',paperZoom>1.02);
  if(save)savePaperZoom();
  updateToolbar();
}

function applyQuestionTransform(q){
  if(!q)return;
  const x=qX(q),y=qY(q),scale=qScale(q);
  q.dataset.abuScale=String(+scale.toFixed(3));
  q.dataset.abuMoveX=String(+x.toFixed(2));
  q.dataset.abuMoveY=String(+y.toFixed(2));
  q.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
  q.style.transformOrigin='top right';
}

function selectQuestion(q){
  if(selectedQuestion===q&&q?.isConnected){updateToolbar();return}
  if(selectedQuestion?.isConnected)selectedQuestion.classList.remove('abu-q-selected');
  selectedQuestion=q&&q.isConnected?q:null;
  if(selectedQuestion)selectedQuestion.classList.add('abu-q-selected');
  updateToolbar();
}

function setQuestionScale(value){
  if(!selectedQuestion)return;
  selectedQuestion.dataset.abuScale=String(clamp(value,MIN_QUESTION_SCALE,MAX_QUESTION_SCALE));
  applyQuestionTransform(selectedQuestion);
  scheduleDraft();
  updateToolbar();
}

function paper(delta){applyPaperZoom(paperZoom+Number(delta||0))}
function paperReset(){applyPaperZoom(1)}
function question(delta){if(selectedQuestion)setQuestionScale(qScale(selectedQuestion)+Number(delta||0))}
function resetQuestion(){
  if(!selectedQuestion)return;
  selectedQuestion.dataset.abuScale='1';selectedQuestion.dataset.abuMoveX='0';selectedQuestion.dataset.abuMoveY='0';
  selectedQuestion.style.transform='';selectedQuestion.style.transformOrigin='';
  scheduleDraft();updateToolbar();
}
function move(){
  if(!selectedQuestion){const first=document.querySelector('.question-container');if(first)selectQuestion(first);else return}
  moveMode=!moveMode;
  document.body.classList.toggle('abu-question-move-mode',moveMode);
  updateToolbar();
}

function displayedScale(q){
  const page=q?.closest('.a4-page');
  if(!page)return 1;
  const raw=page.offsetWidth||1,shown=page.getBoundingClientRect().width||raw;
  return Math.max(.05,shown/raw);
}

function pointerDown(e){
  const q=e.target?.closest?.('.question-container');
  if(q)selectQuestion(q);
  if(!moveMode||!q||e.pointerType==='mouse'&&e.button!==0)return;
  if(e.target?.closest?.('.action-btns'))return;
  const scale=displayedScale(q);
  moving={q,id:e.pointerId,startX:e.clientX,startY:e.clientY,x:qX(q),y:qY(q),displayScale:scale};
  document.body.classList.add('abu-question-moving');
  try{q.setPointerCapture(e.pointerId)}catch(err){}
  e.preventDefault();e.stopPropagation();
}
function pointerMove(e){
  if(!moving||moving.id!==e.pointerId)return;
  const dx=(e.clientX-moving.startX)/moving.displayScale;
  const dy=(e.clientY-moving.startY)/moving.displayScale;
  const page=moving.q.closest('.a4-page');
  const maxX=(page?.offsetWidth||800)*.82,maxY=(page?.offsetHeight||1100)*.82;
  moving.q.dataset.abuMoveX=String(clamp(moving.x+dx,-maxX,maxX));
  moving.q.dataset.abuMoveY=String(clamp(moving.y+dy,-maxY,maxY));
  applyQuestionTransform(moving.q);
  e.preventDefault();
}
function pointerUp(e){
  if(!moving||moving.id!==e.pointerId)return;
  try{moving.q.releasePointerCapture(e.pointerId)}catch(err){}
  moving=null;document.body.classList.remove('abu-question-moving');scheduleDraft();updateToolbar();
}

function touchStart(e){
  if(e.touches.length!==2)return;
  if(moving){moving=null;document.body.classList.remove('abu-question-moving')}
  const t1=e.touches[0],t2=e.touches[1];
  const q1=t1.target?.closest?.('.question-container'),q2=t2.target?.closest?.('.question-container');
  const same=q1&&q1===q2?q1:null;
  if(same)selectQuestion(same);
  pinch={kind:same?'question':'paper',q:same,startDistance:Math.max(1,distance(t1,t2)),startValue:same?qScale(same):paperZoom};
  e.preventDefault();
}
function touchMove(e){
  if(!pinch||e.touches.length<2)return;
  const ratio=distance(e.touches[0],e.touches[1])/pinch.startDistance;
  if(pinch.kind==='question'&&pinch.q?.isConnected){setQuestionScale(pinch.startValue*ratio)}
  else applyPaperZoom(pinch.startValue*ratio,false);
  e.preventDefault();
}
function touchEnd(e){
  if(!pinch||e.touches.length>=2)return;
  if(pinch.kind==='paper')savePaperZoom();
  if(pinch.kind==='question')scheduleDraft();
  pinch=null;updateToolbar();
}

function focusIn(e){
  const editable=e.target?.closest?.('[contenteditable="true"]');
  if(!editable)return;
  const q=editable.closest('.question-container');if(q)selectQuestion(q);
  if(moveMode){moveMode=false;document.body.classList.remove('abu-question-move-mode');updateToolbar()}
  setTimeout(()=>{try{editable.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'})}catch(err){}},240);
}

function observe(){
  const root=$('pages-container')||document.body;
  new MutationObserver(()=>{
    if(selectedQuestion&&!selectedQuestion.isConnected)selectQuestion(null);
    document.querySelectorAll('.question-container[data-abu-scale],.question-container[data-abu-move-x],.question-container[data-abu-move-y]').forEach(applyQuestionTransform);
  }).observe(root,{childList:true,subtree:true});
}

function init(){
  addCss();addToolbar();applyPaperZoom(paperZoom,false);
  document.querySelectorAll('.question-container[data-abu-scale],.question-container[data-abu-move-x],.question-container[data-abu-move-y]').forEach(applyQuestionTransform);
  document.addEventListener('pointerdown',pointerDown,true);
  document.addEventListener('pointermove',pointerMove,{capture:true,passive:false});
  document.addEventListener('pointerup',pointerUp,true);
  document.addEventListener('pointercancel',pointerUp,true);
  document.addEventListener('touchstart',touchStart,{capture:true,passive:false});
  document.addEventListener('touchmove',touchMove,{capture:true,passive:false});
  document.addEventListener('touchend',touchEnd,{capture:true,passive:false});
  document.addEventListener('touchcancel',touchEnd,{capture:true,passive:false});
  document.addEventListener('focusin',focusIn,true);
  observe();updateToolbar();
}

window.AbuQuestionGestures={paper,paperReset,question,move,resetQuestion,select:q=>selectQuestion(q)};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
