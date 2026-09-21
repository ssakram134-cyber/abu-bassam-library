(()=>{
'use strict';
const KEY='abuEnvelopeStudioV1';
function clean(html){return String(html||'').replace(/\sdata-bound=(?:"1"|'1'|1)/g,'').replace(/\sdata-envelope-rebound=(?:"1"|'1'|1)/g,'').replace(/\sselected(?=[\s>])/g,'')}
try{const raw=localStorage.getItem(KEY);if(!raw)return;const state=JSON.parse(raw);if(state&&typeof state.html==='string'){state.html=clean(state.html);localStorage.setItem(KEY,JSON.stringify(state))}}catch(e){}
})();
