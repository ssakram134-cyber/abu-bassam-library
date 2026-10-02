(()=>{
'use strict';
const KEY='abuEnvelopeStudioV1',CUSTOM_KEY='abuEnvelopeCustomTemplatesV1';
function clean(html){return String(html||'').replace(/\sdata-bound=(?:"1"|'1'|1)/g,'').replace(/\sdata-envelope-rebound=(?:"1"|'1'|1)/g,'').replace(/\sselected(?=[\s>])/g,'')}
try{
  const raw=localStorage.getItem(KEY);
  if(raw){
    const state=JSON.parse(raw);
    if(state&&typeof state.html==='string'){
      state.html=clean(state.html);
      localStorage.setItem(KEY,JSON.stringify(state));
    }
  }
  let list=[];
  try{list=JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]')||[]}catch(_){list=[]}
  if(!Array.isArray(list))list=[];
  const filtered=list.filter(item=>!(item&&item.id==='env-10'));
  if(filtered.length!==list.length)localStorage.setItem(CUSTOM_KEY,JSON.stringify(filtered.slice(-30)));
}catch(_){ }
})();
