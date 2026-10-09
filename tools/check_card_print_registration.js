'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'cards-studio-runtime.js'), 'utf8');
new vm.Script(source, { filename: 'cards-studio-runtime.js' });

function segment(start, next) {
  const a = source.indexOf(start);
  const b = source.indexOf(next, a + start.length);
  assert.ok(a !== -1 && b > a, 'Missing canonical print code: ' + start);
  return source.slice(a, b);
}
const layout = segment('function a4SheetRows(', '\nfunction queueCount(');
const print = segment('function printDocument(){', '\nfunction recordHistory(');
const build = new Function(
  'state','expandedJobs','cardHtml','fullPrintCss','freeLayoutCss','cap','$','queueCount',
  layout + '\n' + print + '\nreturn {a4SheetRows,duplexSheetSlots,printDocument,renderStatus};'
);

const DEFAULT = { output:'a4-duplex', sides:'both', width:85.6, height:53.98,
  gap:2, marginX:7, marginY:5, bleed:1, flip:'horizontal', copies:1 };
function create(count, options={}) {
  const state = { ...DEFAULT, ...options };
  const models = Array.from({ length:count }, (_,i)=>({ id:'ID'+String(i+1).padStart(2,'0') }));
  const status = { textContent:'' };
  const api = build(state, () => models,
    (model,side)=>'<div data-card="'+model.id+'" data-side="'+side+'"></div>',
    ()=>'.root{color:#000}', ()=>'', (value,min,max)=>Math.max(min,Math.min(max,Number(value)||0)),
    ()=>status, ()=>models.length);
  return { state, models, api, status };
}
function pages(html, klass) {
  return [...html.matchAll(new RegExp('<section class="'+klass+'"[^>]*>([\\s\\S]*?)<\\/section>', 'g'))]
    .map(match=>match[1]);
}
function duplexCells(body) {
  const cells = [];
  const matcher = /<div class="pair-card cut"><div data-card="([^"]+)" data-side="(front|back)"><\/div><\/div>|<div class="duplex-empty" aria-hidden="true"><\/div>/g;
  for (const match of body.matchAll(matcher)) cells.push(match[1] ? {id:match[1],side:match[2]} : null);
  return cells;
}
assert.match(source, /align-content:center;direction:ltr;page-break-after:always/);
assert.match(source, /\.duplex-empty\{width:var\(--cw\);height:var\(--ch\)\}/);
assert.match(source, /card\.style\.aspectRatio=\x60\$\{model\.width\} \/ \$\{model\.height\}\x60/);
assert.equal((source.match(/\.cs-row span\{min-width:0;font-weight:700;white-space:normal;overflow-wrap:anywhere/g)||[]).length,2);
assert.doesNotMatch(source, /\.cs-row span\{[^}]*text-overflow:ellipsis/);

let cases = 0;
for (const options of [
  { width:85.6,height:53.98,flip:'horizontal' },
  { width:85.6,height:53.98,flip:'vertical' },
  { width:54,height:85.6,flip:'horizontal' },
  { width:54,height:85.6,flip:'vertical' },
  { width:65,height:125,flip:'horizontal' },
  { width:65,height:125,flip:'vertical' },
]) for (const count of [1,2,3,5,7,9,10,11,13,25]) {
  const {api,status}=create(count,options), html=api.printDocument();
  const rows=api.a4SheetRows('a4-duplex',options.width,options.height,2,7,5,true);
  const capacity=rows*2;
  const sections=pages(html,'duplex-page');
  assert.equal(sections.length,2*Math.ceil(count/capacity), 'two sides for every physical A4 sheet');
  for(let p=0;p<sections.length;p+=2) {
    const front=duplexCells(sections[p]),back=duplexCells(sections[p+1]);
    assert.equal(front.length,capacity,'front must preserve all grid slots');
    assert.equal(back.length,capacity,'back must preserve all grid slots');
    for(let slot=0;slot<capacity;slot++){
      const index=Math.floor(p/2)*capacity+slot, expected=index<count?'ID'+String(index+1).padStart(2,'0'):null;
      assert.equal(front[slot]?.id||null,expected,'front must preserve physical slot');
      if(front[slot])assert.equal(front[slot].side,'front');
      const row=Math.floor(slot/2),col=slot%2;
      const origin=options.flip==='vertical'?(rows-1-row)*2+col:row*2+(1-col);
      assert.equal(back[slot]?.id||null,front[origin]?.id||null,'back must mirror correct slot including blanks');
      if(back[slot])assert.equal(back[slot].side,'back');
    }
  }
  api.renderStatus();
  assert.ok(status.textContent.includes(sections.length+' صفحة متوقعة'),'Status count must equal real generated pages');
  cases++;
}
for (const sides of ['front','back']) {
  const {api}=create(7,{sides,flip:'vertical'});
  const sections=pages(api.printDocument(),'duplex-page');
  assert.equal(sections.length,1,'Single-sided sheet must only output one physical face');
  assert.equal(duplexCells(sections[0]).filter(Boolean).length,7);
  assert.ok(duplexCells(sections[0]).filter(Boolean).every(c=>c.side===sides));
}
for (const count of [1,4,7,12]) {
  const {api,status}=create(count,{output:'a4-pairs',width:54,height:85.6});
  const html=api.printDocument();
  const capacity=api.a4SheetRows('a4-pairs',54,85.6,2,7,5,true);
  const sections=pages(html,'pair-page');
  assert.equal(sections.length,Math.ceil(count/capacity));
  api.renderStatus();
  assert.ok(status.textContent.includes(sections.length+' صفحة متوقعة'));
}
for (const sides of ['both','front','back']) {
  const {api,status}=create(3,{output:'cr80',sides,width:85.6,height:54});
  const html=api.printDocument();
  assert.equal(pages(html,'single-page cut').length,sides==='both'?6:3);
  assert.ok(html.includes('@page{size:85.6mm 54mm;margin:0}'));
  api.renderStatus();
  assert.ok(status.textContent.includes((sides==='both'?6:3)+' صفحة متوقعة'));
}
for (const options of [
  {output:'a4-duplex',width:100,height:53.98,marginX:10,gap:5},
  {output:'a4-pairs',width:100,height:53.98,marginX:10,gap:5},
  {output:'a4-duplex',width:54,height:300},
  {output:'a4-duplex',width:-2},
  {output:'a4-duplex',gap:-5},
]) {
  const {api,status}=create(3,options);
  assert.throws(()=>api.printDocument(), /لا يتسع|غير صالحة|غير صالح/);
  api.renderStatus();
  assert.match(status.textContent,/تعذر تخطيط الطباعة/);
}
console.log('A4/CR80 registration checks passed: '+cases+' duplex page/count combinations, mirrored blanks, variable row capacities, one-sided modes, custom card preview ratio, long-text wrapping and real page-count parity.');
