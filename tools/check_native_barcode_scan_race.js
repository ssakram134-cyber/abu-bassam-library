'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const source=fs.readFileSync('index.js','utf8');
const section=(from,to)=>{
 const a=source.indexOf(from),b=source.indexOf(to,a+from.length);
 assert.ok(a>=0&&b>a,'Native barcode handler source missing: '+from);
 return source.slice(a,b)
};
const close=section('  const closeCamera = useCallback(', '\n  useEffect(',);
const open=section('  const openCamera = useCallback(', '\n  const captureDocument = useCallback(');
const scan=section('  const onBarcodeScanned = useCallback(', '\n  const onCameraMountError = useCallback(');
assert.ok(scan.includes('barcodeScanLockRef.current = true'),
 'React state updates alone cannot prevent back-to-back scan callbacks');
assert.ok(!scan.includes('setTimeout('),
 'No old 500ms timeout may unlock an unrelated new camera session');
assert.ok(open.includes('barcodeScanLockRef.current = false')&&
 close.includes('barcodeScanLockRef.current = false'),
 'Opening and closing a camera resets the synchronous scan lock');

function fixture(options={}){
 const events=[],state={},barcodeScanLockRef={current:false};
 let permission={granted:options.permissionInitiallyGranted!==false};
 const record=(kind)=>(val)=>{state[kind]=val;events.push([kind,val])};
 const setCameraMode=record('mode'),setCameraReady=record('ready'),
 setCameraBusy=record('busy'),setBarcodeLocked=record('locked'),setTorch=record('torch'),
 setCameraFacing=record('facing'),setCameraFrameKind=record('frame');
 const captures=[];
 const inject=(method,body)=>captures.push({method,body});
 const cameraError=text=>events.push(['error',text]);
 const callbacks=new Function('useCallback','barcodeScanLockRef','setCameraMode',
  'setCameraReady','setCameraBusy','setBarcodeLocked','setTorch','setCameraFacing',
  'setCameraFrameKind','inject','cameraError','cameraPermission','requestCameraPermission',
  close+open+scan+';return {closeCamera,openCamera,onBarcodeScanned};'
 )(
  f=>f,barcodeScanLockRef,setCameraMode,setCameraReady,setCameraBusy,setBarcodeLocked,
  setTorch,setCameraFacing,setCameraFrameKind,inject,cameraError,permission,
  async()=>{events.push(['askPermission']);return options.permissionGranted===false?{granted:false}:{granted:true}}
 );
 return {...callbacks,state,events,captures,lock:barcodeScanLockRef}
}
(async()=>{
 const b=fixture();
 await b.openCamera('barcode');
 assert.equal(b.state.mode,'barcode');
 assert.equal(b.lock.current,false);
 b.onBarcodeScanned({data:'123',type:'qr'});
 b.onBarcodeScanned({data:'123',type:'qr'});
 b.onBarcodeScanned({data:'456',type:'ean13'});
 assert.equal(b.captures.length,1,'Three camera callbacks before a render must inject only once');
 assert.deepEqual(b.captures[0],{method:'AbuBassamNativeCameraResult',
  body:{mode:'barcode',data:'123',barcodeType:'qr'}});
 assert.equal(b.lock.current,true);
 assert.equal(b.state.locked,true);
 assert.equal(b.state.mode,null,'Successful barcode closes the scanner overlay');

 // An old pending timeout must not unlock the closed scanner.
 assert.ok(!b.events.some(x=>x[0]==='timer'),'No timed unlock is scheduled');
 await b.openCamera('barcode');
 assert.equal(b.lock.current,false,'New barcode session must start unlocked');
 b.onBarcodeScanned({data:'next',type:'code128'});
 assert.equal(b.captures.length,2,'Second deliberate scan session can scan again');
 assert.equal(b.captures[1].body.data,'next');

 b.closeCamera();
 assert.equal(b.lock.current,false,'User closing camera removes the synchronous lock');
 assert.equal(b.state.locked,false);
 await b.openCamera('barcode');
 b.onBarcodeScanned({data:''});
 b.onBarcodeScanned({});
 assert.equal(b.lock.current,false,'Invalid camera frames must not lock scanner');
 b.onBarcodeScanned({data:'valid'});
 assert.equal(b.captures.length,3);
 assert.equal(b.captures[2].body.barcodeType,'');

 const denied=fixture({permissionInitiallyGranted:false,permissionGranted:false});
 await denied.openCamera('barcode');
 assert.equal(denied.state.mode,undefined,'Denied camera permission cannot open scanner');
 assert.equal(denied.lock.current,false);
 assert.ok(denied.events.some(e=>e[0]==='error'));

 const granted=fixture({permissionInitiallyGranted:false,permissionGranted:true});
 await granted.openCamera('barcode','card');
 assert.equal(granted.state.mode,'barcode');
 assert.equal(granted.state.frame,'card');
 assert.equal(granted.lock.current,false);

 console.log('Barcode scan lock passed: immediate duplicate rejection, no stale unlock timer, reopen/reset, permission denial and valid subsequent scans.');
})().catch(error=>{console.error(error);process.exitCode=1});
