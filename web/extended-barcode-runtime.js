(()=>{
'use strict';
if(window.AbuBassamExtendedBarcode)return;
const $=id=>document.getElementById(id);
const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const R=['1110010','1100110','1101100','1000010','1011100','1000100','1010000','1001000','1110100','1110010'];
R[9]='1110100';R[8]='1001000';R[7]='1000100';R[6]='1010000';R[5]='1001110';R[4]='1011100';R[3]='1000010';R[2]='1101100';R[1]='1100110';R[0]='1110010';
const PARITY=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
const ITF=['nnwwn','wnnnw','nwnnw','wwnnn','nnwnw','wnwnn','nwwnn','nnnww','wnnwn','nwnwn'];
function checkDigit(digits){
 if(!/^\d+$/.test(digits))throw Error('BARCODE_NOT_NUMERIC');
 let sum=0;for(let i=digits.length-1,j=0;i>=0;i--,j++)sum+=Number(digits[i])*(j%2===0?3:1);
 return String((10-sum%10)%10)
}
function normalize(type,input){
 const s=String(input??'').trim();
 const lengths={EAN13:[12,13],UPCA:[11,12],ITF14:[13,14]};
 if(!lengths[type])throw Error('BARCODE_UNKNOWN_TYPE');
 if(!/^[0-9]+$/.test(s))throw Error('BARCODE_DIGITS_REQUIRED');
 const [short,long]=lengths[type];
 if(s.length!==short&&s.length!==long)throw Error('BARCODE_LENGTH_'+long);
 if(s.length===short)return s+checkDigit(s);
 if(s.slice(-1)!==checkDigit(s.slice(0,-1)))throw Error('BARCODE_INVALID_CHECK_DIGIT');
 return s
}
function eanBits(s){
 const full=s.length===12?'0'+s:s;
 if(full.length!==13)throw Error('EAN13_INVALID_LENGTH');
 const parity=PARITY[Number(full[0])];let bits='101';
 for(let i=1;i<=6;i++)bits+=(parity[i-1]==='L'?L:G)[Number(full[i])];
 bits+='01010';
 for(let i=7;i<13;i++)bits+=R[Number(full[i])];
 return bits+'101'
}
function itfBits(value){
 let bits='1010'; // two narrow bars separated by narrow spaces
 for(let i=0;i<value.length;i+=2){
  const bars=ITF[Number(value[i])],spaces=ITF[Number(value[i+1])];
  for(let k=0;k<5;k++)bits+=(bars[k]==='w'?'111':'1')+(spaces[k]==='w'?'000':'0')
 }
 return bits+'1101'
}
function encode(type,input){
 const value=normalize(type,input);
 const bits=type==='ITF14'?itfBits(value):eanBits(type==='UPCA'?'0'+value:value);
 return{type,value,bits}
}
function svg(type,input){
 const {value,bits}=encode(type,input);
 const unit=3,margin=36,bars=bits.length*unit,height=144,width=bars+margin*2;
 let rects='';
 for(let i=0;i<bits.length;i++)if(bits[i]==='1')rects+='<rect x="'+(margin+i*unit)+'" y="7" width="'+unit+'" height="105"/>';
 return'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+type+' '+value+'">'+
 '<rect width="'+width+'" height="'+height+'" fill="white"/><g fill="#000">'+rects+'</g>'+
 '<text x="'+width/2+'" y="133" text-anchor="middle" font-size="14" font-family="monospace">'+value+'</text></svg>'
}
function authorized(){return window.AbuBassamSecurity?.role?.()==='owner'||window.AbuBassamPermissions?.can?.('cardsBarcode')===true}
function message(v){const el=$('extendedBarcodeMessage');if(el)el.textContent=v}
let current='';
function render(){
 if(!authorized())return message('ليس لديك إذن لإنشاء باركود.');
 try{
  const type=$('extendedBarcodeType').value,data=$('extendedBarcodeValue').value;
  const result=encode(type,data);current=svg(type,data);
  $('extendedBarcodeGraphic').innerHTML=current;
  message('تم التحقق من الرقم '+result.value+' • نوع '+type+' • طول الرمز '+result.bits.length+' وحدة.');
 }catch(e){current='';$('extendedBarcodeGraphic').textContent='';message('قيمة غير صالحة: '+String(e.message||e))}
}
function save(){
 if(!current||!authorized())return message('تحقق من الرقم والصلاحية قبل الحفظ.');
 const blob=new Blob([current],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='Abu_Bassam_Barcode_'+Date.now()+'.svg';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)
}
function build(){
 const cards=$('cardsCenter');if(!cards||$('extendedBarcodePanel'))return;
 const panel=document.createElement('section');panel.id='extendedBarcodePanel';
 panel.innerHTML='<h3>▥ أنواع باركود إضافية مع تدقيق الأرقام</h3>'+
 '<p>EAN-13 / UPC-A / ITF-14 • تحقّق من رقم الفحص قبل إنشاء الرمز • يعمل دون إنترنت.</p>'+
 '<label>النوع <select id="extendedBarcodeType"><option value="EAN13">EAN-13</option>'+
 '<option value="UPCA">UPC-A</option><option value="ITF14">ITF-14</option></select></label>'+
 '<label>الرقم <input id="extendedBarcodeValue" inputmode="numeric" autocomplete="off" placeholder="أدخل الرقم دون مسافات"></label>'+
 '<button id="extendedBarcodeRun">إنشاء وتدقيق الباركود</button>'+
 '<div id="extendedBarcodeGraphic" role="img" aria-label="معاينة الباركود"></div>'+
 '<p id="extendedBarcodeMessage" role="status"></p>'+
 '<button id="extendedBarcodeSave">حفظ الباركود SVG قابل للطباعة</button>';
 cards.appendChild(panel);
 $('extendedBarcodeRun').onclick=render;$('extendedBarcodeSave').onclick=save;
}
window.AbuBassamExtendedBarcode=Object.freeze({normalize,checkDigit,encode,svg});
window.addEventListener('DOMContentLoaded',build)
})();