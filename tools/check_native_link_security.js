const fs=require('fs');
const src=fs.readFileSync('index.js','utf8');
const repair=fs.readFileSync('scripts/patch-startup-stability.mjs','utf8');
const need=(s,m,l)=>{if(!s.includes(m))throw new Error(`native link security check failed: ${l}`)};
const forbid=(s,m,l)=>{if(s.includes(m))throw new Error(`native link security check failed: forbidden ${l}`)};
for(const [s,label] of [[src,'index.js'],[repair,'startup repair']]){
  need(s,"if (/^(https:|tel:|mailto:|tg:|whatsapp:)/i.test(url))",`${label} external navigation must allow HTTPS and approved app schemes only`);
  forbid(s,"https?:|tel:",`${label} must not accept plaintext HTTP`);
}
need(src,"if (!/^(https:|tel:|mailto:|tg:|whatsapp:)/i.test(value))",'openExternal must allow HTTPS and approved app schemes only');
need(src,"originWhitelist={['file://*','about:*']}",'WebView must stay local-only');
need(src,'mixedContentMode="never"','mixed content must stay disabled');
forbid(src,"originWhitelist={['*']}",'wildcard WebView origin whitelist');
forbid(src,'mixedContentMode="always"','unsafe mixed content');
console.log('native link security checks passed: canonical WebView and explicit repair source both keep external web navigation HTTPS-only.');
