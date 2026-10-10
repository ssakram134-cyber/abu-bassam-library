'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('web/national-id-runtime.js','utf8');
new Function(src);
const listeners={},readers=[],images=[],timers=[],messages=[];
const context={fillRect(){},save(){},translate(){},rotate(){},drawImage(){},restore(){},getImageData(){return{data:new Uint8ClampedArray(16)}},putImageData(){}};
const nodes=new Map();
function el(id){
 if(!nodes.has(id))nodes.set(id,{value:100,textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){}},appendChild(){},removeAttribute(){},getContext(){return context},toDataURL(){return 'data:image/jpeg;base64,AA=='},click(){}});
 return nodes.get(id);
}
const document={getElementById:el,querySelector:()=>null,createElement:()=>({width:0,height:0,style:{},classList:{add(){},remove(){}},appendChild(){},getContext(){return context},toDataURL(){return 'data:image/jpeg;base64,AA=='}}),addEventListener:(k,fn)=>listeners[k]=fn};
const storage=new Map();
const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
let deferImage=false;
class Reader{readAsDataURL(){readers.push(this)}}
class MockImage{set src(s){this.naturalWidth=64;this.naturalHeight=64;if(deferImage)images.push(this);else this.onload?.()}}
const window={addEventListener(){},AbuBassamCloud:{session:()=>({user:{id:'test-user'}})},AbuBassamSecurity:{device:()=>({device_id:'test-phone'})}};
const injected=src.replace('window.Nat={','window.__imageAudit={S,handleImages,addNativeImage,currentImageBytes,pendingMakerSlots};window.Nat={');
assert.notEqual(injected,src);
new Function('window','document','localStorage','FileReader','Image','alert','setTimeout',injected)(window,document,localStorage,Reader,MockImage,x=>messages.push(String(x)),fn=>(timers.push(fn),timers.length));
const audit=window.__imageAudit;
const fake=(id)=>({name:String(id),src:'data:image/jpeg;base64,AA==',im:{naturalWidth:64,naturalHeight:64},rot:0,b:100,c:100,s:100,crop:null,gray:0,bw:false});
const file=name=>({name,type:'image/jpeg',size:256});
const settle=r=>{r.result='data:image/jpeg;base64,QQ==';r.onload()};
(async()=>{
 // Two queued import operations must never both observe the same remaining slot.
 audit.S.items=Array.from({length:99},(_,i)=>fake(i));audit.S.sel=98;
 const first=audit.handleImages([file('one.jpg')],false);
 const second=audit.handleImages([file('two.jpg')],false);
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(readers.length,1,'Second batch must not read while first batch is pending');
 settle(readers[0]);await first;await second;
 assert.equal(audit.S.items.length,100,'Concurrent import must not exceed 100 images');
 assert.equal(readers.length,1,'Batch started after limit was reached must not consume file data');
 // A camera picture already decoding cannot bypass the count reached by another operation.
 audit.S.items=Array.from({length:99},(_,i)=>fake(i));audit.S.sel=98;deferImage=true;
 const camera=audit.addNativeImage('data:image/jpeg;base64,QQ==','scan');
 assert.equal(images.length,1);
 audit.S.items.push(fake('interleaved'));deferImage=false;images[0].onload();await camera;
 assert.equal(audit.S.items.length,100,'Delayed camera response must obey post-decode limit');
 // One pending ID front reserves both face positions.
 audit.S.items=Array.from({length:98},(_,i)=>fake(i));audit.S.front=fake('front-pending');audit.S.sel=97;
 const before=readers.length;await audit.handleImages([file('blocked.jpg')],false);
 assert.equal(readers.length,before,'Pending maker front must reserve both slots');
 // An old hung FileReader must not block imports after switching account.
 audit.S.front=null;audit.S.items=[];audit.S.sel=-1;
 const old=audit.handleImages([file('old.jpg')],false);
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 const oldReader=readers.at(-1);
 listeners['abu-bassam-auth-changed']();
 const newer=audit.handleImages([file('new.jpg')],false);
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(readers.length,before+2,'New account must not wait on old account pending FileReader');
 const newReader=readers.at(-1);settle(newReader);await newer;settle(oldReader);await old;
 assert.equal(audit.S.items.length,1,'Old account files must not leak into new account');
 assert.equal(audit.S.items[0].name,'new.jpg');
 // Compare displays the source briefly but must not mutate the edited image.
 const edit=fake('comparison');edit.b=128;edit.c=135;edit.s=119;edit.gray=1;edit.crop={l:.1,t:.1,r:.9,b:.9};
 audit.S.items=[edit];audit.S.sel=0;el('natB').value=128;el('natC').value=135;el('natS').value=119;
 const previous=JSON.stringify(edit);window.Nat.compare();
 assert.equal(JSON.stringify(edit),previous,'Comparison must not overwrite image adjustments');
 assert.equal(Number(el('natB').value),128,'Comparison must not move brightness slider');
 edit.rot=90;timers.at(-1)();
 assert.equal(edit.rot,90,'Comparison timeout must preserve subsequent edits');
 console.log('National import race checks passed: serialized batches, post-decode capacity, maker slots, auth cancellation, non-mutating comparison.');
})().catch(err=>{console.error(err);process.exitCode=1});