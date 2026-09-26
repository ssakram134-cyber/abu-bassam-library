(()=>{
'use strict';
if(window.__ABU_NOTIFICATION_EXCEL_V1__)return;
window.__ABU_NOTIFICATION_EXCEL_V1__=true;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function owner(){return window.AbuBassamSecurity?.role?.()==='owner'}
function cells(){
  return [...document.querySelectorAll('#abuReportRows .abu-report-row:not(.head)')].map(row=>{
    const parts=[...row.children].map(x=>String(x.innerText||x.textContent||'').trim().replace(/\s*\n\s*/g,' | '));
    return [parts[0]||'',parts[1]||'',parts[2]||''];
  });
}
function exportExcel(){
  if(!owner())return alert('تصدير Excel لتقارير الأجهزة الفرعية متاح للحساب الرئيسي فقط.');
  const rows=cells();if(!rows.length)return alert('اعرض التقرير أولًا ثم صدّره إلى Excel.');
  const from=$('abuReportFrom')?.value||'',to=$('abuReportTo')?.value||'';
  const table=`<table border="1"><thead><tr><th>التاريخ / الجهاز</th><th>العملية / التفاصيل</th><th>النوع / المستوى</th></tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const html=`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>تقرير مكتبة أبو بسام</title></head><body><h3>تقرير عمليات الأجهزة الفرعية — مكتبة أبو بسام</h3><p>الفترة: ${esc(from||'—')} إلى ${esc(to||'—')} • عدد العمليات: ${rows.length}</p>${table}</body></html>`;
  const mime='application/vnd.ms-excel';
  const data=`data:${mime};base64,${btoa(unescape(encodeURIComponent(html)))}`;
  if(window.Android?.saveBase64){Android.saveBase64(`Abu_Bassam_Branch_Report_${Date.now()}.xls`,mime,data);return}
  const a=document.createElement('a');a.download=`Abu_Bassam_Branch_Report_${Date.now()}.xls`;a.href=data;a.click();
}
function install(){
  const actions=document.querySelector('#abuAdminContent .abu-report-actions');if(!actions||$('abuReportExcel'))return false;
  const b=document.createElement('button');b.id='abuReportExcel';b.type='button';b.textContent='Excel';b.onclick=exportExcel;actions.appendChild(b);return true;
}
function boot(){if(install())return;let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>120)clearInterval(timer)},250);new MutationObserver(()=>install()).observe(document.documentElement,{childList:true,subtree:true})}
window.AbuBassamExcelReport={export:exportExcel,install};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
