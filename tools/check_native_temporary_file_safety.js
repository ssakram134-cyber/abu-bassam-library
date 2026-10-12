'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const writer = source.match(/  const writeTemporaryFile = useCallback\([\s\S]*?\n  \}, \[\]\);/)?.[0];
const parser = source.match(/function splitDataUrl\(dataUrl\) \{[\s\S]*?\n\}/)?.[0];
const safeName = source.match(/function safeName\(value\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(writer && parser && safeName, 'Native cache file writer and input validation must exist');

function fixture(options = {}) {
  const events = [];
  let counter = 0;
  const FileSystem = {
    cacheDirectory: options.missingCache ? null : 'file:///cache/',
    EncodingType: { Base64: 'base64' },
    writeAsStringAsync: async (uri, data, settings) => {
      events.push({ action: 'write', uri, data, settings });
      if (options.failWrite) throw Error('disk is full');
    },
    deleteAsync: async (uri, settings) => {
      events.push({ action: 'delete', uri, settings });
      if (options.failDelete) throw Error('cache cleanup denied');
    }
  };
  const writeTemporaryFile = new Function('FileSystem', 'useCallback', 'Date', 'Math',
    parser + '\n' + safeName + '\n' + writer + '\nreturn writeTemporaryFile;'
  )(FileSystem, fn => fn, { now: () => 123456 },
    { random: () => (++counter / 1000) });
  return { writeTemporaryFile, events };
}

async function check() {
  const valid = 'data:application/pdf;base64,JVBERi0x';
  const success = fixture();
  const file = await success.writeTemporaryFile('file:name.pdf', 'application/pdf', valid);
  assert.equal(file.name, 'file_name.pdf', 'Cache name must be safe');
  assert.equal(file.type, 'application/pdf');
  assert.equal(success.events[0].action, 'write');
  assert.equal(success.events[0].data, 'JVBERi0x');
  assert.equal(success.events[0].settings.encoding, 'base64');
  assert.ok(file.uri.startsWith('file:///cache/abu_bassam_123456_'));
  assert.equal(success.events.filter(x => x.action === 'delete').length, 0,
    'Successfully written file belongs to calling print/share operation');

  const simultaneous = fixture();
  const pair = await Promise.all([
    simultaneous.writeTemporaryFile('same.pdf', 'application/pdf', valid),
    simultaneous.writeTemporaryFile('same.pdf', 'application/pdf', valid)
  ]);
  assert.notEqual(pair[0].uri, pair[1].uri,
    'Simultaneous print/share exports must never have identical cache paths');

  const interrupted = fixture({ failWrite: true });
  await assert.rejects(
    interrupted.writeTemporaryFile('file.pdf', 'application/pdf', valid),
    /disk is full/
  );
  assert.deepEqual(interrupted.events.map(x => x.action), ['write', 'delete'],
    'Failed cache write must remove any partially created file');
  assert.equal(interrupted.events[1].uri, interrupted.events[0].uri);
  assert.deepEqual(interrupted.events[1].settings, { idempotent: true });

  const failedCleanup = fixture({ failWrite: true, failDelete: true });
  await assert.rejects(
    failedCleanup.writeTemporaryFile('file.pdf', 'application/pdf', valid),
    /disk is full/,
    'Clean-up error must not mask the original failed write'
  );
  assert.deepEqual(failedCleanup.events.map(x => x.action), ['write', 'delete']);

  const unavailable = fixture({ missingCache: true });
  await assert.rejects(
    unavailable.writeTemporaryFile('file.pdf', 'application/pdf', valid),
    /مجلد الملفات المؤقتة غير متاح/
  );
  assert.deepEqual(unavailable.events, [], 'Absent cache must not attempt a write');

  const invalid = fixture();
  await assert.rejects(
    invalid.writeTemporaryFile('bad.pdf', 'application/pdf', 'data:application/pdf;base64,invalid!'),
    /غير صالحة/
  );
  assert.deepEqual(invalid.events, [], 'Invalid base64 must be rejected before writing');
  console.log('Native temporary file safety passed: cleanup on failed writes, original error preservation, collision avoidance, missing cache and invalid input.');
}
check().catch(error => { console.error(error); process.exitCode = 1; });
