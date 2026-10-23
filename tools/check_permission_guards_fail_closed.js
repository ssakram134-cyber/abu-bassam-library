const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('web/permission-guard-runtime.js','utf8');
const sections=fs.readFileSync('web/permission-section-guards-runtime.js','utf8');
new vm.Script(source);new vm.Script(sections);
function fixture(sec){
 const ev={};
 const doc={readyState:'loading',addEventListener(n,f){(ev[n]??=[]).push(f)},querySelectorAll(){return []},getElementById(){return {style:{},textContent:''}}};
 const ctx={window:{AbuBassamSecurity:sec},document:doc,setTimeout:()=>0,clearTimeout:()=>{}};
 vm.runInNewContext(source,ctx);
 return{ev,doc,ctx,allowed:ctx.window.AbuBassamPermissionGuard.allowed,decorate:ctx.window.AbuBassamPermissionGuard.decorate};
}
for(const [label,sec,expected] of [
 ['missing runtime',undefined,false],['missing role',{can:()=>true},false],
 ['unknown role',{role:()=>'',can:()=>true},false],['secondary missing can',{role:()=> 'secondary'},false],
 ['secondary undecided',{role:()=> 'secondary',can:()=>undefined},false],
 ['secondary denied',{role:()=> 'secondary',can:()=>false},false],
 ['secondary allowed',{role:()=> 'secondary',can:()=>true},true],
 ['owner missing can',{role:()=> 'owner'},false],
 ['owner allowed',{role:()=> 'owner',can:()=>true},true],
 ['owner denied',{role:()=> 'owner',can:()=>false},false],
 ['role throws',{role:()=>{throw Error('not ready')},can:()=>true},false],
 ['can throws',{role:()=> 'secondary',can:()=>{throw Error('not ready')}},false]
])assert.equal(fixture(sec).allowed('edit'),expected,label);
function click(sec,denied){
 const f=fixture(sec);for(const fn of f.ev.DOMContentLoaded||[])fn();
 const target={id:'',className:'',textContent:'طباعة',getAttribute(){return ''},closest(s){return s.includes('button,a')?this:null}};
 let canceled=0,stopped=0;
 for(const fn of f.ev.click||[])fn({target,preventDefault(){canceled++},stopImmediatePropagation(){stopped++}});
 assert.equal(canceled,denied?1:0);assert.equal(stopped,denied?1:0);
}
click(undefined,true);click({role:()=>'',can:()=>true},true);
click({role:()=> 'secondary'},true);click({role:()=> 'secondary',can:()=>true},false);
click({role:()=> 'owner',can:()=>true},false);
click({role:()=> 'owner'},true);
click({role:()=> 'owner',can:()=>{throw Error('not ready')}},true);
const line=sections.split('\n').find(x=>x.startsWith('const can=k=>'));
assert.ok(line,'section guard helper missing');
const expr=line.slice('const can='.length).replace(/;$/,'');
const sc=s=>vm.runInNewContext('('+expr+')',{window:{AbuBassamPermissions:s}})('cardsPrint');
assert.equal(sc(undefined),false);
assert.equal(sc({can:()=>undefined}),false);
assert.equal(sc({can:()=>false}),false);
assert.equal(sc({can:()=>true}),true);
assert.equal(sc({can:()=>{throw Error('not ready')}}),false);
const f=fixture({role:()=> 'secondary',can:()=>false});
const button={id:'printAction',className:'',textContent:'طباعة',dataset:{},style:{opacity:'.8'},title:'الطباعة المباشرة',
 closest(){return null},
 getAttribute(name){return name==='title'?this.title:''},
 removeAttribute(name){if(name==='title')this.title=''}
};
f.doc.querySelectorAll=()=>[button];
f.decorate();
assert.equal(button.style.opacity,'.48','denied button appears disabled');
assert.equal(button.dataset.abuPermissionDenied,'1','denied button marked');
f.ctx.window.AbuBassamSecurity={role:()=> 'owner',can:()=>true};
f.decorate();
assert.equal(button.style.opacity,'.8','owner permission restoration must restore original opacity');
assert.equal(button.title,'الطباعة المباشرة','owner permission restoration must restore original title');
console.log('28 fail-closed guard checks passed');
