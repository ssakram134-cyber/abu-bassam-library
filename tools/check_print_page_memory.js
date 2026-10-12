'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const home=fs.readFileSync('web/index.html','utf8');
const poster=fs.readFileSync('web/photo-print-advanced-runtime.js','utf8');
function section(src,from,to){const a=src.indexOf(from),b=src.indexOf(to,a+from.length);assert.ok(a>=0&&b>a,'Missing source section: '+from);return src.slice(a,b)}
const helpers=section(home,'function disposeCanvas(','function clearImages(){');
const photo=section(home,'function renderPaper(){','function showPage(');
const zoom=section(home,'function openPaperZoom(){','function zoomDist(');
const build=section(poster,'function buildPoster(){','function drawPosterMarks(');
const invalidate=section(poster,'function invalidatePosterPages(){','function posterSettingsChanged(){');
for(const token of ['old.forEach(cv=>','disposeCanvas(t)','pagesCreated.forEach(disposeCanvas)','printZoomThumbnail(pageCanvases[currentPage])',"$('paperZoomImage').removeAttribute('src')"])
 assert.ok((helpers+photo+zoom).includes(token),'Print memory guard missing: '+token);
for(const token of ["pages.push(page);page.width=", "pages.forEach(cv=>{cv.width=0;cv.height=0})",
 "if(typeof releasePrintPages==='function')releasePrintPages(pages)"])
 assert.ok(build.includes(token),'Poster memory guard missing: '+token);

const canvases=[];let failAfter=0;
class Canvas{
 constructor(){this.width=0;this.height=0;this.encoded=null;this.style={};canvases.push(this)}
 getContext(){const self=this;return{
  fillRect(){},strokeRect(){},save(){},restore(){},translate(){},rotate(){},clearRect(){},
  drawImage(){if(failAfter&&!--failAfter)throw Error('SIMULATED_CANVAS_DRAW_FAILURE')},
  get imageSmoothingEnabled(){return true},set imageSmoothingEnabled(v){},
  set imageSmoothingQuality(v){},set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){}
 }}
 toDataURL(type){this.encoded={width:this.width,height:this.height,type};return 'data:image/jpeg;base64,QUJD'}
}
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{
 value:({photoCount:1,marginInput:0,gapInput:0,borderMode:'none'})[id]??'',
 style:{display:''},textContent:'',title:'',onclick:null,src:'',
 classList:{add(){},remove(){}},
 removeAttribute(k){if(k==='src')this.src=''}
 });return elements.get(id)}
const document={createElement:t=>{assert.equal(t,'canvas');return new Canvas()},
 querySelector:()=>({classList:{remove(){}}})};
const $=el;
const original=[{img:{naturalWidth:100,naturalHeight:100},src:'original'}];
const factory=new Function('document','$','uploadedImages',
 'getPaperSize','getPhotoSize','mmToPx','updateFooter','updatePageNav','getPaperPrintKey','printDpi',
 'makePhotoCanvas','showPage','applyPaperZoom',
 'let pageCanvases=[],pagePrintMeta=null,currentPage=0,paperZoomScale=1,paperZoomX=0,paperZoomY=0;'+
 helpers+photo+zoom+
 ';return {renderPaper,releasePrintPages,printZoomThumbnail,openPaperZoom,closePaperZoom,disposeCanvas,'+
 'pages:()=>pageCanvases,meta:()=>pagePrintMeta}');
const env=factory(document,$,original,()=>({w:100,h:100}),()=>({w:90,h:90}),n=>Number(n),
 ()=>{},()=>{},()=> 'A4',()=>96,
 (_item,w,h)=>{const tmp=new Canvas();tmp.width=w;tmp.height=h;return tmp},()=>{},()=>{});
let count=0;function check(v,m){assert.ok(v,m);count++}
el('photoCount').value='2';
env.renderPaper();
check(env.pages().length===2,'Two photos must create two separate pages');
const first=env.pages().slice();
check(canvases.filter(c=>c.width===90&&c.height===90).length===0,'Temporary photo canvases must be freed immediately');
env.renderPaper();
check(env.pages().length===2&&first.every(c=>c.width===0&&c.height===0),'Replacing preview frees all previous page buffers');
const second=env.pages().slice();
env.openPaperZoom();
check(el('paperZoomImage').src.startsWith('data:image/jpeg'),'Zoom uses scaled JPEG rather than original PNG');
const preview=canvases.at(-1);
check(preview.width===0&&preview.height===0,'Zoom thumbnail backing store is discarded after encoding');
env.closePaperZoom();
check(el('paperZoomImage').src==='','Closing zoom removes retained Data URL');
failAfter=1;
env.renderPaper();
check(env.pages().length===0&&second.every(c=>c.width===0&&c.height===0),
 'Failed preview must not keep previously generated pages');
check(canvases.every(c=>c.width===0&&c.height===0),'Failed photo drawing frees unpublished page and temporary canvas');

let status=[],busy=[],updates=0,alerts=[];
function posterHarness(){
 const before=new Canvas();before.width=500;before.height=400;
 const initial=[before];
 const runtime=new Function('document','$','posterPlan','drawPosterMarks','syncMainPaper','showPage',
   'setBusy','alert','updatePageNav','releasePrintPages',
   'let pageCanvases=arguments[10],pagePrintMeta={kind:"poster"},currentPage=1;'+
   build+';return {buildPoster,pages:()=>pageCanvases,meta:()=>pagePrintMeta,original:pageCanvases}')(
  document,$,()=>({
   item:{img:{naturalWidth:200,naturalHeight:100}},fit:'contain',posterW:200,posterH:100,
   rows:1,cols:2,usableW:100,usableH:100,overlap:0,margin:0,dpi:96,
   paper:{w:100,h:100,key:'A4',landscape:false},pages:2,borderless:false
  }),()=>{},()=>{},()=>{},x=>busy.push(x),x=>alerts.push(x),()=>{updates++},null,initial
 );
 return runtime
}
const posterTest=posterHarness();
const oldPoster=posterTest.original[0];
failAfter=0;
check(posterTest.buildPoster()===true&&posterTest.pages().length===2,'Poster 2×1 should generate its actual tiles');
check(oldPoster.width===0&&oldPoster.height===0,'Regenerating poster must free old tile canvases');
const good=posterTest.pages().slice();
failAfter=1;
check(posterTest.buildPoster()===false,'Canvas failure must not report successful poster generation');
check(posterTest.pages().length===0&&good.every(c=>c.width===0&&c.height===0),
 'Poster draw failure must discard previously published pages and invalidate output');
check(canvases.every(c=>c.width===0&&c.height===0),'Poster failure releases all partly generated tile canvases');
check(posterTest.meta()===null,'Failed poster build must invalidate stale print metadata');

console.log('Print canvas lifecycle checks passed: '+count+
 ' cases; page replacement, render failure, zoom cleanup, poster failure and canvas disposal.');
