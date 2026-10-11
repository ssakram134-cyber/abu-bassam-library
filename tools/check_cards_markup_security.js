'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const src=fs.readFileSync('web/cards-studio-runtime.js','utf8');new Function(src);
const win={addEventListener(){},AbuBassamSecurity:{role:()=> 'owner'}};
const doc={getElementById(){return null},addEventListener(){}},store={getItem(){return null},setItem(){},removeItem(){}};
const exposed=src.replace('window.CardsStudio={','window.__badgeSecurityAudit={safeCardImageSrc,photoMarkup,brandLine,referenceBrand,watermark,cardHtml};window.CardsStudio={');
assert.notEqual(exposed,src);
new Function('window','document','localStorage',exposed)(win,doc,store);
const a=win.__badgeSecurityAudit,valid='data:image/jpeg;base64,QUJD';
assert.equal(a.safeCardImageSrc(valid),valid);
assert.equal(a.safeCardImageSrc('data:image/png;base64,QQ=='),'data:image/png;base64,QQ==');
assert.equal(a.safeCardImageSrc('abu_bassam_icon.webp'),'abu_bassam_icon.webp');
for(const malicious of ['javascript:alert(1)','data:text/html;base64,PHNjcmlwdD4=','data:image/svg+xml;base64,PHN2Zz4=','x" onerror="alert(1)','../private-file.jpg','https://example.com/remote.jpg']){
 assert.equal(a.safeCardImageSrc(malicious),'','Image source must reject '+malicious);
}
const model={type:'personal',orientation:'landscape',data:{name:'ملاك',phone:'07829667521',address:'',notes:''},brand:{name:'مكتبة أبو بسام',phone:'07829667521',logo:'x" onerror="alert(1)'},photo:'x" onerror="alert(1)',photoTransform:{zoom:'1);background:url(evil)',x:'0" onmouseover="alert(1)',y:-120,rotate:'0;background:red'},watermark:'logo',watermarkText:'اختبار',watermarkOpacity:10};
const front=a.cardHtml(model,'front'),back=a.cardHtml(model,'back');
assert.ok(front.includes('cs-photo-empty'),'Rejected image must be replaced by visible placeholder');
for(const output of [front,back,a.photoMarkup(model),a.referenceBrand(model,'cs-test-brand'),a.watermark(model)]){
 assert.ok(!output.includes('onerror='),'Untrusted image must not inject HTML events');
 assert.ok(!output.includes('onmouseover='),'Untrusted transforms must not inject HTML events');
 assert.ok(!output.includes('background:red'),'Untrusted CSS fragment must not enter badge');
 assert.ok(!output.includes('javascript:'),'Disallowed image protocols must be rejected');
}
model.photo=valid;model.brand.logo='data:image/png;base64,QQ==';model.photoTransform={zoom:2,x:12,y:-8,rotate:30};
const safeFront=a.cardHtml(model,'front'),safeBack=a.cardHtml(model,'back');
assert.ok(safeFront.includes('src="'+valid+'"'),'Valid photo must remain visible');
assert.ok(safeFront.includes('scale(2) rotate(30deg)'),'Legitimate photo transform must remain');
assert.ok(safeBack.includes('src="data:image/png;base64,QQ=="'),'Valid brand image must remain in back');
assert.ok(a.watermark(model).includes('src="data:image/png;base64,QQ=="'),'Valid watermark logo must remain');
console.log('Badge markup safety passed: unsafe image/CSS injection blocked, valid photos, branding, logo watermark and crop transforms retained.');
