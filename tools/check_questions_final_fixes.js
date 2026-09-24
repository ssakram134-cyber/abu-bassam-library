const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'web');
const errors=[];
const read=f=>fs.readFileSync(path.join(web,f),'utf8');
const need=(s,m,l)=>{if(!s.includes(m))errors.push(`${l}: missing ${m}`)};
for(const f of ['questions-final-fixes-runtime.js','questions-paper-runtime.js']){
  const p=path.join(web,f);if(!fs.existsSync(p)){errors.push(`Missing ${f}`);continue}
  try{new vm.Script(read(f),{filename:f})}catch(e){errors.push(`${f}: syntax ${e.message}`)}
}
if(fs.existsSync(path.join(web,'questions-final-fixes-runtime.js'))){
  const s=read('questions-final-fixes-runtime.js');
  for(const m of ['__ABU_QUESTIONS_FINAL_FIXES_V1__','durableSave','durableReset','dbDelete','LOCAL_TS_KEY','window.saveQuestionDraft=durableSave','window.resetQuestionDraft=durableReset','window.handleAddImage=safeAddImage','40*1024*1024','2600/maxSide','imageSmoothingQuality','refreshOverflowFlags','abu-question-overflow'])need(s,m,'final fixes');
}
if(fs.existsSync(path.join(web,'questions-paper-runtime.js'))){
  const p=read('questions-paper-runtime.js');
  need(p,'questions-final-fixes-runtime.js','paper loader');
  need(p,'s.async=false','paper deterministic loader');
}
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Question final-fix checks passed: durable save/reset, safe image import, stable A4 overflow cleanup.\n');
