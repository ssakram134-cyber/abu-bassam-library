'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','web/image-compressor.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length,1);new vm.Script(scripts[0][1]);
const text=scripts[0][1],i=text.indexOf('async function compressOne(item,index){'),j=text.indexOf('\nfunction renderResults()',i);
assert.ok(i>=0&&j>i);const code=text.slice(i,j);
const opts={quality:{value:'80'},targetKb:{value:'150'},outputMime:{value:'image/jpeg'},stripMetadata:{checked:false}};
const sizes=[],file={name:'sample.png',type:'image/png',size:500000};
const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){},set fillStyle(v){},set imageSmoothingEnabled(v){},set imageSmoothingQuality(v){}}),
 toBlob:(cb,mime,q)=>{const b={size:Math.round(400000*(q===undefined?1:q)),type:mime};sizes.push(b.size);cb(b)}};
const compress=new Function('loadImage','calcSize','$','outType','document','blobUrlData','readDataUrl','assess','safeBase','extFor',code+';return compressOne')(
 async()=>({naturalWidth:1000,naturalHeight:1000}),()=>({w:1000,h:1000,scale:1}),
 id=>opts[id],()=> 'image/png',{createElement:()=>canvas},
 async()=> 'data:image/jpeg;base64,YQ==',async()=> 'original',
 ()=>({label:'جودة قابلة للمراجعة',cls:'q-good'}),name=>name.split('.')[0],mime=>mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg');
(async()=>{
 let result=await compress({id:'a',file,url:'blob:x'},0);
 assert.equal(result.mime,'image/jpeg');
 assert.ok(result.compressedBytes<=150*1024,'Iterative compression must meet reasonable target');
 assert.ok(sizes.length>1,'Must actually re-encode to reduce bytes');
 assert.match(result.name,/\.jpg$/);
 assert.equal(result.originalBytes,file.size);
 opts.outputMime.value='image/webp';
 result=await compress({id:'a',file,url:'blob:x'},0);
 assert.equal(result.mime,'image/webp');assert.match(result.name,/\.webp$/);
 opts.outputMime.value='image/png';
 result=await compress({id:'a',file,url:'blob:x'},0);
 assert.match(result.quality,/الحد المطلوب لم يتحقق/,'Do not pretend PNG met impossible target');
 opts.targetKb.value='0';opts.outputMime.value='image/jpeg';opts.stripMetadata.checked=true;
 const small={...file,type:'image/jpeg',name:'small.jpg',size:100000};
 result=await compress({id:'b',file:small,url:'blob:y'},1);
 assert.equal(result.unchanged,false,'Explicit metadata removal must reencode rather than preserve original EXIF');
 assert.match(html,/id="deliveryProfile"/);
 assert.match(html,/id="targetKb"/);assert.match(html,/id="outputMime"/);
 assert.match(html,/id="stripMetadata"/);
 assert.match(html,/deliveryProfile'\)\.onchange/);
 assert.match(html,/upscaleOpenBtn/);assert.match(html,/restoreOpenBtn/);
 console.log('Stage87 targeted KB compression, selectable JPEG WebP PNG, refusal to fake PNG quota, opt-in reencode and prior upscaler/restoration integration PASS.');
})().catch(e=>{console.error(e);process.exitCode=1});
