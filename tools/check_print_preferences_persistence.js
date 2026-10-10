'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const studio=read('web/cards-studio-runtime.js'),photo=read('web/index.html');
new vm.Script(studio,{filename:'web/cards-studio-runtime.js'});
const begin=studio.indexOf("const PRINT_PREFS_KEY='"),end=studio.indexOf('const TYPE_LABELS=',begin);
assert.ok(begin>0&&end>begin,'A single scoped print-preferences module exists');
const block=studio.slice(begin,end);
function storage(){
 const map=new Map(),events=[];
 return{
  map,events,
  getItem:key=>map.get(key)??null,
  setItem:(key,value)=>{map.set(key,String(value));events.push(key)},
  removeItem:key=>map.delete(key)
 };
}
function session(localStorage){
 return new Function('localStorage',block+"\nconst state={...loadPrintPrefs()};return {state,normalizePrintPrefs,loadPrintPrefs,persistPrintPrefs,DEFAULT_PRINT_PREFS,PRINT_PREFS_KEY};")(localStorage)
}
const ls=storage();
const a=session(ls);
assert.equal(a.state.output,'a4-pairs');
assert.equal(a.state.width,85.6);
assert.equal(a.state.paperType,'plain');
assert.equal(a.state.printDpi,300);
const fields=new Map(),names=['Output','PaperType','PrintDpi','Sides','Orientation','Copies','Width','Height','Gap','MarginX','MarginY','Bleed','Flip','Watermark','WatermarkOpacity','WatermarkText'];
fields.set('csPrintSettings',{innerHTML:''});
for(const name of names)fields.set('cs'+name,{value:'',disabled:false,options:[]});
fields.get('csOutput').options=[{value:'a4-pairs'},{value:'a4-duplex'},{value:'cr80'}];
let refresh=0,preview=0;
const start=studio.indexOf('function renderPrintSettings(){'),stop=studio.indexOf('\nfunction printGeometry(',start);
assert.ok(start>0&&stop>start);
const show=new Function('$','state','canCard','cap','persistPrintPrefs','renderPreview','renderStatus','esc',
 studio.slice(start,stop)+'\nreturn renderPrintSettings')(
 id=>fields.get(id)||null,a.state,()=>true,
 (v,min,max)=>Math.max(min,Math.min(max,Number(v)||0)),a.persistPrintPrefs,
 ()=>preview++,()=>refresh++,x=>String(x)
);
show();
assert.match(fields.get('csPrintSettings').innerHTML,/نوع الورق المفضل/);
assert.match(fields.get('csPrintSettings').innerHTML,/دقة الطابعة المفضلة DPI/);
assert.match(fields.get('csPrintSettings').innerHTML,/يلزم تأكيدهما من نافذة طباعة Android/);
function change(name,value){const input=fields.get('cs'+name);input.value=String(value);assert.equal(typeof input.oninput,'function');input.oninput()}
change('Output','a4-duplex');change('Sides','back');
change('PaperType','glossy');change('PrintDpi',600);
change('Width',54);change('Height',85.6);change('Copies',7);
change('MarginX',12.5);change('MarginY',9);change('Gap',3);
change('Bleed',1.2);change('Flip','vertical');change('Watermark','text');
change('WatermarkOpacity',27);change('WatermarkText','مراجعة الطباعة');
assert.ok(preview>=14&&refresh>=14);
assert.equal(a.persistPrintPrefs(),true);
const key=a.PRINT_PREFS_KEY,raw=JSON.parse(ls.getItem(key));
assert.equal(raw.output,'a4-duplex');assert.equal(raw.paperType,'glossy');
assert.equal(raw.printDpi,600);assert.equal(raw.width,54);assert.equal(raw.height,85.6);
assert.equal(raw.flip,'vertical');assert.equal(raw.marginX,12.5);
assert.equal(raw.copies,7);assert.equal(raw.watermarkText,'مراجعة الطباعة');
const second=session(ls);
assert.deepEqual(second.state,raw,'Relaunch must recover full print preferences');
const defaults=second.DEFAULT_PRINT_PREFS;
ls.setItem(key,'{broken');
assert.deepEqual(session(ls).state,defaults,'Corrupt preferences must not stop app startup');
ls.setItem(key,JSON.stringify({output:'evil',paperType:'laser',printDpi:90000,copies:-1,width:-20,marginX:'NaN',flip:'sideways',watermarkText:'A'.repeat(300)}));
const invalid=session(ls).state;
assert.equal(invalid.output,'a4-pairs');assert.equal(invalid.paperType,'plain');
assert.equal(invalid.printDpi,300);assert.equal(invalid.copies,1);
assert.equal(invalid.width,85.6);assert.equal(invalid.marginX,7);
assert.equal(invalid.flip,'horizontal');assert.equal(invalid.watermarkText.length,120);
const privateStore={getItem:()=>null,setItem:()=>{throw Error('STORAGE_BLOCKED')}};
assert.equal(session(privateStore).persistPrintPrefs(),false,'Storage failure should not crash printing UI');
assert.match(studio,/state\.copies=1;persistPrintPrefs\(\);saveDraft\(\)/);
assert.match(studio,/state\.copies=cap\(state\.copies\+1,1,MAX_CARDS\);persistPrintPrefs\(\)/);
assert.match(studio,/renderPrintSettings\(\);renderPreview\(\);renderStatus\(\)/);
assert.match(studio,/\[state\.width,state\.height\]=\[state\.height,state\.width\];persistPrintPrefs\(\)/);
assert.match(photo,/abuBassamPrintSettingsV1/);
assert.match(photo,/dpiEnabled:!!\$\('dpiEnabled'\)\.checked/);
assert.match(photo,/if\(typeof data\.dpiEnabled==='boolean'\)/);
assert.match(photo,/function printDirectly\(\)\{if\(!pageCanvases\.length\)return alert\('أضف صورة أولاً'\);saveAppSettings\(\)/);
const corrected=read('web/settings-corrections-runtime.js');
const appSettings=read('web/app-settings-runtime.js');
for(const key of ['abuBassamCardsPrintPreferencesV1','abuBassamDpiEnabledV1']){
 assert.ok(corrected.includes("'"+key+"'"),'Safe default reset must clear '+key);
 assert.ok(appSettings.includes("'"+key+"'"),'Base default reset must clear '+key);
}
assert.match(studio,/function printNow\(\)/);
assert.match(studio,/function savePdf\(\)/);
assert.match(studio,/editor\.openPrint\(html,dispatched\)/);
assert.match(studio,/editor\.openPdf\(name,html,dispatched\)/);
console.log('Print preferences passed: live card control changes, local roundtrip after reload, corrupt storage recovery, photo media/DPI options and reset compatibility. Android print-driver settings remain outside Expo API.');
