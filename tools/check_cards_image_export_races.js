'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const src=fs.readFileSync('web/cards-studio-runtime.js','utf8');new Function(src);
const ev={},imgs=[],jobs=[],saves=[],nodes=new Map(),db=new Map(),warn=[];
function node(id){if(!nodes.has(id))nodes.set(id,{value:'',src:'',srcdoc:'',classList:{add(){},remove(){}}});return nodes.get(id)}
const doc={getElementById:node,addEventListener:(n,cb)=>ev[n]=cb};
const store={getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v),removeItem:k=>db.delete(k)};
const Android={savePagesToGallery:(...args)=>saves.push(args)};
const window={Android,addEventListener(){},AbuBassamSecurity:{role:()=> 'owner'},AbuBassamCloud:{session:()=>({user:{id:'owner'}})}};
const injection='renderForm=()=>{};renderPreview=()=>{};renderAll=()=>{};'
 +'domCardPng=(side,model)=>new Promise(resolve=>window._jobs.push({side,model,resolve}));'
 +'resizeImage=file=>new Promise(resolve=>window._imgs.push({file,resolve}));'
 +'window._audit={state,loadPhoto,loadBrandLogo};window.CardsStudio={';
window._jobs=jobs;window._imgs=imgs;
new Function('window','document','localStorage','alert','Android',src.replace('window.CardsStudio={',injection))(window,doc,store,m=>warn.push(m),Android);
const tick=async()=>{for(let i=0;i<5;i++)await Promise.resolve()};
(async()=>{
const st=window._audit.state;st.type='personal';st.sides='both';st.output='cr80';st.queue=[];st.forms.personal.name='الأول';
const exp=window.CardsStudio.exportPng();assert.equal(jobs.length,1);
st.forms.personal.name='الثاني';st.sides='front';st.output='a4-pairs';jobs[0].resolve('front-image');await tick();
assert.equal(jobs.length,2);assert.equal(jobs[1].side,'back');assert.equal(jobs[0].model,jobs[1].model);assert.equal(jobs[1].model.data.name,'الأول');
jobs[1].resolve('back-image');await exp;assert.equal(saves.length,1);assert.equal(JSON.parse(saves[0][1]).length,2);
assert.equal(st.history[0].models[0].data.name,'الأول');assert.equal(st.history[0].printSettings.output,'cr80');
st.sides='both';const old=window.CardsStudio.exportPng();ev['abu-bassam-auth-changed']();jobs[2].resolve('old-data');await old;
assert.equal(saves.length,1);assert.equal(jobs.length,3,'old session must not begin drawing second face');
const a=window._audit.loadPhoto({name:'first'}),b=window._audit.loadPhoto({name:'second'});
imgs[1].resolve('new-photo');await b;imgs[0].resolve('old-photo');await a;assert.equal(st.photo,'new-photo');
const c=window._audit.loadPhoto({name:'deleting'});window.CardsStudio.removePhoto();imgs[2].resolve('late-photo');await c;assert.equal(st.photo,'');
const d=window._audit.loadBrandLogo({name:'old-logo'}),e=window._audit.loadBrandLogo({name:'new-logo'});
imgs[4].resolve('new-logo');await e;imgs[3].resolve('old-logo');await d;assert.equal(st.brand.logo,'new-logo');
const f=window._audit.loadBrandLogo({name:'other-user'});ev['abu-bassam-auth-changed']();imgs[5].resolve('secret');await f;assert.notEqual(st.brand.logo,'secret');
console.log('Cards atomic PNG/photo/logo checks passed: same face data, stable history, cancellation on logout, newest image and logo retained.');
})().catch(e=>{console.error(e);process.exitCode=1});