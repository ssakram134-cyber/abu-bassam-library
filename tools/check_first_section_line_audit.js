'use strict';
const fs=require('fs'),vm=require('vm');
// Exact current physical lines for the first photo/print audit boundary, not a claim of semantic proof.
const sources=['web/index.html','web/photo-print-advanced-runtime.js','web/photo-geometry-runtime.js','web/design-studio-advanced-runtime.js','web/print-presets-runtime.js','web/card-free-layout-runtime.js','web/poster-project-runtime.js','web/advanced-completion-runtime.js','web/image-compressor.html'];
let total=0,issues=[],rows=[];
for(const path of sources){
 const src=fs.readFileSync(path,'utf8'),lines=src.split(/\r?\n/);total+=lines.length;
 for(let i=0;i<lines.length;i++){const line=lines[i];if(/[\u0000\uFEFF\uFFFD]/.test(line))issues.push(`${path}:${i+1}: illegal hidden/replacement character`);if(/^\s*(<<<<<<<|=======|>>>>>>>)\s/.test(line))issues.push(`${path}:${i+1}: unmerged conflict marker`)}
 rows.push(`${path}: ${lines.length} physical lines, ${src.length} UTF-16 characters`);
 if(path.endsWith('.js')){try{new vm.Script(src,{filename:path})}catch(e){issues.push(`${path}: JS syntax: ${e.message}`)}}
 else for(const match of src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(!match[1].trim())continue;try{new vm.Script(match[1],{filename:path+' inline'})}catch(e){issues.push(`${path}: inline JS syntax: ${e.message}`)}}
}
const get=p=>fs.readFileSync(p,'utf8');
const main=get('web/index.html'),photo=get('web/photo-print-advanced-runtime.js'),geo=get('web/photo-geometry-runtime.js'),complete=get('web/advanced-completion-runtime.js'),adv=get('web/design-studio-advanced-runtime.js'),poster=get('web/poster-project-runtime.js'),compress=get('web/image-compressor.html');
const required=[
 [photo,'pagePrintMeta.photoImageRef!==selectedItem()?.img','poster source must match the generated pages'],
 [photo,'originalSrc','enhancement must not overwrite a changed photo'],
 [photo,'if(job&&job!==enhanceJob)return;ctx.putImageData','stale enhancement pixel job must stop'],
 [geo,'Math.sqrt(12_000_000/(ow*oh))','crop output memory bounded'],
 [geo,'Math.sqrt(8_000_000/(originalW*originalH))','perspective input memory bounded'],
 [geo,"it.src!==originalSrc",'delayed crop may not overwrite another image'],
 [complete,'function htmlEsc(v)','design layer text must be escaped'],
 [complete,'function trimHistory(stack)','undo history must have memory cap'],
 [complete,'invalidatePosterPages?.()','source mutation invalidates poster output'],
 [adv,"attributeFilter:['class']",'design observer must not react to every style change'],
 [poster,"event.detail?.src==='photo-print-advanced-runtime.js'",'poster controls must load deterministically'],
 [poster,'uploadedImages.indexOf(rec)','failed import only removes its own record'],
 [compress,'MAX_OUTPUT_BYTES=24*1024*1024','individual compression output size cap'],
 [compress,'MAX_TOTAL_OUTPUT_BYTES=96*1024*1024','compression batch output size cap'],
 [compress,'sw*sh>48_000_000','input decoded image must fit memory'],
 [geo,"$('abuRulerModal')?.classList.add('show')",'paper-size ruler must open its own modal'],
 [geo,"window.addEventListener('pointermove',move)",'crop drag must survive handle re-render'],
 [geo,"token!==drawToken",'stale crop animation frames must not duplicate handles'],
 [compress,"function lockProcessingControls(locked)",'compression controls must lock during processing'],
 [compress,"if(processing||saving)return alert('لا يمكن إضافة صور أثناء المعالجة أو الحفظ.",'compression must reject file additions while busy'],
 [compress,"window.moveItem=(i,d)=>{if(processing||saving)return;",'compression must reject reordering while busy'],
 [complete,"it.src!==before)return false",'photo undo must discard delayed image changes'],
 [complete,"if(await setPhotoSource(it,next))pushUndo(it,before)",'flip history must change only after successful image replacement'],
 [photo,"selectedItem()!==item||item.src!==before",'restoring original photo must reject stale selection'],
 [main,"cropTarget.transform={...cropDraft}",'crop must preserve the originally selected image identity'],
 [main,"cropTarget.src!==cropSourceAtOpen",'crop must reject stale source'],
 [main,"aiProTarget=uploadedImages[selectedIndex]",'AI must track object identity rather than mutable array index'],
 [main,"const target=activeAiProTarget(),source=aiProSourceAtOpen",'AI request must pin original target and source'],
 [main,"requestId!==aiProRequestId||!validAiProSource(source)",'AI result must reject stale requests'],
 [main,"if(!validAiProSource(expected)||result!==aiProResult)",'AI adoption must check target after image load'],
 [main,"if(!validAiProSource(before))",'AI original restore must check target after image load'],
 [main,"const epoch=imageImportEpoch",'image import must capture clear generation'],
 [main,"if(--left!==0||epoch!==imageImportEpoch)return",'cleared image imports must not return'],
 [main,"button.onclick=event=>{event.stopPropagation();removePerson(i)}",'photo list uses safe DOM button handler'],
 [main,"if(removed===aiProTarget)",'deleting image must cancel retained AI target'],
 [main,"sw*sh>12000000",'background removal must bound decoded image size'],
 [geo,"function projectiveCoefficients(corners)",'perspective must use projective transformation'],
 [geo,"t*turns[0]<0",'perspective must reject crossed corners'],
 [geo,"const {a,b,c,d,e,f,g,h}=coeff",'perspective warp must use homography coefficients'],
 [geo,"pagePrintMeta?.paper||",'ruler must reflect current generated page size'],
 [photo,"margin:p.margin,photoImageRef:im",'poster margin must be stored with current print pages'],

 [geo,"geoTarget=it;geoSourceAtOpen=it.src",'geometry editor must pin source image when opened'],
 [geo,"const cancelled=()=>operationId!==geoOperationId||geoTarget!==it||it.src!==originalSrc||item()!==it||!uploadedImages.includes(it);",'geometry must reject selection changes after asynchronous work'],
 [geo,"if(geometryBusy||ev.pointerId!==pointerId)return;",'geometry corners must not move while processing'],
 [geo,"if(startY+rows<oh)await new Promise(resolve=>requestAnimationFrame(resolve));",'projective correction must yield for responsive touch'],
 [geo,"const strip=outCtx.createImageData(ow,rows)",'perspective must render strips rather than allocate whole output twice'],
 [geo,"if(!finished&&output){output.width=0;output.height=0}",'canceled perspective must release backing store'],
 [geo,"}else pts[i]={x,y};refreshOverlay()",'pointer movement must not rerasterize the source image'],
];for(const [src,needle,reason] of required)if(!src.includes(needle))issues.push('Regression guard missing: '+reason);
if(issues.length){console.error(issues.join('\n'));process.exitCode=1}else console.log('First-section photo/print code audit passed\n'+rows.join('\n')+'\nTotal physical lines examined by static checks: '+total+'; critical regression guards: '+required.length);
