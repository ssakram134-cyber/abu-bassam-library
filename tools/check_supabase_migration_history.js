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
const need=(src,token,label)=>{if(!src.includes(token))fail(label+' missing '+token)};
const secure=fs.readFileSync(path.join(DIR,'20260920064926_secure_sync_v4_2.sql'),'utf8');
for(const token of ['create table if not exists public.abu_bassam_sync_secure','enable row level security','auth.uid()','abu-bassam-private'])need(secure,token,'secure sync base');
const least=fs.readFileSync(path.join(DIR,'20260920065005_secure_sync_least_privilege.sql'),'utf8');
for(const token of ['revoke all on table public.abu_bassam_sync_secure from anon, authenticated','grant select, insert, update, delete on table public.abu_bassam_sync_secure to authenticated','revoke all on sequence public.abu_bassam_sync_secure_id_seq from anon, authenticated'])need(least,token,'secure sync least privilege');
const legacyLock=fs.readFileSync(path.join(DIR,'20260920065840_lock_legacy_sync.sql'),'utf8');
for(const token of ['drop policy if exists','revoke all on public.abu_bassam_sync from anon, authenticated'])need(legacyLock,token,'legacy sync lock');
console.log(`supabase migration history checks passed: ${files.length} canonical live migrations, exact SHA-256 manifest match, 14-digit unique versions/names, and no legacy abu_bassam_sync runtime access`);
