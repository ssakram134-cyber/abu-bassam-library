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
for(const [name,code] of [['poster project',posterProject],['advanced completion',read('advanced-completion-runtime.js')]]){
 if(code.includes('setInterval('))errors.push(name+' must not poll repeatedly for initialization');
}
need(posterProject,"document.addEventListener('abu-runtime-loaded',event=>",'poster project must retry when its actual runtime becomes ready');
need(read('advanced-completion-runtime.js'),"document.addEventListener('abu-design-advanced-ready',ensureDesignCompletion)",'design tools event-driven startup');
need(read('design-studio-advanced-runtime.js'),"new CustomEvent('abu-design-advanced-ready')",'design studio readiness signal');
for(const marker of ['Math.sqrt(12_000_000/(ow*oh))','Math.sqrt(8_000_000/(sw*sh))'])need(read('photo-geometry-runtime.js'),marker,'bounded geometry memory');
for(const marker of ['function htmlEsc(v)','function trimHistory(stack)','invalidatePosterPages?.()'])need(read('advanced-completion-runtime.js'),marker,'safe layer names, undo size and poster cache invalidation');
need(read('design-studio-advanced-runtime.js'),"attributeFilter:['class']", 'prevent style mutation feedback loops during card dragging');
if(read('design-studio-advanced-runtime.js').includes('return setTimeout(observe,80)'))errors.push('design studio must not poll 80ms while canvas is missing');
for(const marker of ['photoImageRef:im','pagePrintMeta.photoImageRef!==selectedItem()?.img'])need(read('photo-print-advanced-runtime.js'),marker,'poster must reject stale source image');

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
 // Build the six actual (mock-canvas) tiles, preserving A4 landscape page dimensions.
 Object.assign(fields,{paperSize:{value:'A4'},paperCustomW:{value:'21'},paperCustomH:{value:'29.7'},'info-text':{textContent:''},abuPosterMarks:{checked:false},abuPosterLabels:{checked:false}});
 fields.abuPosterMode.value='grid';fields.abuPosterCols.value='2';fields.abuPosterRows.value='3';fields.abuPosterDpi.value='96';
 let canvasCount=0,drawCount=0;const mockContext={fillRect(){},drawImage(){drawCount++}};
 sandbox.document.createElement=tag=>{if(tag!=='canvas')throw new Error('unexpected DOM element '+tag);canvasCount++;return {width:0,height:0,getContext(){return mockContext}}};
 sandbox.document.querySelector=()=>({classList:{remove(){}}});
 sandbox.setBusy=()=>{};sandbox.showPage=()=>{};sandbox.toggleCustomPaper=()=>{};sandbox.saveAppSettings=()=>{};
 sandbox.pageCanvases=[];sandbox.currentPage=0;sandbox.pagePrintMeta=null;
 const built=sandbox.window.AbuPhotoAdvanced.buildPoster();
 if(!built||sandbox.pageCanvases.length!==6||canvasCount!==6||drawCount!==6)throw new Error('2x3 poster failed to produce six image tiles');
 if(fields.paperSize.value!=='custom'||Number(fields.paperCustomW.value)!==29.7||Number(fields.paperCustomH.value)!==21)throw new Error('landscape paper dimensions were not propagated to print');
  if(sandbox.pagePrintMeta?.kind!=='poster'||sandbox.pagePrintMeta.paper.w!==297||sandbox.pagePrintMeta.paper.h!==210||sandbox.pagePrintMeta.paperKey!=='CUSTOM:297:210')throw new Error('poster output lost its original print dimensions');
  if(!sandbox.window.AbuPhotoAdvanced.invalidatePosterPages()||sandbox.pageCanvases.length||sandbox.pagePrintMeta!==null)throw new Error('stale poster pages were not invalidated');

}catch(error){errors.push('Poster functional regression: '+String(error.message||error))}
const posterRuntime=read('photo-print-advanced-runtime.js');
need(posterRuntime,"if(typeof printDirectly==='function')return printDirectly()",'poster must use the single shared print path');
need(home,"Android.printBase64('Abu_Bassam_Print.pdf'",'large poster PDF print fallback');
for(const m of ['pagePrintMeta?.paper||getPaperSize()','pagePrintMeta?.paperKey||getPaperPrintKey()','pagePrintMeta?.dpi??printDpi()'])need(home,m,'print output dimensions must be locked');
need(home,"if(pageCanvases.length>20)return alert('العمل يحتوي على أكثر من 20 صفحة",'gallery must refuse unsupported oversized native batch');
need(posterRuntime,"pagePrintMeta?.kind!=='poster'",'poster buttons must refuse outdated ordinary photo pages');
need(home,'invalidatePosterPages?.()','photo selection must invalidate a prior poster');
need(posterRuntime,'function invalidatePosterPages()','poster settings must invalidate previously generated pages');
for(const m of ["INPUT_IDS.includes(id)","window.AbuPhotoAdvanced?.buildPoster?.()","36000000","f.size>65000000"])need(posterProject,m,'safe poster project import and reopen');
// Exercise the real embedded photo-print functions after the user changes the paper dropdown.
try{
 const start=home.indexOf('<script>'),end=home.indexOf('</script>',start);if(start<0||end<0)throw new Error('main photo script missing');
 let pdfConfig=null,nativePrint=null;
 const mockPdf={addPage(){},addImage(){},output(){return 'data:application/pdf;base64,VEVTVA=='}};
 const fields={paperSize:{value:'A4'},paperCustomW:{value:'21'},paperCustomH:{value:'29.7'},dpiInput:{value:'300'},dpiEnabled:{checked:false},tgEnabled:{checked:false}};
 const android={printPages(...args){nativePrint=args}};
 const sandbox={window:{Android:android,addEventListener(){}},Android:android,document:{getElementById(id){return fields[id]||null}},jspdf:{jsPDF:function(opts){pdfConfig=opts;return mockPdf}},localStorage:{getItem(){return null},setItem(){}},alert(){}};
 vm.createContext(sandbox);
 vm.runInContext(home.slice(start+'<script>'.length,end),sandbox,{filename:'index.html photo print'});
 vm.runInContext("pageCanvases=[{toDataURL(){return 'data:image/png;base64,VEVTVA=='}},{toDataURL(){return 'data:image/png;base64,VEVTVA=='}}];pagePrintMeta={kind:'poster',paper:{w:297,h:210},paperKey:'CUSTOM:297:210',dpi:96};makePdfData();printDirectly()",sandbox,{timeout:3000});
 if(!pdfConfig||pdfConfig.format[0]!==297||pdfConfig.format[1]!==210||pdfConfig.orientation!=='landscape')throw new Error('PDF dimensions changed with mutable UI');
 if(nativePrint?.[1]!=='CUSTOM:297:210'||nativePrint?.[2]!==96)throw new Error('native print did not use generated poster metadata');
}catch(error){errors.push('Print metadata functional regression: '+String(error.message||error))}
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Advanced photo/print checks passed: local enhancement, undo/redo/flip, poster tiling with portrait/landscape and strict size caps, assembled preview/project reopen, direct crop/perspective, ruler preview, 8-handle transforms, card free layout, snap/grid, layers/hide, print-bound warning, and named print presets.\n');
