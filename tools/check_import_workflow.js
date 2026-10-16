const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github','workflows','import-source-zip.yml'),'utf8');
const validator=fs.readFileSync(path.join(root,'tools','validate_imported_source.js'),'utf8');
const sourceAudit=fs.readFileSync(path.join(root,'.github','workflows','source-audit.yml'),'utf8');
const sourceChecks=fs.readFileSync(path.join(root,'.github','workflows','source-code-checks.yml'),'utf8');
function need(src,marker,label){if(!src.includes(marker))throw new Error(`source import check failed: ${label}`)}
function forbid(src,marker,label){if(src.includes(marker))throw new Error(`source import check failed: forbidden ${label}`)}
need(workflow,'workflow_dispatch:','manual-only trigger');
need(workflow,'pull-requests: write','PR permission');
need(workflow,'Capture trusted validator before extraction','trusted validator capture');
need(workflow,'unsafe path','archive path traversal check');
need(workflow,'symbolic link','archive symlink rejection');
need(workflow,'uncompressed size exceeds 500 MB','ZIP bomb limit');
need(workflow,'npm ci --ignore-scripts --no-audit --no-fund','no npm lifecycle execution');
need(workflow,'source-import-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}','isolated import branch');
need(workflow,'git add -A','new files must be staged before change detection');
need(workflow,'if git diff --cached --quiet; then','change detection must include staged new files');
const stage=workflow.indexOf('git add -A');
const noChanges=workflow.indexOf('if git diff --cached --quiet; then');
if(stage<0||noChanges<=stage)throw new Error('source import check failed: stage files before no-change check');
forbid(workflow,'if git diff --quiet && git diff --cached --quiet','untracked files ignored by no-change check');
need(workflow,'gh pr create','review PR creation');
need(workflow,'--base main','PR targets main');
forbid(workflow,'paths:\n      - \'Abu_Bassam_Library','automatic ZIP push trigger');
forbid(workflow,'git push origin main','direct push to main');
forbid(workflow,'git push origin HEAD:main','direct HEAD push to main');
forbid(workflow,'npm run check:web','execution of imported project scripts inside import workflow');
need(validator,"for(const name of ['preinstall','install','postinstall','prepare','prepublish','prepublishOnly'])",'npm lifecycle rejection');
need(validator,"if(Object.prototype.hasOwnProperty.call(pkg.scripts||{},'repair:source'))",'reject obsolete repair command');
need(validator,"if(rel==='index.js')continue;",'do not parse JSX as ordinary Node script');
forbid(validator,'repair:source missing explicit compatibility repair:','obsolete repair requirement');
need(validator,"app.android?.package!=='com.abubassam.librarycamera3'",'Android identity validation');
need(validator,"app.slug!=='abu-bassam-library'",'Expo slug validation');
need(validator,"forbiddenExt",'signing/secret file rejection');
need(validator,"cp.spawnSync(process.execPath,['--check',file]",'JavaScript syntax validation');
need(sourceAudit,'workflow_dispatch:','source-only audit must be manual');
need(sourceAudit,'contents: read','source-only audit read permission');
need(sourceAudit,'npm ci --ignore-scripts --no-audit --no-fund','source audit must not execute dependency lifecycle scripts');
need(sourceAudit,'npm run check:all','source audit must use the full source test suite');
for(const unsafe of ['  push:','  pull_request:','  schedule:','assembleRelease','android:prebuild','upload-artifact']){
  forbid(sourceAudit,unsafe,`source audit must never trigger builds or automatic runs: ${unsafe}`);
}
for(const marker of ["      - '.github/workflows/**'","      - '.gitignore'","      - 'config/**'","      - 'codemagic.yaml'","      - 'eas.json'"]){
  need(sourceChecks,marker,'source-check push trigger missing release configuration coverage: '+marker);
}
for(const marker of ['contents: read','npm ci --ignore-scripts --no-audit --no-fund','npm run check:web']){
  need(sourceChecks,marker,'read-only source-check workflow missing: '+marker);
}
for(const unsafe of ['assembleRelease','android:prebuild','upload-artifact','./gradlew']){
  forbid(sourceChecks,unsafe,'source-only workflow must never assemble Android: '+unsafe);
}
console.log('Source ZIP import and both source-only workflow policy checks passed.');
