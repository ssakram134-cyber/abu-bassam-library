'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const studio=read('web/cards-studio-runtime.js'),qrLib=read('web/qrcode.js'),utf8=read('web/qrcode_UTF8.js'),native=read('index.js');
new vm.Script(studio);
const barcode={};
vm.runInNewContext(qrLib+'\n'+utf8+'\nthis.qrcode=qrcode;',barcode);
assert.equal(typeof barcode.qrcode,'function','Bundled QR library with UTF-8 must load');
const cut=(a,b)=>{const i=studio.indexOf(a),j=studio.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'Missing code section '+a);return studio.slice(i,j)};
const code=cut('function vcardEscape(','\nfunction modelNow(){');
const deps=['state','childInstitution','serviceName','qrcode','esc'];
const funcs=new Function(...deps,code+'\nreturn {payloadFor,qrSvg,code128Svg,guardianWhatsApp,emergencyDial,assertModelBarcodes,validatePrintBarcodes};')(
 {lastBarcode:''},
 d=>d.institutionType==='school'?d.school:'روضة أطفال القادسية',
 d=>d.service||'facebook',barcode.qrcode,s=>String(s));
const brand={name:'مكتبة أبو بسام للتصوير والقرطاسية',phone:'07829667521',email:'library@example.com',website:'https://example.com'};
const child={type:'child',brand,data:{name:'ملاك أكرم حاتم',age:'4',address:'حي الضباط - قرب الزراعة',institutionType:'kindergarten',guardianPhone:'07829667521',driverPhone:'07829664889',notes:'معلومات الطبيب: لا يوجد'}};
const payload=funcs.payloadFor(child);
assert.match(payload,/^BEGIN:VCARD\nVERSION:3.0\nFN:ملاك أكرم حاتم/m);
assert.match(payload,/ORG:روضة أطفال القادسية/);
assert.match(payload,/TEL;TYPE=CELL:07829667521/);
assert.match(payload,/TEL;TYPE=WORK:07829664889/);
assert.match(payload,/ADR:;;حي الضباط - قرب الزراعة;;;;/);
assert.match(payload,/العمر: 4/);
assert.match(payload,/معلومات الطبيب/);
assert.match(payload,/https:\/\/wa.me\/9647829667521/);
assert.equal(funcs.guardianWhatsApp('wrong'),'');
assert.equal(funcs.emergencyDial('0782 966 7521'),'07829667521');
assert.equal(funcs.emergencyDial('+9647829667521'),'+9647829667521');
assert.equal(funcs.emergencyDial('123'),'');
assert.ok(funcs.qrSvg(payload).startsWith('<svg'));
assert.equal(funcs.assertModelBarcodes(child),true,'Arabic child QR must be encodable with vCard');
const school={...child,data:{...child.data,institutionType:'school',school:'مدرسة الأقصى الابتدائية للبنات'}};
assert.match(funcs.payloadFor(school),/ORG:مدرسة الأقصى/);
for(const model of [
 {type:'personal',brand,data:{name:'سارة',address:'القادسية',phone:'07829667521',email:'example@example.com',notes:'معلومة مهمة'}},
 {type:'wifi',brand,data:{ssid:'مدرسة ألف',password:'abc1234567',security:'WPA',hidden:false}},
 {type:'login',brand,data:{service:'facebook',account:'user@example.com',password:'Abc@@123',notes:'مؤقت'}},
 {type:'qr',brand,data:{kind:'email',symbology:'qr',content:'test@example.com',caption:''}},
 {type:'qr',brand,data:{kind:'phone',symbology:'code128',content:'07829667521',caption:''}}
]){
 assert.equal(funcs.assertModelBarcodes(model),true,model.type+' expected valid');
}
assert.equal(funcs.validatePrintBarcodes([child,child,school]),true);
const long={type:'qr',brand,data:{kind:'text',symbology:'qr',content:'أ'.repeat(8000)}};
assert.throws(()=>funcs.assertModelBarcodes(long),/تعذر إنشاء QR/,'Over-capacity QR cannot silently become an empty placeholder');
assert.throws(()=>funcs.validatePrintBarcodes([child,long]),/تعذر إنشاء QR/,'Invalid queued barcode must block output');
const nonAsciiCode={type:'qr',brand,data:{kind:'text',symbology:'code128',content:'مرحبا'}};
assert.throws(()=>funcs.assertModelBarcodes(nonAsciiCode),/Code 128/,'Code 128 cannot encode Arabic data');
const cardSource=cut('function cardHtml(model,side){','\nfunction renderPreview(){');
const card=new Function('esc','watermark','childInstitution','referenceBrand','photoMarkup','textAttrs','row','qrSvg','payloadFor','footer','emergencyDial',
 cardSource+';return cardHtml;')(
 s=>String(s),()=>'',d=>d.institutionType==='school'?d.school:'روضة أطفال القادسية',
 ()=>'',()=>'',()=>'',(a,b)=>b?'<p>'+a+': '+b+'</p>':'',funcs.qrSvg,funcs.payloadFor,()=>'<footer>مكتبة أبو بسام للتصوير والقرطاسية</footer>',funcs.emergencyDial);
const rendered=card(child,'back');
assert.match(rendered,/العمر: 4 سنوات/);
assert.match(rendered,/رقم هاتف ولي الأمر: 07829667521/);
assert.match(rendered,/رقم سائق الخط: 07829664889/);
assert.match(rendered,/tel:07829667521/);
const withDriver={...child,data:{...child.data,guardianPhone:'invalid',driverPhone:'07829664889'}};
assert.match(card(withDriver,'back'),/tel:07829664889/,'Emergency QR must fall back to valid driver phone');
const withoutEmergency={...child,data:{...child.data,guardianPhone:'abc',driverPhone:'xyz'}};
assert.doesNotMatch(card(withoutEmergency,'back'),/cs-call-qr/,'Never render an invalid emergency dialing QR');
assert.match(card(child,'front'),/روضة أطفال القادسية/);
const printFn=cut('function printDocument(){','\nfunction recordHistory(');
assert.match(printFn,/validatePrintBarcodes\(jobs\)/,'Print and PDF paths must validate every queued model');
const print=new Function('expandedJobs','validatePrintBarcodes',printFn+';return printDocument;')(
 ()=>[long],funcs.validatePrintBarcodes);
assert.throws(print,/تعذر إنشاء QR/,'Invalid QR must fail before rendering any print/PDF pages');
const pngFn=cut('async function exportPng(){','\nfunction scanBarcode(){');
assert.match(pngFn,/assertModelBarcodes\(modelNow\(\)\)/,'PNG export must validate barcode first');
const queueFn=cut('function addQueue(){','\nfunction removeQueue(');
assert.match(queueFn,/assertModelBarcodes\(modelNow\(\)\)/,'Queue must reject invalid QR');
assert.match(studio,/csQrStatus'\)\.textContent='⚠ '/,'Preview must show QR failures instead of claiming success');
assert.match(native,/const barcodeScanGuard = useRef\(false\)/);
console.log('Badge/QR validation passed: UTF-8 vCards, child age/guardian/driver, emergency fallback, overflow, Code128, preview, print/PDF/image and queued output guards.');
