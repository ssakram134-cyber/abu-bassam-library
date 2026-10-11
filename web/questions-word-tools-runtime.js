(function () {
  'use strict';
  if (window.__ABU_QUESTION_WORD_TOOLS_V1__) return;
  window.__ABU_QUESTION_WORD_TOOLS_V1__ = true;

  var MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  var ar = document.documentElement.lang !== 'en';
  var saveBusy = false;
  var EXPECTED_KEY = 'abuQuestionExpectedTotalV1_' + (ar ? 'ar' : 'en');
  var zipPromise = null;
  var docIndex = 0;
  var $ = function (id) { return document.getElementById(id); };
  function xml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    });
  }
  function textOf(node) {
    return node ? String(node.innerText || node.textContent || '').replace(/\u00a0/g, ' ').replace(/\r/g, '').trim() : '';
  }
  function plain(value) {
    return String(value || '').normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function questionNodes() { return Array.from(document.querySelectorAll('#pages-container .question-container')); }
  function gradeOf(q) {
    var raw = q.getAttribute('data-abu-grade');
    return raw !== null && raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0 && Number(raw) <= 1000 ? Number(raw) : null;
  }
  function addGrade(q) {
    if (q.querySelector('.abu-question-grade')) return;
    var box = document.createElement('label');
    box.className = 'abu-question-grade';
    box.textContent = ar ? 'الدرجة: ' : 'Marks: ';
    var input = document.createElement('input');
    input.type = 'number'; input.min = '0'; input.max = '1000'; input.step = '0.5';
    input.placeholder = ar ? 'غير محددة' : 'Unset';
    input.value = q.getAttribute('data-abu-grade') || '';
    input.setAttribute('value', input.value);
    input.setAttribute('aria-label', ar ? 'درجة السؤال' : 'Question marks');
    input.addEventListener('change', function () {
      var raw = input.value.trim(), val = Number(raw);
      if (raw && (!Number.isFinite(val) || val < 0 || val > 1000)) {
        alert(ar ? 'أدخل درجة من صفر إلى 1000' : 'Enter marks from 0 to 1000');
        input.value = q.getAttribute('data-abu-grade') || ''; return;
      }
      if (raw) q.setAttribute('data-abu-grade', String(val));
      else q.removeAttribute('data-abu-grade');
      input.setAttribute('value', input.value);
      if (typeof window.scheduleQuestionDraft === 'function') window.scheduleQuestionDraft();
    });
    box.appendChild(input);
    var level = document.createElement('select');
    level.setAttribute('aria-label', ar ? 'صعوبة السؤال' : 'Question difficulty');
    var values = ['', 'easy', 'medium', 'hard'];
    var labels = ar ? ['الصعوبة', 'سهل', 'متوسط', 'صعب'] : ['Difficulty', 'Easy', 'Medium', 'Hard'];
    values.forEach(function (v, i) {
      var option = document.createElement('option');
      option.value = v; option.textContent = labels[i]; level.appendChild(option);
    });
    level.value = q.getAttribute('data-abu-difficulty') || '';
    level.onchange = function () {
      if (level.value) q.setAttribute('data-abu-difficulty', level.value);
      else q.removeAttribute('data-abu-difficulty');
      if (typeof window.scheduleQuestionDraft === 'function') window.scheduleQuestionDraft();
    };
    box.appendChild(level);
    q.appendChild(box);
  }
  function ensureGrades() { questionNodes().forEach(addGrade); }

  function collect(includeAnswers) {
    var questions = questionNodes().map(function (q, i) {
      return {
        number: i + 1,
        title: textOf(q.querySelector('.q-title')),
        body: textOf(q.querySelector('.text-area')),
        answer: textOf(q.querySelector('.abu-answer-box [contenteditable]')),
        grade: gradeOf(q),
        difficulty: q.getAttribute('data-abu-difficulty') || '',
        images: Array.from(q.querySelectorAll('.text-area img, .draggable-item img')).map(function (img) {
          return String(img.getAttribute('src') || '');
        })
      };
    });
    var first = document.querySelector('#pages-container .a4-page .header');
    var header = first ? textOf(first) : '';
    var seen = new Map(), duplicates = [], missing = [], unanswered = [], skippedImages = 0;
    questions.forEach(function (q) {
      var key = plain(q.title.replace(/^(س|q)\s*\d+\s*[/\-.:]?\s*/i, '') + '\n' + q.body);
      if (key.length > 16) {
        if (seen.has(key)) duplicates.push([seen.get(key), q.number]);
        else seen.set(key, q.number);
      }
      if (!q.title || !q.body) missing.push(q.number);
      if (includeAnswers && (!q.answer || /^(اكتب الإجابة|write the answer)/i.test(q.answer))) unanswered.push(q.number);
      q.images.forEach(function (url) { if (!/^data:image\/(png|jpeg);base64,/i.test(url) || url.length > 8000040) skippedImages++; });
    });
    skippedImages += Array.from(document.querySelectorAll('#pages-container .draggable-item img')).filter(function (img) { return !img.closest('.question-container'); }).length;
    return {
      questions: questions, header: header, duplicates: duplicates, missing: missing,
      unanswered: unanswered, skippedImages: skippedImages,
      graded: questions.filter(function (q) { return q.grade !== null; }).length,
      total: questions.reduce(function (n, q) { return n + (q.grade || 0); }, 0),
      overflow: document.querySelectorAll('.abu-question-overflow').length
    };
  }
  function expectedGrade() {
    try {
      var value = localStorage.getItem(EXPECTED_KEY);
      if (value === null || value === '') return null;
      var n = Number(value);
      return Number.isFinite(n) && n >= 0 && n <= 10000 ? n : null;
    } catch (_) { return null; }
  }
  function setExpectedGrade() {
    var old = expectedGrade();
    var value = prompt(ar ? 'الدرجة النهائية المطلوبة (اتركه فارغاً لإلغاء المقارنة)' : 'Expected final marks (clear to disable)',
      old === null ? '100' : String(old));
    if (value === null) return;
    var raw = value.trim(), num = Number(raw);
    if (raw && (!Number.isFinite(num) || num < 0 || num > 10000)) return alert(ar ? 'الدرجة النهائية غير صالحة' : 'Invalid final marks');
    try {
      if (raw) localStorage.setItem(EXPECTED_KEY, String(num));
      else localStorage.removeItem(EXPECTED_KEY);
    } catch (error) { return alert(ar ? 'تعذر حفظ الدرجة النهائية' : 'Could not save final marks'); }
    report();
  }
  function report() {
    ensureGrades();
    var r = collect(true), lines = [
      (ar ? 'عدد الأسئلة: ' : 'Questions: ') + r.questions.length,
      (ar ? 'الدرجات المحددة: ' : 'Marks assigned: ') + r.graded + '/' + r.questions.length,
      (ar ? 'مجموع الدرجات المحددة: ' : 'Assigned marks total: ') + r.total,
      (ar ? 'الأسئلة المحتملة التكرار: ' : 'Likely duplicates: ') + (r.duplicates.map(function (p) { return p.join(' ↔ '); }).join('، ') || (ar ? 'لا يوجد' : 'none')),
      (ar ? 'أسئلة ناقصة النص: ' : 'Questions missing text: ') + (r.missing.join('، ') || (ar ? 'لا يوجد' : 'none')),
      (ar ? 'إجابات غير مدخلة: ' : 'Missing model answers: ') + (r.unanswered.join('، ') || (ar ? 'لا يوجد' : 'none')),
      (ar ? 'صفحات تتجاوز حدود الورقة: ' : 'Overflow pages: ') + r.overflow
    ];
    var expected = expectedGrade();
    if (expected !== null) {
      lines.push((ar ? 'الدرجة النهائية المطلوبة: ' : 'Expected final marks: ') + expected);
      if (r.graded !== r.questions.length)
        lines.push(ar ? '⚠ درجات بعض الأسئلة غير محددة؛ المجموع غير مكتمل.' : '⚠ Some marks are unset.');
      else if (Math.abs(r.total - expected) > 0.001)
        lines.push((ar ? '⚠ اختلاف المجموع بمقدار ' : '⚠ Mark difference: ') + (r.total - expected));
      else lines.push(ar ? '✓ مجموع الدرجات مطابق.' : '✓ Marks match.');
    }
    alert(lines.join('\n'));
    return r;
  }
  function paragraph(value, bold, dir) {
    var lines = String(value || '').split(/\n/);
    return lines.map(function (line) {
      return '<w:p><w:pPr>' + (dir ? '<w:bidi/>' : '') + '<w:spacing w:after="120"/></w:pPr><w:r><w:rPr>' +
        (bold ? '<w:b/>' : '') + '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>' +
        '<w:sz w:val="' + (bold ? 27 : 23) + '"/></w:rPr><w:t xml:space="preserve">' +
        xml(line) + '</w:t></w:r></w:p>';
    }).join('');
  }
  function drawing(id, rid, width, height) {
    var max = 4200000, cx = Math.max(1, Number(width) || 800), cy = Math.max(1, Number(height) || 600);
    var scale = Math.min(1, max / cx), w = Math.round(cx * scale * 9525), h = Math.round(cy * scale * 9525);
    return '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
      '<wp:extent cx="' + w + '" cy="' + h + '"/><wp:docPr id="' + id + '" name="Question image ' + id + '"/>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + id + '" name="Image ' + id + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + w + '" cy="' + h + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>' +
      '</wp:inline></w:drawing></w:r></w:p>';
  }
  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (zipPromise) return zipPromise;
    zipPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'jszip.min.js';
      script.onload = function () { if (window.JSZip) resolve(window.JSZip); else reject(new Error('JSZip unavailable')); };
      script.onerror = function () { reject(new Error('Local DOCX engine unavailable')); };
      document.head.appendChild(script);
    }).catch(function (e) { zipPromise = null; throw e; });
    return zipPromise;
  }
  async function createDocx(r, includeAnswers, variantLabel) {
    var JSZip = await loadZip(), zip = new JSZip(), rels = [
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    ];
    var body = paragraph(r.header, true, ar);
    body += paragraph(includeAnswers ? (ar ? 'الأسئلة مع الإجابات النموذجية' : 'Questions with model answers') :
      (ar ? 'ورقة الأسئلة' : 'Questions only') + (variantLabel ? ' — ' + variantLabel : ''), true, ar);
    var mediaCount = 0;
    for (var qi = 0; qi < r.questions.length; qi++) {
      var q = r.questions[qi];
      body += paragraph(q.title || ((ar ? 'السؤال ' : 'Question ') + q.number), true, ar);
      if (q.body) body += paragraph(q.body, false, ar);
      if (q.grade !== null) body += paragraph((ar ? 'الدرجة: ' : 'Marks: ') + q.grade, false, ar);
      if (q.difficulty) body += paragraph((ar ? 'مستوى الصعوبة: ' : 'Difficulty: ') + ({easy:ar?'سهل':'Easy',medium:ar?'متوسط':'Medium',hard:ar?'صعب':'Hard'}[q.difficulty]||q.difficulty), false, ar);
      for (var ii = 0; ii < q.images.length; ii++) {
        var match = /^data:image\/(png|jpeg);base64,([a-z0-9+/=]+)$/i.exec(q.images[ii]);
        if (!match || match[2].length > 8000000) continue;
        mediaCount++;
        var ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : 'png';
        var name = 'question-' + mediaCount + '.' + ext, rid = 'rIdImage' + mediaCount;
        zip.file('word/media/' + name, match[2], { base64: true });
        rels.push('<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + name + '"/>');
        body += drawing(mediaCount, rid, 440, 320);
      }
      if (includeAnswers) body += paragraph((ar ? 'الإجابة النموذجية: ' : 'Model answer: ') + (q.answer || '—'), false, ar);
    }
    if (includeAnswers) {
      body += paragraph(ar ? 'مفتاح الإجابة' : 'Answer key', true, ar);
      r.questions.forEach(function (q) {
        body += paragraph(q.number + '. ' + (q.answer || '—'), false, ar);
      });
    }
    if (r.graded) body += paragraph((ar ? 'مجموع الدرجات المحددة: ' : 'Assigned marks total: ') + r.total, true, ar);
    var size = (window.AbuQuestionPaper && window.AbuQuestionPaper.state && window.AbuQuestionPaper.state()) || { w: 210, h: 297 };
    var w = Math.round((size.w || 210) / 25.4 * 1440), h = Math.round((size.h || 297) / 25.4 * 1440);
    body += '<w:sectPr><w:pgSz w:w="' + w + '" w:h="' + h + '"/><w:pgMar w:top="700" w:bottom="700" w:left="700" w:right="700"/></w:sectPr>';
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="' + MIME + '.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join('') + '</Relationships>');
    zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>');
    zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' + body + '</w:body></w:document>');
    return zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }
  async function exportDocx(includeAnswers) {
    if (saveBusy) return;
    ensureGrades();
    var r = collect(includeAnswers);
    if (!r.questions.length) return alert(ar ? 'أضف سؤالاً أولاً' : 'Add a question first');
    if (r.missing.length && !confirm((ar ? 'يوجد سؤال ناقص النص، هل تريد المتابعة؟ ' : 'Some questions lack text. Continue? ') + r.missing.join(', '))) return;
    if (r.skippedImages && !confirm(ar ? 'هناك صور خارج نص السؤال أو غير مدعومة في Word ولن تظهر في الملف. هل تتابع دونها؟' : 'Some floating or unsupported images will be omitted from Word. Continue?')) return;
    var expected = expectedGrade();if(expected!==null&&(r.graded!==r.questions.length||Math.abs(r.total-expected)>0.001)&&!confirm(ar?'تنبيه: مجموع الدرجات لا يطابق الدرجة النهائية أو توجد درجات غير محددة. هل تريد المتابعة؟':'Marks are missing or differ from final marks. Continue?'))return;
    saveBusy = true;
    var status = $('abuQuestionWordStatus');
    if (status) status.textContent = ar ? 'جاري تجهيز Word...' : 'Preparing Word...';
    try {
      var data = await createDocx(r, includeAnswers);
      if (data.length > 16 * 1024 * 1024) throw new Error(ar ? 'حجم Word يتجاوز الحد الآمن للحفظ' : 'DOCX exceeds the safe save limit');
      var name = 'Abu_Bassam_Questions_' + (ar ? 'AR' : 'EN') + (includeAnswers ? '_Answers_' : '_Student_') + Date.now() + '.docx';
      window.parent.postMessage({ type: 'abuSaveQuestionDocx', language: ar ? 'ar' : 'en',
        name: name, data: 'data:' + MIME + ';base64,' + data }, '*');
      if (status) status.textContent = ar ? 'أُرسل طلب الحفظ إلى التطبيق' : 'Save request sent to app';
    } catch (error) {
      if (status) status.textContent = ar ? 'تعذر إنشاء Word' : 'DOCX export failed';
      alert((ar ? 'تعذر إنشاء Word: ' : 'DOCX export failed: ') + (error.message || error));
    } finally { saveBusy = false; }
  }
  async function exportVariants() {
    if (saveBusy) return;
    ensureGrades();
    var r = collect(false);
    if (r.questions.length < 3) return alert(ar ? 'تتطلب نماذج أ، ب، ج ثلاثة أسئلة مختلفة على الأقل' : 'At least three questions are required for A/B/C models');
    var original = r.questions;
    var variants = [
      { name: 'A', items: original.slice() },
      { name: 'B', items: original.slice(1).concat(original.slice(0, 1)) },
      { name: 'C', items: original.slice().reverse() }
    ];
    saveBusy = true;
    var status = $('abuQuestionWordStatus');
    if (status) status.textContent = ar ? 'جاري إنشاء 3 نماذج امتحانية...' : 'Creating three exam models...';
    try {
      var Zip = await loadZip(), pack = new Zip();
      for (var i = 0; i < variants.length; i++) {
        var variant = variants[i];
        var items = variant.items.map(function (q, n) {
          var heading = String(q.title || '').replace(/^(س|q)\s*[0-9٠-٩۰-۹]+\s*[/:.\-]?\s*/i, '').trim();
          return Object.assign({}, q, { number: n + 1, title: (ar ? 'س' : 'Q') + (n + 1) + '/ ' + heading });
        });
        var base64 = await createDocx(Object.assign({}, r, { questions: items }), false,
          (ar ? 'نموذج ' : 'Model ') + variant.name);
        pack.file('Exam_Model_' + variant.name + '.docx', base64, { base64: true });
      }
      var data = await pack.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      if (data.length > 20 * 1024 * 1024) throw new Error(ar ? 'حجم النماذج يتجاوز الحد الآمن' : 'Models exceed the safe size limit');
      window.parent.postMessage({
        type: 'abuSaveQuestionVariants', language: ar ? 'ar' : 'en',
        name: 'Abu_Bassam_Exam_ABC_' + Date.now() + '.zip', data: 'data:application/zip;base64,' + data
      }, '*');
      if (status) status.textContent = ar ? 'أُرسل طلب حفظ نماذج أ، ب، ج' : 'A/B/C save request sent';
    } catch (error) {
      if (status) status.textContent = ar ? 'تعذر إنشاء النماذج' : 'Model export failed';
      alert((ar ? 'تعذر إنشاء النماذج: ' : 'Model export failed: ') + (error.message || error));
    } finally { saveBusy = false; }
  }
  function wordParagraphs(xmlSource) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xmlSource)) throw new Error(ar ? 'بنية XML غير آمنة' : 'Unsafe XML document');
    var parser = new DOMParser(), doc = parser.parseFromString(xmlSource, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error(ar ? 'تعذر قراءة نص Word' : 'Malformed Word XML');
    var wordNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    var paragraphs = Array.from(doc.getElementsByTagNameNS(wordNS, 'p')).slice(0, 250);
    return paragraphs.map(function (p) {
      return Array.from(p.getElementsByTagNameNS(wordNS, 't')).map(function (t) {
        return t.textContent || '';
      }).join('').trim();
    }).filter(Boolean);
  }
  function parseImportedQuestions(lines) {
    var heading = /^(?:س\s*[0-9٠-٩۰-۹]+|Q(?:uestion)?\s*[0-9]+)\s*[/):.\-]?\s*/i;
    var hasHeadings = lines.some(function (line) { return heading.test(line); });
    var result = [];
    lines.forEach(function (line) {
      if (hasHeadings) {
        if (heading.test(line) || !result.length) result.push({ title: line, body: '' });
        else result[result.length - 1].body += (result[result.length - 1].body ? '\n' : '') + line;
      } else result.push({ title: line, body: '' });
    });
    return result.slice(0, 30);
  }
  async function importDocx(file) {
    if (!file) return;
    if (!/\.docx$/i.test(file.name || '') || file.size > 6 * 1024 * 1024) {
      return alert(ar ? 'اختر ملف DOCX لا يتجاوز 6 ميغابايت' : 'Select a DOCX file smaller than 6 MB');
    }
    var status = $('abuQuestionWordStatus');
    try {
      if (status) status.textContent = ar ? 'جاري قراءة Word محلياً...' : 'Reading Word locally...';
      var Zip = await loadZip(), archive = await Zip.loadAsync(await file.arrayBuffer());
      var docPart = archive.file('word/document.xml');
      if (!docPart) throw new Error(ar ? 'لا يوجد نص Word صالح' : 'Missing Word document content');
      var declaredSize = Number(docPart._data && docPart._data.uncompressedSize);
      if (!Number.isFinite(declaredSize) || declaredSize < 0 || declaredSize > 2 * 1024 * 1024) throw new Error(ar ? 'حجم XML الداخلي غير آمن' : 'Unsafe uncompressed Word XML size');
      var xmlText = await docPart.async('string');
      if (xmlText.length > 2 * 1024 * 1024) throw new Error(ar ? 'نص Word أكبر من الحد الآمن' : 'Word text exceeds safe limit');
      var allLines = wordParagraphs(xmlText);
      var groups = parseImportedQuestions(allLines);
      if (!groups.length) throw new Error(ar ? 'لم يتم العثور على أسئلة نصية' : 'No text questions found');
      var template = document.querySelector('#pages-container .question-container');
      var area = document.querySelector('#pages-container .a4-page:last-of-type .questions-area') ||
        document.querySelector('#pages-container .questions-area');
      if (!template || !area) throw new Error(ar ? 'محرر الأسئلة غير جاهز' : 'Question editor not ready');
      var notice = (ar ? 'تم استخراج ' : 'Found ') + groups.length + (ar ? ' سؤالاً محتملاً.' : ' potential questions.') +
        (allLines.length > 250 || groups.length >= 30 ? (ar ? '\nسيُستورد أول 30 سؤالاً كحد أقصى.' : '\nAt most 30 questions will be imported.') : '') +
        (ar ? '\nقد تحتاج الأسئلة إلى تقسيم وتصحيح يدوي. لن تُستورد الصور والجداول والمعادلات. هل تضيف النصوص إلى الورقة الحالية؟' :
          '\nReview and split imported text manually. Images, tables and formulas are excluded. Add to current sheet?');
      if (!confirm(notice)) { if (status) status.textContent = ''; return; }
      try { window.saveState && window.saveState(); } catch (_) {}
      groups.forEach(function (item, index) {
        var clone = template.cloneNode(true);
        clone.removeAttribute('data-abu-grade');
        clone.removeAttribute('data-abu-difficulty');
        clone.querySelector('.abu-question-grade')?.remove();
        clone.querySelectorAll('.draggable-item').forEach(function (e) { e.remove(); });
        var title = clone.querySelector('.q-title'), body = clone.querySelector('.text-area');
        if (title) title.textContent = item.title || ((ar ? 'السؤال ' : 'Question ') + (index + 1));
        if (body) body.textContent = item.body || (ar ? 'أكمل تحرير السؤال هنا.' : 'Complete question here.');
        var answer = clone.querySelector('.abu-answer-box [contenteditable]');
        if (answer) answer.textContent = '';
        area.appendChild(clone);
      });
      window.AbuQuestionCompletion?.ensureAnswers?.();
      window.AbuQuestionCompletion?.rebind?.();
      window.AbuQuestionTypes?.enhance?.();
      window.checkAutoFlow?.();
      window.scheduleQuestionDraft?.();
      if (status) status.textContent = ar ? 'تمت إضافة الأسئلة للنموذج الحالي، راجعها ثم احفظ.' : 'Questions added. Review and save.';
    } catch (error) {
      if (status) status.textContent = ar ? 'فشل استيراد Word' : 'Word import failed';
      alert((ar ? 'تعذر استيراد Word: ' : 'Word import failed: ') + (error.message || error));
    }
  }
  function boot() {
    var bar = $('controls'), pages = $('pages-container');
    if (!bar || !pages) return;
    if (!$('abuQuestionWordStyle')) {
      var style = document.createElement('style');
      style.id = 'abuQuestionWordStyle';
      style.textContent = '.abu-question-grade{display:flex;align-items:center;gap:4px;padding:3px 7px;font-size:12px;color:#334155}.abu-question-grade input{width:85px;max-width:100%;min-height:32px;border:1px solid #94a3b8;border-radius:6px;font-size:13px}.abu-question-grade select{min-height:32px;border:1px solid #94a3b8;border-radius:6px;background:white;font-size:12px}.abu-word-btn{background:#1d6f42!important;color:white!important}.abu-word-audit{background:#475569!important;color:white!important}#abuQuestionWordStatus{font-size:10px;margin:4px;color:#064e3b}@media print{.abu-question-grade{display:none!important}}';
      document.head.appendChild(style);
    }
    if (!$('abuQuestionWordStudent')) {
      var b = document.createElement('button');
      b.type = 'button'; b.id = 'abuQuestionWordStudent'; b.className = 'btn abu-word-btn';
      b.textContent = ar ? '📝 Word أسئلة' : '📝 Word Questions';
      b.onclick = function () { exportDocx(false); }; bar.appendChild(b);
      var a = document.createElement('button');
      a.type = 'button'; a.id = 'abuQuestionWordAnswer'; a.className = 'btn abu-word-btn';
      a.textContent = ar ? '📘 Word مع الإجابات' : '📘 Word + Answers';
      a.onclick = function () { exportDocx(true); }; bar.appendChild(a);
      var v = document.createElement('button');
      v.type = 'button'; v.id = 'abuQuestionWordAudit'; v.className = 'btn abu-word-audit';
      v.textContent = ar ? '🔎 تدقيق / درجات' : '🔎 Audit / Marks';
      v.onclick = report; bar.appendChild(v);
      var target = document.createElement('button');target.type='button';target.id='abuQuestionExpectedGrade';target.className='btn abu-word-audit';target.textContent=ar?'🎯 الدرجة النهائية':'🎯 Target Marks';target.onclick=setExpectedGrade;bar.appendChild(target);
      var abc = document.createElement('button');abc.type='button';abc.id='abuQuestionAbcExport';abc.className='btn abu-word-btn';abc.textContent=ar?'📚 نماذج أ ب ج':'📚 Models A B C';abc.onclick=exportVariants;bar.appendChild(abc);
      var choose=document.createElement('input');choose.id='abuQuestionDocxImportInput';choose.type='file';choose.accept='.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';choose.style.display='none';choose.onchange=function(){var f=choose.files&&choose.files[0];choose.value='';importDocx(f)};bar.appendChild(choose);
      var importButton=document.createElement('button');importButton.type='button';importButton.id='abuQuestionDocxImportBtn';importButton.className='btn abu-word-btn';importButton.textContent=ar?'⬆️ استيراد Word':'⬆️ Import Word';importButton.onclick=function(){choose.click()};bar.appendChild(importButton);
      var info = document.createElement('span');
      info.id = 'abuQuestionWordStatus'; info.setAttribute('aria-live', 'polite'); bar.appendChild(info);
    }
    ensureGrades();
    var scheduled = false;
    new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      Promise.resolve().then(function () { scheduled = false; ensureGrades(); });
    }).observe(pages, { childList: true, subtree: true });
  }
  window.AbuQuestionWordTools = { collect: collect, report: report, exportDocx: exportDocx, exportVariants: exportVariants, importDocx: importDocx, wordParagraphs: wordParagraphs, parseImportedQuestions: parseImportedQuestions, ensureGrades: ensureGrades };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}());
