const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const failures=[];
const authoredExt=new Set(['.js','.html','.mjs','.ts','.sql','.json','.yml','.yaml','.gradle','.md','.py']);
const vendorNames=new Set(['jspdf.umd.min.js','jszip.min.js','supabase-2.58.0.js','qrcode.js','qrcode_UTF8.js']);
const secretExt=/\.(?:jks|keystore|p12|pfx|pem|key)$/i;
const forbiddenSecretNames=/^(?:\.env(?:\..*)?|id_rsa|id_ed25519)$/i;
const executableRoots=['web','scripts','supabase/functions','supabase/migrations','.github/workflows','tools'];
const forbiddenLegacyFiles=['tools/rebuild_apk.py','tools/apk_v2.py','tools/verify_release.py'];
const unfinishedWorkPattern=new RegExp(`\\b(?:${'TO'+'DO'}|${'FIX'+'ME'})\\b`,'i');
const files=[];

function walk(dir){
  if(!fs.existsSync(dir))return;
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(['node_modules','.git','dist','android','ios'].includes(ent.name))continue;
    const full=path.join(dir,ent.name);
    if(ent.isDirectory())walk(full);else files.push(full);
  }
}
for(const rel of executableRoots)walk(path.join(root,rel));
for(const rel of ['index.js','index-auth.js','package.json','app.json','.gitignore']){
  const full=path.join(root,rel);if(fs.existsSync(full))files.push(full);
}
for(const rel of forbiddenLegacyFiles)if(fs.existsSync(path.join(root,rel)))failures.push(`${rel}: legacy APK repack/sign/verify path must stay removed; Gradle + apksigner is authoritative`);

for(const full of files){
  const rel=path.relative(root,full).replace(/\\/g,'/');
  const base=path.basename(full);
  if(secretExt.test(base)||forbiddenSecretNames.test(base))failures.push(`${rel}: secret/signing material must not be tracked`);
  const ext=path.extname(full).toLowerCase();
  if(!authoredExt.has(ext)&&base!=='.gitignore')continue;
  const src=fs.readFileSync(full,'utf8');
  if(src.includes('\0'))failures.push(`${rel}: contains NUL byte`);
  if(/^(?:<{7}|={7}|>{7})(?: .*)?$/m.test(src))failures.push(`${rel}: unresolved merge-conflict marker`);
  if(!vendorNames.has(base)&&['.js','.html','.mjs','.ts','.py'].includes(ext)&&unfinishedWorkPattern.test(src))failures.push(`${rel}: unfinished-work marker left in executable source`);
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(src))failures.push(`${rel}: embedded private key detected`);
  if(/\bghp_[A-Za-z0-9]{30,}\b/.test(src)||/\bgithub_pat_[A-Za-z0-9_]{30,}\b/.test(src))failures.push(`${rel}: embedded GitHub credential detected`);
  if(/\bsb_secret_[A-Za-z0-9_-]{20,}\b/.test(src))failures.push(`${rel}: embedded Supabase secret key detected`);
  if(src.includes('com.akramghazali.phonerepair'))failures.push(`${rel}: obsolete PhoneRepair package identity returned`);
  if(src.includes('مركز أكرم الغزالي'))failures.push(`${rel}: obsolete application identity returned`);
  if((rel.startsWith('web/')||rel.startsWith('tools/'))&&ext==='.js'&&!vendorNames.has(base)){
    try{new vm.Script(src,{filename:rel})}catch(e){failures.push(`${rel}: JavaScript syntax error: ${e.message}`)}
  }
  if(rel==='tools/render_card_previews.py'){
    if(/@gmail\.com/i.test(src))failures.push(`${rel}: preview generator must not embed personal Gmail credentials`);
    if(!src.includes('user@example.invalid')||!src.includes('DEMO-NOT-A-REAL-PASSWORD'))failures.push(`${rel}: preview generator must use explicit non-secret demo credentials`);
  }
}

let packageJson=null;
for(const rel of ['package.json','app.json']){
  try{
    const parsed=JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
    if(rel==='package.json')packageJson=parsed;
  }catch(e){failures.push(`${rel}: invalid JSON: ${e.message}`)}
}
if(packageJson){
  const checkWeb=String(packageJson.scripts?.['check:web']||'');
  const checkerFiles=fs.readdirSync(path.join(root,'tools')).filter(name=>/^check_.*\.js$/i.test(name)).sort();
  for(const name of checkerFiles){
    const marker=`node tools/${name}`;
    if(!checkWeb.includes(marker))failures.push(`package.json: permanent checker is orphaned from check:web: tools/${name}`);
  }
}

const native=fs.readFileSync(path.join(root,'index.js'),'utf8');
for(const bad of ["originWhitelist={['*']}",'mixedContentMode="always"','allowUniversalAccessFromFileURLs={true}'])if(native.includes(bad))failures.push(`index.js: insecure WebView setting returned: ${bad}`);
for(const good of ["originWhitelist={['file://*','about:*']}",'mixedContentMode="never"','onShouldStartLoadWithRequest'])if(!native.includes(good))failures.push(`index.js: missing hardened WebView marker: ${good}`);
const gitignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
for(const pattern of ['*.jks','*.keystore','*.p12','*.pfx','*.pem','*.key'])if(!gitignore.includes(pattern))failures.push(`.gitignore: missing signing/secret exclusion ${pattern}`);

if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log(`repository hygiene passed: ${files.length} source/config files checked; authored web JavaScript parses; every permanent check_*.js is wired into check:web; legacy APK repack/sign paths and old app identity stay removed; no merge markers, TODO/FIXME, tracked signing files, obvious embedded private keys/tokens, or insecure WebView regression detected.`);
