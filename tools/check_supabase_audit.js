'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const historical=read('supabase/migrations/202609260001_backup_center.sql');
const correction=read('supabase/migrations/20261013000100_backup_item_count_2000.sql');
const edge=read('supabase/functions/backup-center/index.ts');
const client=read('web/backup-center-runtime.js');
const original=Number(historical.match(/item_count between 0 and (\d+)/)?.[1]);
const repaired=Number(correction.match(/item_count between 0 and (\d+)/)?.[1]);
const server=Number(edge.match(/MAX_BACKUP_RECORDS=(\d+)/)?.[1]);
const web=Number(client.match(/MAX_BACKUP_RECORDS=(\d+)/)?.[1]);
assert.equal(original,1000,'Historical limit must be identified before applying correction');
assert.equal(repaired,server,'New DB item limit must match Edge code');
assert.equal(repaired,web,'New DB item limit must match app code');
assert.equal(repaired,2000,'No reduction of approved backup capacity');
assert.ok(correction.includes('drop constraint if exists abu_bassam_backups_item_count_check'),'Existing constraint must be replaced, never edited in historical migration');
assert.ok(!/\b(?:grant|revoke|drop table)\b/i.test(correction),'Limit migration must not change user permissions or drop tables');
assert.ok(edge.includes('data.size>CHUNK_BYTES')&&edge.indexOf('data.size>CHUNK_BYTES')<edge.indexOf('await data.arrayBuffer()'),'Oversized backup parts must be rejected before memory allocation');
assert.ok(edge.includes("throw new Error('BACKUP_PART_SIZE_INVALID')"),'Part size failures must not be silently ignored');
assert.ok(edge.includes('partCount!==Math.ceil(size/CHUNK_BYTES)'),'Claimed upload part count must match actual size');
assert.ok(edge.includes("context(req,kind==='pre_restore'?'backupRestore':'backupCreate')"),'Backup create and pre-restore must keep permission gate');
assert.ok(edge.includes("if(row.branch_device_id!==base.deviceId)"),'Backup commit must be scoped to the uploading device');
assert.ok(edge.includes('if(!scopeAllowed(base.device,base.deviceId,row))'),'Other-branch downloads must require owner authorization');
// Exercise the actual multipart verification function rather than trusting source strings alone.
// The isolated worker mocks only Storage download and the streaming hash provider.
async function verifyPartSafety(){
  const start=edge.indexOf('async function verifyParts(');
  const end=edge.indexOf('\nasync function cleanupReady',start);
  assert.ok(start>=0&&end>start,'Backend multipart verifier could not be extracted');
  const body=edge.slice(start,end).replace(
    'admin:any,parts:string[],expectedSize:number,expectedSha:string',
    'admin,parts,expectedSize,expectedSha'
  );
  const digestZero={create:()=>({update:()=>{},digest:()=>new Uint8Array(32)})};
  const fn=new Function('sha256','MAX_BYTES','CHUNK_BYTES','BUCKET',body+';return verifyParts')(
    digestZero,512*1024*1024,5*1024*1024,'abu-bassam-private'
  );
  const validDigest='00'.repeat(32);
  for(const {name,size,actualSize,expectedSize,digest,reject,bufferCalls} of [
    {name:'oversized-part',size:5*1024*1024+1,actualSize:1,expectedSize:1,digest:validDigest,reject:true,bufferCalls:0},
    {name:'empty-part',size:0,actualSize:0,expectedSize:0,digest:validDigest,reject:true,bufferCalls:0},
    {name:'valid-part',size:3,actualSize:3,expectedSize:3,digest:validDigest,reject:false,bufferCalls:1},
    {name:'size-mismatch',size:3,actualSize:2,expectedSize:3,digest:validDigest,reject:true,bufferCalls:1},
    {name:'sha-mismatch',size:3,actualSize:3,expectedSize:3,digest:'11'.repeat(32),reject:true,bufferCalls:1}
  ]){
    let calls=0;
    const admin={storage:{from:()=>({download:async()=>({
      error:null,data:{size,arrayBuffer:async()=>{calls++;return new ArrayBuffer(actualSize)}}
    })})}};
    let thrown=false;
    try{await fn(admin,['snapshot-part'],expectedSize,digest)}catch(error){thrown=true}
    assert.equal(thrown,reject,'Backup multipart verification rejected unexpected case: '+name);
    assert.equal(calls,bufferCalls,'Memory allocation guard failed: '+name);
  }
  const condition=edge.match(/if\(!Number\.isInteger\(size\)\|\|size<1\|\|size>MAX_BYTES\|\|!Number\.isInteger\(count\)\|\|count<0\|\|count>MAX_BACKUP_RECORDS\|\|!Number\.isInteger\(partCount\)\|\|partCount<1\|\|partCount>MAX_PARTS\|\|partCount!==Math\.ceil\(size\/CHUNK_BYTES\)\)/);
  assert.ok(condition,'Exact multipart upload plan guard missing');
  const rejected=new Function('size','count','partCount','MAX_BYTES','MAX_BACKUP_RECORDS','MAX_PARTS','CHUNK_BYTES','return '+condition[0].slice(3,-1));
  for(const test of [
    {size:0,count:0,parts:1,reject:true},
    {size:1,count:0,parts:1,reject:false},
    {size:5*1024*1024,count:2000,parts:1,reject:false},
    {size:5*1024*1024+1,count:2000,parts:1,reject:true},
    {size:5*1024*1024+1,count:2001,parts:2,reject:true},
    {size:5*1024*1024+1,count:2000,parts:2,reject:false}
  ]){
    assert.equal(rejected(test.size,test.count,test.parts,512*1024*1024,2000,120,5*1024*1024),test.reject,
      'Multipart plan unexpectedly accepted/rejected '+JSON.stringify(test));
  }
}
verifyPartSafety().then(()=>{
  console.log('Supabase source and behavioral regression checks passed: 5 download cases, 6 upload-plan cases, 2000-row metadata constraint, and scoped authorization. Database migration application remains unverified.');
}).catch(error=>{console.error('Supabase audit checks failed:',error);process.exitCode=1});
