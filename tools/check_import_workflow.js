const fs=require('fs');
const path=require('path');
const cp=require('child_process');

const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github','workflows','import-source-zip.yml'),'utf8');
const validatorPath=path.join(root,'tools','validate_imported_source.js');
const validator=fs.readFileSync(validatorPath,'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')).expo||{};

function need(src,marker,label){if(!src.includes(marker))throw new Error(`source import check failed: ${label}`)}
function forbid(src,marker,label){if(src.includes(marker))throw new Error(`source import check failed: forbidden ${label}`)}

for(const [marker,label] of [
  ['workflow_dispatch:','manual-only trigger'],
  ['contents: write','contents permission for isolated branch push'],
  ['pull-requests: write','PR permission'],
  ['group: source-import-main','single trusted import concurrency group'],
  ['Require trusted main ref','main-ref guard'],
  ['test "$GITHUB_REF" = "refs/heads/main"','main-ref enforcement'],
  ['uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1','immutable checkout action'],
  ['Capture trusted validator and baseline before extraction','trusted validator capture'],
  ['ABU_TRUSTED_APP_VERSION','trusted app version capture'],
  ['ABU_TRUSTED_VERSION_CODE','trusted versionCode capture'],
  ['source_zip must be a relative .zip path inside the repository','repository-relative ZIP path validation'],
  ['source_zip path contains symbolic link','archive path symlink rejection'],
  ['source_zip escapes repository workspace','archive workspace confinement'],
  ['encrypted ZIP entry','encrypted entry rejection'],
  ['unsafe path','archive path traversal check'],
  ['symbolic link','archive entry symlink rejection'],
  ['uncompressed size exceeds 500 MB','ZIP bomb limit'],
  ['npm ci --ignore-scripts --no-audit --no-fund','no npm lifecycle execution'],
  ["--exclude 'tools/validate_imported_source.js'",'trusted validator preservation'],
  ['sha256sum -c "$RUNNER_TEMP/abu-trusted/validator.sha256"','trusted validator hash verification'],
  ['cmp -s tools/validate_imported_source.js "$RUNNER_TEMP/abu-trusted/validate_imported_source.js"','trusted validator byte comparison'],
  ['source-import-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}','isolated import branch'],
  ['gh pr create','review PR creation'],
  ['--base main','PR targets main']
]) need(workflow,marker,label);

for(const [marker,label] of [
  ["paths:\n      - 'Abu_Bassam_Library",'automatic ZIP push trigger'],
  ['git push origin main','direct push to main'],
  ['git push origin HEAD:main','direct HEAD push to main'],
  ['npm run check:web','execution of imported project scripts inside import workflow'],
  ['uses: actions/checkout@v','mutable checkout action tag']
]) forbid(workflow,marker,label);

for(const [marker,label] of [
  ["for(const name of ['preinstall','install','postinstall','prepare','prepublish','prepublishOnly'])",'npm lifecycle rejection'],
  ["app.android?.package!=='com.abubassam.librarycamera3'",'Android identity validation'],
  ["app.slug!=='abu-bassam-library'",'Expo slug validation'],
  ['package.json and app.json versions must match','package/app version consistency'],
  ['Android versionCode downgrade is not allowed','versionCode downgrade rejection'],
  ["Object.prototype.hasOwnProperty.call(pkg.scripts||{},'repair:source')",'obsolete repair script rejection'],
  ["'scripts/patch-startup-stability.mjs','scripts/patch-customer-camera.mjs','web/touch-stability-runtime.js'",'obsolete patch file rejection'],
  ['forbiddenExt','signing/secret file rejection'],
  ["cp.spawnSync(process.execPath,['--check',file]",'JavaScript syntax validation']
]) need(validator,marker,label);

for(const [marker,label] of [
  ["repair.includes(marker)",'old repair:source requirement'],
  ["version must remain 4.3.2", 'hardcoded import app version'],
  ["versionCode must remain 432",'hardcoded import versionCode']
]) forbid(validator,marker,label);

const selfCheck=cp.spawnSync(process.execPath,[validatorPath,root],{
  cwd:root,
  encoding:'utf8',
  env:{
    ...process.env,
    ABU_TRUSTED_APP_VERSION:String(pkg.version||''),
    ABU_TRUSTED_VERSION_CODE:String(app.android?.versionCode||'')
  }
});
if(selfCheck.status!==0){
  throw new Error('source import check failed: trusted validator rejects current canonical source:\n'+String(selfCheck.stderr||selfCheck.stdout||'').trim());
}

console.log('Source ZIP import workflow check passed: main-only manual import, confined ZIP preflight, immutable checkout, preserved trusted validator, no imported lifecycle execution, self-validating canonical source, branch-only write, and PR review.');
