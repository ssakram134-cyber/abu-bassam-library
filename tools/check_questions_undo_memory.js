'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const arabic=fs.readFileSync('web/questions-ar.html','utf8');
const english=fs.readFileSync('web/questions-en.html','utf8');
const template=fs.readFileSync('web/questions-templates-runtime.js','utf8');
for(const [name,html] of [['ar',arabic],['en',english]]){
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);
 scripts.forEach((js,i)=>new vm.Script(js,{filename:name+':'+i}));
 const start=html.indexOf('let undoStack = [];'),end=html.indexOf('function undoAction()',start);
 assert.ok(start>=0&&end>start,'Missing canonical undo stack in '+name);
 let content='start';
 const document={getElementById:()=>({get innerHTML(){return content}})};
 const api=new Function('document',html.slice(start,end)+';return {saveState,history:()=>undoStack}')(document);
 for(let i=0;i<30;i++){content=String(i).repeat(400000);api.saveState()}
 assert.ok(api.history().length<=20,'Undo stack entry count must be bounded');
 assert.ok(api.history().reduce((sum,x)=>sum+x.length,0)<=6*1024*1024,
  'Undo memory budget must be enforced for '+name);
 content='BIG'.repeat(3*1024*1024);api.saveState();
 assert.equal(api.history().length,0,'Too-large snapshots must clear unsafe history');
}
new vm.Script(template,{filename:'question templates'});
const s=template.indexOf('const QUESTION_HISTORY_BUDGET=');
const e=template.indexOf('function scheduleHistory()',s);
assert.ok(s>=0&&e>s,'Missing template undo budget');
const history=new Function('stack',template.slice(s,e)+';return boundQuestionHistory(stack)');
let stack=Array.from({length:50},(_,i)=>String(i).repeat(400000));
history(stack);
assert.ok(stack.length<=20&&stack.reduce((n,x)=>n+x.length,0)<=6*1024*1024,
 'Template history must be limited by total HTML size');
const empty=new Array(4).fill('x'.repeat(7*1024*1024));
history(empty);assert.equal(empty.length,0,'Oversize template snapshots must be dropped');
assert.ok(template.includes('boundQuestionHistory(redoStack)')&&template.includes('boundQuestionHistory(history)'),
 'Redo as well as undo must be bounded');
console.log('Question undo memory checks passed: Arabic, English and templates reject oversized HTML snapshots and cap history including redo.');
