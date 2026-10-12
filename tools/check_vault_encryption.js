'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {TextEncoder}=require('node:util');

const runtime=fs.readFileSync('web/document-vault-hardening-runtime.js','utf8');
const start=runtime.indexOf('function strong(pass){');
const end=runtime.indexOf("async function plainBackup(",start);
assert.ok(start>=0&&end>start,'Encrypted vault helpers must remain present');
const code=runtime.slice(start,end);
const MAGIC=new TextEncoder().encode('ABUVLT1\n');
const {strong,encryptBackup,decryptBackup,isEncrypted}=new Function(
 'crypto','TextEncoder','MAGIC','ITER',code+
 ';return {strong,encryptBackup,decryptBackup,isEncrypted}'
)(webcrypto,TextEncoder,MAGIC,300000);

const payload=new TextEncoder().encode('Abu Bassam: an offline vault backup must remain private.');
const password='Vault#2026StrongKey';
let count=0;
function check(v,msg){assert.ok(v,msg);count++}
(async()=>{
 check(strong(password)===true,'Strong backup password must be accepted');
 check(strong('password123')===false,'Weak backup password must be refused');
 const cipher=await encryptBackup(payload,password);
 check(isEncrypted(cipher)&&cipher.length===MAGIC.length+16+12+payload.length+16,
   'Authenticated envelope must use magic + 16 salt + 12 IV + 16 GCM tag');
 const clear=await decryptBackup(cipher,password);
 check(Buffer.from(clear).equals(Buffer.from(payload)),'Correct password must recover identical plaintext');
 await assert.rejects(()=>decryptBackup(cipher,'WrongPassword#2026'),/./,
   'Incorrect password must never return a decrypted vault');
 count++;
 for(const [label,offset] of [
  ['salt',MAGIC.length],
  ['initialization vector',MAGIC.length+16],
  ['encrypted payload',MAGIC.length+28],
  ['GCM authentication tag',cipher.length-1]
 ]){
  const damaged=cipher.slice();damaged[offset]^=1;
  await assert.rejects(()=>decryptBackup(damaged,password),/./,
    'Tampered '+label+' must fail authenticated decryption');
  count++
 }
 const second=await encryptBackup(payload,password);
 check(!Buffer.from(cipher).equals(Buffer.from(second)),
   'Equal plaintexts encrypted twice must use fresh IV/salt');
 check(Buffer.from(await decryptBackup(second,password)).equals(Buffer.from(payload)),
   'Second authenticated envelope must decrypt');
 const truncated=cipher.slice(0,cipher.length-8);
 await assert.rejects(()=>decryptBackup(truncated,password),/./,
   'Truncated AES-GCM tag must cause decryption failure');
 count++;
 check(!isEncrypted(new Uint8Array(8)), 'Invalid/truncated header must not be recognized');
 check(runtime.includes("if(/\\.abuvault$/i.test(String(file.name||''))&&!isEncrypted(bytes))"),
   'Damaged .abuvault header must fail closed during restore');
 check(runtime.includes("if(restoreFails>=5){restoreLockedUntil=Date.now()+5*60*1000"),
   'Failed-password attempts must trigger timed lockout');
 console.log('Vault AES-GCM/PBKDF2 checks passed: '+count+
  ' native Node WebCrypto cases; wrong password, salt, IV, ciphertext, tag, truncation and fresh encryption.')
})().catch(error=>{console.error(error);process.exitCode=1});
