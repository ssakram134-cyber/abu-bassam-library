(()=>{
'use strict';
if(window.__ABU_QUESTIONS_COMPLETION_V2__)return;
window.__ABU_QUESTIONS_COMPLETION_V2__=true;
const $=id=>document.getElementById(id);
const PROFILE_KEY='abuQuestionHeaderProfileV1';
const IDB_NAME='AbuBassamQuestionDraftV2';
const IDB_STORE='drafts';
const IDB_KEY='ar';
const scope=()=>window.AbuQuestionScope?.identity()||null;
const rowId=()=>window.AbuQuestionScope?.draftRow(IDB_KEY)||null;
const sk=key=>window.AbuQuestionScope?.scopedKey(key)||null;
const META_KEY='abuBassamQuestionDraftArabicV2Meta';
const LOCAL_TS_KEY='abuBassamQuestionDraftArabicV2LocalTs';
let answersVisible=!!sk('abuQuestionAnswersVisibleV1')&&localStorage.getItem(sk('abuQuestionAnswersVisibleV1'))==='1';
let saveTimer=0,hydrating=true,editedDuringHydration=false,resettingDraft=false,draftWrites=Promise.resolve(),draftGeneration=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function profile(){try{return Object.assign({day:'',date:'',school:'مدرسة القادسية الابتدائية',schoolType:'للبنين',teacher:'أكرم حاتم الغزالي',year:'٢٠٢٦ - ٢٠٢٧',role:'الدور الأول'},JSON.parse((sk(PROFILE_KEY)&&localStorage.getItem(sk(PROFILE_KEY)))||'{}'))}catch(e){return{day:'',date:'',school:'مدرسة القادسية الابتدائية',schoolType:'للبنين',teacher:'أكرم حاتم الغزالي',year:'٢٠٢٦ - ٢٠٢٧',role:'الدور الأول'}}}
function addCss(){if($('abuQuestionsCompletionStyle'))return;const s=document.createElement('style');s.id='abuQuestionsCompletionStyle';s.textContent=`
.abu-answer-box{display:none;margin-top:9px;padding:9px;border:1px dashed #0f766e;border-radius:10px;background:#ecfdf5;color:#134e4a;font-size:12px}.abu-answer-box b{display:block;margin-bottom:5px}.abu-show-answers .abu-answer-box{display:block}.abu-answer-toggle{background:#7c3aed!important}.abu-question-overflow:after{content:'⚠ محتوى الصفحة أكبر من مساحة A4';position:absolute;left:14px;bottom:8px;background:#fee2e2;color:#991b1b;border-radius:9px;padding:5px 8px;font:800 9px Tajawal;z-index:500}.abu-extra-template{border-color:#7c3aed55!important}.abu-extra-template .abu-tpreview{border-color:#7c3aed55!important;background:linear-gradient(135deg,#faf5ff,#f0fdf4)!important}.abu-extra-template button{background:#6d28d9!important}@media print{.abu-question-overflow:after{display:none!important}.abu-answer-box{display:none!important}.abu-show-answers .abu-answer-box{display:block!important}}
`;document.head.appendChild(s)}
function removeQuestionLibraryBranding(){
  document.querySelectorAll('.a4-page img').forEach(img=>{const text=(img.alt+' '+img.title+' '+img.src).toLowerCase();if(/abu[_-]?bassam|مكتبة أبو بسام|library[_-]?logo/.test(text))img.remove()});
  document.querySelectorAll('.a4-page .library-logo,.a4-page .question-library-logo,.a4-page [data-library-logo]').forEach(el=>el.remove());
}
function normalizeHeaders(){
  const p=profile();document.querySelectorAll('.a4-page .header').forEach(header=>{
    const before=header.innerHTML;const after=before.replace(/اسم\s*التلميذ\s*[:：\/]?/g,'التاريخ /');if(after!==before)header.innerHTML=after;
    const boxes=header.querySelectorAll('.header-box');const left=boxes[0],right=boxes[boxes.length-1];
    if(left&&/مدرسة الجود الابتدائية/.test(left.textContent||''))left.innerHTML=left.innerHTML.replace('مدرسة الجود الابتدائية',esc(p.school));
    if(!right)return;
    if(!/التاريخ/.test(right.textContent||''))right.insertAdjacentHTML('beforeend',`<br><span class="abu-header-date">التاريخ / ${esc(p.date||'................')}</span>`);
    if(!/اليوم/.test(right.textContent||''))right.insertAdjacentHTML('beforeend',`<br><span class="abu-header-day">اليوم / ${esc(p.day||'................')}</span>`);
  });
}
function enhanceAnswers(){
  document.querySelectorAll('.question-container').forEach(q=>{
    if(q.querySelector(':scope > .abu-answer-box'))return;
    const box=document.createElement('div');box.className='abu-answer-box';box.innerHTML='<b>الإجابة النموذجية / الملاحظات</b><div contenteditable="true">اكتب الإجابة أو الملاحظة هنا...</div>';q.appendChild(box)
  });
  document.body.classList.toggle('abu-show-answers',answersVisible);syncAnswerButton();
}
function syncAnswerButton(){const b=$('abuAnswerToggle');if(b)b.textContent=answersVisible?'📝 الملاحظات/الإجابات: ظاهرة':'📝 الملاحظات/الإجابات: مخفية'}
function toggleAnswers(){answersVisible=!answersVisible;if(sk('abuQuestionAnswersVisibleV1'))localStorage.setItem(sk('abuQuestionAnswersVisibleV1'),answersVisible?'1':'0');document.body.classList.toggle('abu-show-answers',answersVisible);syncAnswerButton();queueDraft()}
function installAnswerButton(){const bar=$('controls');if(!bar||$('abuAnswerToggle'))return;const b=document.createElement('button');b.id='abuAnswerToggle';b.className='btn abu-answer-toggle';b.type='button';b.onclick=toggleAnswers;bar.appendChild(b);syncAnswerButton()}
function scaleFor(el){const page=el.closest('.a4-page');if(!page)return 1;const rect=page.getBoundingClientRect();return rect.width&&page.offsetWidth?rect.width/page.offsetWidth:1}
const boundMove=new WeakSet(),boundResize=new WeakSet();
function stableSetup(wrapper,moveHandle,resizeHandle){
  if(moveHandle&&!boundMove.has(moveHandle)){
    boundMove.add(moveHandle);moveHandle.style.touchAction='none';
    moveHandle.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();e.stopPropagation();const s=scaleFor(wrapper),x=e.clientX,y=e.clientY,l=wrapper.offsetLeft,t=wrapper.offsetTop;try{moveHandle.setPointerCapture(e.pointerId)}catch(_){}
      const mv=ev=>{ev.preventDefault();wrapper.style.left=(l+(ev.clientX-x)/s)+'px';wrapper.style.top=(t+(ev.clientY-y)/s)+'px'};
      const up=()=>{moveHandle.removeEventListener('pointermove',mv);moveHandle.removeEventListener('pointerup',up);moveHandle.removeEventListener('pointercancel',up);queueDraft()};
      moveHandle.addEventListener('pointermove',mv);moveHandle.addEventListener('pointerup',up);moveHandle.addEventListener('pointercancel',up)
    })
  }
  if(resizeHandle&&!boundResize.has(resizeHandle)){
    boundResize.add(resizeHandle);resizeHandle.style.touchAction='none';
    resizeHandle.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();e.stopPropagation();const s=scaleFor(wrapper),x=e.clientX,y=e.clientY,w=wrapper.offsetWidth,h=wrapper.offsetHeight;try{resizeHandle.setPointerCapture(e.pointerId)}catch(_){}
      const mv=ev=>{ev.preventDefault();wrapper.style.width=Math.max(50,w-(ev.clientX-x)/s)+'px';wrapper.style.height=Math.max(50,h+(ev.clientY-y)/s)+'px'};
      const up=()=>{resizeHandle.removeEventListener('pointermove',mv);resizeHandle.removeEventListener('pointerup',up);resizeHandle.removeEventListener('pointercancel',up);queueDraft()};
      resizeHandle.addEventListener('pointermove',mv);resizeHandle.addEventListener('pointerup',up);resizeHandle.addEventListener('pointercancel',up)
    })
  }
}
function stableRebind(){
  document.querySelectorAll('.draggable-item').forEach(wrapper=>{
    let move=wrapper.querySelector('.drag-move-handle'),resize=wrapper.querySelector('.img-resize-handle');
    if(move&&!boundMove.has(move)){const n=move.cloneNode(true);move.replaceWith(n);move=n}
    if(resize&&!boundResize.has(resize)){const n=resize.cloneNode(true);resize.replaceWith(n);resize=n}
    stableSetup(wrapper,move,resize);
    const buttons=[...wrapper.querySelectorAll('.img-btn')],img=wrapper.querySelector('img');
    buttons.forEach(btn=>{if((btn.textContent||'').includes('❌'))btn.onclick=()=>{try{window.saveState?.()}catch(_){}wrapper.remove();queueDraft()};if(img&&(btn.textContent||'').includes('✂'))btn.onclick=()=>{try{window.saveState?.()}catch(_){}img.style.objectFit=img.style.objectFit==='cover'?'contain':'cover';btn.style.backgroundColor=img.style.objectFit==='cover'?'#4CAF50':'white';queueDraft()}})
  });
  document.querySelectorAll('.btn-del-page').forEach(button=>{button.onclick=()=>window.deletePage?.(button)})
}
function installStableDrag(){window.setupDragAndResize=stableSetup;window.rebindAllDraggables=stableRebind;stableRebind()}
function dbOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open(IDB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(IDB_STORE))r.result.createObjectStore(IDB_STORE,{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function idbPut(html,updatedAt=Date.now()){
 const key=rowId(),owner=scope();if(!key||!owner)return false;
 try{
  const db=await dbOpen();
  if(scope()!==owner){db.close?.();return false}
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(IDB_STORE,'readwrite');
   tx.objectStore(IDB_STORE).put({id:key,html,updatedAt});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
  });
  db.close?.();return scope()===owner
 }catch(e){return false}
}
async function idbGet(){
 const key=rowId(),owner=scope();if(!key||!owner)return null;
 try{
  const db=await dbOpen();if(scope()!==owner){db.close?.();return null}
  const row=await new Promise((resolve,reject)=>{
   const req=db.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).get(key);
   req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)
  });
  db.close?.();return scope()===owner?row:null
 }catch(e){return null}
}
async function idbDelete(){
 const key=rowId(),owner=scope();if(!key||!owner)return false;
 try{
  const db=await dbOpen();if(scope()!==owner){db.close?.();return false}
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).delete(key);
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
  });db.close?.();return scope()===owner
 }catch(e){return false}
}
async function saveDurableDraft(show=false){
 const container=$('pages-container');
 if(!container||resettingDraft||!scope()){if(show)alert('لا تتوفر هوية حساب موثوقة لحفظ المسودة.');return false}
 const html=container.innerHTML,ts=Date.now(),generation=draftGeneration,owner=scope();
 // Keep writes ordered: an older autosave must never finish after a newer save.
 const pending=draftWrites.catch(()=>{}).then(async()=>{
  if(resettingDraft||generation!==draftGeneration||scope()!==owner)return false;
  const ok=await idbPut(html,ts);
  if(ok&&generation===draftGeneration&&scope()===owner){
   try{
    localStorage.setItem(sk(LOCAL_TS_KEY),String(ts));
    localStorage.setItem(sk(META_KEY),String(ts));
   }catch(e){}
  }
  return ok
 });
 draftWrites=pending;
 const ok=await pending;
 if(show)alert(ok?'تم حفظ مسودة الأسئلة ✓':'تعذر حفظ المسودة؛ لم يتم حذف النسخة القديمة.');
 return ok
}
function queueDraft(){if(hydrating||resettingDraft)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveDurableDraft(false),650)}
function draftInput(){if(hydrating)editedDuringHydration=true;queueDraft()}
async function restoreDurableIfNeeded(){
 const container=$('pages-container'),owner=scope();
 if(!container||!owner){hydrating=false;return false}
 const before=container.innerHTML;
 try{
  // Old global IDs and LocalStorage snapshots are quarantined, never silently assigned to a new user.
  const row=await idbGet();
  if(!row?.html||scope()!==owner||editedDuringHydration||before!==container.innerHTML)return false;
  container.innerHTML=row.html;
  stableRebind();normalizeHeaders();enhanceAnswers();window.fitToScreen?.();
  return true
 }finally{hydrating=false;if(editedDuringHydration)queueDraft()}
}
async function resetDurableDraft(){
 if(resettingDraft||!scope()||!confirm('بدء نموذج جديد؟ ستُحذف مسودة الأسئلة الحالية من التخزين المحلي.'))return false;
 const owner=scope();resettingDraft=true;clearTimeout(saveTimer);draftGeneration++;
 try{
  await draftWrites.catch(()=>{});
  if(scope()!==owner||!(await idbDelete()))throw Error('تعذر حذف المسودة أو تغير الحساب؛ لم يُغلق المحرر.');
  try{
   localStorage.removeItem(sk(META_KEY));
   localStorage.removeItem(sk(LOCAL_TS_KEY));
  }catch(e){throw Error('تعذر تنظيف المسودة القديمة؛ لم يُعَد تشغيل المحرر.')}
  location.reload();
  return true
 }catch(e){alert(String(e?.message||e));return false}
 finally{resettingDraft=false}
}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('تعذر قراءة الصورة'));r.readAsDataURL(file)})}
function loadImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('تعذر فتح الصورة'));im.src=src})}
async function optimizedImage(file){if(!file||!String(file.type||'').startsWith('image/'))throw new Error('الملف المختار ليس صورة.');if(file.size>40*1024*1024)throw new Error('الصورة أكبر من الحد الآمن 40MB.');const src=await fileToDataUrl(file),im=await loadImage(src),w=im.naturalWidth||im.width,h=im.naturalHeight||im.height,maxSide=Math.max(w,h);if(maxSide<=2600&&file.size<=6*1024*1024)return src;const scale=Math.min(1,2600/maxSide),cw=Math.max(1,Math.round(w*scale)),ch=Math.max(1,Math.round(h*scale)),canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;const ctx=canvas.getContext('2d',{alpha:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(im,0,0,cw,ch);const png=String(file.type).toLowerCase()==='image/png';return canvas.toDataURL(png?'image/png':'image/jpeg',png?undefined:.94)}
async function safeAddImage(event){const input=event?.target,file=input?.files?.[0];if(!file)return;try{const data=await optimizedImage(file);if(typeof window.createDraggableElement!=='function')throw new Error('محرر الصور غير جاهز');window.createDraggableElement('image',data);queueDraft()}catch(e){alert('تعذر إضافة الصورة: '+(e?.message||e))}finally{if(input)input.value=''}}
function refreshOverflowFlags(){document.querySelectorAll('.a4-page').forEach(page=>{if(page.scrollHeight<=page.clientHeight+4)page.classList.remove('abu-question-overflow')})}
function wrapFlow(){const fn=window.checkAutoFlow;if(typeof fn!=='function'||fn.__abuCompletionWrapped)return;const wrapped=function(...args){document.querySelectorAll('.a4-page').forEach(p=>p.classList.remove('abu-question-overflow'));const out=fn.apply(this,args);refreshOverflowFlags();return out};wrapped.__abuCompletionWrapped=true;window.checkAutoFlow=wrapped}
function wrapPaper(){const api=window.AbuQuestionPaper;if(!api||api.__abuCompletionWrapped)return;const apply=api.apply?.bind(api);if(apply)api.apply=function(...args){const out=apply(...args);setTimeout(()=>{wrapFlow();refreshOverflowFlags()},0);return out};api.__abuCompletionWrapped=true}
function q(index,title,body,type='short'){return `<div class="question-container q${((index-1)%15)+1}" data-question-type="${type}"><div class="action-btns"><button onclick="moveUp(this)">⬆️</button><button onclick="moveDown(this)">⬇️</button><button onclick="duplicateQ(this)">📋</button><button onclick="deleteQ(this)">🗑️</button></div><div class="q-title" contenteditable="true"><span>✦</span> ${esc(title)}</div><div class="text-area" contenteditable="true">${body}</div></div>`}
function header(meta,title){const p=profile();return `<div class="header"><div class="header-box" contenteditable="true">إدارة: .........................<br>${esc(p.school)}<br>${esc(p.schoolType)}</div><div class="header-center" contenteditable="true"><span class="title">${esc(title)}</span><br>${esc(p.role)}<br>للعام ${esc(p.year)}</div><div class="header-box" contenteditable="true">${meta.grade?'الصف / '+esc(meta.grade)+'<br>':''}${meta.subject?'المادة / '+esc(meta.subject)+'<br>':''}معلم المادة / ${esc(p.teacher)}<br>التاريخ / ${esc(p.date||'................')}<br>اليوم / ${esc(p.day||'................')}</div></div>`}
function page(meta,title,note,questions){return `<div class="a4-page" id="main-page"><button class="btn-del-page" onclick="deletePage(this)">حذف الصفحة</button>${header(meta,title)}<div class="note-wrapper"><button class="del-note-btn" onclick="hideElement(this)">✖</button><div class="note-bar" contenteditable="true">${esc(note)}</div></div><div class="questions-area">${questions.join('')}</div></div>`}
const EXTRA={
 math1:[
  ['رياضيات الأول — نموذج ٤',[['الأعداد والترتيب — ٢ درجة','رتب: ٨، ٢، ٥، ١ من الأصغر إلى الأكبر.'],['المقارنة — ٢ درجة','ضع > أو < أو = : ٧ ( ) ٣ ، ٤ ( ) ٤ ، ٢ ( ) ٦.'],['الجمع — ٢ درجة','٣ + ٤ = ( ) ، ٢ + ٦ = ( ).'],['الطرح — ٢ درجة','٩ - ٣ = ( ) ، ٧ - ٢ = ( ).'],['مسألة — ٢ درجة','مع سارة ٥ أقلام، اشترت ٣ أخرى. كم أصبح لديها؟']]],
  ['رياضيات الأول — نموذج ٥',[['خط الأعداد — ٢ درجة','أكمل: ٠ — ١ — ٢ — ( ) — ٤ — ( ).'],['السابق واللاحق — ٢ درجة','( ) ٥ ( ) ، ( ) ٨ ( ).'],['الأشكال — ٢ درجة','سمِّ الأشكال: ○  △  □  ▭.'],['الأنماط — ٢ درجة','أكمل: ○ △ ○ △ ( ) ( ).'],['تفكير — ٢ درجة','أي العددين أقرب إلى ١٠: ٨ أم ٤؟ وضح.']]],
  ['رياضيات الأول — نموذج ٦',[['العد — ٢ درجة','🍎 🍎 🍎 🍎 🍎 = ( )'],['العدد المفقود — ٢ درجة','١، ٢، ( )، ٤، ( )، ٦.'],['الجمع بالصور — ٢ درجة','🍏🍏 + 🍏🍏🍏 = ( ).'],['الطرح بالصور — ٢ درجة','⭐⭐⭐⭐⭐ احذف نجمتين، الباقي ( ).'],['قصة عددية — ٢ درجة','في الصف ٦ تلاميذ، خرج تلميذان. كم بقي؟']]],
  ['رياضيات الأول — نموذج ٧',[['الطول — ٢ درجة','ضع خطًا تحت الشيء الأطول في كل زوج.'],['الكتلة — ٢ درجة','أيّهما أثقل: كتاب أم قلم؟'],['الوقت — ٢ درجة','اكتب الوقت عندما يشير العقرب الصغير إلى ٣ والكبير إلى ١٢.'],['النقود — ٢ درجة','معك ١٠، دفعت ٦. المتبقي ( ).'],['تفكير — ٢ درجة','اذكر شيئًا في الصف يمكن قياس طوله.']]],
  ['رياضيات الأول — نموذج ٨',[['أكمل إلى ١٠ — ٢ درجة','٧ + ( ) = ١٠ ، ٤ + ( ) = ١٠.'],['عائلات الحقائق — ٢ درجة','اكتب عمليتي جمع باستعمال ٢، ٣، ٥.'],['المقارنة — ٢ درجة','الأكبر: ٦ أم ٩؟ الأصغر: ٣ أم ٨؟'],['ترتيب — ٢ درجة','٩، ٤، ٧، ٢ من الأكبر إلى الأصغر.'],['تفكير — ٢ درجة','لديك عدد أكبر من ٥ وأصغر من ٨. ما الاحتمالات؟']]],
  ['رياضيات الأول — نموذج ٩',[['المكان — ٢ درجة','اكتب: فوق / تحت / يمين / يسار حسب الشكل الذي يرسمه المعلم.'],['الأشكال — ٢ درجة','ارسم دائرة ومربعًا ومثلثًا.'],['الأنماط — ٢ درجة','□ ○ ○ □ ○ ○ ( ) ( ) ( ).'],['الجمع — ٢ درجة','٥ + ١ = ( ) ، ٥ + ٢ = ( ).'],['مسألة — ٢ درجة','على الغصن ٧ عصافير طار ٣. كم بقي؟']]],
  ['رياضيات الأول — نموذج ١٠',[['أتعلم — ٢ درجة','اكتب الأعداد من ٠ إلى ٩ بالترتيب.'],['أتأكد — ٢ درجة','ضع دائرة حول العدد الأكبر: ٣، ٨، ٥.'],['أتحدث — ٢ درجة','اشرح كيف تعرف أن ٦ أكبر من ٤.'],['أحل — ٢ درجة','٤ + ٣ = ( ) ، ٨ - ٥ = ( ).'],['أفكر — ٢ درجة','كوّن مسألة من حياتك إجابتها ٧.']]]
 ],
 science3:[
  ['علوم الثالث — نموذج ٧',[['تغذية الكائنات — ٣ درجات','كيف تحصل النباتات والحيوانات على غذائها؟'],['الفطريات — ٣ درجات','اذكر مثالين للفطريات وفائدة أو ضررًا لكل مثال.'],['السلسلة الغذائية — ٤ درجات','كوّن سلسلة غذائية من ثلاثة كائنات.']]],
  ['علوم الثالث — نموذج ٨',[['مواد البيئة — ٣ درجات','اذكر ثلاث مواد من البيئة وفائدة كل منها.'],['الثروة الحيوانية — ٣ درجات','صنّف الحيوانات إلى آكلات أعشاب ولحوم وقوارت.'],['تفكير — ٤ درجات','ماذا يحدث إذا اختفى أحد أفراد السلسلة الغذائية؟']]],
  ['علوم الثالث — نموذج ٩',[['صنع الغذاء — ٣ درجات','ما الذي يحتاجه النبات لصنع غذائه؟'],['تخزين الغذاء — ٣ درجات','اذكر أجزاء نباتية تخزن الغذاء مع مثال.'],['المكافحة الحياتية — ٤ درجات','اشرح بمثال كيف تساعد كائنات حية في مكافحة الآفات.']]],
  ['علوم الثالث — نموذج ١٠',[['أدوية من الطبيعة — ٣ درجات','اذكر مثالًا لمادة دوائية مصدرها نبات أو حيوان.'],['الماء والهواء — ٣ درجات','لماذا يعد الماء والهواء مهمين للكائنات الحية؟'],['المعادن والصخور والتربة — ٤ درجات','قارن بين معدن وصخر وتربة من حيث الاستخدام.']]]
 ],
 general:[
  ['نموذج عام ٧',[['السؤال الأول — ٢ درجة','اختر الإجابة الصحيحة من الخيارات المعطاة.'],['السؤال الثاني — ٢ درجة','ضع صح أو خطأ أمام العبارات.'],['السؤال الثالث — ٣ درجات','أكمل الفراغات بما يناسب.'],['السؤال الرابع — ٣ درجات','أجب بإجابة قصيرة.']]],
  ['نموذج عام ٨',[['تعريفات — ٣ درجات','عرّف ثلاثة مصطلحات من المادة.'],['مقارنة — ٣ درجات','قارن بين مفهومين وفق نقطتين.'],['تطبيق — ٤ درجات','طبّق ما تعلمته على موقف جديد.']]],
  ['نموذج عام ٩',[['اختيار — ٣ درجات','اختر الإجابة الأدق واذكر السبب.'],['ترتيب — ٣ درجات','رتب الخطوات أو الأحداث ترتيبًا صحيحًا.'],['تفكير — ٤ درجات','فسّر النتيجة المتوقعة للموقف المعطى.']]],
  ['نموذج عام ١٠',[['أساسيات — ٢ درجة','أجب عن سؤالين مباشرين.'],['فهم — ٣ درجات','اشرح الفكرة الرئيسة بأسلوبك.'],['تطبيق — ٢ درجة','اذكر مثالًا من الحياة اليومية.'],['تفكير — ٣ درجات','اقترح حلًا أو استنتاجًا مناسبًا.']]]
 ]
};
function subjectKey(){
  const text=String($('abuSubjects')?.querySelector('button.on')?.textContent||'');if(text.includes('الثالث'))return'science3';if(text.includes('الرابع'))return'science4';if(text.includes('الإسلامية'))return'islamic';if(text.includes('الرياضيات'))return'math1';
  try{return window.AbuQuestionTypes?.subject?.()||'math1'}catch(e){return'math1'}
}
function metaFor(key){return key==='math1'?{grade:'الأول الابتدائي',subject:'الرياضيات'}:key==='science3'?{grade:'الثالث الابتدائي',subject:'العلوم'}:{grade:'................',subject:'................'}}
function extraCard(key,index,item){const id=`abu-extra-${key}-${index}`;return `<div class="abu-tcard abu-extra-template" data-extra-template="${id}"><div class="abu-tpreview"><b>${esc(item[0])}</b><span>تخطيط وأسئلة مستقلة</span></div><b>${esc(item[0])}</b><button type="button" onclick="AbuQuestionCompletion.applyExtra('${key}',${index})">استخدام النموذج</button></div>`}
function injectExtraTemplates(){
  const spec=$('abuSubjectTemplates'),gen=$('abuGeneralTemplates');if(!spec||!gen)return;
  const key=subjectKey(),extras=EXTRA[key]||[];extras.forEach((item,i)=>{const id=`abu-extra-${key}-${i}`;if(!spec.querySelector(`[data-extra-template="${id}"]`))spec.insertAdjacentHTML('beforeend',extraCard(key,i,item))});
  EXTRA.general.forEach((item,i)=>{const id=`abu-extra-general-${i}`;if(!gen.querySelector(`[data-extra-template="${id}"]`))gen.insertAdjacentHTML('beforeend',extraCard('general',i,item))})
}
function applyExtra(key,index){const item=EXTRA[key]?.[index];if(!item)return;const meta=metaFor(key);const questions=item[1].map((row,i)=>q(i+1,row[0],row[1])).join('');const html=page(meta,item[0],'أجب عن جميع الأسئلة مع مراعاة وضوح الخط.',[questions]);const c=$('pages-container');if(!c)return;try{window.saveState?.()}catch(_){}c.innerHTML=html;normalizeHeaders();enhanceAnswers();stableRebind();window.AbuQuestionTypes?.enhance?.();window.fitToScreen?.();window.checkAutoFlow?.();queueDraft();$('abuQTemplateModal')?.classList.remove('show')}
function wrapTemplates(){if(!window.AbuQuestionTemplates||AbuQuestionTemplates.__abuCompletionWrapped)return false;const origOpen=AbuQuestionTemplates.openTemplates?.bind(AbuQuestionTemplates),origApply=AbuQuestionTemplates.applyTemplate?.bind(AbuQuestionTemplates);if(origOpen)AbuQuestionTemplates.openTemplates=function(...args){const r=origOpen(...args);setTimeout(injectExtraTemplates,20);return r};if(origApply)AbuQuestionTemplates.applyTemplate=function(...args){const r=origApply(...args);setTimeout(()=>{normalizeHeaders();enhanceAnswers();stableRebind();window.fitToScreen?.();window.checkAutoFlow?.();queueDraft()},30);return r};AbuQuestionTemplates.__abuCompletionWrapped=true;return true}
function watch(){
  const c=$('pages-container');if(c){c.addEventListener('input',draftInput,true);c.addEventListener('change',draftInput,true);new MutationObserver(()=>{normalizeHeaders();removeQuestionLibraryBranding();enhanceAnswers();setTimeout(stableRebind,0);queueDraft()}).observe(c,{childList:true,subtree:true})}
  const modal=$('abuQTemplateModal');if(modal)new MutationObserver(()=>setTimeout(injectExtraTemplates,0)).observe(modal,{childList:true,subtree:true})
}
async function init(){addCss();installAnswerButton();normalizeHeaders();removeQuestionLibraryBranding();enhanceAnswers();installStableDrag();window.saveQuestionDraft=saveDurableDraft;window.scheduleQuestionDraft=queueDraft;window.resetQuestionDraft=resetDurableDraft;window.handleAddImage=safeAddImage;wrapFlow();wrapPaper();watch();await restoreDurableIfNeeded();let tries=0,t=setInterval(()=>{tries++;const ready=wrapTemplates();wrapFlow();wrapPaper();if(ready||tries>40)clearInterval(t)},100);setTimeout(injectExtraTemplates,500)}
window.AbuQuestionCompletion={toggleAnswers,applyExtra,save:saveDurableDraft,reset:resetDurableDraft,optimizeImage:optimizedImage,refreshOverflow:refreshOverflowFlags,injectExtraTemplates,normalizeHeaders,rebind:stableRebind,ensureAnswers:enhanceAnswers};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();