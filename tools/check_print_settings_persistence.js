'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const home=fs.readFileSync('web/index.html','utf8');
function extract(start,end){const a=home.indexOf(start),b=home.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'Could not locate print settings method '+start);return home.slice(a,b)}
const save=extract('function saveAppSettings(){','function loadAppSettings(){');
const load=extract('function loadAppSettings(){','function onImageSelect(');
const mode=extract('function dpiModeChanged(){','function loadDpiMode(){');
const loadMode=extract('function loadDpiMode(){','function sanitize(');
const settingsIds=['paperSize','photoSize','paperCustomW','paperCustomH','customW','customH','mediaType',
 'dpiInput','photoCount','borderMode','gapInput','marginInput','aiBgMode'];
const initial={
 paperSize:'custom',photoSize:'custom',paperCustomW:'20',paperCustomH:'30',
 customW:'3.5',customH:'4.5',mediaType:'photo-glossy',dpiInput:'600',
 photoCount:'4',borderMode:'black',gapInput:'1.5',marginInput:'2',aiBgMode:'white'
};
const options={paperSize:['A4','A5','custom'],photoSize:['30x40','35x45','custom'],
 mediaType:['plain','photo-glossy','photo-matte'],borderMode:['none','black']};
const storage=new Map();
const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
const fields=Object.fromEntries(settingsIds.map(id=>[id,{
 value:initial[id],tagName:options[id]?'SELECT':'INPUT',options:(options[id]||[]).map(value=>({value}))
}]));
fields.dpiEnabled={checked:true,disabled:false};
fields.dpiModeInfo={textContent:''};
const $=id=>fields[id]||null;
const funcs=new Function('$','localStorage',
 'let guideEnabled=true;function dpiIsEnabled(){return !!$("dpiEnabled")?.checked}function settingsChanged(){saveAppSettings()}'+save+load+mode+loadMode+
 ';return{saveAppSettings,loadAppSettings,dpiModeChanged,loadDpiMode}')($,localStorage);
let count=0;function check(expr,msg){assert.ok(expr,msg);count++}
funcs.saveAppSettings();
check(storage.has('abuBassamPrintSettingsV1'),'Print settings must save under persistent key');
const serialized=JSON.parse(storage.get('abuBassamPrintSettingsV1'));
check(settingsIds.every(id=>serialized[id]===initial[id]),'Stored snapshot must retain all paper, media, quality, spacing and layout values');
for(const id of settingsIds)fields[id].value=id==='mediaType'?'plain':'changed';
funcs.loadAppSettings();
check(settingsIds.every(id=>fields[id].value===initial[id]),'Reload after restart must restore all print controls');
fields.paperSize.value='A4';
storage.set('abuBassamPrintSettingsV1',JSON.stringify({...serialized,paperSize:'invalid'}));
funcs.loadAppSettings();
check(fields.paperSize.value==='A4','Invalid paper options in old settings must not override available options');
storage.set('abuBassamPrintSettingsV1',JSON.stringify(serialized));
fields.dpiEnabled.checked=true;
funcs.dpiModeChanged();
check(storage.get('abuBassamDpiEnabledV1')==='1','Manual DPI enablement must survive restart');
fields.dpiEnabled.checked=false;
funcs.loadDpiMode();
check(fields.dpiEnabled.checked===true,'Manual DPI must be restored from persisted flag');
check(fields.dpiInput.disabled===false,'Restored DPI checkbox must re-enable DPI input');
fields.dpiEnabled.checked=false;
funcs.dpiModeChanged();
check(storage.get('abuBassamDpiEnabledV1')==='0','Auto DPI disablement must also persist');
fields.dpiEnabled.checked=true;
funcs.loadDpiMode();
check(fields.dpiEnabled.checked===false,'Automatic DPI must load when previously selected');
console.log('Print settings persistence checks passed: '+count+' cases; application presets retain media, paper, DPI, layout and manual-mode flag. Driver defaults are not controlled by app.');
