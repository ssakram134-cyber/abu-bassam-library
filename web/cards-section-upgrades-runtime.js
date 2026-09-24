(()=>{
'use strict';
if(window.__ABU_CARDS_SECTION_UPGRADES_V1__)return;
window.__ABU_CARDS_SECTION_UPGRADES_V1__=true;
function addCss(){if(document.getElementById('abuCardsSectionUpgradesCss'))return;const s=document.createElement('style');s.id='abuCardsSectionUpgradesCss';s.textContent=`.cs-login-value .cs-cap{color:#d71920!important;font-weight:900!important}.abu-capital-hint{grid-column:1/-1;padding:7px 9px;border-radius:9px;background:#fff1f2;color:#a11d2d;font-size:9px;font-weight:900}.abu-gallery-barcode{background:#7c3aed!important}`;document.head.appendChild(s)}
function cleanChildLine(){
 const input=document.querySelector('#csForm [data-field="line"]');
 if(input){if(String(input.value||'').trim()){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));return}input.closest('label')?.remove()}
 document.querySelectorAll('#csCardPair .cs-row').forEach(row=>{const b=row.querySelector('b');if(b&&String(b.textContent).includes('رقم خط النقل'))row.remove()});
}
function addLoginHint(){const form=document.getElementById('csForm');if(!form||document.querySelector('.abu-capital-hint'))return;const account=form.querySelector('[data-field="account"]'),password=form.querySelector('[data-field="password"]');if(!account&&!password)return;const hint=document.createElement('div');hint.className='abu-capital-hint';hint.textContent='A B C — أي حرف إنجليزي كبير يظهر باللون الأحمر داخل الباج تلقائيًا.';form.appendChild(hint)}
function addGalleryBarcodeButton(){const box=document.querySelector('.cs-reader-actions');if(!box||document.getElementById('abuBarcodeGalleryBtn'))return;let btn=document.createElement('button');btn.id='abuBarcodeGalleryBtn';btn.className='abu-gallery-barcode';btn.textContent='🖼 قراءة من الاستديو';btn.onclick=()=>{const input=document.getElementById('csBarcodeImageInput');if(!input)return;input.removeAttribute('capture');input.click()};box.appendChild(btn)}
function stripChildLineHtml(html){try{const doc=new DOMParser().parseFromString(String(html||''),'text/html');doc.querySelectorAll('.cs-row').forEach(row=>{const b=row.querySelector('b');if(b&&String(b.textContent).includes('رقم خط النقل'))row.remove()});return '<!doctype html>'+doc.documentElement.outerHTML}catch(e){return String(html||'')}}
function patchAndroid(){if(!window.Android||Android.__abuChildLineStripV1)return false;Android.__abuChildLineStripV1=true;const print=Android.printHtml,save=Android.savePdfHtml;if(typeof print==='function')Android.printHtml=function(html){return print.call(this,stripChildLineHtml(html))};if(typeof save==='function')Android.savePdfHtml=function(name,html){return save.call(this,name,stripChildLineHtml(html))};return true}
function scan(){addCss();cleanChildLine();addLoginHint();addGalleryBarcodeButton();patchAndroid()}
function boot(){scan();let n=0,t=setInterval(()=>{n++;scan();if(n>160)clearInterval(t)},80);new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();