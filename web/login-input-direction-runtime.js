(()=>{
'use strict';
if(window.__ABU_LOGIN_INPUT_DIRECTION_V1__)return;
window.__ABU_LOGIN_INPUT_DIRECTION_V1__=true;

function apply(){
  const user=document.getElementById('abuLoginUser');
  const pass=document.getElementById('abuLoginPass');
  [user,pass].forEach(input=>{
    if(!input)return;
    input.setAttribute('dir','ltr');
    input.setAttribute('lang','en');
    input.setAttribute('autocapitalize','off');
    input.setAttribute('spellcheck','false');
    input.style.direction='ltr';
    input.style.unicodeBidi='plaintext';
    input.style.textAlign='center';
  });
}

function init(){
  apply();
  [80,250,700,1600].forEach(delay=>setTimeout(apply,delay));
  window.addEventListener('pageshow',apply);
  document.addEventListener('abu-bassam-auth-changed',()=>setTimeout(apply,0));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
