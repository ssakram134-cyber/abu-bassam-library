const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const errors = [];
const read = (name) => fs.readFileSync(path.join(web, name), 'utf8');
const need = (source, marker, label) => { if (!source.includes(marker)) errors.push(`${label}: missing ${marker}`); };

for (const file of ['feature-recovery-runtime.js','card-templates.html','mawkib-cards.html','thanks-letter.html','envelopes.html']) {
  if (!fs.existsSync(path.join(web, file))) errors.push(`Missing latest feature asset: ${file}`);
}

const device = read('device-name-runtime.js');
if (/function\s+loadGlobalFlex\s*\(/.test(device) || /(^|[^\w])loadGlobalFlex\s*\(\s*\)\s*;/m.test(device)) {
  errors.push('Global flex runtime is still actively loaded');
}
need(device, 'feature-recovery-runtime.js', 'device-name-runtime.js');

const gestures = read('questions-gesture-runtime.js');
need(gestures, '__ABU_QUESTION_GESTURES_DISABLED__', 'questions-gesture-runtime.js');
need(gestures, 'restoreNativeTouch', 'questions-gesture-runtime.js');

const recovery = read('feature-recovery-runtime.js');
for (const marker of [
  '#abuControlDock','.abu-control-dock','.top-actions{top:54px','abuCardsTemplatesBtn',
  'كارت المواكب','صناعة الأظرف','كتاب الشكر والتقدير','mawkib-cards.html','thanks-letter.html',
  'removeFlex','cleanQuestions','tabEnvelopes','tabThanks'
]) need(recovery, marker, 'feature-recovery-runtime.js');

const cards = read('card-templates.html');
for (const marker of ['نماذج الباجات والكروت','كروت المواكب الحسينية','الباج التعريفي','باج الروضة والمدرسة']) need(cards, marker, 'card-templates.html');

const mawkib = read('mawkib-cards.html');
for (const marker of ['85.6 × 54','qrcode_UTF8.js','موكب','اسم المسؤول','رقم الهاتف','حفظ PDF','طباعة','localStorage']) need(mawkib, marker, 'mawkib-cards.html');

const thanks = read('thanks-letter.html');
for (const marker of ['كتاب شكر وتقدير','الجهة المانحة','اسم المكرَّم','حفظ PDF','طباعة','localStorage','نموذج ذهبي رسمي']) need(thanks, marker, 'thanks-letter.html');

for (const file of ['card-templates.html','mawkib-cards.html','thanks-letter.html']) {
  const source = read(file);
  const scripts = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;
  while ((match = scripts.exec(source))) {
    index += 1;
    if (!match[1].trim()) continue;
    try { new vm.Script(match[1], { filename: `${file}#${index}` }); }
    catch (error) { errors.push(`${file} inline script ${index}: ${error.message}`); }
  }
}

if (errors.length) {
  process.stderr.write(errors.join('\n') + '\n');
  process.exit(1);
}
process.stdout.write('Latest UX/features checks passed (native touch, no flex loader, hidden bottom dock, lowered header controls, card templates, procession cards, envelopes, thanks letters).\n');
