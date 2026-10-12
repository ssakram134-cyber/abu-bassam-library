'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const parserSource = source.match(/function splitDataUrl\(dataUrl\) \{[\s\S]*?\n\}/)?.[0];
const printerSource = source.match(/  const printBase64 = useCallback\([\s\S]*?\n  \}, \[writeTemporaryFile\]\);/)?.[0];
assert.ok(parserSource && printerSource, 'native data parser and printer must exist');
const splitDataUrl = new Function(parserSource + '\nreturn splitDataUrl;')();

function makePrinter(failPrinting = false) {
  const operations = [], alerts = [];
  const Print = { printAsync: async options => {
    operations.push({ action: 'print', options });
    if (failPrinting) throw Error('printer unavailable');
  }};
  const FileSystem = { deleteAsync: async uri => {
    operations.push({ action: 'delete', uri });
  }};
  const writeTemporaryFile = async (...args) => {
    operations.push({ action: 'write', args });
    return { uri: 'file:///tmp/abu-test.pdf' };
  };
  const printBase64 = new Function(
    'useCallback', 'splitDataUrl', 'Print', 'writeTemporaryFile', 'FileSystem', 'Alert',
    printerSource + '\nreturn printBase64;'
  )(handler => handler, splitDataUrl, Print, writeTemporaryFile, FileSystem, {
    alert: (...args) => alerts.push(args)
  });
  return { printBase64, operations, alerts };
}

async function check() {
  for (const invalid of [
    'invalid:application/pdf;base64,JVBERi0xLjQK',
    'data:application/pdf;base64,abc*',
    'data:application/pdf;base64,MTIzNA',
    'data:application/pdf;base64,',
    'data:;base64,AQIDBA=='
  ]) assert.throws(() => splitDataUrl(invalid), /غير/);
  assert.equal(splitDataUrl('data:application/pdf;base64,JVBERi0xLjQK').mime, 'application/pdf');
  assert.equal(splitDataUrl('data:image/png;name=page%201.png;base64,AQIDBA==').mime, 'image/png');
  assert.equal(splitDataUrl('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEsDBA==').mime,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  const pdf = makePrinter();
  await pdf.printBase64({ name: 'file.pdf', mime: 'application/pdf',
    data: 'data:application/pdf;base64,JVBERi0xLjQK' });
  assert.deepEqual(pdf.operations.map(op => op.action), ['write', 'print', 'delete']);
  assert.equal(pdf.operations[1].options.uri, 'file:///tmp/abu-test.pdf');
  assert.equal(pdf.alerts.length, 0);

  const picture = makePrinter();
  await picture.printBase64({ name: 'scan.png', mime: 'image/png',
    data: 'data:image/png;base64,AQIDBA==' });
  assert.deepEqual(picture.operations.map(op => op.action), ['print']);
  assert.ok(picture.operations[0].options.html.includes('<img'));

  const word = makePrinter();
  await word.printBase64({ name: 'exam.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    data: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEsDBA==' });
  assert.equal(word.operations.length, 0, 'Word must not enter PDF print engine');
  assert.match(word.alerts[0][1], /PDF/);

  const mismatch = makePrinter();
  await mismatch.printBase64({ name: 'fake.pdf', mime: 'application/pdf',
    data: 'data:image/png;base64,AQIDBA==' });
  assert.equal(mismatch.operations.length, 0, 'mismatched mime must be rejected');

  const failed = makePrinter(true);
  await failed.printBase64({ name: 'file.pdf', mime: 'application/pdf',
    data: 'data:application/pdf;base64,JVBERi0xLjQK' });
  assert.deepEqual(failed.operations.map(op => op.action), ['write', 'print', 'delete']);
  assert.match(failed.alerts[0][1], /printer unavailable/);

  console.log('Native file safety passed: strict base64 parsing, PDF/image printing, Word blocking, MIME mismatch and temporary-file cleanup.');
}

check().catch(error => { console.error(error); process.exitCode = 1; });
