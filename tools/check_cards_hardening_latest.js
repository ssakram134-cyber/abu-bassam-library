const fs=require('fs');
function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
function need(src,token,label){if(!src.includes(token))throw new Error(`cards latest hardening failed: ${label}`)}
const fixes=read('web/cards-hardening-fixes-runtime.js');
const upgrades=read('web/cards-section-upgrades-runtime.js');
new Function(fixes);new Function(upgrades);
need(upgrades,'cards-hardening-fixes-runtime.js','latest hardening runtime is not loaded');
need(fixes,'reapplyOverrides','text/image overrides must survive rerender');
need(fixes,"b.dataset.image='1'",'standalone image replacement button is missing');
need(fixes,"cardsEditImage",'image replacement must obey cardsEditImage permission');
need(fixes,"cardsEditText",'text editing must obey cardsEditText permission');
need(fixes,"mode.startsWith('a4')",'A4 layout permission guard is missing');
need(fixes,"mode==='cr80'",'direct CR80 permission guard is missing');
need(fixes,'isCardA4','native bridge A4 bypass guard is missing');
console.log('latest cards hardening checks passed');
