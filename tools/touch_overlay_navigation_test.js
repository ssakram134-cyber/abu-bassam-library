'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'web/app-security-runtime.js'),'utf8');
const feature=fs.readFileSync(path.join(root,'web/feature-recovery-runtime.js'),'utf8');
const begin=app.indexOf('function closeTopLayer(){'),end=app.indexOf('\nfunction home()',begin);
assert.ok(begin>=0&&end>begin,'canonical back overlay handler');
const closeCode=app.slice(begin,end);
const featureCode=feature.split('\n').find(x=>x.startsWith('function closeTool()'));
assert.ok(featureCode,'canonical Recovery close');
assert.match(feature,/\$\('abuRecoveryClose'\)\.onclick=closeTool/);
assert.match(feature,/AbuFeatureRecovery=\{openTool,closeTool,/);
assert.match(app,/function back\(fromHardware=false\)\{if\(!sessionUnlocked\(\)\)return true;if\(closeTopLayer\(\)\)return true/);
let count=4;
const eq=(a,b,name)=>{assert.equal(a,b,name);count++};
function node(id,classes=[],style={}){
 const active=new Set(classes);
 return{id,style:{display:'none',...style},src:'example.html',
  classList:{contains:x=>active.has(x),remove:x=>active.delete(x),add:x=>active.add(x)}};
}
function fixture({recovery=false,zoom=false,sheet=false,backdrop=false,device=false,settings=false,card=false,design=false,ops=false,closeSheets=true}={}){
 const state={closeSheets:0,closeZoom:0,closeDevice:0,closeSettings:0,closeOps:0};
 const nodes={
  abuRecoveryModal:node('abuRecoveryModal',[],{display:recovery?'flex':'none'}),
  abuRecoveryFrame:node('abuRecoveryFrame'),
  paperZoomOverlay:node('paperZoomOverlay',zoom?['show']:[]),
  optionsSheet:node('optionsSheet',sheet?['sheet','show']:['sheet']),
  sheetBackdrop:node('sheetBackdrop',backdrop?['show']:[]),
  abuDeviceModal:node('abuDeviceModal',device?['show']:[]),
  abuSettingsModal:node('abuSettingsModal',settings?['show']:[]),
  opsSheet:node('opsSheet',ops?['show']:[]),
  cardModal:node('cardModal',card?['show']:[]),
  designSheet:node('designSheet',design?['show']:[])
 };
 const $=id=>nodes[id]||null;
 const recoveryClose=new Function('$',featureCode+'\nreturn closeTool')($);
 const window={
  AbuFeatureRecovery:{closeTool:recoveryClose},
  AbuBassamSettings:{close(){state.closeSettings++;nodes.abuSettingsModal.classList.remove('show')}},
  AbuBassamOps:{close(){state.closeOps++;nodes.opsSheet.classList.remove('show')}},
  closePaperZoom(){state.closeZoom++;nodes.paperZoomOverlay.classList.remove('show')}
 };
 if(closeSheets)window.closeSheets=()=>{state.closeSheets++;nodes.optionsSheet.classList.remove('show');nodes.sheetBackdrop.classList.remove('show')};
 const selectors={
  '#abuDeviceModal.show':'abuDeviceModal','#abuSettingsModal.show':'abuSettingsModal',
  '#opsSheet.show':'opsSheet','.cs-modal.show':'cardModal',
  '.ds-sheet.show':'designSheet','.sheet.show':'optionsSheet'
 };
 const document={querySelector(sel){
  const id=selectors[sel];
  return id&&nodes[id].classList.contains('show')?nodes[id]:null;
 }};
 const closeDevices=()=>{state.closeDevice++;nodes.abuDeviceModal.classList.remove('show')};
 const closeTopLayer=new Function('$','document','window','closeDevices',closeCode+'\nreturn closeTopLayer')($,document,window,closeDevices);
 return{state,nodes,window,closeTopLayer};
}
const empty=fixture();
eq(empty.closeTopLayer(),false,'nothing open');
const options=fixture({sheet:true,backdrop:true});
eq(options.closeTopLayer(),true,'closing options takes Back');
eq(options.state.closeSheets,1,'options invokes canonical sheet closer');
eq(options.nodes.optionsSheet.classList.contains('show'),false,'sheet hidden');
eq(options.nodes.sheetBackdrop.classList.contains('show'),false,'backdrop released');
const fallback=fixture({sheet:true,backdrop:true,closeSheets:false});
eq(fallback.closeTopLayer(),true,'fallback closes sheet');
eq(fallback.nodes.sheetBackdrop.classList.contains('show'),false,'fallback releases backdrop');
const orphan=fixture({backdrop:true});
eq(orphan.closeTopLayer(),true,'orphan backdrop recognized');
eq(orphan.nodes.sheetBackdrop.classList.contains('show'),false,'orphan backdrop removed');
const rec=fixture({recovery:true});
eq(rec.closeTopLayer(),true,'recovery overlay handled');
eq(rec.nodes.abuRecoveryModal.style.display,'none','recovery overlay hidden');
eq(rec.nodes.abuRecoveryFrame.src,'about:blank','iframe stopped on close');
eq(rec.closeTopLayer(),false,'recovery close idempotent');
const zoom=fixture({zoom:true});
eq(zoom.closeTopLayer(),true,'paper zoom Back recognized');
eq(zoom.state.closeZoom,1,'paper zoom uses canonical closer');
eq(zoom.nodes.paperZoomOverlay.classList.contains('show'),false,'zoom overlay removed');
const modal=fixture({card:true});
eq(modal.closeTopLayer(),true,'card modal closed');
eq(modal.nodes.cardModal.classList.contains('show'),false,'card modal removed');
const ds=fixture({design:true});
eq(ds.closeTopLayer(),true,'design drawer closed');
eq(ds.nodes.designSheet.classList.contains('show'),false,'design drawer removed');
const d=fixture({device:true});
eq(d.closeTopLayer(),true,'device modal closed');
eq(d.state.closeDevice,1,'device modal uses own close');
const settings=fixture({settings:true});
eq(settings.closeTopLayer(),true,'settings closed');
eq(settings.state.closeSettings,1,'settings uses own close');
const operations=fixture({ops:true});
eq(operations.closeTopLayer(),true,'ops sheet closed');
eq(operations.state.closeOps,1,'ops sheet uses own close');
const mixed=fixture({recovery:true,zoom:true,sheet:true,backdrop:true});
eq(mixed.closeTopLayer(),true,'top recovery closes first');
eq(mixed.nodes.abuRecoveryModal.style.display,'none','top recovery hidden');
eq(mixed.nodes.paperZoomOverlay.classList.contains('show'),true,'lower zoom not closed yet');
eq(mixed.closeTopLayer(),true,'zoom then closes');
eq(mixed.nodes.paperZoomOverlay.classList.contains('show'),false,'zoom removed');
eq(mixed.closeTopLayer(),true,'sheet then closes');
eq(mixed.nodes.sheetBackdrop.classList.contains('show'),false,'final backdrop removed');
eq(mixed.closeTopLayer(),false,'all overlays finally gone');
console.log('Hardware back overlay cleanup: '+count+'/'+count+' focused checks passed');
