(()=>{'use strict';if(window.__ABU_CUSTOMER_IMAGE_QUALITY_V1__)return;window.__ABU_CUSTOMER_IMAGE_QUALITY_V1__=1;let timer=0,last='';function analyze(){const modal=document.getElementById('cwfEditor'),cv=document.getElementById('cwfCanvas'),out=document.getElementById('cwfQuality');if(!modal?.classList.contains('on')||!cv||!out||!cv.width||!cv.height)return;try{const w=cv.width,h=cv.height,x=cv.getContext('2d',{willReadFrequently:true}),step=Math.max(2,Math.floor(Math.max(w,h)/260)),d=x.getImageData(0,0,w,h).data;let n=0,sum=0,sum2=0,edges=0,clippedDark=0,clippedLight=0;for(let y=step;y<h-step;y+=step)for(let xx=step;xx<w-step;xx+=step){const i=(y*w+xx)*4,j=(y*w+xx+step)*4,k=((y+step)*w+xx)*4,l=.299*d[i]+.587*d[i+1]+.114*d[i+2],lr=.299*d[j]+.587*d[j+1]+.114*d[j+2],ld=.299*d[k]+.587*d[k+1]+.114*d[k+2];sum+=l;sum2+=l*l;n++;if(l<18)clippedDark++;if(l>238)clippedLight++;edges+=Math.abs(l-lr)+Math.abs(l-ld)}if(!n)return;const mean=sum/n,sd=Math.sqrt(Math.max(0,sum2/n-mean*mean)),edge=edges/(n*2),dark=clippedDark/n,light=clippedLight/n,warnings=[];if(mean<65)warnings.push('الصورة مظلمة');else if(mean>205)warnings.push('الإضاءة مرتفعة');if(sd<28)warnings.push('التباين منخفض');if(edge<10)warnings.push('التفاصيل/الوضوح منخفض');if(dark>.18)warnings.push('مناطق سوداء كثيرة');if(light>.2)warnings.push('مناطق بيضاء محروقة');const grade=warnings.length===0?'جودة الصورة جيدة ✓':warnings.length<=2?'تحتاج مراجعة: '+warnings.join(' • '):'تنبيه جودة: '+warnings.join(' • '),base=String(out.textContent||'').replace(/\s*\|\s*فحص الصورة:.*$/,'');out.textContent=base+' | فحص الصورة: '+grade;out.dataset.imageQuality=warnings.length===0?'good':warnings.length<=2?'review':'warning'}catch{}}
function schedule(){clearTimeout(timer);timer=setTimeout(analyze,180)}
function attachEditor(){
 const m=document.getElementById('cwfEditor');
 if(!m||m.dataset.qualityWired==='1')return !!m;
 m.dataset.qualityWired='1';
 for(const name of ['input','change','pointerup'])m.addEventListener(name,schedule,true);
 const modalObserver=new MutationObserver(records=>{if(records.some(r=>r.attributeName==='class')&&m.classList.contains('on'))schedule()});
 modalObserver.observe(m,{attributes:true,attributeFilter:['class']});
 if(m.classList.contains('on'))schedule();
 return true;
}
function boot(){
 if(attachEditor())return;
 const lookupObserver=new MutationObserver(()=>{if(attachEditor())lookupObserver.disconnect()});
 lookupObserver.observe(document.documentElement,{childList:true,subtree:true});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();})();