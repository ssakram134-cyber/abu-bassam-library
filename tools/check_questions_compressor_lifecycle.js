'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const web = path.join(__dirname, '..', 'web');
const compressorHtml = fs.readFileSync(path.join(web, 'image-compressor.html'), 'utf8');
const host = fs.readFileSync(path.join(web, 'productivity-tools-runtime.js'), 'utf8');
const inline = [...compressorHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).filter(Boolean);
assert.equal(inline.length, 1, 'Compressor must have exactly one inline runtime');
new vm.Script(inline[0], { filename: 'image-compressor.html' });
new vm.Script(host, { filename: 'productivity-tools-runtime.js' });

// Reject unsupported image formats instead of silently saving HEIC/GIF/SVG bytes as JPEG.
const elements = new Map(), alerts = [], revoked = [], preset = { dataset: { q: '80' }, disabled: false, classList: { toggle() {} } };
function getElement(id) {
  if (!elements.has(id)) elements.set(id, {
    id, innerHTML: '', textContent: '', style: {}, dataset: {}, disabled: false,
    value: id === 'quality' ? '75' : id === 'maxDimension' ? '2000' : '',
    classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {},
    click() {}, removeAttribute() {},
  });
  return elements.get(id);
}
const document = {
  getElementById: getElement,
  querySelectorAll: selector => selector === '.preset' ? [preset] : [],
  createElement: () => ({ click() {}, remove() {} }),
  body: { appendChild() {} },
};
const objectUrls = {
  createObjectURL: file => 'blob:test/' + encodeURIComponent(file.name),
  revokeObjectURL: url => revoked.push(url),
};
const context = vm.createContext({
  document, window: { addEventListener() {}, parent: {} }, URL: objectUrls,
  crypto: { randomUUID: () => 'test-' + Math.random() }, alert: message => alerts.push(String(message)),
  setTimeout, clearTimeout, Image: class {}, FileReader: class {},
  console,
});
vm.runInContext(inline[0], context);
const run = source => vm.runInContext(source, context);

for (const [mime, name, expected] of [
  ['image/jpeg', 'photo.jpg', true],
  ['image/png', 'page.png', true],
  ['image/webp', 'new.webp', true],
  ['', 'scan.jpeg', true],
  ['application/octet-stream', 'document.png', true],
  ['image/heic', 'photo.heic', false],
  ['image/gif', 'animation.gif', false],
  ['image/svg+xml', 'vector.svg', false],
  ['image/heic', 'misleading.jpg', false],
  ['application/pdf', 'report.pdf', false],
]) {
  assert.equal(run(`isImageFile({type:${JSON.stringify(mime)},name:${JSON.stringify(name)}})`), expected, 'MIME guard ' + name);
}
run("acceptFiles([{name:'first.jpg',type:'image/jpeg',size:1024},{name:'second.png',type:'image/png',size:2048}])");
assert.equal(run('selected.length'), 2);
run("acceptFiles([{name:'bad.gif',type:'image/gif',size:100}])");
assert.equal(run('selected.length'), 2, 'Unsupported image must not join the batch');
assert.ok(alerts.some(message => message.includes('JPG') && message.includes('WebP')));

let completeCompression;
context.compressMock = (item, index) => new Promise(resolve => {
  completeCompression = () => resolve({
    id: item.id, name: 'compressed_' + index + '.jpg', originalName: item.file.name,
    originalBytes: item.file.size, compressedBytes: 200, dataUrl: 'data:image/jpeg;base64,YQ==',
    width: 1000, height: 1000, quality: 'جيدة للطباعة', qualityClass: 'q-good', unchanged: false,
  });
});
run('compressOne = (item, index) => globalThis.compressMock(item,index)');
const pending = run('processAll()');
assert.equal(run('processing'), true);
assert.equal(getElement('quality').disabled, true);
assert.equal(getElement('maxDimension').disabled, true);
assert.equal(preset.disabled, true);
run("acceptFiles([{name:'during.jpg',type:'image/jpeg',size:100}])");
run('window.moveItem(0,1);window.removeItem(0)');
assert.equal(run('selected.length'), 2, 'Selection must not change mid-compression');
assert.equal(run('selected[0].file.name'), 'first.jpg', 'Reordering must be blocked mid-compression');
run('cancelRequested=true');
completeCompression();
pending.then(() => {
  assert.equal(run('processing'), false);
  assert.equal(run('results.length'), 1, 'Cancellation stops remaining items');
  assert.equal(getElement('quality').disabled, false);
  assert.equal(getElement('maxDimension').disabled, false);
  assert.equal(preset.disabled, false);
  assert.equal(run('selected.length'), 2, 'Cancellation preserves originals');

  // An iframe loading its target URL must not receive scripts before its own document is ready.
  const loaded = host.match(/^function frameLoaded\(frame\)\{.*\}$/m)?.[0];
  const ready = host.match(/^function frameDocumentReady\(frame,expected\)\{.*\}$/m)?.[0];
  assert.ok(loaded && ready, 'Expected both iframe-document guards');
  const check = vm.runInNewContext(loaded + '\n' + ready + '\nframeDocumentReady');
  const frame = {
    getAttribute: () => 'questions-ar.html',
    contentDocument: { readyState: 'complete' },
    contentWindow: { location: { pathname: '/library/questions-ar.html' } },
  };
  assert.equal(check(frame, 'questions-ar.html'), true);
  assert.equal(check(frame, 'questions-en.html'), false);
  frame.contentDocument.readyState = 'loading';
  assert.equal(check(frame, 'questions-ar.html'), false);
  frame.contentDocument.readyState = 'complete';
  frame.contentWindow.location.pathname = '/library/about:blank';
  assert.equal(check(frame, 'questions-ar.html'), false);
  assert.ok(host.includes("!frameDocumentReady(frame,'questions-ar.html')"));
  assert.ok(host.includes("!frameDocumentReady(frame,'questions-en.html')"));
  assert.doesNotMatch(host, /setTimeout\(injectCurrentQuestionRuntime,120\)/);
  console.log('Questions/compressor lifecycle checks passed: MIME allowlist, immutable active batch, cancellation, controls restored, and loaded iframe-only script injection.');
}).catch(error => { console.error(error); process.exitCode = 1; });
