(()=>{
'use strict';
if(window.__ABU_NOTIFICATION_OPS_BRIDGE_V1__)return;
window.__ABU_NOTIFICATION_OPS_BRIDGE_V1__=true;
function install(){
  const ops=window.AbuBassamOps,center=window.AbuBassamNotifications;
  if(!ops||!center||typeof ops.add!=='function'||typeof ops.list!=='function'||typeof center.fromOperation!=='function')return false;
  if(ops.add.__abuStableNotifyBridge)return true;
  const current=ops.add;
  const original=current.__abuOriginal||current;
  const wrapped=function(input,...rest){
    const previousId=ops.list?.()?.[0]?.id||'';
    const result=original.call(this,input,...rest);
    Promise.resolve(result).finally(()=>setTimeout(()=>{
      try{
        const latest=ops.list?.()?.[0];
        if(latest&&latest.id&&latest.id!==previousId)center.fromOperation(latest);
      }catch(_){}
    },0));
    return result;
  };
  wrapped.__abuStableNotifyBridge=true;
  wrapped.__abuOriginal=original;
  ops.add=wrapped;
  return true;
}
const timer=setInterval(()=>{if(install())clearInterval(timer)},120);
setTimeout(()=>clearInterval(timer),15000);
if(document.readyState!=='loading')install();else document.addEventListener('DOMContentLoaded',install,{once:true});
})();
