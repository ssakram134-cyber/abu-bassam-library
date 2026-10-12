'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

const secure = read('web/secure-sync-runtime.js');
const nativeFunctions = secure.match(/  function nativeAvailable\(\) \{[\s\S]*?\n  window\.AbuBassamNativeSecurity = \{ request: nativeRequest, available: nativeAvailable \};/)?.[0];
assert.ok(nativeFunctions, 'canonical native security dispatcher must be present');

function makeNative(throwOnSend = false) {
  const calls = [];
  const timers = new Set();
  let nextTimer = 0;
  const window = { Android: {} };
  const Android = {
    security: (...args) => {
      if (throwOnSend) throw new Error('native bridge unavailable');
      calls.push(args);
    }
  };
  window.Android = Android;
  const api = new Function(
    'window', 'Android', 'setTimeout', 'clearTimeout',
    'const nativePending = new Map(); let nativeSeq = 0;\n' +
      nativeFunctions + '\nreturn { request: nativeRequest, pending: nativePending };'
  )(window, Android, () => { const token = ++nextTimer; timers.add(token); return token; },
    token => timers.delete(token));
  return { ...api, result: window.AbuBassamNativeSecurityResult, calls, timers };
}

async function verify() {
  let checks = 0;
  const basic = makeNative();
  const valid = basic.request('secureGet', { key: 'abu_bassam_test_value' });
  assert.equal(basic.pending.size, 1);
  for (const invalid of ['null', '[]', '{invalid', null, [], { requestId: 5, ok: true }]) {
    assert.doesNotThrow(() => basic.result(invalid));
    assert.equal(basic.pending.size, 1, 'malformed replies must not consume pending request');
    checks++;
  }
  basic.result({ requestId: basic.calls[0][1], ok: true, value: 'safe-value' });
  assert.equal(await valid, 'safe-value');
  assert.equal(basic.pending.size, 0);
  assert.equal(basic.timers.size, 0);
  checks++;

  const missingAck = makeNative();
  const spoofed = missingAck.request('secureGet');
  missingAck.result({ requestId: missingAck.calls[0][1], value: 'unconfirmed' });
  await assert.rejects(spoofed, /تعذر تنفيذ العملية الأمنية/);
  assert.equal(missingAck.pending.size, 0);
  checks++;

  const wrongAck = makeNative();
  const wrong = wrongAck.request('secureGet');
  wrongAck.result({ requestId: wrongAck.calls[0][1], ok: 'true', value: 'wrong' });
  await assert.rejects(wrong, /تعذر تنفيذ العملية الأمنية/);
  checks++;

  const rejected = makeNative();
  const denied = rejected.request('secureGet');
  rejected.result({ requestId: rejected.calls[0][1], ok: false, error: 'denied' });
  await assert.rejects(denied, /denied/);
  checks++;

  const sendError = makeNative(true);
  await assert.rejects(sendError.request('secureGet'), /native bridge unavailable/);
  assert.equal(sendError.pending.size, 0);
  assert.equal(sendError.timers.size, 0);
  checks++;

  const guardSource = read('web/permission-guard-runtime.js');
  const guardFunctions = guardSource.match(/function secondary\(\)\{[^\n]*\}\nfunction allowed\(permission\)\{[^\n]*\}/)?.[0];
  assert.ok(guardFunctions, 'canonical permissions guard must be present');
  const sec = { role: () => 'secondary', can: () => undefined };
  const allowed = new Function(
    'window',
    'const security=()=>window.AbuBassamSecurity;\n' + guardFunctions + '\nreturn allowed;'
  )({ AbuBassamSecurity: sec });

  assert.equal(allowed('edit'), false, 'unresolved secondary permission must fail closed');
  checks++;
  sec.can = () => false;
  assert.equal(allowed('print'), false);
  checks++;
  sec.can = () => true;
  assert.equal(allowed('print'), true);
  checks++;
  sec.role = () => 'owner';
  sec.can = () => false;
  assert.equal(allowed('edit'), true, 'owner capability must remain unchanged');
  checks++;

  console.log('Native dispatcher / permissions: ' + checks + '/' + checks +
    ' focused checks passed; unknown replies and secondary privileges fail closed.');
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
