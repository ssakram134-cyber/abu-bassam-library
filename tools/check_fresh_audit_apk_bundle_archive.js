'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','scripts/build-android-local.mjs'),'utf8');
const begin=source.indexOf('function verifyBundle(apk) {'),end=source.indexOf('\nfunction sdkRoot()',begin);
assert.ok(begin>=0&&end>begin);
const body=source.slice(begin,end);
assert.doesNotMatch(body,/buf\.includes\(Buffer\.from\(/,'A ZIP filename substring is not evidence of a real embedded JS asset');
assert.match(body,/0x06054b50/);
assert.match(body,/0x02014b50/);
assert.match(body,/0x04034b50/);
assert.match(body,/inflateRawSync/);
assert.match(body,/contents\.length < 1000/);
class Binary extends Uint8Array{
 readUInt16LE(i){return this[i]+this[i+1]*256}
 readUInt32LE(i){return (this[i]+this[i+1]*256+this[i+2]*65536+this[i+3]*16777216)>>>0}
 toString(){return String.fromCharCode(...this)}
}
function independentCrc32(bytes){let crc=-1;for(const byte of bytes){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return(crc^-1)>>>0}
function zipWithBundle(size=1200){
 const name='assets/index.android.bundle',n=name.length;
 const c=30+n+size,total=c+46+n+22,b=new Binary(total);
 const u16=(i,v)=>{b[i]=v&255;b[i+1]=(v>>>8)&255};
 const u32=(i,v)=>{u16(i,v&65535);u16(i+2,(v>>>16)&65535)};
 const str=(i,v)=>{for(let j=0;j<v.length;j++)b[i+j]=v.charCodeAt(j)};
 u32(0,0x04034b50);u16(8,0);u32(18,size);u32(22,size);u16(26,n);
 str(30,name);for(let j=0;j<size;j++)b[30+n+j]=65;
 u32(c,0x02014b50);u16(c+10,0);u32(c+16,independentCrc32(b.subarray(30+n,30+n+size)));u32(c+20,size);u32(c+24,size);u16(c+28,n);u32(c+42,0);str(c+46,name);
 const e=c+46+n;u32(e,0x06054b50);u16(e+8,1);u16(e+10,1);u32(e+12,46+n);u32(e+16,c);
 return b
}
let input=zipWithBundle();
const verify=new Function('fs','inflateRawSync',body+';return verifyBundle')({readFileSync:()=>input},()=>{throw Error('Unexpected decompression')});
assert.equal(verify('sample.apk'),1200,'Valid stored real bundle inside a ZIP is accepted');
input=new Binary(3000);const marker='assets/index.android.bundle';for(let i=0;i<marker.length;i++)input[150+i]=marker.charCodeAt(i);
assert.throws(()=>verify('fake.apk'),/central directory is missing/,'A random signed blob with the name substring is rejected');
input=zipWithBundle(10);
assert.throws(()=>verify('small.apk'),/empty, encrypted, or uses an unsupported encoding/,'Truncated/minimal JS bundle is rejected');
input=zipWithBundle(1200);input[50]=66;
assert.throws(()=>verify('corrupt.apk'),/CRC-32 does not match/,'Tampering with same-size JS bytes must invalidate ZIP integrity');
input=zipWithBundle(1200);input[0]=0;
assert.throws(()=>verify('broken.apk'),/no local ZIP file entry/,'A forged central directory without a local ZIP entry is rejected');
const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8'));
const cmds=pkg.scripts['check:web'].split(' && ');
assert.ok(cmds.includes('node tools/check_fresh_audit_apk_bundle_archive.js'));
assert.equal(new Set(cmds).size,cmds.length);
console.log('Fresh audit C: APK release script verifies actual ZIP entry and nontrivial embedded JS bytes, not a stray filename substring.');
