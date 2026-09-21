(()=>{
'use strict';

const $=id=>document.getElementById(id);
let language='ar';
let studioMode=localStorage.getItem('abuBassamProductivityModeV2')==='certificate'?'certificate':'questions';

function addCss(){
  if($('abuProductivityStyle'))return;
  const style=document.createElement('style');
  style.id='abuProductivityStyle';
  style.textContent=`#questionsCenter,#compressorCenter{display:none;padding:12px;background:var(--bg,#f5efe8);min-height:78vh}.productivity-show{display:block!important}.productivity-shell{max-width:920px;margin:auto}.productivity-head{display:flex;justify-content:space-between;align-items:center;gap:9px;padding:14px;border-radius:18px;background:linear-gradient(135deg,#123c57,#087f72 58%,#a7772e);color:#fff;box-shadow:0 9px 24px #123c5728}.productivity-head h2{font-size:17px;margin:0}.productivity-head p{font-size:8px;line-height:1.7;margin:4px 0 0;opacity:.9}.productivity-head span{font-size:30px}.productivity-subtabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:10px 0}.productivity-subtabs button{min-height:46px;border:1px solid #087f7255;border-radius:12px;background:var(--surface2,#fff);color:var(--text,#222);font-size:9px;font-weight:900;line-height:1.4;white-space:normal}.productivity-subtabs button.active{background:linear-gradient(135deg,#087f72,#155d86);color:#fff;border-color:transparent}.question-language{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}.question-language button{min-height:42px;border:1px solid #087f7255;border-radius:12px;background:var(--surface2,#fff);color:var(--text,#222);font-size:10px;font-weight:900}.question-language button.active{background:#087f72;color:#fff;border-color:#087f72}.productivity-frame-wrap{margin-top:8px;border:1px solid #0001;border-radius:17px;overflow:hidden;background:#fff;box-shadow:0 6px 20px #00000012}.productivity-frame{display:block;width:100%;height:900px;border:0;background:#edf2f7}.productivity-frame.design-frame{height:920px}.compressor-frame{height:700px;background:#020617}.productivity-note{margin-top:7px;padding:8px 10px;border-radius:11px;background:#087f720c;color:var(--muted,#756b65);font-size:8px;line-height:1.7}.productivity-status{display:inline-block;margin-top:6px;padding:4px 9px;border-radius:16px;background:#fff2;color:#fff;font-size:8px;font-weight:900}.productivity-status.ok{background:#dff7ed;color:#087456}.productivity-status.err{background:#ffe4e7;color:#a42d39}.productivity-pane{display:none}.productivity-pane.show{display:block}@media(max-width:430px){.productivity-frame{height:840px}.productivity-frame.design-frame{height:850px}.compressor-frame{height:650px}}`;
  document.head.appendChild(style);
}

function mainHtml(){
  return `<div class="productivity-shell"><div class="productivity-head"><div><h2>الأسئلة والطباعة المدرسية</h2><p>قوالب أسئلة حسب المادة • شهادات تقدير • حفظ تلقائي • PDF وطباعة</p></div><span>📝</span></div><div class="productivity-subtabs"><button id="prodModeQuestions" onclick="AbuBassamProductivity.mode('questions')">صياغة الأسئلة</button><button id="prodModeCertificate" onclick="AbuBassamProductivity.mode('certificate')">شهادات التقدير</button></div><div id="prodPaneQuestions" class="productivity-pane"><div class="question-language"><button id="questionLangAr" class="active" onclick="AbuBassamProductivity.language('ar')">العربي — RTL</button><button id="questionLangEn" onclick="AbuBassamProductivity.language('en')">English — LTR</button></div><div class="productivity-frame-wrap"><iframe id="questionsFrame" class="productivity-frame" src="questions-ar.html" title="صياغة الأسئلة بالعربية والإنكليزية"></iframe></div><div class="productivity-note">للعربي: زر «القوالب» يعرض نماذج الرياضيات والعلوم والإسلامية والعامة، وزر «الورق» يتيح A4 وA5 والمقاس المخصص. تحفظ المسودة والتعديلات تلقائيًا.</div><span id="questionsHostStatus" class="productivity-status">جاهز للعمل محليًا</span></div><div id="prodPaneCertificate" class="productivity-pane"><div class="productivity-frame-wrap"><iframe id="certificateFrame" class="productivity-frame design-frame" src="certificates.html" title="شهادات التقدير"></iframe></div><div class="productivity-note">١٠ نماذج احترافية قابلة للتحرير، مع A4 وA5 عمودي/أفقي والحفظ التلقائي والطباعة وPDF.</div><span id="certificateHostStatus" class="productivity-status">محرر الشهادات جاهز</span></div></div>`;
}

function compressorHtml(){
  return `<div class="productivity-shell"><div class="productivity-head"><div><h2>ضغط الصور</h2><p>ضغط صورة أو مجموعة صور محليًا • مقارنة الحجم قبل وبعد • حفظ نسخ جديدة دون تعديل الأصل</p></div><span>🗜️</span></div><div class="productivity-frame-wrap"><iframe id="compressorFrame" class="productivity-frame compressor-frame" src="image-compressor.html" title="ضغط الصور"></iframe></div><div class="productivity-note">تتم المعالجة داخل الهاتف ولا تُرفع الصور إلى الإنترنت. عند الحفظ اختر مجلد الصور مرة واحدة لحفظ النتائج.</div><span id="compressorHostStatus" class="productivity-status">لا توجد صور مضغوطة بعد</span></div>`;
}

function build(){
  if($('questionsCenter'))return;
  addCss();
  const app=document.querySelector('.app'),preview=document.querySelector('.app .preview');
  if(!app)return;
  const questions=document.createElement('section');questions.id='questionsCenter';questions.innerHTML=mainHtml();
  const compressor=document.createElement('section');compressor.id='compressorCenter';compressor.innerHTML=compressorHtml();
  app.insertBefore(questions,preview||null);app.insertBefore(compressor,preview||null);
  window.addEventListener('message',handleMessage);
  $('questionsFrame')?.addEventListener('load',()=>{if(language==='ar')setTimeout(injectArabicRuntimes,50)});
  setMode(studioMode);
}

function injectArabicRuntimes(){
  const frame=$('questionsFrame');if(!frame||language!=='ar')return;
  try{
    const doc=frame.contentDocument;if(!doc)return;
    [['abuQuestionTemplatesExternal','questions-templates-runtime.js'],['abuQuestionPaperExternal','questions-paper-runtime.js']].forEach(([id,src])=>{if(doc.getElementById(id))return;const script=doc.createElement('script');script.id=id;script.src=src;doc.head.appendChild(script)});
  }catch(e){setStatus('questionsHostStatus','تعذر تحميل أدوات القوالب والورق داخل المحرر',false)}
}

function setMode(value){
  studioMode=value==='certificate'?'certificate':'questions';
  localStorage.setItem('abuBassamProductivityModeV2',studioMode);
  [['questions','prodModeQuestions','prodPaneQuestions'],['certificate','prodModeCertificate','prodPaneCertificate']].forEach(([m,b,p])=>{$(b)?.classList.toggle('active',studioMode===m);$(p)?.classList.toggle('show',studioMode===m)});
  if(studioMode==='questions')setTimeout(()=>{notifyFrame('questionsFrame');if(language==='ar')injectArabicRuntimes()},50);
  else setTimeout(()=>notifyFrame('certificateFrame'),50);
}

function setLanguage(value){
  language=value==='en'?'en':'ar';
  $('questionLangAr')?.classList.toggle('active',language==='ar');$('questionLangEn')?.classList.toggle('active',language==='en');
  const frame=$('questionsFrame'),wanted=language==='ar'?'questions-ar.html':'questions-en.html';
  if(frame&&!String(frame.getAttribute('src')||'').endsWith(wanted))frame.src=wanted;
  localStorage.setItem('abuBassamQuestionLanguageV1',language);
  setStatus('questionsHostStatus',language==='ar'?'تم فتح نموذج الأسئلة العربي':'English question template opened',true);
  if(language==='ar')setTimeout(injectArabicRuntimes,120);
}

function setStatus(id,message,ok){const element=$(id);if(!element)return;element.className='productivity-status '+(ok===false?'err':ok===true?'ok':'');element.textContent=message}
function trustedSource(event,frameId){const frame=$(frameId);return !!(frame&&frame.contentWindow&&event.source===frame.contentWindow)}
function safeName(name,fallback){return String(name||fallback).replace(/[\\/:*?"<>|]/g,'_').trim()||fallback}
function log(type,title,details=''){if(window.AbuBassamOps&&AbuBassamOps.add)AbuBassamOps.add({type,title,details,section:type==='compress'?'ضغط الصور':'الأسئلة والطباعة'})}
function browserSave(name,data){const link=document.createElement('a');link.download=name;link.href=data;link.click()}

function handleMessage(event){
  const data=event.data;if(!data||typeof data!=='object'||typeof data.type!=='string')return;
  if(data.type==='abuQuestionReady'&&trustedSource(event,'questionsFrame')){setStatus('questionsHostStatus',String(data.message||'تم استعادة المسودة وأصبح النموذج جاهزًا'),true);if(language==='ar')setTimeout(injectArabicRuntimes,40);return}
  if((data.type==='abuPrintQuestion'||data.type==='abuSaveQuestionPdf')&&!trustedSource(event,'questionsFrame'))return;
  if(data.type==='abuPrintQuestion'){if(window.Android&&Android.printHtml)Android.printHtml(String(data.html||''));else alert('الطباعة متاحة داخل تطبيق Android');setStatus('questionsHostStatus','تم إرسال نموذج الأسئلة إلى معاينة الطباعة',true);log('print','طباعة نموذج أسئلة',data.language==='en'?'English':'عربي');return}
  if(data.type==='abuSaveQuestionPdf'){const name=safeName(data.name,'Abu_Bassam_Questions.pdf');if(window.Android&&Android.savePdfHtml)Android.savePdfHtml(name,String(data.html||''));else alert('حفظ PDF متاح داخل تطبيق Android');setStatus('questionsHostStatus','تم تجهيز ملف PDF للحفظ',true);log('pdf','حفظ نموذج أسئلة PDF',data.language==='en'?'English':'عربي');return}
  if(data.type==='abuDesignReady'&&trustedSource(event,'certificateFrame')){setStatus('certificateHostStatus',String(data.message||'محرر الشهادات جاهز'),true);return}
  const designTrusted=trustedSource(event,'certificateFrame');
  if((data.type==='abuDesignPrint'||data.type==='abuDesignPdf'||data.type==='abuDesignSaveImage')&&!designTrusted)return;
  if(data.type==='abuDesignPrint'){if(window.Android&&Android.printHtml)Android.printHtml(String(data.html||''));else alert('الطباعة متاحة داخل تطبيق Android');log('print','طباعة شهادة تقدير',data.name||'');return}
  if(data.type==='abuDesignPdf'){const name=safeName(data.name,'Certificate.pdf');if(window.Android&&Android.savePdfHtml)Android.savePdfHtml(name,String(data.html||''));else alert('حفظ PDF متاح داخل تطبيق Android');log('pdf','حفظ شهادة PDF',name);return}
  if(data.type==='abuDesignSaveImage'){const name=safeName(data.name,'Certificate.png'),value=String(data.data||'');if(window.Android&&Android.saveToGallery)Android.saveToGallery(name,'image/png',value);else browserSave(name,value);log('image','حفظ شهادة كصورة',name);return}
  if(data.type==='abuCompressionReady'&&trustedSource(event,'compressorFrame')){
    const pages=Array.isArray(data.pages)?data.pages.filter(item=>typeof item==='string'&&item.startsWith('data:image/')):[];
    if(!pages.length){setStatus('compressorHostStatus','لم تُنتج صور صالحة للحفظ',false);return}
    const prefix='Abu_Bassam_Compressed';if(window.Android&&Android.savePagesToGallery)Android.savePagesToGallery(prefix,JSON.stringify(pages),'image/jpeg');else pages.forEach((item,index)=>browserSave(prefix+'_'+(index+1)+'.jpg',item));
    const before=Number(data.originalBytes)||0,after=Number(data.compressedBytes)||0,delta=before-after,percent=before?Math.round(Math.abs(delta)/before*100):0;setStatus('compressorHostStatus',delta>=0?`تم ضغط ${pages.length} صورة • توفير ${percent}% من الحجم`:`حُفظت ${pages.length} صورة، لكن الحجم زاد ${percent}% — اختر ضغطًا أقوى`,delta>=0);log('compress','ضغط الصور',`${pages.length} صورة • قبل ${before} بايت • بعد ${after} بايت`);
  }
}

function notifyFrame(id){const frame=$(id);if(frame&&frame.contentWindow)frame.contentWindow.postMessage({type:'abuBassamTabVisible'},'*')}
function onQuestionsShow(){const saved=localStorage.getItem('abuBassamQuestionLanguageV1')||language;if(saved!==language)setLanguage(saved);setMode(localStorage.getItem('abuBassamProductivityModeV2')==='certificate'?'certificate':'questions');setTimeout(()=>notifyFrame(studioMode==='certificate'?'certificateFrame':'questionsFrame'),60)}
function onCompressorShow(){setTimeout(()=>notifyFrame('compressorFrame'),60)}

window.AbuBassamProductivity={language:setLanguage,mode:setMode,onQuestionsShow,onCompressorShow};
window.addEventListener('DOMContentLoaded',()=>{build();const saved=localStorage.getItem('abuBassamQuestionLanguageV1');if(saved)setLanguage(saved)});
})();
