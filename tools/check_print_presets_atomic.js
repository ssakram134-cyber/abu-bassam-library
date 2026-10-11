'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('web/print-presets-runtime.js','utf8');
new vm.Script(source,{filename:'print-presets-runtime.js'});
const saved=new Map(),messages=[];let quota=false;
const elements={
 abuPresetName:{value:'معاملات الموظفين'},abuPresetPrinter:{value:'Printer A'},
 paperSize:{value:'A4'},photoSize:{value:'30x40'},paperCustomW:{value:'21'},
 paperCustomH:{value:'29.7'},customW:{value:'3'},customH:{value:'4'},
 mediaType:{value:'Matte'},dpiInput:{value:'300'},dpiEnabled:{checked:true},
 photoCount:{value:'6'},borderMode:{value:'light'},gapInput:{value:'1'},
 marginInput:{value:'2'},aiBgMode:{value:'white'},
 abuPresetList:{innerHTML:''},abuPresetModal:{style:{display:'none'}}
};
const store={getItem:key=>saved.get(key)||null,setItem:(key,value)=>{if(quota)throw Error('QuotaExceeded');saved.set(key,String(value))}};
const document={readyState:'loading',getElementById:id=>elements[id]||null,addEventListener(){}};
const window={};
new Function('window','document','localStorage','alert',source)(window,document,store,x=>messages.push(String(x)));
const api=window.AbuPrintPresets;
assert.equal(api.capture(),true);
assert.equal(JSON.parse(saved.get('abuBassamProfessionalPrintPresetsV1'))[0].paperSize,'A4');
elements.paperSize.value='A5';quota=true;
assert.equal(api.capture(),false,'Failed write must not overwrite previously saved preset');
assert.equal(JSON.parse(saved.get('abuBassamProfessionalPrintPresetsV1'))[0].paperSize,'A4');
assert.equal(api.remove(0),false,'Failed delete must not remove saved preset from memory');
quota=false;api.open();
assert.ok(elements.abuPresetList.innerHTML.includes('A4'),'Pending edits must not appear as saved presets');
elements.paperSize.value='A5';assert.equal(api.capture(),true);
assert.equal(JSON.parse(saved.get('abuBassamProfessionalPrintPresetsV1'))[0].paperSize,'A5');
assert.equal(api.remove(0),true);
assert.deepEqual(JSON.parse(saved.get('abuBassamProfessionalPrintPresetsV1')),[]);
assert.ok(messages.length>=2,'Both failed writes must warn the user');
console.log('Print preset atomicity checks passed: save, quota rollback, failed deletion rollback and persisted updated paper size.');
