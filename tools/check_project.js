const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const required = [
  'index.html',
  'residence-card.html',
  'cards-studio-runtime.js',
  'national-id-runtime.js',
  'document-vault-runtime.js',
  'app-settings-runtime.js',
  'typography-runtime.js',
  'secure-sync-runtime.js',
  'device-name-runtime.js',
  'global-flex-runtime.js',
  'productivity-tools-runtime.js',
  'questions-templates-runtime.js',
  'questions-template-tools-runtime.js',
  'questions-paper-runtime.js',
  'questions-gesture-runtime.js',
  'design-studio-runtime.js',
  'envelopes.html',
  'certificates.html',
  'questions-ar.html',
  'questions-en.html',
  'image-compressor.html',
  'supabase-2.58.0.js',
  'qrcode.js',
  'jszip.min.js',
  'fonts/Cairo-Regular.ttf',
  'fonts/Cairo-Bold.ttf',
  'fonts/Tajawal-Regular.ttf',
  'fonts/Tajawal-Bold.ttf',
];

const errors = [];
for (const relative of required) {
  if (!fs.existsSync(path.join(web, relative))) errors.push(`Missing web asset: ${relative}`);
}

for (const filename of fs.readdirSync(web).filter((name) => name.endsWith('.js'))) {
  const source = fs.readFileSync(path.join(web, filename), 'utf8');
  try {
    new vm.Script(source, { filename });
  } catch (error) {
    errors.push(`${filename}: ${error.message}`);
  }
}

for (const filename of ['index.html', 'residence-card.html', 'questions-ar.html', 'questions-en.html', 'image-compressor.html', 'envelopes.html', 'certificates.html']) {
  const source = fs.readFileSync(path.join(web, filename), 'utf8');
  const scripts = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;
  while ((match = scripts.exec(source))) {
    index += 1;
    if (!match[1].trim()) continue;
    try {
      new vm.Script(match[1], { filename: `${filename}#${index}` });
    } catch (error) {
      errors.push(`${filename} script ${index}: ${error.message}`);
    }
  }
}

const indexHtml = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
for (const reference of ['supabase-2.58.0.js', 'secure-sync-runtime.js', 'device-name-runtime.js', 'productivity-tools-runtime.js']) {
  if (!indexHtml.includes(`src="${reference}"`)) errors.push(`index.html does not load ${reference}`);
}

const deviceRuntime = fs.readFileSync(path.join(web, 'device-name-runtime.js'), 'utf8');
for (const marker of ['global-flex-runtime.js', 'abuGlobalFlexRuntime', 'loadGlobalFlex']) {
  if (!deviceRuntime.includes(marker)) errors.push(`Missing global-flex loader marker: ${marker}`);
}

const globalFlex = fs.readFileSync(path.join(web, 'global-flex-runtime.js'), 'utf8');
for (const marker of [
  'abuGlobalFlexSettingsV1','abuGlobalFlexZoomMapV1','MIN_ZOOM','MAX_ZOOM',
  'touchstart','touchmove','pointerdown','pointermove','wheelZoom','scrollIntoView',
  '✥ تحريك','إصبعان للتكبير والتصغير','scanFrames','global-flex-runtime.js',
  '.preview','.nat-stage','.cs-preview-wrap','.v-view','.productivity-frame-wrap','.ds-stage',
  '@media print','abu-flex-has-zoom','abuFlexSensitivity'
]) {
  if (!globalFlex.includes(marker)) errors.push(`Missing global-flex marker: ${marker}`);
}

const nationalRuntime = fs.readFileSync(path.join(web, 'national-id-runtime.js'), 'utf8');
for (const marker of ['tabQuestions', 'tabCompressor', "switchTab('questions')", "switchTab('compressor')"]) {
  if (!nationalRuntime.includes(marker)) errors.push(`Missing productivity tab marker: ${marker}`);
}

const productivityRuntime = fs.readFileSync(path.join(web, 'productivity-tools-runtime.js'), 'utf8');
for (const marker of [
  'questions-ar.html', 'questions-en.html', 'image-compressor.html',
  'envelopes.html', 'certificates.html', 'questions-templates-runtime.js', 'questions-paper-runtime.js',
  'abuPrintQuestion', 'abuSaveQuestionPdf', 'abuCompressionReady',
  'abuDesignPrint', 'abuDesignPdf', 'abuDesignSaveImage',
  'prodModeEnvelope', 'prodModeCertificate'
]) {
  if (!productivityRuntime.includes(marker)) errors.push(`Missing productivity integration marker: ${marker}`);
}

const questionTemplates = fs.readFileSync(path.join(web, 'questions-templates-runtime.js'), 'utf8');
for (const marker of [
  'math1-','makeScienceTemplate(3','makeScienceTemplate(4','islamic-',
  'نماذج خاصة بالمادة','نماذج عامة','قوالب الأسئلة',
  'أتعلم — ٢ درجة','أتأكد — ٢ درجة','أتحدث — ٢ درجة','أحل — ٢ درجة','أفكر — ٢ درجة',
  'الحفظ — ٢ درجة','الحديث الشريف — ٢ درجة','التلاوة — ٢ درجة','العقائد والعبادات — ١ درجة','المعاني — ١ درجة','السيرة — ١ درجة','الآداب الإسلامية — ١ درجة',
  'abuQuestionHeaderProfileV1','abuQuestionCustomTemplatesV1','MutationObserver',
  'استبدال','قص حر','قفل/فتح','للأمام','للخلف','redo'
]) {
  if (!questionTemplates.includes(marker)) errors.push(`Missing question-template marker: ${marker}`);
}
if (!questionTemplates.includes('Array.from({length:3}') || !questionTemplates.includes('makeMathTemplate')) errors.push('Math grade-1 template count marker is missing');
if (!questionTemplates.includes('Array.from({length:10},(_,i)=>makeScienceTemplate(4,i))')) errors.push('Science grade-4 ten-template marker is missing');
if (!questionTemplates.includes('Array.from({length:10},(_,i)=>makeIslamicTemplate(i))')) errors.push('Islamic ten-template marker is missing');

const questionPaper = fs.readFileSync(path.join(web, 'questions-paper-runtime.js'), 'utf8');
for (const marker of ['A4P','A4L','A5P','A5L','مخصص','abuQuestionPaperSettingsV1','@page','ملم','سم','questions-gesture-runtime.js','abuQuestionGestureExternal']) {
  if (!questionPaper.includes(marker)) errors.push(`Missing question-paper marker: ${marker}`);
}

const questionGestures = fs.readFileSync(path.join(web, 'questions-gesture-runtime.js'), 'utf8');
for (const marker of [
  'abuQuestionCanvasZoomV1','MIN_PAPER_ZOOM','MAX_PAPER_ZOOM','MIN_QUESTION_SCALE','MAX_QUESTION_SCALE',
  'touchstart','touchmove','pointerdown','pointermove','abuMoveX','abuMoveY','abuScale',
  '✥ نقل','إصبعان على الورقة','scrollIntoView','abu-question-move-mode','@media print'
]) {
  if (!questionGestures.includes(marker)) errors.push(`Missing question-gesture marker: ${marker}`);
}

const designStudio = fs.readFileSync(path.join(web, 'design-studio-runtime.js'), 'utf8');
for (const marker of [
  'ENVELOPE_PRESETS','CERT_PRESETS','225x115','DL —','C6 —','#10 —',
  'Array.from({length:10','Array.from({length:9',
  'صناعة الظرف / غلاف الأسئلة','شهادات التقدير','إضافة نماذج',
  'الوحدة','ملم','سم','saveAsTemplate','applyCrop','replaceImage','front','back','lock',
  'abuDesignPrint','abuDesignPdf','abuDesignSaveImage'
]) {
  if (!designStudio.includes(marker)) errors.push(`Missing design-studio marker: ${marker}`);
}

const envelopesPage = fs.readFileSync(path.join(web, 'envelopes.html'), 'utf8');
const certificatesPage = fs.readFileSync(path.join(web, 'certificates.html'), 'utf8');
if (!envelopesPage.includes('data-studio-mode="envelope"') || !envelopesPage.includes('design-studio-runtime.js')) errors.push('Envelope studio page is not wired');
if (!certificatesPage.includes('data-studio-mode="certificate"') || !certificatesPage.includes('design-studio-runtime.js')) errors.push('Certificate studio page is not wired');

const localToolPages = ['questions-ar.html', 'questions-en.html', 'image-compressor.html', 'envelopes.html', 'certificates.html'];
for (const filename of localToolPages) {
  const source = fs.readFileSync(path.join(web, filename), 'utf8');
  if (/(?:src|href)\s*=\s*["']https?:\/\//i.test(source) || /url\(\s*["']?https?:\/\//i.test(source)) {
    errors.push(`${filename} still depends on an external URL`);
  }
}

const arabicQuestions = fs.readFileSync(path.join(web, 'questions-ar.html'), 'utf8');
const englishQuestions = fs.readFileSync(path.join(web, 'questions-en.html'), 'utf8');
const compressor = fs.readFileSync(path.join(web, 'image-compressor.html'), 'utf8');
if (!arabicQuestions.includes('abuBassamQuestionDraftArabicV1')) errors.push('Arabic question draft persistence is missing');
if (!englishQuestions.includes('abuBassamQuestionDraftEnglishV1')) errors.push('English question draft persistence is missing');
for (const marker of ['multiple accept="image/*"', 'MAX_FILES = 20', 'abuCompressionReady']) {
  if (!compressor.includes(marker)) errors.push(`Image compressor marker is missing: ${marker}`);
}

const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
for (const marker of ['كل بند تم تدقيقه','تم ✅','ناقص ⚠️','غير موجود ❌','يحتاج تحقق 🔍','التكبير والتصغير','جميع أقسام البرنامج']) {
  if (!agents.includes(marker)) errors.push(`Missing mandatory audit/flex rule in AGENTS.md: ${marker}`);
}

const firstSupabase = indexHtml.indexOf('supabase-2.58.0.js');
const secureSync = indexHtml.indexOf('secure-sync-runtime.js');
if (firstSupabase < 0 || secureSync < firstSupabase) errors.push('Supabase must load before secure-sync-runtime.js');

const projectText = fs.readdirSync(web)
  .filter((name) => /\.(?:html|js)$/i.test(name) && name !== 'supabase-2.58.0.js')
  .map((name) => fs.readFileSync(path.join(web, name), 'utf8'))
  .join('\n');
for (const forbidden of ['api.telegram.org/bot', 'service_role', 'sb_secret_', 'BEGIN ' + 'PRIVATE KEY']) {
  if (projectText.includes(forbidden)) errors.push(`Forbidden secret/sender marker found: ${forbidden}`);
}
if (/\/rest\/v1\/abu_bassam_sync(?:\?|['"])/.test(projectText)) errors.push('Legacy anonymous sync endpoint is still referenced');
if (/Ahmed Hassan|أحمد حسن|facebook\.com/i.test(projectText)) errors.push('Project contains the previous author or social link');
if (!projectText.includes('أكرم حاتم الغزالي') && !projectText.includes('Akram Hatem Al-Ghazali')) errors.push('Approved programmer identity is missing');

const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
if (app.android.package !== 'com.abubassam.librarycamera3') errors.push('Unexpected Android package');
if (app.version !== '4.3.2' || app.android.versionCode !== 432) errors.push('Unexpected version metadata');

if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`Project checks passed (${required.length} required assets, global flex, question templates, paper sizes, gestures, envelopes and certificates).\n`);
