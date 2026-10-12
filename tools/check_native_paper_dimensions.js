'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','index.js'),'utf8');
const sizeCode=code.match(/function printDimensions\(paper\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(sizeCode,'Native printDimensions must exist');
const printDimensions=new Function(sizeCode+';return printDimensions')();
for(const [paper,expected] of [
 ['A4',{width:210,height:297}],
 ['A5',{width:148,height:210}],
 ['A6',{width:105,height:148}],
 ['10x15',{width:100,height:150}],
 ['CUSTOM:85.6:54',{width:85.6,height:54}],
 ['CUSTOM:297:420',{width:297,height:420}],
 ['CUSTOM:1000:2000',{width:1000,height:2000}],
 ['CUSTOM:0:200',{width:210,height:297}],
 ['CUSTOM:-5:100',{width:210,height:297}],
 ['CUSTOM:Infinity:150',{width:210,height:297}],
 ['CUSTOM:1e309:150',{width:210,height:297}],
 ['CUSTOM:150:NaN',{width:210,height:297}],
 ['CUSTOM:150:5000',{width:210,height:297}],
 ['CUSTOM::120',{width:210,height:297}]
])assert.deepEqual(printDimensions(paper),expected,'Paper size '+paper);
console.log('Native custom paper sizes passed: A4/A5/A6, CR80, A3, tall posters and rejection of invalid/oversized CSS sizes.');
