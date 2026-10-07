const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>{const f=path.join(root,p);if(!fs.existsSync(f))throw new Error(`missing ${p}`);return fs.readFileSync(f,'utf8')};
const failures=[];
const need=(src,marker,label)=>{if(!src.includes(marker))failures.push(`${label}: missing ${marker}`)};
const forbid=(src,marker,label)=>{if(src.includes(marker))failures.push(`${label}: forbidden ${marker}`)};
const photo=read('supabase/functions/abu-bassam-ai-photo/index.ts');
const status=read('supabase/functions/abu-bassam-ai-status/index.ts');
const web=read('web/index.html');
const buildProxy=read('supabase/functions/android-build-tool-proxy/index.ts');
const bootstrap=read('supabase/functions/bootstrap-owner/index.ts');
const triage=read('supabase/functions/repair-triage/index.ts');
const trackRepair=read('supabase/functions/track-repair/index.ts');
const customerDocuments=read('supabase/functions/customer-documents/index.ts');
const branchVault=read('supabase/functions/branch-vault/index.ts');
const backupCenter=read('supabase/functions/backup-center/index.ts');
const appUpdate=read('supabase/functions/app-update/index.ts');
for(const marker of [
  "Deno.env.get('AI_APP_TOKEN')","Deno.env.get('GEMINI_API_KEY')","Deno.env.get('OPENAI_API_KEY')",
  'async function tokenMatches','crypto.subtle.digest','MAX_BODY_BYTES','MAX_IMAGE_DATA_URL','MAX_PROMPT_CHARS','ALLOWED_IMAGE',
  "provider === 'openai'","provider === 'gemini'",'Cache-Control','X-Content-Type-Options',"form.append('model', 'gpt-image-2')"
])need(photo,marker,'AI photo edge');
for(const marker of ["Deno.env.get('AI_APP_TOKEN')",'async function sameToken','crypto.subtle.digest',"req.headers.get('x-pro-token')",'Cache-Control','X-Content-Type-Options'])need(status,marker,'AI status edge');
for(const marker of ['abu-bassam-ai-photo',"localStorage.removeItem('abuBassamAiProToken')",'x-pro-token'])need(web,marker,'AI client');
for(const marker of ['sk-proj-','sk-live-','AIzaSy','AI_APP_TOKEN=','OPENAI_API_KEY=','GEMINI_API_KEY=']){forbid(photo,marker,'AI photo embedded secret');forbid(status,marker,'AI status embedded secret')}
forbid(web,"localStorage.setItem('abuBassamAiProToken'",'AI client must not persist PRO token');
for(const marker of ["status: 410","android build proxy retired","Cache-Control","X-Content-Type-Options"])need(buildProxy,marker,'retired Android build proxy');
for(const marker of ["bootstrap disabled","status: 410","cache-control"])need(bootstrap,marker,'disabled owner bootstrap');
for(const marker of [
  "const allowedRoles = new Set(['owner', 'manager', 'technician', 'reception'])",
  "req.headers.get('Authorization')",
  "supabase.auth.getUser()",
  "supabase.rpc('current_app_role')",
  "Deno.env.get('AI_GATEWAY_API_KEY')",
  "description.length < 3 || description.length > 3000",
  "status: 401",
  "status: 403"
])need(triage,marker,'repair triage security');
for(const marker of ["fetch(","dl.google.com","github.com/patrickfav"])forbid(buildProxy,marker,'retired Android build proxy must not fetch upstream artifacts');
for(const [label,src] of [
  ['track-repair',trackRepair],
  ['customer-documents',customerDocuments],
  ['branch-vault',branchVault],
  ['backup-center',backupCenter],
  ['app-update',appUpdate],
  ['repair-triage',triage],
]){
  need(src,'npm:@supabase/supabase-js@2.117.2',label+' must pin the approved Supabase client version');
  forbid(src,'npm:@supabase/supabase-js@2.58.0',label+' must not regress to the old Supabase client');
  forbid(src,"npm:@supabase/supabase-js@2'",label+' must not use a floating major-only Supabase client');
}
if(failures.length){process.stderr.write(failures.join('\n')+'\n');process.exit(1)}
process.stdout.write('AI/Edge checks passed: AI secrets stay environment-only, requests are bounded, PRO tokens are not persisted, provider keys are not embedded, and the retired Android build proxy cannot fetch public upstream artifacts.\n');
