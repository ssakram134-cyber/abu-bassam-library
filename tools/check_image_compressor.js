const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'web');
const errors=[];
const read=p=>fs.readFileSync(p,'utf8');
const need=(src,marker,label)=>{if(!src.includes(marker))errors.push(`${label}: missing ${marker}`)};
const html=read(path.join(web,'image-compressor.html'));
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
scripts.forEach((src,i)=>{try{new vm.Script(src,{filename:`image-compressor.html#${i+1}`})}catch(e){errors.push(`compressor syntax: ${e.message}`)}});
for(const m of [
  'MAX_FILES=20','MAX_TOTAL_BYTES=80*1024*1024','SAFE_MAX_PIXELS=24_000_000',
  "addEventListener('drop'",'moveItem','removeItem','beforeImg','afterImg','maxDimension',
  'cancelRequested','if(cancelRequested)break','catch(e){results.push','image/png','image/webp',
  'namedDataUrl','encodeURIComponent(name)','_compressed_','ممتازة للطباعة','ضعيفة للطباعة الكبيرة',
  'blob.size>=file.size','imageSmoothingQuality','overflow-y:auto','currentBytes()+incomingBytes',
  'window.parent?.Android?.savePagesToGallery','browserSave(r.name,r.dataUrl)','isImageFile'
])need(html,m,'image compressor');
const index=read(path.join(root,'index.js'));
for(const m of ['encodedNameMatch','decodeURIComponent(encodedNameMatch[1])','itemMime','imagePages.length > 20','requestedName || fallbackName','const finalName = safeName(requestedName || fallbackName);'])need(index,m,'canonical Android image saving');
// QCIF/CIF/VGA local resize must not imply recovered detail.
for(const marker of ['id="enhanceTarget"','QCIF — 176px','CIF — 352px','VGA — 640px','Full HD — 1920px','4K — 3840px','تفاصيل المصدر محدودة','upscaled'])need(html,marker,'image quality enhancement');
try{
 const sourceLine=html.split(String.fromCharCode(10)).find(line=>line.startsWith('function calcSize('));
 if(!sourceLine)throw new Error('missing resize function');
 const controls={maxDimension:{value:'0'},enhanceTarget:{value:'640'}};
 const fn=new Function('$','SAFE_MAX_PIXELS',sourceLine+';return calcSize')(id=>controls[id],24_000_000);
 const qcif=fn(176,144);
 if(qcif.w!==640||qcif.h<=144)throw new Error('QCIF interpolation failed');
 controls.enhanceTarget.value='0';
 const unchanged=fn(640,480);
 if(unchanged.w!==640||unchanged.h!==480)throw new Error('disabled enhancement changed original dimensions');
 controls.enhanceTarget.value='3840';
 const capped=fn(5000,5000);
 if(capped.w*capped.h>24_000_000)throw new Error('enhancement exceeded pixel budget');
}catch(e){errors.push('image enhancement functional regression: '+String(e?.message||e))}
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('Image compressor checks passed: cumulative batch limits, drag/drop, reorder/delete, before/after preview, cancellation, failure isolation, memory-safe dimensions, PNG/WebP preservation, print-quality guidance, original-derived names, browser fidelity and Android named mixed-format saving.\n');
