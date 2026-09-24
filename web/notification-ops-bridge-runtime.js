(()=>{
'use strict';
if(window.__ABU_NOTIFICATION_OPS_BRIDGE_V1__)return;
window.__ABU_NOTIFICATION_OPS_BRIDGE_V1__=true;
const NOTIFY_KEY='abuBassamNotificationsV1';
function removeTransientDuplicate(latest,ops){
  try{
    const list=JSON.parse(localStorage.getItem(NOTIFY_KEY)||'[]');
    if(!Array.isArray(list)||!latest)return;
    const valid=new Set((ops.list?.()||[]).filter(x=>x?.id).map(x=>`op:${x.id}`));
    const time=Date.parse(latest.printedAt||latest.uploadedAt||0)||Date.now();
    const same=n=>n?.source==='operations'&&!valid.has(n.id)&&String(n.title||'')===String(latest.title||'عملية')&&String(n.details||'')===String(latest.details||latest.fileName||'')&&String(n.section||'')===String(latest.section||'')&&Math.abs((Date.parse(n.createdAt||0)||time)-time)<=5000;
    const cleaned=list.filter(n=>!same(n));
    if(cleaned.length!==list.length)localStorage.setItem(NOTIFY_KEY,JSON.stringify(cleaned));
  }catch(_){}
}
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
        if(latest&&latest.id&&latest.id!==previousId){removeTransientDuplicate(latest,ops);center.fromOperation(latest)}
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
