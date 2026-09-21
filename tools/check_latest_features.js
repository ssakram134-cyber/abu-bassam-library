const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const errors = [];
const read = (name) => fs.readFileSync(path.join(web, name), 'utf8');
const need = (source, marker, label) => { if (!source.includes(marker)) errors.push(`${label}: missing ${marker}`); };
const forbid = (source, marker, label) => { if (source.includes(marker)) errors.push(`${label}: forbidden ${marker}`); };

for (const file of ['feature-recovery-runtime.js','card-templates.html','ration-card.html','mawkib-cards.html','thanks-letter.html','envelopes.html','envelope-agreement-runtime.js']) {
  if (!fs.existsSync(path.join(web, file))) errors.push(`Missing latest feature asset: ${file}`);
}

const device = read('device-name-runtime.js');
if (/function\s+loadGlobalFlex\s*\(/.test(device) || /(^|[^\w])loadGlobalFlex\s*\(\s*\)\s*;/m.test(device)) errors.push('Global flex runtime is still actively loaded');
need(device, 'feature-recovery-runtime.js', 'device-name-runtime.js');

const gestures = read('questions-gesture-runtime.js');
need(gestures, '__ABU_QUESTION_GESTURES_DISABLED__', 'questions-gesture-runtime.js');
need(gestures, 'restoreNativeTouch', 'questions-gesture-runtime.js');

const recovery = read('feature-recovery-runtime.js');
for (const marker of [
  '#abuControlDock','.abu-control-dock','.top-actions{top:54px','abuCardsTemplatesBtn',
  "addCardTool(types,'ration'","addCardTool(types,'mawkib'","addCardTool(types,'envelope'","addCardTool(types,'thanks'",
  'ration-card.html','mawkib-cards.html','envelopes.html','thanks-letter.html','removeOldPlacements','recoveryMessage',
  "$('prodModeEnvelope')?.remove()","$('prodPaneEnvelope')?.remove()"
]) need(recovery, marker, 'feature-recovery-runtime.js');
for (const marker of ["b.id='tabEnvelopes'","b.id='tabThanks'","p.id='prodPaneThanks'"]) forbid(recovery, marker, 'feature-recovery-runtime.js');

const cards = read('card-templates.html');
for (const marker of ['نماذج الباجات والكروت','البطاقة التموينية','كروت المواكب الحسينية','صناعة الظرف','الشكر والتقدير','ration-card.html','mawkib-cards.html','envelopes.html','thanks-letter.html','الباج التعريفي','باج الروضة والمدرسة']) need(cards, marker, 'card-templates.html');

const ration = read('ration-card.html');
for (const marker of [
  'البطاقة التموينية','اسم رب العائلة','رقم البطاقة التموينية','ملاحظة أسفل الكارت','85.6 × 54','CR80 — كارت مباشر','A4 — الوجه والظهر',
  'value="t10"','renderQr(q(\'rationNumber\').value)','يحتوي الباركود على رقم البطاقة التموينية فقط','حفظ PDF','حفظ الوجه والظهر','localStorage'
]) need(ration, marker, 'ration-card.html');

const mawkib = read('mawkib-cards.html');
for (const marker of ['85.6 × 54','qrcode_UTF8.js','موكب','اسم المسؤول','رقم الهاتف','حفظ PDF','طباعة','localStorage']) need(mawkib, marker, 'mawkib-cards.html');

const thanks = read('thanks-letter.html');
for (const marker of ['كتاب شكر وتقدير','الجهة المانحة','اسم المكرَّم','حفظ PDF','طباعة','localStorage','نموذج ذهبي رسمي']) need(thanks, marker, 'thanks-letter.html');

const envelopes = read('envelopes.html');
for (const marker of ['data-studio-mode="envelope"','design-studio-runtime.js','envelope-agreement-runtime.js']) need(envelopes, marker, 'envelopes.html');
const envelopeAgreement = read('envelope-agreement-runtime.js');
for (const marker of ['التاريخ:','اليوم:','ورق A5 — غلاف فقط','ورق A4 — غلاف فقط','ليست أظرفًا قياسية','DesignStudio.addText','__ABU_ENVELOPE_AGREEMENT_V1__']) need(envelopeAgreement, marker, 'envelope-agreement-runtime.js');

for (const file of ['feature-recovery-runtime.js','envelope-agreement-runtime.js']) {
  try { new vm.Script(read(file), { filename: file }); }
  catch (error) { errors.push(`${file}: ${error.message}`); }
}
for (const file of ['card-templates.html','ration-card.html','mawkib-cards.html','thanks-letter.html']) {
  const source = read(file);
  const scripts = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match, index = 0;
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
process.stdout.write('Latest UX/features checks passed (native touch, hidden bottom dock, lowered header controls, and agreed tools grouped inside Barcode & Cards only).\n');
