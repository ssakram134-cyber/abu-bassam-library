'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('web/index.html','utf8');
const start=html.indexOf('async function makePdfDataAsync(){');
const end=html.indexOf('function tgCaption(',start);
assert.ok(start>=0&&end>start,'Cannot locate cooperative PDF exporter');
const source=html.slice(start,end);
for(const marker of [
 'const pages=pageCanvases.slice(),revision=pagePrintMeta;',
 'const unchanged=()=>pagePrintMeta===revision',
 'pages.every((cv,i)=>pageCanvases[i]===cv',
 'ensureCurrent();',
 'if(imageBytes>28*1024*1024)',
 'if(makePdfDataAsync.busy)throw new Error(',
 '}finally{makePdfDataAsync.busy=false}'
])assert.ok(source.includes(marker),'PDF revision or size contract missing: '+marker);

let cases=0;
function check(condition,label){assert.ok(condition,label);cases++}
function canvas(id,{onRead=null,bytes=5}={}){
 return {width:100,height:120,toBlob(done){
  if(onRead)onRead();
  done({arrayBuffer:async()=>{const out=new Uint8Array(bytes);out[2]=id.charCodeAt(0);return out.buffer}})
 }}
}
function harness(first,second,{onYield=()=>{},scaledLimit=false}={}){
 const images=[],events=[];
 class PDF{
  addImage(data){images.push(data[2])}
  addPage(){events.push('page')}
  output(){events.push('output');return 'pdf'}
 }
 const script=scaledLimit?source.replace('28*1024*1024','1024'):source;
 const env=new Function('jspdf','getPaperSize','setTimeout','first','second',
  'let pageCanvases=[first,second],pagePrintMeta={paper:{w:210,h:297}};'+
  'function replacePages(next){pageCanvases=next}'+
  'function setMeta(meta){pagePrintMeta=meta}'+
  script+';return{run:makePdfDataAsync,replacePages,setMeta}')(
   {jsPDF:PDF},()=>({w:210,h:297}),done=>{onYield();done()},first,second
  );
 return{...env,images,events}
}
(async()=>{
 const stable=harness(canvas('A'),canvas('B'));
 const good=await stable.run();
 check(good==='pdf'&&stable.images.map(v=>String.fromCharCode(v)).join('')==='AB'&&stable.events.includes('output'),
  'Unchanged preview must export both original pages in order');

 let duringRead;
 const replacement=canvas('X');
 const changing=harness(canvas('A',{onRead:()=>duringRead.replacePages([canvas('Y'),replacement])}),canvas('B'));
 duringRead=changing;
 await assert.rejects(changing.run(),/تغيّرت صفحات الطباعة/);
 check(changing.images.length===0&&!changing.events.includes('output'),
  'Rebuild during JPEG encoding must not export a mixed document');

 let afterYield;
 const switched=harness(canvas('A'),canvas('B'),{onYield:()=>afterYield.replacePages([canvas('C'),canvas('D')])});
 afterYield=switched;
 await assert.rejects(switched.run(),/تغيّرت صفحات الطباعة/);
 check(switched.images.map(v=>String.fromCharCode(v)).join('')==='A'&&!switched.events.includes('output'),
  'Rebuild between PDF pages must abort before adding a page from a newer layout');

 let metaChange;
 const newMeta=harness(canvas('A',{onRead:()=>metaChange.setMeta({paper:{w:297,h:210}})}),canvas('B'));
 metaChange=newMeta;
 await assert.rejects(newMeta.run(),/تغيّرت صفحات الطباعة/);
 check(!newMeta.events.includes('output'),'Paper size mutation during export must invalidate output');

 const removed=canvas('A');
 let freed;
 const freedCanvas=harness(canvas('A',{onRead:()=>{freed.width=0;freed.height=0}}),removed);
 freed=freedCanvas?removed:null;
 await assert.rejects(freedCanvas.run(),/تغيّرت صفحات الطباعة/);
 check(!freedCanvas.events.includes('output'),'Released page canvas must not be exported');

 const oversized=harness(canvas('A',{bytes:1500}),canvas('B'),{scaledLimit:true});
 await assert.rejects(oversized.run(),/28MB/);
 check(oversized.images.length===0&&!oversized.events.includes('output'),
  'A scaled-down test threshold must reject oversized JPEG data before jsPDF output');

 const short=harness(canvas('A'),canvas('B'));
 short.replacePages([canvas('C')]);
 const afterChange=await short.run();
 check(afterChange==='pdf'&&short.images.map(v=>String.fromCharCode(v)).join('')==='C',
  'Rebuilding before export begins must use the fresh snapshot normally');

 let releaseExport=null;
 const delayed={
  width:100,height:120,
  toBlob(done){releaseExport=()=>done({arrayBuffer:async()=>Uint8Array.of(255,216,65,255,217).buffer})}
 };
 const serial=harness(delayed,canvas('B'));
 const ongoing=serial.run();
 await assert.rejects(serial.run(),/يُنشأ PDF حالياً/);
 check(serial.images.length===0&&!serial.events.includes('output'),
  'Second request must fail while the previous PDF has a pending JPEG callback');
 releaseExport();
 await ongoing;
 check(serial.images.map(v=>String.fromCharCode(v)).join('')==='AB',
  'Original export must complete normally after rejecting a duplicate request');
 await assert.rejects(serial.run(),/يُنشأ PDF حالياً/).catch(()=>{});
 // The first call has completed: the exporter must not remain stuck as busy.
 const released=harness(canvas('C'),canvas('D'));
 await released.run();
 check(released.events.includes('output'),'A completed export must allow subsequent generation');
 const failures=harness({width:100,height:120,toBlob:done=>done(null)},canvas('B'));
 await assert.rejects(failures.run(),/تعذر ترميز إحدى صفحات PDF/);
 await assert.rejects(failures.run(),/تعذر ترميز إحدى صفحات PDF/);
 check(!failures.events.includes('output'),
  'After a JPEG encoding failure, a subsequent attempt must fail on encoding, not a stale busy lock');
 console.log('PDF export revision checks passed: '+cases+
  ' cases; mixed generations, paper mutation, freed canvases and size limit fail closed.')
})().catch(e=>{console.error(e);process.exitCode=1});
