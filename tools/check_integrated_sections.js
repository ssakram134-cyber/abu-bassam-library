'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const native=fs.readFileSync('index.js','utf8');
const national=fs.readFileSync('web/national-id-runtime.js','utf8');
const cards=fs.readFileSync('web/cards-studio-runtime.js','utf8');
const html=fs.readFileSync('web/index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const android=JSON.parse(fs.readFileSync('app.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
require('@babel/parser').parse(native,{sourceType:'module',plugins:['jsx']});
new Function(national);new Function(cards);
const first=html.indexOf('national-id-runtime.js'),second=html.indexOf('cards-studio-runtime.js');
assert.ok(first>=0&&second>first,'Load native-ID handler before cards wrapping it');
for(const label of ['cancelCamera','pickContact','cancelContactChoice','scanBarcodeImage'])
 assert.ok(native.includes("message.type === '"+label+"'"),'Native dispatcher lost '+label);
assert.ok(native.includes('openCamera, closeCamera, pickContact,'),'Keep both old camera close and new contact callbacks in message handler dependencies');
assert.ok(native.includes('requestId, dataUrl:')&&national.includes('String(result.requestId??'),
 'Native camera request identity must reach national ID');
assert.ok(cards.includes('const previousNativeResult=window.AbuBassamNativeCameraResult'),
 'Cards should capture national camera handler before installing their wrapper');
assert.ok(cards.includes("return previousNativeResult(result)"),'Cards must forward scan/maker to national handler');
assert.ok(cards.includes('window.AbuBassamNativeContactSelected')&&cards.includes('function accountStorageKey('));
assert.ok(cards.includes('function safeCardImageSrc(')&&cards.includes('function validateSymbols(jobs,needsBack='));
assert.ok(android.expo.android.permissions.includes('READ_CONTACTS'));
assert.ok(android.expo.android.permissions.includes('CAMERA'));
assert.ok(!android.expo.android.permissions.includes('WRITE_CONTACTS'));
assert.equal(pkg.dependencies['expo-contacts'],'~15.0.11');
assert.equal(lock.packages['node_modules/expo-contacts'].version,'15.0.11');
const commands=pkg.scripts['check:web'].split(' && ');
assert.equal(commands.length,new Set(commands).size,'No duplicate verification commands');
const tests=[
 'check_national_session_privacy.js','check_national_import_race.js','check_national_async_crop_exports.js',
 'check_national_duplex_print.js','check_national_maker_races.js','check_cards_section_20260924.js',
 'check_cards_gallery_scanner.js','check_cards_section03_privacy_races.js','check_cards_barcode_print_quality.js',
 'check_cards_history_print_settings.js','check_cards_image_export_races.js','check_cards_markup_security.js',
 'check_android_permission_onboarding.js','check_integrated_sections.js'
];
for(const name of tests)assert.ok(commands.includes('node tools/'+name),'Combined source must retain test '+name);
const listeners={},requests=[],canceled=[];
const document={getElementById:()=>null,addEventListener:(name,listener)=>{(listeners[name] ||= []).push(listener)}};
const storage={getItem(){return null},setItem(){},removeItem(){}};
const win={
 addEventListener(){},AbuBassamSecurity:{role:()=> 'owner'},
 AbuBassamCloud:{session:()=>({user:{id:'owner'}})},
 Android:{cancelContactChoice:()=>canceled.push(1)},
 ReactNativeWebView:{postMessage:raw=>requests.push(JSON.parse(raw))}
};
new Function('window','document','localStorage','alert',national)(win,document,storage,()=>{});
const original=win.AbuBassamNativeCameraResult;
assert.equal(typeof original,'function');
const delegated=[];
win.AbuBassamNativeCameraResult=result=>delegated.push(result);
const exposed=cards.replace('window.CardsStudio={',
 'renderForm=()=>{};renderPreview=()=>{};window.__integratedCardsState=state;window.CardsStudio={');
assert.notEqual(exposed,cards,'Card source must expose test state');
new Function('window','document','localStorage','alert',exposed)(win,document,storage,()=>{});
const mergedHandler=win.AbuBassamNativeCameraResult;
assert.notEqual(mergedHandler,original,'Card camera handler must wrap existing route');
const scanResult={mode:'scan',requestId:'29',dataUrl:'data:image/jpeg;base64,QUJD'};
mergedHandler(scanResult);
assert.equal(delegated.length,1,'Scan/maker must reach previous camera handler');
assert.equal(delegated[0],scanResult);
win.CardsStudio.scanBarcode();
assert.ok(requests.some(x=>x.mode==='barcode'&&x.type==='openCamera'));
mergedHandler({mode:'barcode',data:'QR-123',barcodeType:'qr'});
assert.equal(win.__integratedCardsState.forms.reader.result,'QR-123','Barcode result must route to cards reader');
for(const cb of listeners['abu-bassam-auth-changed']||[])cb();
assert.equal(win.__integratedCardsState.forms.reader.result,'','Logout must clear barcode data');
assert.equal(canceled.length,1,'Logout must also cancel a pending contacts picker');
console.log('Integrated national-camera, cards reader, contact cancellation and all required test routes passed.');
