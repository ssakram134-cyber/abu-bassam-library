'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','scripts/build-android-local.mjs'),'utf8');
const a=source.indexOf('function verifyBundle(apk) {'),b=source.indexOf('\nfunction sdkRoot()',a);
assert.ok(a>=0&&b>a);const fnSource=source.slice(a,b);
assert.match(fnSource,/expectedCrc/);assert.match(fnSource,/crc32\(contents\) !== expectedCrc/);
assert.match(fnSource,/maxOutputLength: MAX_BUNDLE_BYTES/);
const verify=new Function('fs','inflateRawSync',fnSource+';return verifyBundle')({readFileSync:()=>zip},()=>{throw Error('Unexpected inflate')});
class ZipBytes extends Uint8Array{
 readUInt16LE(i){return this[i]+this[i+1]*256}
 readUInt32LE(i){return(this[i]+this[i+1]*256+this[i+2]*65536+this[i+3]*16777216)>>>0}
 toString(){return String.fromCharCode(...this)}
}
function crc(bytes){let n=-1;for(const v of bytes){n^=v;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return(n^-1)>>>0}
function build(size=1200){
 const name='assets/index.android.bundle',n=name.length,dir=30+n+size,end=dir+46+n;
 const b=new ZipBytes(end+22),u16=(i,v)=>{b[i]=v&255;b[i+1]=(v>>>8)&255};
 const u32=(i,v)=>{u16(i,v&65535);u16(i+2,(v>>>16)&65535)};
 const str=(i,s)=>{for(let j=0;j<s.length;j++)b[i+j]=s.charCodeAt(j)};
 u32(0,0x04034b50);u16(8,0);u32(18,size);u32(22,size);u16(26,n);str(30,name);
 for(let k=0;k<size;k++)b[30+n+k]=65;
 u32(dir,0x02014b50);u16(dir+10,0);u32(dir+16,crc(b.subarray(30+n,dir)));
 u32(dir+20,size);u32(dir+24,size);u16(dir+28,n);u32(dir+42,0);str(dir+46,name);
 u32(end,0x06054b50);u16(end+8,1);u16(end+10,1);u32(end+12,46+n);u32(end+16,dir);
 return{bytes:b,dir}
}
let item=build(),zip=item.bytes;
assert.equal(verify('valid.apk'),1200,'Proper ZIP and CRC should pass');
zip[30+'assets/index.android.bundle'.length+120]^=1;
assert.throws(()=>verify('altered.apk'),/CRC-32 does not match/,'Equal-length corruption must fail');
item=build();zip=item.bytes;zip[item.dir+16]^=1;
assert.throws(()=>verify('forged-crc.apk'),/CRC-32 does not match/,'Corrupt ZIP directory checksum must fail');
item=build();zip=item.bytes;zip[item.dir+24]=1;zip[item.dir+25]=0;zip[item.dir+26]=0;zip[item.dir+27]=4;
assert.throws(()=>verify('bomb.apk'),/empty, encrypted, or uses an unsupported encoding/,'Unreasonably large declared output rejected before inflation');
assert.match(source,/if \(found.length > 1\)/,'Ambiguous APK selection must fail closed');
console.log('Fresh audit closure CRC: validated real bundle checksum, corrupted payload/header rejection and bounded ZIP decompression.');
