'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const runtime=read('web/national-quality-ocr-runtime.js'),national=read('web/national-id-runtime.js'),html=read('web/index.html');
new vm.Script(runtime);new vm.Script(national);
const win={addEventListener:()=>{}};
new Function('window','document',runtime)(win,{});
const glare=win.AbuNationalQualityReview.glare;
const w=80,h=80,image=new Uint8ClampedArray(w*h*4);
for(let i=0;i<w*h;i++){image[i*4]=image[i*4+1]=image[i*4+2]=115;image[i*4+3]=255}
for(let y=27;y<54;y++)for(let x=27;x<54;x++){let i=(y*w+x)*4;image[i]=image[i+1]=image[i+2]=255}
assert.equal(glare(image,w,h).suspicious,true,'Reflective clipped white patch surrounded by dark image should be flagged');
const clean=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++){clean[i*4]=clean[i*4+1]=clean[i*4+2]=255;clean[i*4+3]=255}
assert.equal(glare(clean,w,h).suspicious,false,'Uniform white background is not necessarily glare');
assert.equal(glare(null,w,h).suspicious,false);
assert.match(national,/reviewData:\(\)=>\{/);
assert.match(national,/detectDocument\(it\)/);
assert.match(national,/function maker\(\)/);
assert.match(national,/function autoCrop\(\)/);
assert.match(html,/src="national-quality-ocr-runtime\.js"/);
assert.match(runtime,/Nat\?\.maker\?\.\(\)/);
assert.match(runtime,/function drawCheck/);
assert.match(runtime,/function recognize/);
assert.match(runtime,/createWorker\('ara\+eng'/);
assert.match(runtime,/vendor\/tesseract\/tesseract\.min\.js/);
assert.match(runtime,/await worker\?\.terminate/);
assert.match(runtime,/if\(!approved\|\|!lastText/);
assert.match(runtime,/if\(window\.Android\?\.saveBase64\)/);
assert.doesNotMatch(runtime,/fetch\(['"]https?:/);
console.log('Stage86 national ID: existing guided front/back crop, new glare warning, local ara+eng OCR with explicit approval and opt-in TXT export PASS.');
