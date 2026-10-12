'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');

const source=fs.readFileSync('web/photo-geometry-runtime.js','utf8');
for(const marker of [
 'function refreshOverlay(){',
 "const stripRows=Math.max(4,Math.min(32,Math.floor(65536/ow)))",
 'const strip=outCtx.createImageData(ow,rows)',
 'outCtx.putImageData(strip,0,startY)',
 'if(shouldCancel())throw new Error',
 'source.width=0;source.height=0',
 'if(!finished&&output){output.width=0;output.height=0}',
 'if(out){out.width=0;out.height=0}',
 'geoOperationId++',
 'stopDrag?.()',
 'function rulerPreviewData(source){',
 '};refreshOverlay()'
])assert.ok(source.includes(marker),'Missing memory/touch guard: '+marker);

let drawCount=0,allocatedLargest=0,animationFrames=0,cancelDuringWarp=false,forceCancelAtYield=false,cancelled=false;
const created=[];
const image={naturalWidth:80,naturalHeight:64,width:80,height:64};
function expectedPixel(x,y){return [x%256,y%256,(x+y)%256,255]}
class CanvasMock{
 constructor(){this.width=0;this.height=0;this.pixels=null}
 getBoundingClientRect(){return{left:0,top:0,width:this.width,height:this.height}}
 getContext(){
  const cv=this;
  return{
   drawImage(){drawCount++},
   fillRect(){},
   getImageData(_x,_y,w,h){
    const data=new Uint8ClampedArray(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(expectedPixel(x,y),(y*w+x)*4);
    return{data}
   },
   createImageData(w,h){
    allocatedLargest=Math.max(allocatedLargest,w*h);
    return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)}
   },
   putImageData(strip,x,y){
    assert.equal(x,0);
    if(!cv.pixels)cv.pixels=new Uint8ClampedArray(cv.width*cv.height*4);
    cv.pixels.set(strip.data,y*cv.width*4)
   }
  }
 }
 toDataURL(type){this.encoded={type,width:this.width,height:this.height};return 'data:image/jpeg;base64,QUJD'}
}
const canvasPreview=new CanvasMock();
const stage={children:[],isConnected:true,
 appendChild(child){child.parent=this;this.children.push(child)},
 querySelectorAll(selector){return this.children.filter(c=>selector.includes(c.className))},
 getBoundingClientRect(){return{left:0,top:0,width:80,height:64}}
};
const cssState=()=>{const active=new Set();return{add:x=>active.add(x),remove:x=>active.delete(x),toggle:(x,yes)=>yes?active.add(x):active.delete(x)}};
const modal={classList:cssState()};
const rulerPage=new CanvasMock();rulerPage.width=6000;rulerPage.height=4200;
const paper={style:{}},safe={style:{}};
const controls={abuGeoCanvas:canvasPreview,abuGeoStage:stage,abuGeoModal:modal,
 abuModeCrop:{classList:cssState()},abuModePerspective:{classList:cssState()},
 abuRulerWrap:{style:{}},abuRulerPaper:paper,abuRulerSafe:safe,abuRulerCaption:{textContent:''},
 abuRulerModal:{classList:cssState()},marginInput:{value:'5'}};
const events={};
const window={innerWidth:400,innerHeight:750,
 addEventListener(type,fn){(events[type]??=[]).push(fn)},
 removeEventListener(type,fn){events[type]=(events[type]||[]).filter(f=>f!==fn)},
 emit(type,event){for(const callback of [...(events[type]||[])])callback(event)}
};
const document={readyState:'loading',addEventListener(){},getElementById:id=>controls[id]||null,
 createElement(tag){
  if(tag==='canvas'){const c=new CanvasMock();created.push(c);return c}
  if(tag==='span')return{
   className:'',dataset:{},style:{},listeners:{},
   addEventListener(type,fn){this.listeners[type]=fn},
   remove(){this.parent.children=this.parent.children.filter(child=>child!==this)}
  };
  throw Error('Unexpected DOM element '+tag)
 }};
class ImageMock{naturalWidth=80;naturalHeight=64;set src(val){this.value=val;Promise.resolve().then(()=>this.onload?.())}}
const original={src:'data:image/jpeg;base64,QUJD',img:image};
const alerts=[];
const context={window,document,uploadedImages:[original],selectedIndex:0,
 pageCanvases:[rulerPage],currentPage:0,pagePrintMeta:{paper:{w:210,h:297},margin:5},
 alert:message=>alerts.push(String(message)),Image:ImageMock,
 setTimeout:fn=>Promise.resolve().then(fn),
 requestAnimationFrame:fn=>{
  animationFrames++;
  if(forceCancelAtYield){cancelled=true;forceCancelAtYield=false}
  if(cancelDuringWarp&&created.length%2===0&&created.length>0){
   cancelDuringWarp=false;
   window.AbuPhotoGeometry.close('abuGeoModal')
  }
  fn()
 }};
const marked=source.replace(
 'window.AbuPhotoGeometry={close,setMode,reset,apply};',
 'window.setTestGeometryPoints=points=>{pts=points};window.AbuPhotoGeometry={close,setMode,reset,apply,openGeo,warpFull};'
);
assert.notEqual(source,marked,'Unable to expose existing geometry functions for testing');
vm.runInNewContext(marked,context,{filename:'photo-geometry-runtime.js',timeout:2000});

let count=0;function check(value,message){assert.ok(value,message);count++}
async function rejected(fn,re){await assert.rejects(fn,re);count++}
(async()=>{
 const geometry=window.AbuPhotoGeometry;
 geometry.openGeo();
 check(drawCount===1,'Opening editor must draw image preview once');
 check(stage.querySelectorAll('.abu-geo-handle').length===4,'Four handles must be created');
 check(stage.querySelectorAll('.abu-geo-line').length===4,'Four border lines must be created');
 const handles=stage.querySelectorAll('.abu-geo-handle');
 handles[0].listeners.pointerdown({preventDefault(){},stopPropagation(){},pointerId:42});
 for(let x=4;x<54;x++)window.emit('pointermove',{pointerId:42,clientX:x,clientY:12});
 window.emit('pointerup',{pointerId:42});
 check(drawCount===1,'Moving handle 50 times must not redraw the source bitmap');
 check(stage.querySelectorAll('.abu-geo-handle').every((h,i)=>h===handles[i]),
  'Handle objects and their listeners must be reused during dragging');
 handles[1].listeners.pointerdown({preventDefault(){},stopPropagation(){},pointerId:77});
 check((events.pointermove||[]).length===1,'Active drag must own one move listener');
 geometry.close('abuGeoModal');
 check((events.pointermove||[]).length===0&&(events.pointerup||[]).length===0,
  'Closing editor during a drag must detach pointer listeners');
 geometry.openGeo();
 handles[1].listeners.pointerdown({preventDefault(){},stopPropagation(){},pointerId:78});
 check((events.pointermove||[]).length===1,
  'Reopening editor after an interrupted drag must allow a fresh pointer gesture');
 window.emit('pointerup',{pointerId:78});


 window.setTestGeometryPoints([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);
 const start=created.length;
 const result=await geometry.warpFull(image,()=>false);
 check(result.width===80&&result.height===64,'Straight quad must retain original dimensions');
 check(allocatedLargest<=65536,'No full-size 8MP ImageData buffer may be created');
 check(created[start].width===0&&created[start].height===0,'Source canvas must be released after copying pixels');
 for(const [x,y]of [[0,0],[79,0],[0,63],[79,63],[37,45]]){
  const sample=[...result.pixels.slice((y*result.width+x)*4,(y*result.width+x)*4+4)];
  assert.deepEqual(sample,expectedPixel(x,y),'Perspective result pixel mismatch at '+x+','+y);
 }
 count++;
 check(animationFrames>0,'Perspective must yield to the event loop during longer work');
 result.width=0;result.height=0;

 // Abort a partially rendered job: the output must not retain a canvas backing store.
 cancelled=false;forceCancelAtYield=true;
 const previous=created.length;
 await rejected(()=>geometry.warpFull(image,()=>cancelled),/أُلغيت معالجة المنظور/);
 check(created[previous].width===0&&created[previous].height===0,
  'Canceled perspective must free the source canvas');
 check(created[previous+1].width===0&&created[previous+1].height===0,
  'Canceled perspective must free the incomplete output canvas');

 geometry.setMode('perspective');
 const existingSrc=original.src;
 cancelDuringWarp=true;
 await geometry.apply();
 check(original.src===existingSrc&&original.img===image,
  'Closing the crop editor while processing must never update the original image');
 check(alerts.some(x=>x.includes('أُلغيت معالجة المنظور')||x.includes('تغيّرت الصورة')),
  'Interrupted processing must clearly report cancellation');
 check(created.at(-1)?.width===0,'Interrupted live perspective must release output backing store');

 window.openAbuPhotoRuler();
 const thumb=created.at(-1);
 check(thumb.encoded?.width<=880&&thumb.encoded?.height<=880&&thumb.encoded.type==='image/jpeg',
  'Paper ruler must not encode the 6000 by 4200 print bitmap');
 check(thumb.width===0&&thumb.height===0,'Temporary ruler thumbnail canvas must be released');
 check(paper.style.backgroundImage.includes('data:image/jpeg'),'Ruler must use compressed small JPEG preview');
 geometry.close('abuRulerModal');
 check(paper.style.backgroundImage==='none','Closing ruler must clear background data URL');
 console.log('Photo geometry memory/touch checks passed: '+count+
  ' cases; pixel accuracy, 50 pointer moves, tiled rendering, cancellation and canvas cleanup.')
})().catch(error=>{console.error(error);process.exitCode=1});
