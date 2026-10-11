'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const native=fs.readFileSync('index.js','utf8');
function region(begin,end){
 const a=native.indexOf(begin),z=native.indexOf(end,a+begin.length);
 assert.ok(a>=0&&z>a,'Missing native printer segment '+begin);
 return native.slice(a,z)
}
const geometry=region('function printDimensions(paper) {','function nativeDeviceInfo(');
const callback=region('  const printPages = useCallback(async ({ pages, paper }) => {','  const printHtml = useCallback(');
const printed=[],warnings=[];
const printer=new Function('useCallback','Print','Alert',geometry+callback+';return printPages')(
 fn=>fn,{printAsync:async args=>{printed.push(args.html)}},{alert:(title,message)=>warnings.push([title,String(message)])});
const valid='data:image/png;base64,VEVTVA==';
(async()=>{
 await printer({pages:JSON.stringify([valid,valid]),paper:'CUSTOM:297:210'});
 assert.equal(printed.length,1);
 assert.ok(printed[0].includes('size:297mm 210mm'));
 assert.ok(printed[0].includes(valid));
 await printer({pages:[valid],paper:'CUSTOM:100000:210'});
 assert.equal(printed.length,1,'Invalid paper dimensions must not silently fall back to A4');
 await printer({pages:Array.from({length:21},()=>valid),paper:'A4'});
 assert.equal(printed.length,1,'Overlong batches must be refused');
 await printer({pages:['https://example.org/photo'],paper:'A4'});
 assert.equal(printed.length,1,'Remote images must be refused for offline printing');
 await printer({pages:['data:image/svg+xml;base64,VEVTVA=='],paper:'A4'});
 assert.equal(printed.length,1,'Executable SVG must not be embedded in native print HTML');
 await printer({pages:['data:image/png;base64,VEVTVA==\" onerror=\"alert(1)'],paper:'A4'});
 assert.equal(printed.length,1,'Invalid data URI must never create HTML attributes');
 assert.equal(warnings.length,5,'Every refused job must have visible error feedback');
 console.log('Android page print safety checks passed: physical paper dimensions, 20-page cap, local raster-only data and invalid-geometry rejection.');
})().catch(e=>{console.error(e);process.exitCode=1});
