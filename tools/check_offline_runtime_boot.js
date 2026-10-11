'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('web/index.html','utf8');
const loader=fs.readFileSync('web/device-name-runtime.js','utf8');
const native=fs.readFileSync('index.js','utf8');
const scriptSrc=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
const bootstrap=[...loader.matchAll(/loadScript\('[^']+','([^']+\.js)'/g)].map(m=>m[1]);
const names=[...new Set([...scriptSrc,...bootstrap])];
assert.ok(scriptSrc.length>=13,'Expected all critical inline script references in web/index.html');
assert.ok(bootstrap.length>=25,'Expected all canonical, fail-closed bootstrap scripts');
assert.equal(names.length,new Set(names).size,'Unexpected duplicated paths');
for(const name of names){
 assert.ok(!/^(?:https?:)?\/\//i.test(name),'Critical boot script must not load from CDN: '+name);
 assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'),'Critical boot path must stay inside app assets: '+name);
 assert.ok(fs.existsSync('web/'+name),'Missing offline boot asset: web/'+name);
}
assert.ok(native.includes("const APP_URL = 'file:///android_asset/library/index.html'"),
 'Native WebView must launch the bundled local HTML, not a remote site');
assert.ok(loader.includes('await loadSecurity();'),'Security must finish before signaling boot ready');
assert.ok(loader.indexOf('await loadApprovedUi();')>=0&&loader.indexOf('signalBootReady();')>loader.indexOf('await loadApprovedUi();'),
 'Native splash must not dismiss before all required local script loads');
const packaging=fs.readFileSync('scripts/prepare-android-assets.mjs','utf8');
assert.ok(packaging.includes('await cp(source, destination, { recursive: true, force: true });'),
 'Android packaging must carry local script tree');
for(const asset of ['pdf.min.js','pdf.worker.min.js','mammoth.browser.min.js','xlsx.full.min.js','lang/ara.traineddata.gz','lang/eng.traineddata.gz'])
 assert.ok(packaging.includes("'"+asset+"'"),'Required packaged offline vendor asset missing from manifest: '+asset);
assert.ok(loader.includes("const loadMediaPipePin=()=>loadScript"),'Optional online background removal must not become critical CDN script');
console.log('Offline boot graph passed: '+names.length+' mandatory local JS files present, no bootstrap CDN, canonical startup ordering and OCR/document packaging retained.');
