'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const spec=fs.readFileSync(path.join(root,'docs/APPROVED-211-REQUIREMENTS.md'),'utf8');
const tracker=fs.readFileSync(path.join(root,'docs/APPROVED-211-TRACKER.csv'),'utf8').replace(/^\uFEFF/,'');
const section=(start,end)=>{
  const a=spec.indexOf(start),b=spec.indexOf(end,a+start.length);
  if(a<0||b<0)throw new Error('Approved requirements section is missing: '+start);
  return spec.slice(a+start.length,b);
};
function numbered(sectionText){
  return sectionText.split(/\r?\n/).filter(x=>/^\d+\.\s/.test(x))
    .map(x=>Number(x.match(/^(\d+)\./)[1]));
}
const core=numbered(section('## الأساسيات الإحدى عشرة المعتمدة','## تفاصيل الميزات المعتمدة سابقاً 1–100'));
const features=numbered(section('## تفاصيل الميزات المعتمدة سابقاً 1–100','## قواعد إلزامية للتنفيذ'));
for(const [group,limit] of [[core,11],[features,200]]){
  if(group.length!==limit||group.some((x,i)=>x!==i+1))throw new Error('Approved requirements missing/duplicated: '+limit);
}
const rows=tracker.trimEnd().split(/\r?\n/);
if(rows.length!==212)throw new Error('Requirements tracker must have 211 rows plus header');
const ids=rows.slice(1).map(line=>line.match(/^"([^"]+)"/)?.[1]);
if(ids.some((x,i)=>x!==(i<11?'B'+String(i+1).padStart(2,'0'):'F'+String(i-10).padStart(3,'0'))))
  throw new Error('Requirements tracker IDs missing, reordered, or duplicated');
if(!rows.slice(1).every(line=>['"تم ✅"','"ناقص ⚠️"','"غير موجود ❌"','"يحتاج تحقق 🔍"'].some(state=>line.includes(state))))
  throw new Error('Requirements tracker has invalid audit status');
if(!spec.includes('٢١٢–٤١١')||!spec.includes('ملغاة'))
  throw new Error('Cancelled proposal exclusion missing');
console.log('Approved requirements gate: 11 core + 200 details, exactly 211 tracked IDs; cancelled proposals excluded.');
