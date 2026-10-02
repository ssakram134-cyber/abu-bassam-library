const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..');
const DIR=path.join(ROOT,'supabase','migrations');
const MANIFEST_PATH=path.join(DIR,'LIVE_HISTORY_MANIFEST.json');
const fail=m=>{throw new Error('supabase migration history check failed: '+m)};
const manifest=JSON.parse(fs.readFileSync(MANIFEST_PATH,'utf8'));
const files=fs.readdirSync(DIR).filter(f=>f.endsWith('.sql')).sort();
if(manifest.schema!==1||!Array.isArray(manifest.entries))fail('invalid manifest');
if(files.length!==manifest.entries.length||files.length!==manifest.count)fail(`file count mismatch repo=${files.length} manifest=${manifest.entries.length}`);
const seenVersion=new Set(),seenName=new Set();
for(const f of files){
 const m=f.match(/^(\\d{14})_([a-z0-9_]+)\\.sql$/);
 if(!m)fail('migration filename must use a 14-digit UTC timestamp and snake_case name: '+f);
 if(seenVersion.has(m[1]))fail('duplicate migration version '+m[1]);
 if(seenName.has(m[2]))fail('duplicate migration name '+m[2]);
 seenVersion.add(m[1]);seenName.add(m[2]);
}
for(const e of manifest.entries){
 const expected=`${e.version}_${e.name}.sql`;
 if(e.file!==expected)fail('manifest filename mismatch '+e.file);
 if(!files.includes(expected))fail('missing '+expected);
 const body=fs.readFileSync(path.join(DIR,expected));
 const digest=crypto.createHash('sha256').update(body).digest('hex');
 if(digest!==e.sha256)fail('content hash mismatch '+expected);
}
const webRoot=path.join(ROOT,'web');
const stack=[webRoot],legacy=[];
while(stack.length){
 const current=stack.pop();
 for(const ent of fs.readdirSync(current,{withFileTypes:true})){
   const p=path.join(current,ent.name);
   if(ent.isDirectory()){stack.push(p);continue}
   if(!/\\.(?:js|html)$/i.test(ent.name))continue;
   const src=fs.readFileSync(p,'utf8');
   if(/['"]abu_bassam_sync['"]/.test(src)||/\\/rest\\/v1\\/abu_bassam_sync(?:[?/'"]|$)/.test(src))legacy.push(path.relative(ROOT,p));
 }
}
if(legacy.length)fail('legacy abu_bassam_sync runtime reference: '+legacy.join(', '));
console.log(`supabase migration history checks passed: ${files.length} canonical live migrations, exact SHA-256 manifest match, 14-digit unique versions/names, and no legacy abu_bassam_sync runtime access`);
