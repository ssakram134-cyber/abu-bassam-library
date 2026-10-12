'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web/permission-section-guards-runtime.js'),'utf8');
new vm.Script(source,{filename:'permission-section-guards-runtime.js'});
let checks=0;
const equal=(a,b,msg)=>{assert.equal(a,b,msg);checks++};
const element=(text,title,disabled=false,opacity='',pointerEvents='')=>({
 textContent:text,title,disabled,dataset:{},
 style:{opacity,pointerEvents,display:'',setProperty(){},getPropertyPriority(){return ''},removeProperty(){}}
});
function scenario(){
 const grants=new Set(['questionsView','compressUse']);
 const operations=element('سجل العمليات','افتح السجل',false,'.92');
 const notifications=element('','الإشعارات',true,'.7');
 const customers=element('مستمسكات الزبائن','ملفات العملاء');
 const plain=element('إعدادات الطباعة','غير مقيّد',false,'.8');
 const imageInput=element('','',false,'.88');
 const paperSize=element('','',false,'');
 const photoSize=element('','',true,'.6');
 const label=element('أضف صورة','',false,'.77','auto');
 const controls={operations,notifications,customers,plain,imageInput,paperSize,photoSize,label};
 const inputs={imageInput,paperSize,photoSize};
 const document={readyState:'complete',getElementById:id=>inputs[id]||null,addEventListener(){},
  querySelectorAll:selector=>selector==='button'?[operations,notifications,customers,plain]:selector==='label[for="imageInput"]'?[label]:[]};
 const window={AbuBassamPermissions:{can:key=>grants.has(key)}};
 vm.runInNewContext(source,{window,document,alert(){},requestAnimationFrame:fn=>fn()});
 return{grants,controls,refresh:()=>window.AbuPermissionSectionGuards.tick()};
}
const a=scenario(),c=a.controls;
for(const [item,expect,label] of [
 [c.operations.disabled,true,'operations locked'],
 [c.operations.title,'معطل من الأدمن','operations disabled title'],
 [c.operations.style.opacity,'.4','operations disabled appearance'],
 [c.notifications.disabled,true,'original disabled notifications'],
 [c.customers.disabled,true,'customer documents locked'],
 [c.imageInput.disabled,true,'file chooser locked'],
 [c.imageInput.style.opacity,'.45','file chooser appears blocked'],
 [c.paperSize.disabled,true,'paper size locked'],
 [c.photoSize.disabled,true,'original disabled photo size'],
 [c.label.style.pointerEvents,'none','file chooser label untouchable'],
 [c.plain.disabled,false,'unrelated buttons remain active'],
 [c.plain.style.opacity,'.8','unrelated opacity preserved']
])equal(item,expect,label);
for(const key of ['logsViewOwn','notificationsView','customerView','imageExport','settingsPrinting'])a.grants.add(key);
a.refresh();
for(const [item,expect,label] of [
 [c.operations.disabled,false,'operations re-enabled'],
 [c.operations.title,'افتح السجل','original operations title restored'],
 [c.operations.style.opacity,'.92','original operations appearance restored'],
 [c.notifications.disabled,true,'prior-disabled notification still disabled'],
 [c.notifications.title,'الإشعارات','title-only button restored'],
 [c.notifications.style.opacity,'.7','original notification opacity restored'],
 [c.customers.disabled,false,'customer documents re-enabled'],
 [c.imageInput.disabled,false,'file chooser re-enabled'],
 [c.imageInput.style.opacity,'.88','file chooser original opacity restored'],
 [c.paperSize.disabled,false,'paper choice re-enabled'],
 [c.photoSize.disabled,true,'photo size prior-disabled stays disabled'],
 [c.photoSize.style.opacity,'.6','photo size opacity restored'],
 [c.label.style.pointerEvents,'auto','file chooser label gets pointer events'],
 [c.label.style.opacity,'.77','file chooser label original style restored'],
 [c.plain.disabled,false,'unrelated stays usable']
])equal(item,expect,label);
a.grants.delete('logsViewOwn');a.grants.delete('imageExport');a.refresh();
equal(c.operations.disabled,true,'second revoke locks operations');equal(c.imageInput.disabled,true,'second revoke locks chooser');equal(c.label.style.pointerEvents,'none','second revoke locks label');
a.grants.add('logsViewOwn');a.grants.add('imageExport');a.refresh();
equal(c.operations.disabled,false,'second grant unlocks operations');equal(c.operations.title,'افتح السجل','second grant restores title');equal(c.imageInput.disabled,false,'second grant enables picker');equal(c.label.style.pointerEvents,'auto','second grant restores label');
a.refresh();equal(c.operations.disabled,false,'repeated updates idempotent');equal(c.imageInput.disabled,false,'repeated picker updates idempotent');
console.log('Permission touch recovery: '+checks+'/'+checks+' checks passed');
