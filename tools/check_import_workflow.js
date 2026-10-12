const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github','workflows','import-source-zip.yml'),'utf8');
const validator=fs.readFileSync(path.join(root,'tools','validate_imported_source.js'),'utf8');
function need(src,marker,label){if(!src.includes(marker))throw new Error(`source import check failed: ${label}`)}
function forbid(src,marker,label){if(src.includes(marker))throw new Error(`source import check failed: forbidden ${label}`)}
const sourceChecks=fs.readFileSync(path.join(root,'.github','workflows','source-code-checks.yml'),'utf8');
function checkSourceBranchGate(){
  need(sourceChecks,'pull_request:','source-check workflow must run before PR merge');
  need(sourceChecks,'branches: [main]','source-check workflow must target main');
  need(sourceChecks,"'.github/workflows/**'",'workflow edits must run source checks');
  need(sourceChecks,"'AGENTS.md'",'approved project contract edits must run source checks');
  need(sourceChecks,'permissions:' + String.fromCharCode(10) + '  contents: read','source checks must be read-only');
  need(sourceChecks,'npm run check:web','source checks must run canonical validation');
  const trigger=sourceChecks.split('  pull_request:')[1]?.split('  workflow_dispatch:')[0]||'';
  if(!trigger)throw new Error('Source CI must include a pull_request gate');
  forbid(trigger,'paths:','required PR source checks must not be filtered by changed paths');
  forbid(trigger,'paths-ignore:','required PR source checks must not be skipped by ignored paths');
  need(sourceChecks,'# All PRs must receive source verification','unfiltered PR verification must be explicit');
  forbid(sourceChecks,'contents: write','source checks must never have source write permission');
  forbid(sourceChecks,'git push','source checks must not push commits');
}
checkSourceBranchGate();
need(workflow,'workflow_dispatch:','manual-only trigger');
need(workflow,'pull-requests: write','PR permission');
need(workflow,'Capture trusted validator before extraction','trusted validator capture');
need(workflow,'unsafe path','archive path traversal check');
need(workflow,'symbolic link','archive symlink rejection');
need(workflow,'uncompressed size exceeds 500 MB','ZIP bomb limit');
need(workflow,'npm ci --ignore-scripts --no-audit --no-fund','no npm lifecycle execution');
need(workflow,'source-import-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}','isolated import branch');
need(workflow,'gh pr create','review PR creation');
need(workflow,'--base main','PR targets main');
forbid(workflow,'paths:\n      - \'Abu_Bassam_Library','automatic ZIP push trigger');
forbid(workflow,'git push origin main','direct push to main');
forbid(workflow,'git push origin HEAD:main','direct HEAD push to main');
forbid(workflow,'npm run check:web','execution of imported project scripts inside import workflow');
need(validator,"for(const name of ['preinstall','install','postinstall','prepare','prepublish','prepublishOnly'])",'npm lifecycle rejection');
need(validator,"app.android?.package!=='com.abubassam.librarycamera3'",'Android identity validation');
need(validator,"app.slug!=='abu-bassam-library'",'Expo slug validation');
need(validator,"forbiddenExt",'signing/secret file rejection');
need(validator,"cp.spawnSync(process.execPath,['--check',file]",'JavaScript syntax validation');
console.log('Source ZIP and PR source-check workflows passed: trusted validation, read-only PR verification, and no write to main.');
