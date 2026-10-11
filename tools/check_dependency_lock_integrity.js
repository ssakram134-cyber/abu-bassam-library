'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const manifest=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
assert.equal(lock.lockfileVersion,3,'Native project uses npm lockfile v3');
assert.equal(lock.name,manifest.name);
assert.equal(lock.version,manifest.version);
const root=lock.packages?.[''];
assert.ok(root,'Root package entry is required');
assert.equal(root.name,manifest.name);
assert.equal(root.version,manifest.version);
for(const field of ['dependencies','devDependencies','optionalDependencies']){
 const declared=manifest[field]||{},locked=root[field]||{};
 assert.equal(JSON.stringify(Object.keys(declared).sort()),JSON.stringify(Object.keys(locked).sort()),'Root '+field+' names differ from package.json');
 for(const [name,range] of Object.entries(declared))assert.equal(locked[name],range,'Root '+field+' changed: '+name);
}
const registry='https://registry.npmjs.org/';
const missing=[];
for(const [name,entry] of Object.entries(lock.packages||{})){
 if(!name||!entry.resolved)continue;
 if(!entry.resolved.startsWith(registry))continue;
 if(!/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity||''))missing.push({name,integrity:entry.integrity||'MISSING'});
}
assert.deepEqual(missing,[],'Every pinned registry tarball must have its SHA-512 integrity recorded');
const contacts=lock.packages['node_modules/expo-contacts'];
assert.ok(contacts,'expo-contacts must be locked for native Android builds');
assert.equal(manifest.dependencies['expo-contacts'],'~15.0.11');
assert.equal(contacts.version,'15.0.11');
assert.equal(contacts.resolved,registry+'expo-contacts/-/expo-contacts-15.0.11.tgz');
assert.deepEqual(contacts.peerDependencies,{expo:'*',react:'*','react-native':'*'});
assert.equal(contacts.integrity,'sha512-buKkoQuWJgVSEvR1Yloa5SvGC/ud7T2YeYDe0R7Aa0oz8pwQpjk3W7OoL3QrXIfYcuKTrIz6ffqC8lc3peaAyg==');
console.log('Dependency lock checks passed: all root declarations match, registry tarballs have SHA-512 SRI, and Expo Contacts SDK54 is pinned.');
