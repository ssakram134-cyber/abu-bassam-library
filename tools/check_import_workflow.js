const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github','workflows','import-source-zip.yml'),'utf8');
const validator=fs.readFileSync(path.join(root,'tools','validate_imported_source.js'),'utf8');
function need(src,marker,label){if(!src.includes(marker))throw new Error(`source import check failed: ${label}`)}
function forbid(src,marker,label){if(src.includes(marker))throw new Error(`source import check failed: forbidden ${label}`)}
need(workflow,'workflow_dispatch:','manual-only trigger');
const eventBlock = workflow.match(/^on:\s*\r?\n([\s\S]*?)(?=^[^\s#\r\n])/m)?.[1] || '';
const triggers = [...eventBlock.matchAll(/^  ([a-zA-Z_][\w-]*):\s*$/gm)].map(match => match[1]);
if (triggers.length !== 1 || triggers[0] !== 'workflow_dispatch') {
  throw new Error('source import must be manual-only; actual triggers: ' + triggers.join(', '));
}
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
const validation = cp.spawnSync(process.execPath,[path.join(root,'tools','validate_imported_source.js'),root],{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
if(validation.error || validation.status!==0)throw new Error('Trusted ZIP validator rejected the actual current repository: '+String(validation.error?.message||validation.stderr||validation.stdout||validation.status));
console.log('Source ZIP import workflow check passed: manual preflight, validator accepts current repository, no lifecycle scripts, branch-only write, and PR review.');
