'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const JSZip = require(path.join(root, 'web', 'jszip.min.js'));
const runtime = fs.readFileSync(path.join(root, 'web', 'questions-word-tools-runtime.js'), 'utf8');
const host = fs.readFileSync(path.join(root, 'web', 'productivity-tools-runtime.js'), 'utf8');

function question(title, body, answer, grade) {
  const attrs = { 'data-abu-grade': String(grade) };
  const contents = { '.q-title': { innerText: title }, '.text-area': { innerText: body },
    '.abu-answer-box [contenteditable]': { innerText: answer }, '.abu-question-grade': {} };
  return {
    getAttribute: key => Object.prototype.hasOwnProperty.call(attrs, key) ? attrs[key] : null,
    setAttribute: (key, value) => { attrs[key] = value; },
    removeAttribute: key => { delete attrs[key]; },
    querySelector: key => contents[key] || null,
    querySelectorAll: () => []
  };
}
const questions = [
  question('س1/ اشرح معنى الماء', 'الماء أساس الحياة', 'سائل شفاف', 5),
  question('س2/ اشرح معنى الماء', 'الماء أساس الحياة', 'سائل شفاف', 10)
];
const messages = [];
const sandbox = {
  console, Promise, Map, Number, String, Array, Date,
  alert: message => { throw new Error('Unexpected alert: ' + message); },
  confirm: () => true,
  document: {
    documentElement: { lang: 'ar' },
    readyState: 'loading',
    addEventListener: () => {},
    getElementById: () => null,
    querySelector: selector => selector.includes('.header') ? { innerText: 'اختبار الفصل' } : null,
    querySelectorAll: selector => selector.includes('.question-container') ? questions : []
  },
  window: {
    JSZip,
    __ABU_QUESTION_WORD_TOOLS_V1__: false,
    AbuQuestionPaper: { state: () => ({ w: 210, h: 297 }) },
    parent: { postMessage: message => { messages.push(message); } }
  }
};
async function test() {
  new vm.Script(runtime, { filename: 'questions-word-tools-runtime.js' }).runInNewContext(sandbox);
  new vm.Script(host, { filename: 'productivity-tools-runtime.js' });
  const api = sandbox.window.AbuQuestionWordTools;
  assert.ok(api && typeof api.exportDocx === 'function');
  const report = api.collect(true);
  assert.equal(report.questions.length, 2);
  assert.equal(report.total, 15);
  assert.equal(report.graded, 2);
  assert.equal(report.duplicates.length, 1);
  assert.equal(report.duplicates[0][0], 1);
  assert.equal(report.duplicates[0][1], 2);
  assert.deepEqual(Array.from(report.unanswered), []);

  await api.exportDocx(false);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'abuSaveQuestionDocx');
  assert.ok(messages[0].name.endsWith('.docx'));
  const student = await JSZip.loadAsync(messages[0].data.split(',')[1], { base64: true });
  const studentXml = await student.file('word/document.xml').async('string');
  assert.ok(studentXml.includes('الماء أساس الحياة'));
  assert.ok(studentXml.includes('الدرجة: 5'));
  assert.ok(studentXml.includes('الدرجة: 10'));
  assert.ok(!studentXml.includes('سائل شفاف'), 'student copy must never leak answers');
  assert.ok(!studentXml.includes('مفتاح الإجابة'));
  assert.ok(student.file('[Content_Types].xml'));
  assert.ok(student.file('word/_rels/document.xml.rels'));

  await api.exportDocx(true);
  assert.equal(messages.length, 2);
  const teacher = await JSZip.loadAsync(messages[1].data.split(',')[1], { base64: true });
  const teacherXml = await teacher.file('word/document.xml').async('string');
  assert.ok(teacherXml.includes('سائل شفاف'));
  assert.ok(teacherXml.includes('مفتاح الإجابة'));
  assert.ok(teacherXml.includes('15'));
  assert.ok(host.includes("trustedSource(event,'questionsFrame')"), 'host must authenticate question frame');
  assert.ok(host.includes("data.type==='abuSaveQuestionDocx'"), 'host must handle DOCX');
  assert.ok(host.includes('Android.saveBase64(name,mime,payload)'), 'Android save bridge must be wired');
  console.log('Question Word tests passed: real DOCX ZIP, Arabic content, student privacy, answer key, marks, duplicate detection, source guard.');
}
test().catch(error => { console.error(error); process.exitCode = 1; });
