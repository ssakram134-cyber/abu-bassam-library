'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','web/productivity-tools-runtime.js'),'utf8');
const start=src.indexOf('function questionDocument(){'),end=src.indexOf('\nfunction updateLanguageUi()',start);
assert.ok(start>=0&&end>start,'canonical question runtime injectors');
const injectors=src.slice(start,end);
const pick=name=>{
 const line=src.split('\n').filter(x=>x.startsWith('function '+name+'('));
 assert.equal(line.length,1,'function '+name);
 return line[0];
};
const notify=pick('notifyFrame');
const onCompressor=pick('onCompressorShow');
const build=pick('build');
let checks=0;
const eq=(actual,expected,label)=>{assert.equal(actual,expected,label);checks++};
function makeDoc(url,ready='complete'){
 const scripts=new Map(),additions=[],statuses=[],logs=[];
 const document={URL:url,readyState:ready,head:{appendChild(element){
   scripts.set(element.id,element);additions.push(element)
 }},getElementById:id=>scripts.get(id)||null,createElement(){
   return{id:'',src:'',removed:false,async:false,remove(){
      this.removed=true;scripts.delete(this.id)
   }}
 }};
 return{document,scripts,additions,statuses,logs};
}
function harness(initial='ar'){
 const state={language:initial,statuses:[],notices:[],scheduled:[],events:{},frameUrl:'questions-'+initial+'.html'};
 const q=makeDoc('file:///android_asset/library/'+state.frameUrl);
 const c=makeDoc('file:///android_asset/library/image-compressor.html','loading');
 const frame={
  dataset:{},contentDocument:q.document,
  getAttribute:name=>name==='src'?state.frameUrl:'',
  contentWindow:{postMessage:(msg,target)=>state.notices.push({frame:'questions',msg,target})}
 };
 const compressor={
  dataset:{},contentDocument:c.document,src:'about:blank',
  listeners:{},getAttribute:name=>name==='src'?compressor.src:'',
  contentWindow:{postMessage:(msg,target)=>state.notices.push({frame:'compressor',msg,target})},
  addEventListener(name,callback){this.listeners[name]=callback}
 };
 const sections={questionsFrame:frame,compressorFrame:compressor};
 const $=id=>sections[id]||null;
 const frameLoaded=f=>!!f&&f.getAttribute('src')!=='about:blank';
 const wantedQuestionSrc=()=>state.language==='ar'?'questions-ar.html':'questions-en.html';
 const setStatus=(id,message,ok)=>state.statuses.push({id,message,ok});
 const console={warn:msg=>state.statuses.push({warn:msg})};
 const code=[
  'let language=state.language;',
  'const $=id=>sections[id]||null;',
  'const frameLoaded=f=>!!f&&f.getAttribute("src")!=="about:blank";',
  'const wantedQuestionSrc=()=>language==="ar"?"questions-ar.html":"questions-en.html";',
  'const setStatus=(id,message,ok)=>state.statuses.push({id,message,ok});',
  'const console={warn:message=>state.statuses.push({warn:message})};',
  injectors,notify,
  'return {questionDocument,inject:injectCurrentQuestionRuntime,arabic:injectArabicRuntimes,english:injectEnglishRuntime,notify:notifyFrame,change:val=>language=val};'
 ].join('\n');
 const api=new Function('state','sections',code)(state,sections);
 return{...api,state,frame,compressor,q,c,
  newQuestions(lang,ready='complete'){
   const obj=makeDoc('file:///android_asset/library/questions-'+lang+'.html',ready);
   state.frameUrl='questions-'+lang+'.html';
   frame.contentDocument=obj.document;
   Object.assign(this,{q:obj});
   api.change(lang);return obj;
  }
 };
}
const a=harness('ar');
eq(a.q.additions.length,0,'no scripts injected before requested');
a.inject();
eq(a.q.additions.length,4,'three Arabic tools plus Word');
eq(a.q.scripts.size,4,'exactly four script ids present');
a.inject();a.inject();
eq(a.q.additions.length,4,'repeated open never duplicates scripts');
for(const id of ['abuQuestionTemplatesExternal','abuQuestionPaperExternal','abuQuestionTypesExternal','abuQuestionWordToolsExternal']){
 eq(a.q.scripts.has(id),true,'necessary Arabic tool '+id);
}
const failedTemplate=a.q.scripts.get('abuQuestionTemplatesExternal');
failedTemplate.onerror();
eq(failedTemplate.removed,true,'failed Arabic script removed');
eq(a.q.scripts.has('abuQuestionTemplatesExternal'),false,'Arabic failure no longer blocks retry');
a.inject();
eq(a.q.additions.length,5,'failed Arabic tool retried once');
eq(a.q.scripts.size,4,'successful scripts preserved on retry');
const failedWord=a.q.scripts.get('abuQuestionWordToolsExternal');
failedWord.onerror();
eq(failedWord.removed,true,'failed Word script removed');
a.inject();
eq(a.q.additions.length,6,'Word export available for retry');
eq(a.q.scripts.size,4,'Word retry does not duplicate successful Arabic tools');
const english=a.newQuestions('en');
a.inject();
eq(english.additions.length,2,'English fixer and Word in new frame');
eq(english.scripts.has('abuQuestionEnFixesExternal'),true,'English fixer present');
eq(english.scripts.has('abuQuestionWordToolsExternal'),true,'Word export enabled for English');
a.inject();
eq(english.additions.length,2,'repeated English opens idempotent');
english.scripts.get('abuQuestionEnFixesExternal').onerror();
eq(english.scripts.has('abuQuestionEnFixesExternal'),false,'failed English fixer removed');
a.inject();
eq(english.additions.length,3,'failed English fixer retried');
english.scripts.get('abuQuestionWordToolsExternal').onerror();
a.inject();
eq(english.additions.length,4,'failed English Word export retried');

const loading=a.newQuestions('ar','loading');
a.inject();
eq(loading.additions.length,0,'loading new page must not receive scripts');
eq(a.questionDocument(),null,'loading document fails ready gate');
loading.document.readyState='complete';
a.inject();
eq(loading.additions.length,4,'completed Arabic page receives tools');
loading.document.URL='about:blank';
a.inject();
eq(loading.additions.length,4,'about-blank document blocks stale injection');
loading.document.URL='file:///android_asset/library/questions-en.html';
a.inject();
eq(loading.additions.length,4,'wrong-language previous page blocks injection');
const fresh=a.newQuestions('ar');
a.inject();
eq(fresh.additions.length,4,'new navigation receives clean scripts');
const badUrl=a.newQuestions('ar');badUrl.document.URL='file:///android_asset/library/questions-en.html';
eq(a.questionDocument(),null,'stale frame URI rejected despite matching parent src');
badUrl.document.URL='file:///android_asset/library/questions-ar.html?x=1#ready';
eq(a.questionDocument(),badUrl.document,'valid same page with query/hash accepted');

const c=harness('ar');
c.notify('compressorFrame');
eq(c.state.notices.length,0,'compressor not notified while loading');
c.c.document.readyState='complete';
c.notify('compressorFrame');
eq(c.state.notices.length,1,'ready compressor receives notification');
eq(c.state.notices[0].msg.type,'abuBassamTabVisible','correct compressor message');
c.c.document.URL='about:blank';c.notify('compressorFrame');
eq(c.state.notices.length,1,'stale compressor ignored');
c.c.document.URL='file:///android_asset/library/image-compressor.html';
c.notify('questionsFrame');
eq(c.state.notices.length,2,'ready question frame notified');
c.q.document.readyState='loading';c.notify('questionsFrame');
eq(c.state.notices.length,2,'unready question frame skipped');

// Exercise the actual section build callback, so the compressor iframe load
// sends a ready notification even when its initial 80ms timer runs too early.
const system=harness();
const events={};const app={insertBefore(){}},section=()=>({id:'',innerHTML:''});
const host={
  readyState:'complete',querySelector:key=>key==='.app'?app:key==='.app .preview'?null:null,
  createElement:()=>section(),getElementById:id=>id==='questionsCenter'?null:
   id==='questionsFrame'?{addEventListener:(type,fn)=>{events.questions=fn}}:
   id==='compressorFrame'?{addEventListener:(type,fn)=>{events.compressor=fn}}:null
};
const buildCode=[
 'const $=id=>document.getElementById(id);',
 'const addCss=()=>{},mainHtml=()=>"",compressorHtml=()=>"";',
 'const loadAdvancedRuntime=async()=>{},handleMessage=()=>{},updateLanguageUi=()=>{};',
 'const setTimeout=callback=>{state.scheduled.push(callback)};',
 'const injectCurrentQuestionRuntime=()=>{},notifyFrame=id=>state.notices.push(id);',
 build,'return build;'
].join('\n');
const buildFn=new Function('document','window','state',buildCode)(host,{addEventListener:(type,fn)=>{events.message=fn}},system.state);
buildFn();
eq(typeof events.compressor,'function','compressor page load handler attached');
eq(typeof events.questions,'function','question page load handler remains attached');
eq(typeof events.message,'function','single host message handler attached');
events.compressor();
eq(system.state.notices[0],'compressorFrame','compressor emits readiness notification after load');
eq(system.state.scheduled.length,0,'compressor onload does not start duplicate timers');

console.log('Question/Compressor iframe lifecycle: '+checks+'/'+checks+' focused checks passed');
