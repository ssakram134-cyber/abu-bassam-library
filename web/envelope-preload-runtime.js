(()=>{
'use strict';
const KEY='abuEnvelopeStudioV1',CUSTOM_KEY='abuEnvelopeCustomTemplatesV1';
function clean(html){return String(html||'').replace(/\sdata-bound=(?:"1"|'1'|1)/g,'').replace(/\sdata-envelope-rebound=(?:"1"|'1'|1)/g,'').replace(/\sselected(?=[\s>])/g,'')}
function el(kind,html,x,y,w,h,extra=''){return `<div class="ds-el ds-${kind}" data-kind="${kind}" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%;${extra}">${html}<span class="ds-resize" title="تغيير الحجم">↙</span></div>`}
function text(t,x,y,w,h,style=''){return el('text',t,x,y,w,h,`font-size:clamp(10px,2.6vw,24px);${style}`)}
function deco(x,y,w,h,style=''){return el('deco','',x,y,w,h,style)}
function env10(){const p='#123f4d',a='#d5ad58';return {
 id:'env-10',name:'10 — الإطار المتقاطع الحديث',bg:'#fffdf8',html:
 deco(0,0,100,100,`border:4px solid ${p};background:linear-gradient(135deg,${p}12 0 14%,transparent 14% 86%,${a}20 86%);`)+
 deco(0,0,100,100,`background:linear-gradient(45deg,transparent 0 46%,${a}24 46% 48%,transparent 48% 52%,${p}18 52% 54%,transparent 54%);`)+
 deco(3,5,94,90,`border:2px solid ${a};border-radius:14px;`)+
 text('إدارة: .........................',61,8,34,12,'font-weight:800;text-align:center;')+
 text('مدرسة القادسية الابتدائية\nللبنين',34,8,31,17,'font-weight:900;text-align:center;white-space:pre-line;')+
 text('أسئلة الامتحان النهائي',30,31,40,15,`font-weight:900;text-align:center;font-size:clamp(14px,3vw,28px);color:${p};background:#fffdf8dd;border:2px solid ${a};border-radius:12px;`)+
 text('المادة: ....................',57,55,35,11,'font-weight:700;')+
 text('الصف: ......................',9,55,35,11,'font-weight:700;')+
 text('الدور: الأول / الثاني',57,70,35,10,'font-weight:700;')+
 text('العام الدراسي: ٢٠٢٥ - ٢٠٢٦',9,70,38,10,'font-weight:700;')+
 text('معلم المادة: أكرم حاتم الغزالي',30,84,40,9,`font-weight:700;text-align:center;color:${p};`)
 }}
try{
 const raw=localStorage.getItem(KEY);if(raw){const state=JSON.parse(raw);if(state&&typeof state.html==='string'){state.html=clean(state.html);localStorage.setItem(KEY,JSON.stringify(state))}}
 let list=[];try{list=JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]')||[]}catch(e){}if(!Array.isArray(list))list=[];const tpl=env10(),idx=list.findIndex(x=>x&&x.id==='env-10');if(idx>=0)list[idx]=tpl;else list.push(tpl);localStorage.setItem(CUSTOM_KEY,JSON.stringify(list.slice(-30)));
}catch(e){}
})();