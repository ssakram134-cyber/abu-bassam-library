'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ar=read('web/questions-completion-runtime.js'),en=read('web/questions-en-fixes-runtime.js');
for(const src of [ar,en])new vm.Script(src);
function between(src,a,b){
 const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,'Missing runtime section '+a);
 return src.slice(i,j)
}
function storage(){
 const map=new Map();
 return {getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,String(v))},
 removeItem:k=>map.delete(k),map}
}
const deferred=()=>{
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
 return {promise,resolve,reject}
};
async function tick(){for(let i=0;i<10;i++)await Promise.resolve()}
function fixture(language){
 const isArabic=language==='ar',src=isArabic?ar:en,localStorage=storage(),alerts=[],view={innerHTML:'draft-1'};
 const $=id=>id==='pages-container'?view:null,deleteCalls=[],puts=[],timers=new Map();
 let reloads=0,deleteResult=true,mode='instant',confirmResult=true,nextTimer=0;
 const queueSource=isArabic
  ?between(src,'function queueDraftWrite(work){','\nfunction profile(){')
  :between(src,'function queueDraftWrite(work){','\nfunction addCss(){');
 // Arabic helper is declared near the top, so pull it independently.
 const queueHelper=isArabic?between(src,'function queueDraftWrite(work){','\nconst esc='):null;
 const draftBlock=isArabic?between(src,'async function saveDurableDraft(show=false){','\nfunction fileToDataUrl('):queueSource;
 const idbPut=async(html)=>{
  const call={html,pending:mode==='deferred'?deferred():null};
  puts.push(call);
  return call.pending?call.pending.promise:mode==='failed'?false:true
 };
 const idbDelete=async()=>{deleteCalls.push(1);return deleteResult};
 const idbGet=async()=>null;
 const alert=x=>alerts.push(String(x));
 const location={reload:()=>reloads++};
 const confirm=()=>confirmResult;
 const setTimeout=(fn,delay)=>{timers.set(++nextTimer,fn);return nextTimer};
 const clearTimeout=id=>timers.delete(id);
 const common=['$', 'idbPut','idbDelete','idbGet','localStorage','alert','location','confirm','setTimeout','clearTimeout',
  'Date','window','stableRebind','normalizeHeaders','enhanceAnswers','draftQueueInit'];
 const vars=[$,idbPut,idbDelete,idbGet,localStorage,alert,location,confirm,setTimeout,clearTimeout,
  Date,{fitToScreen:()=>{}},()=>{},()=>{},()=>{},null];
 const arCode="const META_KEY='meta',LOCAL_TS_KEY='localTs',IDB_KEY='ar';let saveTimer=0,draftResetting=false,draftQueue=Promise.resolve();"+
  (queueHelper||'')+draftBlock+
  ';return {save:saveDurableDraft,reset:resetDurableDraft,schedule:queueDraft,pending:()=>draftQueue}';
 const enCode="const DRAFT_KEY='english';let saveTimer=0,draftResetting=false,draftQueue=Promise.resolve();"+draftBlock+
  ';return {save:durableSave,reset,schedule,pending:()=>draftQueue}';
 const api=new Function(...common,isArabic?arCode:enCode)(...vars);
 return{api,view,alerts,puts,deleteCalls,localStorage,timers,
  setMode:x=>{mode=x},setDelete:x=>{deleteResult=x},setConfirm:x=>{confirmResult=x},
  get reloads(){return reloads}
 }
}
(async()=>{
 for(const lang of ['ar','en']){
  const t=fixture(lang),key=lang==='ar'?'abuBassamQuestionDraftArabicV1':'english';
  t.localStorage.setItem(key,'legacy-draft');
  if(lang==='ar'){t.localStorage.setItem('meta','last-real-success');t.localStorage.setItem('localTs','original')}
  t.setMode('failed');
  assert.equal(await t.api.save(true),lang==='en','English retains successful local fallback; Arabic fails without IDB');
  assert.equal(t.localStorage.getItem(key),lang==='en'?'draft-1':'legacy-draft');
  if(lang==='ar'){
   assert.equal(t.localStorage.getItem('meta'),'last-real-success','Failed IndexedDB save must not publish checkpoint');
   assert.equal(t.localStorage.getItem('localTs'),'original');
  }
  t.setMode('instant');t.view.innerHTML='draft-2';
  assert.equal(await t.api.save(),true);
  assert.equal(t.puts.at(-1).html,'draft-2');
  if(lang==='ar'){
   assert.equal(t.localStorage.getItem(key),null,'Remove old Arabic draft only after IDB transaction commit');
   assert.notEqual(t.localStorage.getItem('meta'),'last-real-success');
  }else assert.equal(t.localStorage.getItem(key),'draft-2');

  t.setMode('deferred');t.view.innerHTML='old-work';
  const first=t.api.save();
  await tick();assert.ok(t.puts.at(-1).pending,'The first async write must have started');
  t.view.innerHTML='new-work';const second=t.api.save();
  await tick();assert.equal(t.puts.at(-1).html,'old-work','Second write must not overtake the pending earlier transaction');
  t.puts.at(-1).pending.resolve(true);
  await first;await tick();
  assert.equal(t.puts.at(-1).html,'new-work','Queued latest draft must commit last');
  t.puts.at(-1).pending.resolve(true);await second;

  t.setMode('deferred');t.view.innerHTML='work-before-reset';
  const inflight=t.api.save();await tick();
  const saved=t.puts.at(-1);assert.equal(saved.html,'work-before-reset');
  t.setDelete(false);
  const failedReset=t.api.reset();await tick();
  assert.equal(t.deleteCalls.length,0,'Delete must await queued in-flight writes');
  saved.pending.resolve(true);await inflight;
  assert.equal(await failedReset,false,'Failed delete must refuse reload');
  assert.equal(t.reloads,0);
  assert.equal(t.deleteCalls.length,1);
  assert.ok(t.alerts.some(x=>/تعذر حذف|Unable to delete/.test(x)));
  if(lang==='ar')assert.ok(t.localStorage.getItem('meta'),'Arabic successful checkpoint retained after failed delete');
  else assert.equal(t.localStorage.getItem(key),'work-before-reset','English fallback retained after failed delete');

  t.setMode('instant');t.setDelete(true);
  assert.equal(await t.api.reset(),true);
  assert.equal(t.reloads,1);
  assert.equal(t.localStorage.getItem(key),null);
  t.setConfirm(false);assert.equal(await t.api.reset(),false);
  assert.equal(t.reloads,1);
 }
 for(const [lang,source,start,end,func,invalid] of [
  ['ar',ar,'async function optimizedImage(file){','\nfunction refreshOverflowFlags(','optimizedImage','الملف المختار ليس صورة'],
  ['en',en,'async function optimized(file){','\nfunction install(){','optimized','Selected file is not an image']
 ]){
  const snippet=between(source,start,end),document={createElement:()=>({width:0,height:0,getContext:()=>null})};
  const runner=new Function('fileToDataUrl','loadImage','fileUrl','image','document',snippet+';return '+func)(
   async()=> 'data:image/png;base64,YQ==',async()=>({naturalWidth:5000,naturalHeight:4000}),
   async()=> 'data:image/png;base64,YQ==',async()=>({naturalWidth:5000,naturalHeight:4000}),document);
  for(const type of ['image/gif','image/svg+xml','image/heic']){
   await assert.rejects(runner({type,size:100}),new RegExp(invalid),'Unsupported image formats fail before decode or canvas');
  }
  await assert.rejects(runner({type:'image/png',size:41*1024*1024}),/40MB/);
  await assert.rejects(runner({type:'image/png',size:7*1024*1024}),/محرر الصور|Image canvas/,'Missing canvas must not crash question editor');
 }
 for(const src of [ar,en]){
  assert.match(src,/maintenanceTimer=setTimeout\(/,'Mutation maintenance must be coalesced');
  assert.match(src,/visibilitychange/,'Pending edits should flush on tab hide');
  assert.match(src,/draftResetting/);
  assert.doesNotMatch(src,/new MutationObserver\(\(\)=>\{enhanceHeader\(\);enhanceAnswers\(\);rebind\(\);schedule\(\)\}/);
 }
 console.log('Question draft safety passed: failed-IDB checkpoints, serialized write order, reset waits for pending writes, deletion-failure preservation, image MIME/canvas handling and observer coalescing.');
})().catch(e=>{console.error(e);process.exitCode=1});
