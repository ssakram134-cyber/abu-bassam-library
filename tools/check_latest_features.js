const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const errors = [];
const read = (name) => fs.readFileSync(path.join(web, name), 'utf8');
const need = (source, marker, label) => { if (!source.includes(marker)) errors.push(`${label}: missing ${marker}`); };
const forbid = (source, marker, label) => { if (source.includes(marker)) errors.push(`${label}: forbidden ${marker}`); };

for (const file of ['feature-recovery-runtime.js','card-templates-v2.html','card-template-library.js','ration-card.html','mawkib-cards.html','thanks-letter.html','envelopes.html','envelope-agreement-runtime.js','questions-paper-runtime.js','questions-gesture-runtime.js','productivity-tools-runtime.js']) {
  if (!fs.existsSync(path.join(web, file))) errors.push(`Missing latest feature asset: ${file}`);
}

const device = read('device-name-runtime.js');
forbid(device, 'global-flex-runtime.js', 'device-name-runtime.js');
forbid(device, 'loadGlobalFlex', 'device-name-runtime.js');
need(device, 'feature-recovery-runtime.js', 'device-name-runtime.js');

const gestures = read('questions-gesture-runtime.js');
need(gestures, '__ABU_QUESTION_GESTURES_DISABLED__', 'questions-gesture-runtime.js');
need(gestures, 'restoreNativeTouch', 'questions-gesture-runtime.js');
for (const marker of ['touchstart','touchmove','pointerdown','pointermove','abuScale','abuMoveX','abuMoveY']) forbid(gestures, marker, 'questions-gesture-runtime.js');

const paper = read('questions-paper-runtime.js');
for (const marker of ['A4P','A4L','A5P','A5L','custom','mm','cm','questions-template-tools-runtime.js']) need(paper, marker, 'questions-paper-runtime.js');
forbid(paper, 'questions-gesture-runtime.js', 'questions-paper-runtime.js');
forbid(paper, 'loadGestureRuntime', 'questions-paper-runtime.js');

const productivity = read('productivity-tools-runtime.js');
for (const marker of ['prodModeQuestions','prodPaneQuestions','prodModeCertificate','prodPaneCertificate','questions-ar.html','certificates.html']) need(productivity, marker, 'productivity-tools-runtime.js');
for (const marker of ['prodModeEnvelope','prodPaneEnvelope','envelopeFrame','src="envelopes.html"',"'envelope'"]) forbid(productivity, marker, 'productivity-tools-runtime.js');

const recovery = read('feature-recovery-runtime.js');
for (const marker of [
  '#abuControlDock','.abu-control-dock','.top-actions{top:76px','.top-actions .icon-btn,.top-actions button{width:52px','font-size:24px','abuCardsTemplatesBtn',
  'card-templates-v2.html','applyRequestedTemplate','#cardsCenter .cs-photo-actions{display:grid!important','grid-template-columns:repeat(2,minmax(0,1fr))!important',
  '#cardsCenter .cs-type{min-height:84px','overflow-wrap:anywhere!important',
  "addCardTool(types,'ration'","addCardTool(types,'mawkib'","addCardTool(types,'envelope'","addCardTool(types,'thanks'",
  'ration-card.html','mawkib-cards.html','envelopes.html','thanks-letter.html','recoveryMessage'
]) need(recovery, marker, 'feature-recovery-runtime.js');
for (const marker of ["b.id='tabEnvelopes'","b.id='tabThanks'","p.id='prodPaneThanks'"]) forbid(recovery, marker, 'feature-recovery-runtime.js');

const catalog = read('card-templates-v2.html');
for (const marker of ['جميع النماذج المتفق عليها','card-template-library.js','النصوص الطويلة تلتف','class="model"','openRoute']) need(catalog, marker, 'card-templates-v2.html');
const legacyCatalog = read('card-templates.html');
need(legacyCatalog, 'card-templates-v2.html', 'card-templates.html');

const library = read('card-template-library.js');
for (const marker of ['AbuBassamCardTemplateLibrary','الباج التعريفي','باج الروضة والمدرسة','البطاقة التموينية','كروت المواكب الحسينية','صناعة الظرف / غلاف الأسئلة','كتاب الشكر والتقدير','env-9','t10']) need(library, marker, 'card-template-library.js');
const groupCount = id => { const m=library.match(new RegExp(`id:'${id}'[\\s\\S]*?models:\\[([\\s\\S]*?)\\]`)); return m ? (m[1].match(/\{id:/g)||[]).length : 0; };
if (groupCount('ration') !== 10) errors.push(`ration templates: expected 10, got ${groupCount('ration')}`);
if (groupCount('mawkib') !== 4) errors.push(`mawkib templates: expected 4, got ${groupCount('mawkib')}`);
if (groupCount('envelope') !== 9) errors.push(`envelope templates: expected 9, got ${groupCount('envelope')}`);
if (groupCount('thanks') !== 6) errors.push(`thanks templates: expected 6, got ${groupCount('thanks')}`);

const ration = read('ration-card.html');
for (const marker of ['البطاقة التموينية','اسم رب العائلة','رقم البطاقة التموينية','ملاحظة أسفل الكارت','85.6 × 54','CR80 — كارت مباشر','A4 — الوجه والظهر','value="t10"',"renderQr(q('rationNumber').value)",'يحتوي الباركود على رقم البطاقة التموينية فقط','حفظ PDF','حفظ الوجه والظهر','localStorage']) need(ration, marker, 'ration-card.html');
const mawkib = read('mawkib-cards.html');
for (const marker of ['85.6 × 54','qrcode_UTF8.js','موكب','اسم المسؤول','رقم الهاتف','حفظ PDF','طباعة','localStorage']) need(mawkib, marker, 'mawkib-cards.html');
const thanks = read('thanks-letter.html');
for (const marker of ['كتاب شكر وتقدير','الجهة المانحة','اسم المكرَّم','حفظ PDF','طباعة','localStorage','نموذج ذهبي رسمي']) need(thanks, marker, 'thanks-letter.html');
const envelopes = read('envelopes.html');
for (const marker of ['data-studio-mode="envelope"','design-studio-runtime.js','envelope-agreement-runtime.js']) need(envelopes, marker, 'envelopes.html');
const envelopeAgreement = read('envelope-agreement-runtime.js');
for (const marker of ['التاريخ:','اليوم:','ورق A5 — غلاف فقط','ورق A4 — غلاف فقط','ليست أظرفًا قياسية','DesignStudio.addText','__ABU_ENVELOPE_AGREEMENT_V1__']) need(envelopeAgreement, marker, 'envelope-agreement-runtime.js');

for (const file of ['feature-recovery-runtime.js','envelope-agreement-runtime.js','card-template-library.js','questions-paper-runtime.js','questions-gesture-runtime.js','productivity-tools-runtime.js','device-name-runtime.js']) {
  try { new vm.Script(read(file), { filename: file }); }
  catch (error) { errors.push(`${file}: ${error.message}`); }
}
for (const file of ['card-templates-v2.html','card-templates.html','ration-card.html','mawkib-cards.html','thanks-letter.html']) {
  const source = read(file); const scripts = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi; let match, index = 0;
  while ((match = scripts.exec(source))) { index += 1; if (!match[1].trim()) continue; try { new vm.Script(match[1], { filename: `${file}#${index}` }); } catch (error) { errors.push(`${file} inline script ${index}: ${error.message}`); } }
}

if (errors.length) { process.stderr.write(errors.join('\n') + '\n'); process.exit(1); }
process.stdout.write('Canonical audit checks passed: native question touch, no flex loader, envelopes/thanks grouped in Barcode & Cards, complete templates catalog, non-overlapping mobile controls, ration/Mawkib/thanks/envelope assets verified.\n');
