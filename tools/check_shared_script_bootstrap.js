'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const text=fs.readFileSync(path.join(__dirname,'..','web/device-name-runtime.js'),'utf8');
const a=text.indexOf('  function loadScript(id,src,guard){'),b=text.indexOf('\n  const loadFeatureRecovery=',a);
assert.ok(a>=0&&b>a,'shared loader source missing');
const fn=text.slice(a,b);
let count=0;
function eq(a,b,m){assert.equal(a,b,m);count++}
async function status(p){let state='pending';p.then(()=>state='resolved',()=>state='rejected');await Promise.resolve();await Promise.resolve();return state}
function harness(){
 const all=new Map(),append=[],events=[],window={};
 function node(id=''){
  const listeners={load:[],error:[]};
  return{id,dataset:{},style:{},removed:false,
   addEventListener:(type,callback)=>listeners[type].push(callback),
   fire(type){this['on'+type]?.();listeners[type].forEach(callback=>callback())},
   remove(){this.removed=true;all.delete(this.id)}
  };
 }
 const document={getElementById:id=>all.get(id)||null,createElement:()=>node(),
  head:{appendChild(el){all.set(el.id,el);append.push(el)}},
  dispatchEvent:ev=>events.push(ev.detail)};
 const CustomEvent=function(type,options){this.detail=options.detail};
 const load=new Function('window','document','CustomEvent',fn+'\nreturn loadScript;')(window,document,CustomEvent);
 return{all,node,append,events,window,load};
}
(async()=>{
 const guard=harness();guard.window.__SHARED__=true;
 eq(await guard.load('shared','shared.js','__SHARED__'),true,'initialized guard accepted');
 eq(guard.append.length,0,'no duplicate script for initialized guard');

 const first=harness(),request=first.load('new','feature.js','__FEATURE__');
 eq(first.append.length,1,'first request appends script');
 eq(await status(request),'pending','new load must await real event');
 first.append[0].fire('load');
 eq(await request,true,'new load finishes after event');
 eq(first.append[0].dataset.abuLoaded,'1','new script records completed state');
 eq(first.events.length,1,'initial load broadcasts once');

 const same=harness(),p=same.load('same','shared.js','__SHARED__'),q=same.load('same','shared.js','__SHARED__');
 eq(same.append.length,1,'simultaneous callers append once');
 eq(await status(q),'pending','second caller waits for existing pending script');
 same.append[0].fire('load');
 eq(await p,true,'first caller resolves after load');
 eq(await q,true,'second caller resolves after load');
 eq(await same.load('same','shared.js','__SHARED__'),true,'completed script reused');
 eq(same.append.length,1,'no reinsertion after load');

 const external=harness(),tag=external.node('foreign');external.all.set('foreign',tag);
 const pending=external.load('foreign','foreign.js','__FOREIGN__');
 eq(await status(pending),'pending','script started by other loader cannot be treated ready');
 eq(external.append.length,0,'no second copy while foreign script loads');
 tag.fire('load');eq(await pending,true,'foreign script load accepted');
 eq(tag.dataset.abuLoaded,'1','foreign completed script marked loaded');

 const completed=harness(),pre=completed.node('complete');pre.dataset.abuLoaded='1';completed.all.set('complete',pre);
 eq(await completed.load('complete','complete.js','__COMPLETE__'),true,'previous successful load recognized');

 const bad=harness(),failed=bad.load('broken','broken.js','__BROKEN__');
 bad.append[0].fire('error');
 await assert.rejects(failed,/broken.js failed to load/);count++;
 eq(bad.append[0].removed,true,'failed script removed');
 eq(bad.all.has('broken'),false,'failed element removed from DOM');
 const retry=bad.load('broken','broken.js','__BROKEN__');
 eq(bad.append.length,2,'retry creates a fresh script');
 eq(await status(retry),'pending','retry does not report premature completion');
 bad.append[1].fire('load');eq(await retry,true,'retry eventually works');

 const externalFailure=harness(),badNode=externalFailure.node('foreignFail');
 externalFailure.all.set('foreignFail',badNode);
 const reject=externalFailure.load('foreignFail','badexternal.js','__ERR__');
 eq(await status(reject),'pending','foreign error still pending until fired');
 badNode.fire('error');
 await assert.rejects(reject,/badexternal.js failed to load/);count++;
 eq(externalFailure.all.has('foreignFail'),false,'foreign failed script cleared');
 console.log('Shared script loader regression: '+count+'/'+count+' focused checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
