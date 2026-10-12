'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('index.js','utf8');
const segment=(from,to)=>{
 const start=src.indexOf(from),end=src.indexOf(to,start+from.length);
 assert.ok(start>=0&&end>start,'Missing native camera section '+from);
 return src.slice(start,end)
};
const close=segment('  const closeCamera = useCallback(', '\n  useEffect(');
const open=segment('  const openCamera = useCallback(', '\n  const captureDocument = useCallback(');
const capture=segment('  const captureDocument = useCallback(', '\n  const onBarcodeScanned = useCallback(');
assert.ok(capture.includes('cameraCaptureLockRef.current = true')&&
 capture.includes('epoch !== cameraSessionEpochRef.current'),
 'Capture must use immediate lock and session-fenced completion');
assert.ok(capture.includes('!cameraActiveRef.current'),
 'A shutter callback after close must not start a native capture');

function deferred(){
 let resolve,reject;
 const promise=new Promise((a,b)=>{resolve=a;reject=b});
 return {promise,resolve,reject}
}
function fixture({permissionGranted=true}={}){
 const state={},events=[],messages=[],pending=[];
 const cameraCaptureLockRef={current:false},cameraSessionEpochRef={current:0},
  cameraActiveRef={current:false},barcodeScanLockRef={current:false};
 const cameraRef={current:{takePictureAsync:opts=>{
  events.push(['takePicture',opts]);const wait=deferred();pending.push(wait);return wait.promise
 }}};
 const setters=Object.fromEntries(
  ['CameraMode','CameraReady','CameraBusy','BarcodeLocked','Torch','CameraFacing','CameraFrameKind']
    .map(name=>['set'+name,value=>{state[name]=value;events.push([name,value])}]));
 const permissionPrompt=deferred();
 const cameraError=msg=>messages.push(['error',String(msg)]);
 const inject=(event,payload)=>messages.push([event,payload]);
 const scope={useCallback:x=>x,cameraCaptureLockRef,cameraSessionEpochRef,cameraActiveRef,
  barcodeScanLockRef,cameraRef,cameraPermission:{granted:permissionGranted},
  requestCameraPermission:()=>permissionPrompt.promise,
  cameraError,inject,cameraReady:true,cameraMode:'scan',
  MAX_NATIVE_CAMERA_CHARS:4,...setters};
 const names=Object.keys(scope);
 const callbacks=new Function(...names,
  close+open+capture+';return {closeCamera,openCamera,captureDocument};'
 )(...names.map(x=>scope[x]));
 return {...callbacks,pending,state,events,messages,permissionPrompt,
  captureLock:cameraCaptureLockRef,epoch:cameraSessionEpochRef,active:cameraActiveRef}
}
(async()=>{
 const double=fixture();
 await double.openCamera('scan');
 const one=double.captureDocument();
 const two=double.captureDocument();
 assert.equal(double.pending.length,1,'Two shutter taps before state rerender must take one picture');
 assert.equal(double.captureLock.current,true);
 double.pending[0].resolve({base64:'ABCD'});
 await Promise.all([one,two]);
 assert.equal(double.messages.filter(x=>x[0]==='AbuBassamNativeCameraResult').length,1);
 assert.equal(double.messages.find(x=>x[0]==='AbuBassamNativeCameraResult')[1].dataUrl,
  'data:image/jpeg;base64,ABCD');
 assert.equal(double.active.current,false);
 assert.equal(double.captureLock.current,false);
 await double.captureDocument();
 assert.equal(double.pending.length,1,'Stale shutter callback after close must be ignored');

 const abandoned=fixture();
 await abandoned.openCamera('scan');
 const inflight=abandoned.captureDocument();
 abandoned.closeCamera();
 abandoned.pending[0].resolve({base64:'ABCD'});
 await inflight;
 assert.equal(abandoned.messages.filter(x=>x[0]==='AbuBassamNativeCameraResult').length,0,
  'Late camera photo must not overwrite documents after camera was closed');
 assert.equal(abandoned.active.current,false);
 assert.equal(abandoned.state.CameraBusy,false);

 const replacement=fixture();
 await replacement.openCamera('scan');
 const oldCapture=replacement.captureDocument();
 replacement.closeCamera();
 await replacement.openCamera('ocr');
 const newCapture=replacement.captureDocument();
 assert.equal(replacement.pending.length,2);
 replacement.pending[0].resolve({base64:'OLD!'});
 await oldCapture;
 assert.equal(replacement.captureLock.current,true,
  'Finishing an obsolete photo must not unlock a new capture');
 assert.equal(replacement.messages.filter(x=>x[0]==='AbuBassamNativeCameraResult').length,0);
 replacement.pending[1].resolve({base64:'NEWW'});
 await newCapture;
 assert.equal(replacement.messages.filter(x=>x[0]==='AbuBassamNativeCameraResult').length,1);
 assert.equal(replacement.messages.find(x=>x[0]==='AbuBassamNativeCameraResult')[1].dataUrl,
  'data:image/jpeg;base64,NEWW');

 const failed=fixture();
 await failed.openCamera('scan');
 const interrupted=failed.captureDocument();
 failed.pending[0].reject(Error('hardware unavailable'));
 await interrupted;
 assert.equal(failed.captureLock.current,false,'Error must release shutter for retry');
 assert.equal(failed.state.CameraBusy,false);
 assert.ok(failed.messages.some(x=>x[0]==='error'&&x[1].includes('hardware unavailable')));
 const retry=failed.captureDocument();
 assert.equal(failed.pending.length,2);
 failed.pending[1].resolve({base64:'PASS'});
 await retry;
 assert.equal(failed.messages.filter(x=>x[0]==='AbuBassamNativeCameraResult').length,1);

 const huge=fixture();
 await huge.openCamera('scan');
 const task=huge.captureDocument();
 huge.pending[0].resolve({base64:'TOO_BIG'});
 await task;
 assert.equal(huge.captureLock.current,false,'Oversized camera photo must not freeze shutter');
 assert.equal(huge.active.current,true);
 assert.equal(huge.messages.some(x=>x[0]==='AbuBassamNativeCameraResult'),false);

 const permission=fixture({permissionGranted:false});
 const pendingPermission=permission.openCamera('barcode');
 permission.closeCamera();
 permission.permissionPrompt.resolve({granted:true});
 await pendingPermission;
 assert.equal(permission.active.current,false,'Old permission grant cannot reopen closed camera');
 assert.equal(permission.state.CameraMode,null);

 console.log('Native shutter races passed: double tap, stale callback after close, new camera session protection, error retry, oversize and delayed permission.');
})().catch(error=>{console.error(error);process.exitCode=1});
