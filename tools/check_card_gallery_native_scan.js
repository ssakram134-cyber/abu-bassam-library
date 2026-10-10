'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const native=read('index.js'),studio=read('web/cards-studio-runtime.js');
new vm.Script(studio);
assert.match(native,/import \{ Camera, CameraView, useCameraPermissions \} from 'expo-camera'/);
assert.match(native,/message\.type === 'scanBarcodeImage'\) return scanBarcodeImage\(message\)/);
assert.match(native,/shareBase64, scanBarcodeImage\]/);
assert.match(studio,/ReactNativeWebView\.postMessage\(JSON\.stringify\(\{type:'scanBarcodeImage',dataUrl:data\}\)\)/);
assert.match(studio,/function onBarcode\(result\)\{if\(!canCard\('cardsBarcode'\)\)return false;/,'Delayed native responses must honor current permission');
function cut(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'missing section '+a);return s.slice(i,j)}
const code=cut(native,'  const scanBarcodeImage = useCallback(', '  const onBarcodeScanned = useCallback(');
const splitSource=cut(native,'function splitDataUrl(dataUrl) {','\nfunction printDimensions(');
const splitDataUrl=new Function(splitSource+';return splitDataUrl')();
let created=[],deleted=[],received=[],errors=[],scanCalls=[],scanMode='ok';
const FileSystem={
 cacheDirectory:'file:///cache/',
 EncodingType:{Base64:'base64'},
 async writeAsStringAsync(uri,encoded,opts){created.push({uri,encoded,opts})},
 async deleteAsync(uri,opts){deleted.push({uri,opts})}
};
const Camera={async scanFromURLAsync(uri,formats){
 scanCalls.push({uri,formats});
 if(scanMode==='none')return [];
 if(scanMode==='error')throw Error('NATIVE_SCANNER_ERROR');
 return [{data:'BEGIN:VCARD\nFN:طفل\nEND:VCARD',type:'qr'}]
}};
const scan=new Function('useCallback','splitDataUrl','FileSystem','Camera','BARCODE_TYPES','inject','cameraError','Date',
 code+';return scanBarcodeImage')(
 fn=>fn,splitDataUrl,FileSystem,Camera,['qr','code128'],
 (...args)=>received.push(args),msg=>errors.push(msg),Date
);
const dataUrl='data:image/png;base64,aGVsbG8=';
(async()=>{
 await scan({dataUrl});
 assert.equal(created.length,1);
 assert.equal(deleted.length,1,'Temporary photo must be deleted after scan success');
 assert.equal(created[0].uri,deleted[0].uri);
 assert.equal(created[0].encoded,'aGVsbG8=');
 assert.equal(created[0].opts.encoding,'base64');
 assert.deepEqual(scanCalls[0].formats,['qr','code128']);
 assert.equal(received.length,1);
 assert.equal(received[0][0],'AbuBassamNativeCameraResult');
 assert.equal(received[0][1].mode,'barcode');
 assert.match(received[0][1].data,/BEGIN:VCARD/);
 scanMode='none';
 await scan({dataUrl});
 assert.equal(created.length,2);
 assert.equal(deleted.length,2);
 assert.match(errors.at(-1),/لم يتم العثور على باركود/);
 scanMode='error';
 await scan({dataUrl});
 assert.equal(created.length,3);
 assert.equal(deleted.length,3,'Temporary image must be deleted on native scan exception');
 assert.match(errors.at(-1),/NATIVE_SCANNER_ERROR/);
 const before=created.length;
 await scan({dataUrl:'data:text/plain;base64,aGVsbG8='});
 assert.equal(created.length,before,'Reject non-image without storing content');
 await scan({dataUrl:'data:image/png;base64,a&5='});
 assert.equal(created.length,before,'Reject invalid base64');
 await scan({dataUrl:'data:image/png;base64,'+'a'.repeat(11*1024*1024)});
 assert.equal(created.length,before,'Reject images larger than the safe bridge size');
 const src=cut(studio,'async function decodeBarcodeImage(file){','\nfunction onBarcode(result){');
 const posted=[],alerts=[],picked={value:'selected'};
 const browser=new Function('requireCard','fileData','window','FileReader','BarcodeDetector','Image','onBarcode','alert','$',src+';return decodeBarcodeImage')(
 ()=>true,async file=>'data:image/png;base64,'+file.value,
 {__ABU_BASSAM_NATIVE_CAMERA__:true,ReactNativeWebView:{postMessage:m=>posted.push(JSON.parse(m))}},
 null,null,null,()=>{},s=>alerts.push(s),()=>picked
 );
 assert.equal(await browser({size:5,value:'cG5n'}),true);
 assert.equal(posted.length,1);
 assert.equal(posted[0].type,'scanBarcodeImage');
 assert.equal(posted[0].dataUrl,'data:image/png;base64,cG5n');
 assert.equal(picked.value,'');
 assert.equal(await browser({size:8*1024*1024,value:'cG5n'}),false);
 assert.match(alerts.at(-1),/7.5MB/);
 assert.equal(posted.length,1);
 console.log('Gallery barcode native tests passed: bounded image bridge, QR payload delivery, noncamera permissions, temp-file cleanup on success/failure and graceful absence.');
})().catch(e=>{console.error(e);process.exitCode=1});
