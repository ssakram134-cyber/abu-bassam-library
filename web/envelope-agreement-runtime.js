(()=>{
'use strict';
if(document.body?.dataset?.studioMode!=='envelope')return;
if(window.__ABU_ENVELOPE_AGREEMENT_V2__)return;window.__ABU_ENVELOPE_AGREEMENT_V2__=true;
const $=id=>document.getElementById(id);
function relabelPresets(){const s=$('dsPreset');if(!s)return;const a=s.querySelector('option[value="A5"]'),b=s.querySelector('option[value="A4"]');if(a){a.textContent='ورق A5 — غلاف فقط ٢١٠ × ١٤٨ مم';a.title='مقاس ورق/غلاف وليس قياس ظرف قياسي'}if(b){b.textContent='ورق A4 — غلاف فقط ٢٩٧ × ٢١٠ مم';b.title='مقاس ورق/غلاف وليس قياس ظرف قياسي'}}
function textExists(label){return [...document.querySelectorAll('#dsCanvas .ds-text')].some(el=>(el.textContent||'').includes(label))}
function addBoundText(label,style,marker){if(textExists(label)||!window.DesignStudio?.addText)return;const c=$('dsCanvas');if(!c)return;DesignStudio.addText();const items=c.querySelectorAll('.ds-el.ds-text');const el=items[items.length-1];if(!el)return;const textNode=[...el.childNodes].find(n=>n.nodeType===3);if(textNode)textNode.nodeValue=label;else el.insertBefore(document.createTextNode(label),el.firstChild);el.dataset.agreedField=marker;el.style.cssText=style;el.setAttribute('contenteditable','true')}
function ensureOptionalFields(){const c=$('dsCanvas');if(!c)return;addBoundText('التاريخ: ....................','left:5%;top:8%;width:24%;height:9%;font-size:clamp(9px,2vw,18px);font-weight:700;text-align:center;','date');addBoundText('اليوم: ......................','left:5%;top:18%;width:24%;height:9%;font-size:clamp(9px,2vw,18px);font-weight:700;text-align:center;','day')}
function note(){const status=$('dsStatus');if(status&&!status.dataset.agreedNote){status.dataset.agreedNote='1';status.textContent='كل تعديل يُحفظ تلقائيًا • اليوم والتاريخ اختياريان ويمكن حذفهما • A4/A5 مقاسات ورق/غلاف وليست أظرفًا قياسية'}}
function refreshAgreementFields(){relabelPresets();ensureOptionalFields();note()}
function patchTemplateApply(){if(!window.DesignStudio||DesignStudio.__abuEnvelopeAgreementPatched)return;const original=DesignStudio.applyTemplate?.bind(DesignStudio);if(!original)return;DesignStudio.applyTemplate=function(...args){const result=original(...args);setTimeout(refreshAgreementFields,0);return result};DesignStudio.__abuEnvelopeAgreementPatched=true}
function init(){setTimeout(()=>{relabelPresets();patchTemplateApply();ensureOptionalFields();note()},0)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
