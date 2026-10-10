const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'web');
const errors=[];
const read=f=>fs.readFileSync(path.join(web,f),'utf8');
const need=(src,m,label)=>{if(!src.includes(m))errors.push(`${label}: missing ${m}`)};
const files=['photo-print-advanced-runtime.js','photo-geometry-runtime.js','design-studio-advanced-runtime.js','print-presets-runtime.js','card-free-layout-runtime.js','poster-project-runtime.js','advanced-completion-runtime.js'];
for(const f of files)if(!fs.existsSync(path.join(web,f)))errors.push(`Missing advanced asset: ${f}`);
if(!errors.length){
  const p=read('photo-print-advanced-runtime.js');
  for(const m of ['بوستر / صورة كبيرة','abuPosterOverlap','abuPosterBorderless','abuPosterMarks','abuPosterLabels','buildPoster','testPoster','sharpen','temperature','abuDenoise','جودة الطباعة الحالية','abu-photo-handle','abuPosterOrientation','function posterPlan()','function syncMainPaper(','الحجم المطلوب يحتاج'])need(p,m,'photo-print-advanced-runtime.js');
  const project=read('poster-project-runtime.js');for(const m of ['معاينة البوستر بعد التجميع','حفظ مشروع','فتح مشروع','imageDataUrl','abuPosterAssemblyCanvas','abuPosterProjectInput','abuPosterOrientation','advanced-completion-runtime.js'])need(project,m,'poster-project-runtime.js');
  const g=read('photo-geometry-runtime.js');for(const m of ['قص حر / منظور','تصحيح منظور 4 زوايا','warpFull','abu-geo-handle','معاينة القياسات','abu-ruler-safe'])need(g,m,'photo-geometry-runtime.js');
  const d=read('design-studio-advanced-runtime.js');for(const m of ["['nw','n','ne','e','se','s','sw','w']",'ds-adv-rotate','dsAdvAspect','dsAdvGrid','dsAdvSnap','dsAdvX','dsAdvY','dsAdvW','dsAdvH','snapGeom'])need(d,m,'design-studio-advanced-runtime.js');
  const presets=read('print-presets-runtime.js');for(const m of ['abuBassamProfessionalPrintPresetsV1','إعدادات طباعة محفوظة','paperSize','mediaType','dpiInput','marginInput','gapInput','apply(i)'])need(presets,m,'print-presets-runtime.js');
  const card=read('card-free-layout-runtime.js');for(const m of ['abuBassamCardFreeLayoutV1','ROLE_SELECTORS','abu-layout-handle','abu-layout-rot','scheduleScan','abu-cards-rendered'])need(card,m,'card-free-layout-runtime.js');const studio=read('cards-studio-runtime.js');for(const m of ['freeLayoutCss()','fullPrintCss()+freeLayoutCss()','function printDocument()'])need(studio,m,'cards-studio-runtime.js');
  const complete=read('advanced-completion-runtime.js');for(const m of ['undoPhoto','redoPhoto','flipPhoto','dsCompLayers','toggleHideSelected','طبقات التصميم','copySelectedStyle','markOutside'])need(complete,m,'advanced-completion-runtime.js');
  const prod=read('productivity-tools-runtime.js');for(const m of ['photo-print-advanced-runtime.js','photo-geometry-runtime.js','print-presets-runtime.js','card-free-layout-runtime.js','poster-project-runtime.js'])need(prod,m,'productivity-tools-runtime.js');
  const env=read('envelopes.html'),cert=read('certificates.html');for(const m of ['design-studio-advanced-runtime.js','advanced-completion-runtime.js']){need(env,m,'envelopes.html');need(cert,m,'certificates.html')}
}
// Guard fixes in the source files, rather than installing additional runtime patches.
const home=read('index.html');
for(const marker of [
  "r.onerror=()=>{failed++;done()}",
  "loaded=new Array(files.length)",
  "if(!uploadedImages.length){pageCanvases=[]",
  "Math.max(0,Math.round(Math.max(0,Number(mm)||0)",
  "if(iw+2*margin>pw||ih+2*margin>ph)",
  "if(uploadedImages.length*count>maxJobs)",
  "else if(selectedIndex===i)selectedIndex=Math.min(i,uploadedImages.length-1)",
  "if(pageCanvases.length>20){let pdf=makePdfData()"
])need(home,marker,'main photo/print regression');
const presetRuntime=read('print-presets-runtime.js');
for(const marker of ['Array.isArray(stored)','presets=presets.slice(0,30)','function restoreDefaults(){const defaults=','dpiModeChanged()'])need(presetRuntime,marker,'print presets regression');
// A poster has one authoritative layout/assembly engine; preview delegates to it.
for(const forbidden of ['function buildPosterOriented()','function posterPlanStrict()','function installPosterOverrides()']){
 if(read('advanced-completion-runtime.js').includes(forbidden))errors.push('Obsolete duplicate poster engine: '+forbidden);
}
const posterProject=read('poster-project-runtime.js');
need(posterProject,'return window.AbuPhotoAdvanced.posterPlan()','poster preview must share canonical layout');
if(posterProject.includes('Math.ceil((w-overlap)'))errors.push('poster-project duplicated layout calculations');
if(read('photo-print-advanced-runtime.js').includes('new MutationObserver(apply).observe(document.body'))errors.push('page-wide observer must not watch photos');
need(read('photo-print-advanced-runtime.js'),"document.addEventListener('abu-cards-rendered',apply)",'card render event integration');
try{
 const ids={abuPosterPaper:'A4',abuPosterOrientation:'landscape',abuPosterMode:'grid',abuPosterCols:2,abuPosterRows:3,abuPosterW:40,abuPosterH:56,abuPosterOverlap:5,abuPosterMargin:5,abuPosterDpi:200,abuPosterFit:'contain'};
 const fields=Object.fromEntries(Object.entries(ids).map(([k,v])=>[k,{value:String(v),checked:false}]));
 fields.abuPosterBorderless={checked:false};fields.abuPosterRatio={checked:false};
 const sandbox={window:{},document:{readyState:'loading',addEventListener(){},getElementById(id){return fields[id]||null}},selectedIndex:0,uploadedImages:[{img:{naturalWidth:1200,naturalHeight:800}}],alert(){}};
 vm.runInNewContext(read('photo-print-advanced-runtime.js'),sandbox,{filename:'photo-print-advanced-runtime.js',timeout:2000});
 const plan=sandbox.window.AbuPhotoAdvanced?.posterPlan;
 if(typeof plan!=='function')throw new Error('canonical poster plan unavailable');
 let p=plan();
 if(p.paper.w!==297||p.paper.h!==210||p.cols!==2||p.rows!==3||p.posterW!==569||p.posterH!==590)throw new Error('landscape grid geometry does not match expected millimeters');
 fields.abuPosterMode.value='size';fields.abuPosterW.value='40';fields.abuPosterH.value='56';
 p=plan();
 if(p.cols!==2||p.rows!==3||p.posterW!==400||p.posterH!==560)throw new Error('size mode should fit into two columns and three rows');
 fields.abuPosterW.value='500';fields.abuPosterH.value='500';
 let refused=false;try{plan()}catch(e){refused=/6×6/.test(String(e.message||e))}
 if(!refused)throw new Error('oversized poster was not rejected');
}catch(error){errors.push('Poster functional regression: '+String(error.message||error))}
const posterRuntime=read('photo-print-advanced-runtime.js');
need(posterRuntime,"if(typeof printDirectly==='function')return printDirectly()",'poster must use the single shared print path');
need(home,"Android.printBase64('Abu_Bassam_Print.pdf'",'large poster PDF print fallback');
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Advanced photo/print checks passed: local enhancement, undo/redo/flip, poster tiling with portrait/landscape and strict size caps, assembled preview/project reopen, direct crop/perspective, ruler preview, 8-handle transforms, card free layout, snap/grid, layers/hide, print-bound warning, and named print presets.\n');
