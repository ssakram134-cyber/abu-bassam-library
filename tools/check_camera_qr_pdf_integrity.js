'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const native = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const studio = fs.readFileSync(path.join(root, 'web/cards-studio-runtime.js'), 'utf8');
const qrLibrary = fs.readFileSync(path.join(root, 'web/qrcode.js'), 'utf8');
const utf8 = fs.readFileSync(path.join(root, 'web/qrcode_UTF8.js'), 'utf8');
new vm.Script(studio, { filename: 'cards-studio-runtime.js' });

// Native scanner callbacks can arrive repeatedly before React applies state updates.
assert.match(native, /const barcodeScanGuard = useRef\(false\)/);
assert.match(native, /if \(barcodeScanGuard\.current \|\| barcodeLocked \|\| cameraMode !== 'barcode'/);
assert.match(native, /barcodeScanGuard\.current = true;\s*setBarcodeLocked\(true\)/);
assert.match(native, /barcodeScanGuard\.current = false;\s*setCameraReady\(false\)/);
assert.doesNotMatch(native, /setTimeout\(\(\) => setBarcodeLocked\(false\)/);
const scanBlock = native.match(/const onBarcodeScanned = useCallback\(\(result\) => \{([\s\S]*?)\n  \}, \[barcodeLocked, cameraMode, inject\]\);/);
assert.ok(scanBlock, 'Canonical scanner callback must be available');
let mode = 'barcode', calls = [], lock = { current: false };
const scanner = new Function('result', 'barcodeScanGuard', 'barcodeLocked', 'cameraMode',
  'setBarcodeLocked', 'setCameraMode', 'setCameraReady', 'setCameraBusy',
  'setTorch', 'setCameraFacing', 'setCameraFrameKind', 'inject', scanBlock[1]);
function scan(data, locked = false) {
  return scanner({ data, type: 'qr' }, lock, locked, mode,
    () => {}, next => { mode = next; }, () => {}, () => {}, () => {}, () => {}, () => {},
    (event, data) => calls.push({ event, data }));
}
scan('first');
scan('duplicate');
assert.equal(calls.length, 1, 'Only first barcode event of a scan session must be delivered');
assert.equal(calls[0].data.data, 'first');
assert.equal(lock.current, true);
lock.current = false; mode = null; scan('stale');
assert.equal(calls.length, 1, 'Old callbacks after closing the camera must be ignored');
mode = 'barcode'; scan('second');
assert.equal(calls.length, 2, 'A new scan session must accept a new barcode');

// vCard must escape user-supplied punctuation/newlines, and dialing must remain functional.
const start = studio.indexOf('function vcardEscape('), end = studio.indexOf('\nfunction qrSvg(', start);
assert.ok(start >= 0 && end > start);
const cardFunctions = new Function('state', 'childInstitution', 'serviceName',
  studio.slice(start, end) + '\nreturn {payloadFor,vcardEscape,guardianWhatsApp};')(
    { lastBarcode: '' },
    data => data.school || 'روضة أطفال القادسية',
    data => data.service || 'email');
const brand = { name: 'مكتبة أبو بسام', phone: '07829667521' };
const child = { type: 'child', brand, data: {
  name: 'ملاك; أكرم,\nحاتم', institutionType: 'school', school: 'مدرسة, الأقصى',
  guardianPhone: '07829667521', driverPhone: '07829664889',
  address: 'حي الضباط; قرب الزراعة', line: 'خط 1', notes: 'سطر\nثانٍ',
}};
const payload = cardFunctions.payloadFor(child);
assert.match(payload, /^BEGIN:VCARD\nVERSION:3\.0\n/);
assert.ok(payload.includes('FN:ملاك\\; أكرم\\,\\nحاتم'));
assert.ok(payload.includes('ORG:مدرسة\\, الأقصى'));
assert.ok(payload.includes('ADR:;;حي الضباط\\; قرب الزراعة;;;;'));
assert.ok(payload.includes('TEL;TYPE=CELL:07829667521'));
assert.ok(payload.includes('TEL;TYPE=WORK:07829664889'));
assert.ok(payload.includes('URL:https://wa.me/9647829667521'));
assert.ok(payload.includes('NOTE:خط النقل خط 1 | سطر\\nثانٍ'));
assert.equal(payload.split('\n').filter(x => x.startsWith('FN:')).length, 1);
assert.ok(payload.endsWith('\nEND:VCARD'));
const invalid = { ...child, data: { ...child.data, guardianPhone: '123' } };
assert.equal(cardFunctions.payloadFor(invalid).includes('wa.me/'), false, 'Bad guardian phone must not create an invalid WhatsApp URL');
const personal = cardFunctions.payloadFor({type:'personal',brand,data:{
  name:'زهراء',phone:'07829667521',email:'example@example.com',address:'القادسية',
  telegram:'',location:'',notes:'ملاحظة'
}});
assert.equal(personal.includes('https://t.me/'), false, 'Empty Telegram username must not create an unusable URL');

// Use the actual bundled QR encoder, including its UTF-8 extension.
const qrContext = {};
vm.runInNewContext(qrLibrary + '\n' + utf8 + '\nthis.generator = qrcode;', qrContext);
const matrix = qrContext.generator(0, 'M');
matrix.addData(payload);
matrix.make();
const svg = matrix.createSvgTag({cellSize:3,margin:12,scalable:true});
assert.ok(matrix.getModuleCount() > 21 && svg.startsWith('<svg') && svg.includes('fill="white"'));

// Check that image export cleans temporary object URLs on success AND on error.
const exportStart = studio.indexOf('async function domCardPng(');
const exportEnd = studio.indexOf('\nfunction saveBase64(', exportStart);
assert.ok(exportStart >= 0 && exportEnd > exportStart);
async function testImageUrlCleanup(fails) {
  let released = 0, created = 0;
  const objectUrl = {
    createObjectURL() { created++; return 'blob:card-preview'; },
    revokeObjectURL(url) { assert.equal(url, 'blob:card-preview'); released++; },
  };
  const ImageMock = class {
    set src(_) { Promise.resolve().then(() => fails ? this.onerror?.() : this.onload?.()); }
  };
  const canvas = { width: 0, height: 0,
    getContext: () => ({ clearRect(){}, drawImage(){} }),
    toDataURL: () => 'data:image/png;base64,YQ==',
  };
  const creator = new Function('modelNow','fullPrintCss','freeLayoutCss','cardHtml','URL','Blob','Image','document',
    studio.slice(exportStart, exportEnd) + '\nreturn domCardPng;');
  const imageExport = creator(() => ({width:85.6,height:54}), () => '', () => '',
    () => '<div class="cs-print-card"></div>', objectUrl, class {}, ImageMock,
    { createElement: () => canvas });
  if(fails) await assert.rejects(imageExport('front'));
  else assert.match(await imageExport('front'), /^data:image\/png;base64,/);
  assert.equal(created, 1);
  assert.equal(released, 1, 'Temporary image blob must always be revoked');
}

// Extract the actual Android PDF handler to verify temporary file deletion after cancellation.
const pdfStart = native.indexOf('  const savePdfHtml = useCallback(');
const pdfEnd = native.indexOf('\n  const writeTemporaryFile = useCallback(', pdfStart);
assert.ok(pdfStart >= 0 && pdfEnd > pdfStart);
async function testPdfTempCleanup(granted) {
  const deletes = [], writes = [], alerts = [];
  const FileSystem = {
    cacheDirectory: 'file:///cache/',
    EncodingType: { Base64:'base64' },
    StorageAccessFramework: {
      getUriForDirectoryInRoot: () => 'content://downloads',
      requestDirectoryPermissionsAsync: async () => ({granted, directoryUri:'content://picked'}),
      createFileAsync: async () => 'content://picked/output.pdf',
      writeAsStringAsync: async (...args) => { writes.push(args); },
    },
    readAsStringAsync: async () => 'YmFzZTY0',
    deleteAsync: async uri => { deletes.push(uri); },
  };
  const create = new Function('useCallback','Print','FileSystem','Alert','safeName',
    native.slice(pdfStart, pdfEnd) + '\nreturn savePdfHtml;');
  const handler = create(fn=>fn, {printToFileAsync: async () => ({uri:'file:///cache/print-123.pdf',base64:'YmFzZTY0'})},
    FileSystem, {alert:(...args)=>alerts.push(args)}, value=>String(value));
  await handler({name:'بطاقة.pdf',html:'<html>card</html>'});
  assert.deepEqual(deletes, ['file:///cache/print-123.pdf'], 'Cached PDF must be deleted even if permission is declined');
  assert.equal(writes.length, granted ? 1 : 0);
  assert.equal(alerts.length, granted ? 1 : 0);
}
(async () => {
  await testImageUrlCleanup(false);
  await testImageUrlCleanup(true);
  await testPdfTempCleanup(false);
  await testPdfTempCleanup(true);
  for (const functionName of ['previewPrint','printNow','savePdf']) {
    const fn = studio.match(new RegExp('function '+functionName+'\\(\\)\\{([^\\n]*)'));
    assert.ok(fn && fn[1].includes('printDocument()'), functionName + ' must share canonical print markup');
  }
  console.log('Camera QR/PDF integrity checks passed: scan event deduplication, valid escaped UTF-8 vCards, QR generation, PNG URL cleanup, and PDF cleanup after cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
