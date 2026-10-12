'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const native=fs.readFileSync('index.js','utf8');
const f=native.match(/  const captureDocument = useCallback\([\s\S]*?\n  \}, \[cameraError, cameraMode, cameraReady, closeCamera, inject\]\);/)?.[0];
assert.ok(f,'Capture callback exists');
assert.ok(native.includes('const MAX_NATIVE_CAMERA_CHARS = 32 * 1024 * 1024;'));
assert.ok(f.includes('picture.base64.length > MAX_NATIVE_CAMERA_CHARS'),
 'Photo must be size-checked before JSON serialization and injection');
assert.ok(f.indexOf('picture.base64.length > MAX_NATIVE_CAMERA_CHARS')<f.indexOf("inject('AbuBassamNativeCameraResult'"),
 'Photo guard must run before native-to-WebView injection');
function makeCapture(options={}){
 const events=[];
 const ref={current:{takePictureAsync:async ()=>{
  events.push('takePicture');if(options.failCapture)throw Error('camera hardware error');
  return{base64:options.data}
 }}};
 const cameraError=msg=>events.push('error:'+msg);
 const capture=new Function('useCallback','cameraRef','cameraReady','cameraCaptureLockRef','cameraSessionEpochRef','cameraActiveRef',
   'setCameraBusy','cameraError','cameraMode','closeCamera','inject',
   'MAX_NATIVE_CAMERA_CHARS',f+';return captureDocument')(
  fn=>fn,ref,true,{current:false},{current:0},{current:true},flag=>events.push('busy:'+flag),
  cameraError,'scan',()=>events.push('close'),
  (event,data)=>events.push({event,data}),100
 );
 return{capture,events};
}
(async()=>{
 const valid=makeCapture({data:'a'.repeat(100)});
 await valid.capture();
 assert.ok(valid.events.includes('close'),'Successful photo must close camera');
 assert.ok(valid.events.some(x=>x?.event==='AbuBassamNativeCameraResult'));
 const image=valid.events.find(x=>x?.data?.dataUrl);
 assert.equal(image.data.dataUrl,'data:image/jpeg;base64,'+'a'.repeat(100));

 const oversized=makeCapture({data:'b'.repeat(101)});
 await oversized.capture();
 assert.ok(oversized.events.some(x=>typeof x==='string'&&x.includes('الصورة كبيرة جداً')));
 assert.ok(!oversized.events.includes('close'),'Oversized photo must leave camera available for retry');
 assert.ok(!oversized.events.some(x=>x?.event==='AbuBassamNativeCameraResult'));
 assert.ok(oversized.events.includes('busy:false'));

 const missing=makeCapture({data:''});
 await missing.capture();
 assert.ok(missing.events.some(x=>typeof x==='string'&&x.includes('لم تُحفظ الصورة')));
 assert.ok(!missing.events.includes('close'));

 const cameraFailed=makeCapture({failCapture:true});
 await cameraFailed.capture();
 assert.ok(cameraFailed.events.some(x=>typeof x==='string'&&x.includes('camera hardware error')));
 assert.ok(cameraFailed.events.includes('busy:false'));
 console.log('Camera WebView boundary passed: valid high-quality JPEG, too-large photo, empty bytes and camera error retain safe UI state.');
})().catch(e=>{console.error(e);process.exitCode=1});
