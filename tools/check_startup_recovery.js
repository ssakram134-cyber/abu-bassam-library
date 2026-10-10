'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const device = fs.readFileSync(path.join(root, 'web/device-name-runtime.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
const native = fs.readFileSync(path.join(root, 'index.js'), 'utf8');

assert.doesNotMatch(html, /setTimeout\s*\(\s*\(\)\s*=>\s*\$\('splash'\)\.classList\.add\('hide'\)/, 'Unverified startup must not hide the splash');
assert.match(native, /const \[startupFailed, setStartupFailed\] = useState\(false\)/);
assert.match(native, /const \[startupAttempt, setStartupAttempt\] = useState\(0\)/);
assert.match(native, /if \(webReady \|\| startupFailed\) return undefined/);
assert.match(native, /onPress=\{retryStartup\}/);
assert.match(native, /webRef\.current\?\.reload\(\)/);
assert.match(native, /onError=\{\(\) => \{ setWebReady\(false\); setStartupFailed\(true\); \}\}/);
assert.doesNotMatch(native, /onLoadEnd=\{\(\) => setWebReady\(true\)\}/, 'WebView onLoad is not security readiness');
assert.match(device, /await loadApprovedUi\(\);\s*dismissSplash\(\);\s*signalBootReady\(\)/);
assert.match(device, /splash\.style\.pointerEvents='none'/);

for (const [index, script] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x => x[1]).filter(x => x.trim()).entries()) {
  new vm.Script(script, { filename: 'web/index.html inline-script-' + index });
}
new vm.Script(device, { filename: 'web/device-name-runtime.js' });

async function simulate({ offline = false, failAt = '', storageFails = false } = {}) {
  const records = [];
  const stored = new Map();
  const splash = {
    style: { display: 'flex' },
    attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    getAttribute(key) { return this.attributes[key]; },
    querySelector() { return null; },
  };
  const document = {
    readyState: 'complete',
    visibilityState: 'visible',
    getElementById: id => id === 'splash' ? splash : null,
    createElement: tag => ({ tagName: tag, style: {} }),
    dispatchEvent() {},
    addEventListener() {},
    head: {
      appendChild(script) {
        records.push({ type: 'script', src: script.src });
        Promise.resolve().then(() => {
          if (script.src === failAt) script.onerror?.();
          else script.onload?.();
        });
      },
    },
  };
  const localStorage = {
    getItem(key) {
      if (storageFails) throw new Error('STORAGE_BLOCKED');
      return stored.get(key) ?? null;
    },
    setItem(key, value) { stored.set(key, String(value)); },
    removeItem(key) { stored.delete(key); },
  };
  const window = {
    ReactNativeWebView: {
      postMessage(raw) {
        records.push({
          type: 'native-ready',
          message: JSON.parse(raw),
          splashDisplay: splash.style.display,
          splashPointerEvents: splash.style.pointerEvents,
        });
      },
    },
    addEventListener() {},
  };
  const errors = [];
  vm.runInNewContext(device, {
    document, localStorage, window,
    navigator: { userAgent: 'Android', onLine: !offline },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    setTimeout: () => 1,
    setInterval: () => 1,
    console: { error: (...args) => errors.push(String(args[0])) },
  }, { filename: 'web/device-name-runtime.js', timeout: 1000 });
  await new Promise(resolve => setImmediate(resolve));
  return { records, splash, errors };
}

(async () => {
  for (const offline of [false, true]) {
    const success = await simulate({ offline });
    const ready = success.records.filter(x => x.type === 'native-ready');
    assert.equal(ready.length, 1, 'Each successful boot sends exactly one readiness handshake');
    assert.equal(ready[0].message.type, 'webBootReady');
    assert.equal(ready[0].splashDisplay, 'none', 'Touch-blocking splash must be removed before readiness');
    assert.equal(ready[0].splashPointerEvents, 'none');
    assert.equal(success.splash.attributes['aria-hidden'], 'true');
  }
  for (const broken of [{ failAt: 'security-bootstrap-guard-runtime.js' }, { storageFails: true }]) {
    const failed = await simulate(broken);
    assert.equal(failed.records.some(x => x.type === 'native-ready'), false, 'Failed startup must remain closed');
    assert.equal(failed.splash.style.display, 'flex', 'Failed startup keeps splash until native retry');
    assert.equal(failed.errors.length, 1, 'Failed startup reports exactly one initialization error');
  }
  console.log('Startup recovery checks passed: splash stays until validated boot, local offline loader ordering, native retry UI, and failed security/storage starts never signal readiness.');
})().catch(error => { console.error(error); process.exitCode = 1; });
