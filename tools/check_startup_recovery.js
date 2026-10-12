'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const native=fs.readFileSync(path.join(root,'index.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'web/device-name-runtime.js'),'utf8');
const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
let checks=0;
function eq(actual,expected,label){assert.equal(actual,expected,label);checks++}
function yes(cond,label){assert.ok(cond,label);checks++}
function match(haystack,regex,label){assert.match(haystack,regex,label);checks++}

yes(!html.includes("setTimeout(()=>$('splash').classList.add('hide'),1000)"),'splash never dismissed by 1-second timer');
match(html,/id="splash"/,'splash exists for secure boot');
match(native,/if \(webReady \|\| webFailure\) return undefined;/,'watchdog stops on terminal failure');
match(native,/key=\{webAttempt\}/,'retry remounts WebView instead of reusing failed DOM');
match(native,/onPress=\{retryWebBoot\}/,'native retry button is clickable');
match(native,/setWebAttempt\(\(attempt\) => attempt \+ 1\)/,'retry changes remount key');
match(native,/onError=\{\(\) => \{ setWebReady\(false\); setWebFailure\(/,'native error sets visible failure state');
match(native,/if \(!message \|\| typeof message !== 'object' \|\| Array\.isArray\(message\) \|\| typeof message\.type !== 'string'\) return;/,'bridge rejects primitive/array');
yes(!native.includes("Alert.alert('تعذر إكمال تشغيل التطبيق'"),'watchdog does not leave user in blocking alert loop');
match(loader,/function showBootFailure\(error\)/,'canonical boot failure display');
match(loader,/message=document\.createElement\('p'\)/,'boot failures create missing accessible status element');
match(loader,/message\.setAttribute\('role','alert'\)/,'startup failure message accessible');

const retry=native.match(/  const retryWebBoot = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[\]\);/)?.[0];
yes(!!retry,'canonical retry handler present');
let ready=true,failure='bad startup',attempt=2;
const retryFn=new Function('useCallback','setWebReady','setWebFailure','setWebAttempt',retry+'\nreturn retryWebBoot;')(
 fn=>fn,v=>ready=v,v=>failure=v,fn=>attempt=fn(attempt)
);
retryFn();
eq(ready,false,'retry enters loading state');
eq(failure,'','retry clears error message');
eq(attempt,3,'retry increments remount generation');

const from=loader.indexOf('  function showBootFailure(error){'),mid=loader.indexOf('\n  async function startApprovedUi(){',from);
const to=loader.indexOf('\n  window.AbuBassamDevices=',mid);
yes(from>=0&&mid>from&&to>mid,'extract authentic startup functions');
const routine=loader.slice(from,to);
const splashFunc=loader.split('\n').filter(l=>/function (?:dismissSplash|signalBootReady)\(\)/.test(l)).join('\n');
yes(splashFunc.includes('dismissSplash')&&splashFunc.includes('signalBootReady'),'canonical ready/splash helpers present');
function make(config={}){
 const trace=[],nodes={};
 const splash={
   style:{display:'flex',visibility:'visible',opacity:'1'},
   attrs:{},
   setAttribute(k,v){this.attrs[k]=v},
   appendChild(n){nodes[n.id]=n;trace.push('append-message')},
   querySelector(){return null}
 };
 nodes.splash=splash;
 const document={
   getElementById:id=>nodes[id]||null,
   createElement:tag=>({tag,id:'',style:{},textContent:'',setAttribute(k,v){this[k]=v}})
 };
 const window={ReactNativeWebView:{postMessage(data){trace.push('ready:'+JSON.parse(data).type)}}};
 let identity=0,load=0;
 const ensureIdentity=()=>{identity++;if(config.identityFails)throw Error('secure identity storage inaccessible')};
 const loadApprovedUi=async()=>{load++;if(config.loadFails)throw Error('required security module failed')};
 const heartbeat=()=>trace.push('heartbeat');
 const setTimeout=fn=>{trace.push('heartbeat-scheduled');return fn};
 const console={error:()=>trace.push('boot-error')};
 const script=splashFunc+'\n'+routine+'\nreturn {startApprovedUi,showBootFailure};';
 const ui=new Function('window','document','ensureIdentity','loadApprovedUi','setTimeout','heartbeat','console',script)(
   window,document,ensureIdentity,loadApprovedUi,setTimeout,heartbeat,console
 );
 return {ui,splash,nodes,trace,stats:()=>({identity,load})};
}
(async()=>{
 const good=make();
 await good.ui.startApprovedUi();
 eq(good.stats().identity,1,'identity initialized once');
 eq(good.stats().load,1,'approved runtime loaded once');
 yes(good.trace.includes('ready:webBootReady'),'native receives ready handshake');
 eq(good.splash.style.display,'none','successful startup removes splash blocker');
 eq(good.splash.attrs['aria-hidden'],'true','success marks splash hidden for touch pass-through');
 yes(good.trace.indexOf('ready:webBootReady')<good.trace.indexOf('heartbeat-scheduled'),'ready precedes heartbeat');

 const storage=make({identityFails:true});
 await storage.ui.startApprovedUi();
 eq(storage.stats().load,0,'identity failure prevents insecure runtime execution');
 eq(storage.splash.style.display,'flex','identity failure keeps splash fail closed');
 eq(storage.nodes.splashText?.tag,'p','identity failure shows text even without prior text element');
 eq(storage.nodes.splashText?.role,'alert','identity failure exposes accessible message');
 yes(!storage.trace.some(x=>x.startsWith('ready:')),'identity error cannot report boot-ready');
 eq(storage.trace.filter(x=>x==='boot-error').length,1,'identity failure logged without crash');

 const script=make({loadFails:true});
 await script.ui.startApprovedUi();
 eq(script.stats().identity,1,'module failure follows identity');
 eq(script.stats().load,1,'module failure attempted');
 eq(script.splash.style.display,'flex','module error keeps splash blocking insecure screen');
 yes((script.nodes.splashText?.textContent||'').includes('تعذر تحميل'),'module failure visible');
 yes(!script.trace.some(x=>x.startsWith('ready:')),'module error not acknowledged as boot-ready');
 script.ui.showBootFailure(Error('retry'));
 eq(script.trace.filter(x=>x==='append-message').length,1,'repeated failure reuses status text');
 console.log('Startup recovery regression: '+checks+'/'+checks+' focused checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
