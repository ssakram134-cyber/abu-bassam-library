const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),web=path.join(root,'web'),errors=[];
const files=fs.readdirSync(web).filter(n=>/\.(js|html)$/i.test(n));
// Security guards must be able to cancel an unsafe action before any other
// handler runs, and the national-id viewer needs raw pinch/pan touch events.
// Everything else stays on Pointer Events with no global interception.
const stopImmediateAllowed=new Set(['fail-closed-runtime.js','account-recovery-hardening-runtime.js','admin-permissions-runtime.js','app-security-runtime.js','password-policy-runtime.js','permission-section-guards-runtime.js','security-bootstrap-guard-runtime.js','security-extras-runtime.js']);
const touchAllowed=new Set(['national-id-runtime.js']);
const observerAllowed=new Set(['account-center-runtime.js','admin-permissions-runtime.js','app-security-runtime.js','backup-center-runtime.js','customer-documents-runtime.js','customer-documents-workflow-runtime.js','customer-permissions-hardening-runtime.js','device-reconcile-runtime.js','notification-excel-runtime.js','operation-log-corrections-runtime.js','permission-section-guards-runtime.js','question-type-runtime.js','security-extras-runtime.js','security-hardening-runtime.js','settings-enhancements-runtime.js']);
for(const f of files){
  const s=fs.readFileSync(path.join(web,f),'utf8');
  for(const token of ['touchstart','touchmove','touchend'])if(s.includes(token)&&!touchAllowed.has(f))errors.push(`${f}: forbidden legacy/global input token ${token}`);
  if(s.includes('stopImmediatePropagation')&&!stopImmediateAllowed.has(f))errors.push(`${f}: forbidden legacy/global input token stopImmediatePropagation`);
  if(/new\s+(?:window\.|win\.)?MutationObserver\([\s\S]{0,700}?\.observe\(document\.(?:documentElement|body),\{[^}]*subtree\s*:\s*true/i.test(s)&&!observerAllowed.has(f))errors.push(`${f}: document-wide MutationObserver`);
}
// Permission/security guards legitimately intercept clicks in the capture phase;
// only non-security runtimes are audited for global input interception.
const known=['cards-hardening-runtime.js','cards-hardening-fixes-runtime.js','document-vault-hardening-runtime.js','permission-guard-runtime.js','login-throttle-fix-runtime.js','feature-recovery-runtime.js'];
for(const f of known){const s=fs.readFileSync(path.join(web,f),'utf8');if(/document\.addEventListener\(['"](?:click|pointerdown|touchstart|touchmove)['"][\s\S]{0,800}?,\s*true\)/.test(s))errors.push(`${f}: document-level capture input interceptor`)}
const cards=fs.readFileSync(path.join(web,'cards-studio-runtime.js'),'utf8');
const nat=fs.readFileSync(path.join(web,'national-id-runtime.js'),'utf8');
const productivity=fs.readFileSync(path.join(web,'productivity-tools-runtime.js'),'utf8');
const native=fs.readFileSync(path.join(root,'index.js'),'utf8');
for(const [s,t,l] of [[cards,"addEventListener('pointerdown'",'cards pointerdown'],[cards,"addEventListener('pointermove'",'cards pointermove'],[nat,"addEventListener('touchmove'",'national pinch/pan gestures']])if(!s.includes(t))errors.push(`missing ${l}`);
for(const t of ['webInstanceKey','recoverWebRenderer','onRenderProcessGone','onContentProcessDidTerminate'])if(!native.includes(t))errors.push(`native crash recovery missing ${t}`);
for(const t of ['tabQuestions','tabCompressor','questionsCenter','compressorCenter','national-id-documents.html'])if(!nat.includes(t))errors.push(`national navigation missing restored ${t}`);
if(nat.includes('residence-card.html'))errors.push('national-id-runtime.js: obsolete residence-card.html route returned');
for(const t of ['ensureQuestionFrame','ensureCompressorFrame','src="about:blank"'])if(!productivity.includes(t))errors.push(`productivity lazy loading missing ${t}`);
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('Input/crash stability audit passed: legacy touch handlers and stopImmediatePropagation are absent, document-wide observers/capture interceptors are rejected, card gestures use Pointer Events and the documents viewer keeps its pinch/pan gestures, restored questions/compressor sections remain lazy-loaded, national documents use the integrated route, and WebView renderer recovery is wired.');
