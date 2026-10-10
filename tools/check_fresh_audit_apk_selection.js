'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','scripts/build-android-local.mjs'),'utf8');
const a=source.indexOf('function findApk(dir) {'),b=source.indexOf('\nfunction ensureReleaseSigningHook(',a);
assert.ok(a>=0&&b>a);const fnSource=source.slice(a,b);
assert.match(fnSource,/found\.length > 1/);
assert.doesNotMatch(fnSource,/\.apk\$\/i\.test\(name\)\) return p/);
let entries={};
const fakeFs={
 existsSync:p=>Object.prototype.hasOwnProperty.call(entries,p),
 readdirSync:p=>entries[p]||[],
 statSync:p=>({isDirectory:()=>Object.prototype.hasOwnProperty.call(entries,p+'/'),
  isFile:()=>!Object.prototype.hasOwnProperty.call(entries,p+'/')})
};
const fakePath={join:(...parts)=>parts.join('/').replace(/\/+/g,'/')};
const find=new Function('fs','path',fnSource+';return findApk')(fakeFs,fakePath);
assert.equal(find('/missing'),null);
entries={'/apk':['app-release.apk','output-metadata.json']};
assert.equal(find('/apk'),'/apk/app-release.apk','Single exact release artifact accepted');
entries={'/apk':['app-release.apk','app-release-2.apk']};
assert.throws(()=>find('/apk'),/Multiple release APKs found/,'Do not distribute an arbitrary APK when two builds are present');
entries={'/apk':['sub','app-release.apk'],'/apk/sub':['app-release-2.apk'],'/apk/sub/':[]};
assert.throws(()=>find('/apk'),/Multiple release APKs found/,'Recursive directory ambiguity rejected');
const cmds=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8')).scripts['check:web'].split(' && ');
assert.ok(cmds.includes('node tools/check_fresh_audit_apk_integrity_crc.js'));
assert.ok(cmds.includes('node tools/check_fresh_audit_apk_selection.js'));
assert.equal(new Set(cmds).size,cmds.length);
console.log('Fresh audit closure APK selection: absent/single/multiple/nested release artifacts all handled deterministically.');
