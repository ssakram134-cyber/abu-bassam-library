const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..'),web=path.join(root,'web'),errors=[];
const read=f=>fs.readFileSync(path.join(web,f),'utf8');
const need=(s,m,l)=>{if(!s.includes(m))errors.push(`${l}: missing ${m}`)};
const forbid=(s,m,l)=>{if(s.includes(m))errors.push(`${l}: forbidden ${m}`)};
const files=['questions-completion-runtime.js','questions-en-fixes-runtime.js','questions-paper-runtime.js','productivity-tools-runtime.js','questions-template-tools-runtime.js','questions-templates-runtime.js','questions-custom-library-runtime.js'];
for(const f of files){const p=path.join(web,f);if(!fs.existsSync(p)){errors.push(`Missing ${f}`);continue}try{new vm.Script(read(f),{filename:f})}catch(e){errors.push(`${f}: syntax ${e.message}`)}}
const ar=read('questions-paper-runtime.js');for(const m of ['__ABU_QUESTION_PAPER_V3__','A4P','A4L','A5P','A5L','value="custom"','A4 وA5 أو مقاس مخصص','80,500','window.fitToScreen','window.checkAutoFlow'])need(ar,m,'Arabic paper');forbid(ar,'A4 فقط','Arabic paper');
const en=read('questions-en-fixes-runtime.js');for(const m of ['__ABU_QUESTIONS_EN_FIXES_V2__','A4P','A4L','A5P','A5L','Custom size','Model answer / notes','Day /','durableSave','dbDelete','window.handleAddImage=addImage','2600/max','40*1024*1024','window.checkAutoFlow=flow'])need(en,m,'English fixes');forbid(en,'A4 only','English fixes');forbid(en,'new MutationObserver','English questions must not install a global DOM observer');forbid(en,'setInterval(','English questions must not poll for readiness');need(en,'function wrapMutations()','English questions must use explicit mutation hooks');need(en,'abu-question-en-content-changed','English questions must emit explicit content lifecycle events');
const completion=read('questions-completion-runtime.js');for(const m of ['saveDurableDraft','resetDurableDraft','idbDelete','window.handleAddImage=safeAddImage','40*1024*1024','2600/maxSide','imageSmoothingQuality','refreshOverflowFlags','localStorage.removeItem(\'abuBassamQuestionDraftArabicV1\')'])need(completion,m,'Arabic consolidated completion');
const templateTools=read('questions-template-tools-runtime.js'),paperRuntime=read('questions-paper-runtime.js');
for(const [name,src] of [['completion',completion],['template tools',templateTools],['paper',paperRuntime],['templates',read('questions-templates-runtime.js')]]){forbid(src,'setInterval(',name+' must not poll for readiness');forbid(src,'new MutationObserver',name+' must use explicit lifecycle events')}
for(const marker of ['abu-question-templates-ready','abu-question-templates-rendered','abu-question-content-changed'])need(completion,marker,'completion lifecycle '+marker);
for(const marker of ['abu-question-templates-ready','abu-question-templates-rendered'])need(templateTools,marker,'template tools lifecycle '+marker);
need(paperRuntime,'abu-question-content-changed','paper layout must follow explicit content lifecycle');

const templates=read('questions-templates-runtime.js');for(const m of ["year:'٢٠٢٦ - ٢٠٢٧'",'التاريخ / ${esc(profile.date','اليوم / ${esc(profile.day',"document.querySelectorAll('.header')",'أكرم حاتم الغزالي'])need(templates,m,'question templates');
const custom=read('questions-custom-library-runtime.js');for(const m of ['indexedDB.open','async function migrate()','async function saveCurrent()','api.saveCustom=saveCurrent','AbuQuestionCustomLibrary'])need(custom,m,'custom library');
const host=read('productivity-tools-runtime.js');for(const m of ['questionsFrame','data-src="questions-ar.html"','questions-en-fixes-runtime.js','script.async=false'])need(host,m,'question host');
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Question checks passed: Arabic/English A4, A5 and custom paper, one durable IndexedDB draft path, safe images, answer notes, date/day headers, custom templates, and stable flow.\n');
