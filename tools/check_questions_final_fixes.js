const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'web');
const errors=[];
const read=f=>fs.readFileSync(path.join(web,f),'utf8');
const need=(s,m,l)=>{if(!s.includes(m))errors.push(`${l}: missing ${m}`)};
for(const f of ['questions-completion-runtime.js','questions-final-fixes-runtime.js','questions-en-fixes-runtime.js','questions-paper-runtime.js','productivity-tools-runtime.js']){
  const p=path.join(web,f);if(!fs.existsSync(p)){errors.push(`Missing ${f}`);continue}
  try{new vm.Script(read(f),{filename:f})}catch(e){errors.push(`${f}: syntax ${e.message}`)}
}
if(fs.existsSync(path.join(web,'questions-completion-runtime.js'))){
  const s=read('questions-completion-runtime.js');
  for(const m of ['LOCAL_TS_KEY','idbPut(html,updatedAt=Date.now())','localStorage.setItem(LOCAL_TS_KEY','localTs>0&&Number(row.updatedAt)>localTs+1000','&quot;','ensureAnswers:enhanceAnswers'])need(s,m,'Arabic completion');
}
if(fs.existsSync(path.join(web,'questions-final-fixes-runtime.js'))){
  const s=read('questions-final-fixes-runtime.js');
  for(const m of ['__ABU_QUESTIONS_FINAL_FIXES_V1__','durableSave','durableReset','dbDelete','LOCAL_TS_KEY','window.saveQuestionDraft=durableSave','window.resetQuestionDraft=durableReset','window.handleAddImage=safeAddImage','40*1024*1024','2600/maxSide','imageSmoothingQuality','refreshOverflowFlags','abu-question-overflow'])need(s,m,'Arabic final fixes');
}
if(fs.existsSync(path.join(web,'questions-en-fixes-runtime.js'))){
  const s=read('questions-en-fixes-runtime.js');
  for(const m of ['__ABU_QUESTIONS_EN_FIXES_V1__','A4P','A4L','A4 only','durableSave','dbDelete','window.saveQuestionDraft=durableSave','window.resetQuestionDraft=reset','window.handleAddImage=addImage','pointerdown','2600/max','40*1024*1024','window.checkAutoFlow=flow','abuEnAnswerBtn','Model answer / notes','Day /','img.style.objectFit','window.saveState?.()'])need(s,m,'English fixes');
  for(const bad of ['A5P','A5L','value="custom"'])if(s.includes(bad))errors.push(`English fixes: forbidden ${bad}`);
}
if(fs.existsSync(path.join(web,'questions-paper-runtime.js'))){
  const p=read('questions-paper-runtime.js');
  need(p,'questions-final-fixes-runtime.js','Arabic paper loader');
  need(p,'s.async=false','Arabic deterministic loader');
}
if(fs.existsSync(path.join(web,'productivity-tools-runtime.js'))){
  const p=read('productivity-tools-runtime.js');
  for(const m of ['A4 فقط','injectEnglishRuntime','questions-en-fixes-runtime.js','injectCurrentQuestionRuntime','script.async=false'])need(p,m,'question host');
  if(p.includes('A4/A5/مخصص'))errors.push('question host still advertises A5/custom paper');
}
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Question final-fix checks passed: Arabic/English A4-only, deterministic drafts, safe images, stable touch/undo controls and overflow cleanup.\n');
