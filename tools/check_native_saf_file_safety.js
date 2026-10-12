'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const native = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const safSource = native.match(/async function writeSafFile\([\s\S]*?\n\}/)?.[0];
const pdfSource = native.match(/  const savePdfHtml = useCallback\([\s\S]*?\n  \}, \[\]\);/)?.[0];
assert.ok(safSource, 'safe SAF write helper must exist');
assert.ok(pdfSource, 'HTML-to-PDF saver must exist');

function mockFileSystem(options = {}) {
  const events = [];
  const fs = {
    EncodingType: { Base64: 'base64' },
    cacheDirectory: 'file:///cache/',
    StorageAccessFramework: {
      getUriForDirectoryInRoot: name => name,
      requestDirectoryPermissionsAsync: async () => ({ granted: !options.denyPermission, directoryUri: 'content://folder' }),
      createFileAsync: async () => { events.push('create'); if (options.failCreate) throw Error('create failed'); return 'content://file'; },
      writeAsStringAsync: async () => { events.push('write'); if (options.failWrite) throw Error('write failed'); },
      deleteAsync: async () => { events.push('delete-saf'); if (options.failDelete) throw Error('delete failed'); }
    },
    deleteAsync: async () => { events.push('delete-cache'); },
    readAsStringAsync: async () => 'JVBERi0x'
  };
  return { fs, events };
}

async function check() {
  const pass = mockFileSystem();
  const writePass = new Function('FileSystem', safSource + '\nreturn writeSafFile;')(pass.fs);
  assert.equal(await writePass('content://folder', 'file', 'application/pdf', 'JVBERi0x'), 'content://file');
  assert.deepEqual(pass.events, ['create', 'write']);

  const failed = mockFileSystem({ failWrite: true });
  const writeFail = new Function('FileSystem', safSource + '\nreturn writeSafFile;')(failed.fs);
  await assert.rejects(writeFail('content://folder', 'file', 'application/pdf', 'JVBERi0x'), /write failed/);
  assert.deepEqual(failed.events, ['create', 'write', 'delete-saf'], 'partial output must be deleted');

  const deletionFailed = mockFileSystem({ failWrite: true, failDelete: true });
  const writeDeletionFailed = new Function('FileSystem', safSource + '\nreturn writeSafFile;')(deletionFailed.fs);
  await assert.rejects(writeDeletionFailed('content://folder', 'file', 'application/pdf', 'JVBERi0x'), /write failed/,
    'original write failure must still surface');

  const createFailed = mockFileSystem({ failCreate: true });
  const writeCreateFailed = new Function('FileSystem', safSource + '\nreturn writeSafFile;')(createFailed.fs);
  await assert.rejects(writeCreateFailed('content://folder', 'file', 'application/pdf', 'JVBERi0x'), /create failed/);
  assert.deepEqual(createFailed.events, ['create'], 'do not delete files not created');

  for (const mode of ['ok', 'deny', 'write-failed']) {
    const state = mockFileSystem({ denyPermission: mode === 'deny', failWrite: mode === 'write-failed' });
    const alerts = [];
    const saver = new Function('useCallback','Print','FileSystem','safeName','writeSafFile','Alert',
      pdfSource + '\nreturn savePdfHtml;')(
      f => f,
      { printToFileAsync: async () => ({ uri: 'file:///cache/generated.pdf', base64: 'JVBERi0x' }) },
      state.fs,
      name => name,
      new Function('FileSystem', safSource + '\nreturn writeSafFile;')(state.fs),
      { alert: (...args) => alerts.push(args) }
    );
    await saver({ name: 'my-pdf.pdf', html: '<p>Printable</p>' });
    assert.ok(state.events.includes('delete-cache'), 'temporary PDF must be cleaned: ' + mode);
    if (mode === 'ok') {
      assert.deepEqual(state.events, ['create', 'write', 'delete-cache']);
      assert.equal(alerts[0][0], 'تم حفظ PDF');
    } else if (mode === 'deny') {
      assert.deepEqual(state.events, ['delete-cache']);
      assert.equal(alerts.length, 0);
    } else {
      assert.deepEqual(state.events, ['create', 'write', 'delete-saf', 'delete-cache']);
      assert.equal(alerts[0][0], 'تعذر حفظ PDF');
    }
  }
  console.log('Native SAF safety passed: rollback on interrupted writes and cleanup after PDF save, cancel, or failure.');
}

check().catch(error => { console.error(error); process.exitCode = 1; });
