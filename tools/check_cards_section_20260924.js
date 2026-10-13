const fs=require('fs'),vm=require('vm');
function read(p){if(!fs.existsSync(p))throw new Error('missing '+p);return fs.readFileSync(p,'utf8')}
function need(src,token,label){if(!src.includes(token))throw new Error('cards check failed: '+label)}
for(const p of ['web/cards-section-upgrades-runtime.js','web/cards-hardening-runtime.js','web/cards-hardening-fixes-runtime.js','web/cards-final-audit-runtime.js'])if(fs.existsSync(p))throw new Error('cards check failed: obsolete patch runtime returned '+p);
const loader=read('web/productivity-tools-runtime.js'),studio=read('web/cards-studio-runtime.js'),freeLayout=read('web/card-free-layout-runtime.js'),a4=read('web/a4-card-sheet-editor-v2-runtime.js'),standalone=read('web/standalone-card-layouts-plus-runtime.js'),library=read('web/card-template-library.js');
for(const src of [loader,studio,freeLayout,a4,standalone])new Function(src);
const sandbox={window:{}};vm.runInNewContext(library,sandbox);const groups=sandbox.window.AbuBassamCardTemplateLibrary;
const expected={personal:5,child:10,login:10,wifi:3,qr:4,ration:10,mawkib:4,'student-thanks':10,envelope:9,certificate:10,thanks:6};
for(const [id,count] of Object.entries(expected)){const g=groups.find(x=>x.id===id);if(!g||g.models.length!==count)throw new Error(`cards check failed: ${id} expected ${count}, got ${g?.models?.length??'missing'}`)}
for(const f of ['card-models-plus-runtime.js','standalone-card-layouts-plus-runtime.js','card-free-layout-runtime.js','a4-card-sheet-editor-v2-runtime.js'])need(loader,f,'loader '+f);
need(loader,'async function loadAdvancedRuntime()','advanced runtime loader must be sequential');
need(studio,'scanBarcodeGallery','gallery barcode source action');
need(studio,'student-thanks-cards.html','student thanks source route');
need(studio,"cardsPrint','printCards','printGeneral",'print guard');
need(studio,"cardsExportPdf','pdfCreate','pdfSave",'PDF guard');
need(studio,"cardsExportImage','imageExport','exportOutsideApp",'image export guard');
need(studio,"cardsA4Layout','printA4",'A4 output guard');
need(studio,'printCardDirect','CR80 output guard');
need(freeLayout,'تحرير الباج','explicit card edit mode');
need(freeLayout,'abuBassamCardEditModeV1','card edit mode persistence');
need(a4,"DIRS=['nw','n','ne','e','se','s','sw','w']",'eight resize handles');
need(a4,'function rotate','rotation handle');
need(standalone,'safeTextTarget','standalone text safety');
need(standalone,'abuBassamStandaloneCardLayoutV2','standalone editor persistence');
const childTemplates=read('web/child-card-templates-runtime.js'),modelsPlus=read('web/card-models-plus-runtime.js');
for(const source of [childTemplates,modelsPlus])new Function(source);
for(const [source,label] of [[childTemplates,'child badge templates'],[modelsPlus,'additional card models']]){
 if(source.includes('setInterval(')||source.includes('new MutationObserver('))throw new Error('cards check failed: global polling/observer returned in '+label);
 if(!source.includes("document.addEventListener('abu-runtime-loaded'"))throw new Error('cards check failed: runtime-ready integration missing in '+label);
}
need(childTemplates,"document.addEventListener('abu-cards-rendered'",'child template lifecycle listener');
need(studio,'const PRINT_SETTINGS_KEY=','validated card printer preferences');
need(studio,'function validateSymbols(jobs)','protect against printing invalid QR');
need(studio,'let resetArmed=false','confirmation required before destructive reset');
need(studio,"state.forms.login.password=''",'clear stored login secrets during startup');
need(studio,"finally{URL.revokeObjectURL(url)}",'release temporary card image blobs on failure');
need(studio,"row('هاتف سائق الخط',d.driverPhone)",'display the driver phone in the child back');
for(const fake of ['Example@Email.com','Password123'])if(studio.includes(fake))throw new Error('cards check failed: printable fake login credential remains: '+fake);

need(studio,'36_000_000','memory safe image budget');
// A4 editor must bind generated duplex .cut cards, never overwrite the host application during fallback.
need(a4,"page.querySelectorAll(':scope > .cut')",'A4 duplex cards must be selectable in free-position editor');
if(a4.includes('document.write(html)'))throw new Error('cards check failed: printing may not overwrite the application document');
const a4Window={addEventListener(){}},a4Document={readyState:'loading',addEventListener(){}};
const inspectA4=a4.replace('window.AbuA4CardSheetEditorV2={','window.__a4Inspection={items,pairDuplex,setG};window.AbuA4CardSheetEditorV2={');
new Function('window','document',inspectA4)(a4Window,a4Document);
const duplexPage={classList:{contains:name=>name==='duplex-page'},querySelectorAll:selector=>selector===':scope > .cut'?['front','back']:[]};
if(a4Window.__a4Inspection.items(duplexPage).length!==2)throw new Error('cards check failed: duplex card elements are invisible to editor');
need(studio,'data-a4-pair-id','A4 front/back cards must carry shared pairing identifiers');
need(studio,'data-a4-flip','A4 pages must carry selected back-flip direction');
for(const flip of ['horizontal','vertical']){
 const pages=[],sheet={querySelectorAll:()=>pages};
 for(const side of ['front','back']){
  const page={dataset:{a4Side:side,a4Flip:flip},classList:{contains:key=>key==='duplex-page'},querySelectorAll:selector=>selector===':scope > .cut'?page.children:[],children:[]};
  const item={dataset:{a4PairId:'test-pair'},style:{},isConnected:true,closest:()=>page};
  page.children.push(item);pages.push(page)
 }
 a4Window.__a4Inspection.pairDuplex(sheet);
 const front=pages[0].children[0],back=pages[1].children[0];
 a4Window.__a4Inspection.setG(front,{x:7,y:5,w:85.6,h:53.98,r:10});
 const expectedX=flip==='horizontal'?210-7-85.6:7,expectedY=flip==='vertical'?297-5-53.98:5;
 if(Math.abs(Number(back.dataset.a4x)-expectedX)>0.0001||Math.abs(Number(back.dataset.a4y)-expectedY)>0.0001||back.dataset.a4r!==-10)throw new Error('cards check failed: editor does not mirror '+flip+' duplex geometry');
}
need(a4,'duplexTwins.set(clone,twinClone)','A4 repeated card copies must also pair both faces');
// Android must support private, offline gallery decoding even when WebView BarcodeDetector is absent.
const nativeIndex=read('index.js');
for(const marker of ["scanBarcodeImage: function (data)","message.type === 'scanBarcodeImage'",'Camera.scanFromURLAsync(uri, BARCODE_TYPES)','AbuBassamNativeBarcodeImageResult','FileSystem.deleteAsync(uri'])need(nativeIndex,marker,'offline native gallery scan');
need(studio,'window.Android?.scanBarcodeImage','WebView gallery scanner fallback');
// Untrusted localStorage types may not crash card startup or revive old secrets.
for(const bad of ['"broken"','42','[]']){
 const malformedStore={getItem:key=>key==='abuBassamCardsStudioV4'?bad:null,setItem(){}};
 try{new Function('window','document','localStorage',studio)({addEventListener(){}},{getElementById(){return null},addEventListener(){}},malformedStore)}
 catch(error){throw new Error('cards check failed: corrupt stored draft crashes startup: '+bad+' '+error.message)}
}
// Execute the canonical QR renderer and the exact A4 duplex grid, including incomplete sheets.
const barcodeFactory=new Function(read('web/qrcode.js')+'\n'+read('web/qrcode_UTF8.js')+'\nreturn qrcode;')();
const stored=new Map([['abuBassamCardsStudioV4',JSON.stringify({login:{password:'legacy-secret'},wifi:{password:'legacy-wifi'}})],['abuBassamCardsPrintSettingsV1',JSON.stringify({output:'a4-duplex',copies:4,flip:'vertical',width:90,height:55,watermarkText:'اختبار'})]]);
const testWindow={addEventListener(){}},testStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
const testSource=studio.replace('window.CardsStudio={',"window.__auditCards={state,payloadFor,qrSvg,code128Svg,printDocument,savePrintSettings,saveDraft,recordHistory,injectPrintStub(){cardHtml=(m,side)=>'<b data-name=\"'+m.data.name+'\" data-side=\"'+side+'\"></b>';symbolSvg=()=>'<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>'}};window.CardsStudio={");
if(testSource===studio)throw new Error('cards check failed: canonical test inspection unavailable');
const listeners={};new Function('window','document','localStorage','qrcode',testSource)(testWindow,{getElementById(){return null},addEventListener(name,fn){listeners[name]=fn}},testStorage,barcodeFactory);
const tested=testWindow.__auditCards,st=tested.state;
st.lastBarcode='private-scanned-code';const blankPayload=tested.payloadFor({type:'qr',data:{kind:'text',content:'',title:'',caption:''},brand:{name:'Library'}});
if(blankPayload.includes('private-scanned-code'))throw new Error('cards check failed: blank QR leaked previous scan');
st.lastBarcode='';
if(st.forms.login.password||st.forms.wifi.password)throw new Error('cards check failed: legacy credentials kept in memory');
if(st.output!=='a4-duplex'||st.flip!=='vertical'||st.width!==90||st.copies!==4)throw new Error('cards check failed: saved printing defaults not restored');
tested.savePrintSettings();const savedPrint=JSON.parse(stored.get('abuBassamCardsPrintSettingsV1'));
if(savedPrint.login||savedPrint.wifi||savedPrint.password)throw new Error('cards check failed: print preferences leak secrets');
const sensitive='PRIVATE-BARCODE-DATA-PASSWORD-1234';
st.forms.reader.result=sensitive;st.forms.reader.format='qr';st.forms.qr.content=sensitive;st.qrFromScan=true;
tested.saveDraft();
if(stored.get('abuBassamCardsStudioV4').includes(sensitive))throw new Error('cards check failed: scan contents were persisted in a draft');
st.type='qr';st.queue=[];st.copies=1;tested.recordHistory('test secret scrub');
if(stored.get('abuBassamPrintHistoryV4').includes(sensitive))throw new Error('cards check failed: scanned QR password leaked into print history');
st.history=[];st.forms.reader.result='';st.forms.qr.content='';st.qrFromScan=false;
st.lastBarcode='another secret';st.forms.reader.result='private reader';st.forms.qr.content='private QR';st.qrFromScan=true;
if(typeof listeners['abu-bassam-auth-changed']!=='function')throw new Error('cards check failed: account-change cleanup not connected');
listeners['abu-bassam-auth-changed']();
if(st.lastBarcode||st.forms.reader.result||st.forms.qr.content)throw new Error('cards check failed: scanned QR remains after account change');
const childModel={type:'child',data:{name:'ملاك أكرم',guardianPhone:'07829781753',driverPhone:'07820000000',institutionType:'kindergarten',notes:'طفل, جديد; رائع'},brand:{name:'مكتبة أبو بسام',phone:'07829667521'}};
const payload=tested.payloadFor(childModel);
if(payload.includes('undefined')||payload.includes('خط النقل')||!payload.includes('https://wa.me/9647829781753')||!payload.includes('طفل\\, جديد\\; رائع'))throw new Error('cards check failed: child QR has obsolete field or invalid WhatsApp/vCard data');
if(!tested.qrSvg(payload).startsWith('<svg'))throw new Error('cards check failed: Arabic UTF8 QR failed to render');
if(!tested.code128Svg('07829781753').startsWith('<svg')||tested.code128Svg('ملاك').startsWith('<svg'))throw new Error('cards check failed: Code128 accepted invalid alphabet or refused digits');
st.type='qr';st.forms.qr={kind:'text',symbology:'qr',content:'أ'.repeat(2200),title:'',caption:''};st.output='cr80';st.queue=[];st.copies=1;
let rejected=false;try{tested.printDocument()}catch(err){rejected=String(err.message||err).includes('باركود غير قابل للقراءة')}if(!rejected)throw new Error('cards check failed: unreadable QR must block printing');
tested.injectPrintStub();
const parsedSlots=section=>[...section.matchAll(/<div class="(?:cut|cs-empty-slot)"[^>]*>(?:<b data-name="([^"]+)" data-side="[^"]+"><\/b>)?<\/div>/g)].map(m=>m[1]||'_');
for(const count of [1,2,3,5,9,10,11])for(const flip of ['horizontal','vertical']){
 st.queue=Array.from({length:count},(_,index)=>({model:{type:'personal',data:{name:String(index+1)},brand:{},width:85.6,height:53.98},copies:1}));
 Object.assign(st,{type:'personal',output:'a4-duplex',sides:'both',width:85.6,height:53.98,marginX:7,marginY:5,gap:2,flip});
 const sections=[...tested.printDocument().matchAll(/<section class="duplex-page"[^>]*>([\s\S]*?)<\/section>/g)].map(m=>parsedSlots(m[1]));
 if(sections.length!==2*Math.ceil(count/10))throw new Error('cards check failed: unexpected duplex page count');
 for(let page=0;page<sections.length;page+=2){let front=sections[page],back=sections[page+1];if(front.length!==10||back.length!==10)throw new Error('cards check failed: grid slots missing');
  const expected=front.map((_,i)=>flip==='horizontal'?front[i^1]:front[(4-Math.floor(i/2))*2+(i%2)]);
  if(JSON.stringify(back)!==JSON.stringify(expected))throw new Error('cards check failed: duplex back alignment '+count+' '+flip);
 }
}
st.queue=[];st.copies=1;st.output='a4-pairs';st.width=85.6;st.height=280;st.marginY=20;
let rejectsTall=false;try{tested.printDocument()}catch(err){rejectsTall=String(err.message).includes('ارتفاع')}if(!rejectsTall)throw new Error('cards check failed: oversized A4 card was cropped silently');
console.log('cards functional regressions passed: UTF8 QR, guardian WhatsApp link, secure draft recovery, persistent paper settings, 14 duplex mirror combinations, oversized A4 rejection.');
console.log('cards section checks passed: canonical permissions, exact model counts, CR80/A4 output controls, free layout, A4 editor V2, and no patch runtimes.');
