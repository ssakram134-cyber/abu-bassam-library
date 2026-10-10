'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','scripts/prepare-android-assets.mjs'),'utf8');
const a=source.indexOf('function validAssetContent('),b=source.indexOf('\nasync function fetchWithTimeout(',a);
assert.ok(a>=0&&b>a);const fragment=source.slice(a,b);new vm.Script(fragment);
assert.match(fragment,/gunzipSync\(data,\{maxOutputLength:256\*1024\*1024\}\)/);
assert.match(source,/if\(!validAssetContent\(data,path\)\)throw/);
assert.match(fragment,/return validAssetContent\(await readFile\(path\),path\)/);
let opened=0,stored=Buffer.from('var Tesseract=function(){};'+' '.repeat(21000));
const deps={
 stat:async()=>({size:stored.length}),readFile:async()=>{opened++;return stored},
 gunzipSync:d=>{if(d[0]!==31||d[1]!==139)throw Error('INVALID_GZIP');return Buffer.alloc(11000)}
};
const f=new Function('stat','readFile','gunzipSync',fragment+';return {validAssetContent,existsEnough}')(...['stat','readFile','gunzipSync'].map(k=>deps[k]));
assert.equal(f.validAssetContent(stored,'worker.min.js'),true);
assert.equal(f.validAssetContent(Buffer.alloc(21000),'worker.min.js'),false);
assert.equal(f.validAssetContent(Buffer.from('<html><title>error</title>'+' '.repeat(21000)),'worker.min.js'),false);
assert.equal(f.validAssetContent(Buffer.from('{"status":"error"}'+' '.repeat(21000)),'worker.min.js'),false);
assert.equal(f.validAssetContent(Buffer.from([31,139,8,0]),'ara.traineddata.gz'),true);
assert.equal(f.validAssetContent(Buffer.from([31,139,7,0]),'ara.traineddata.gz'),false);
assert.equal(f.validAssetContent(Buffer.alloc(500000),'ara.traineddata.gz'),false);
(async()=>{
 assert.equal(await f.existsEnough('worker.min.js',20000),true);
 stored=Buffer.alloc(21000);
 assert.equal(await f.existsEnough('worker.min.js',20000),false,'Do not trust invalid cached asset');
 assert.equal(opened,2);
 const commands=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8')).scripts['check:web'].split(' && ');
 assert.ok(commands.includes('node tools/check_fresh_audit_ocr_payload_integrity.js'));
 console.log('OCR content checks reject HTTP errors, zero-filled cached JS, invalid GZIP and unbounded expansion.');
})().catch(error=>{console.error(error);process.exitCode=1});
