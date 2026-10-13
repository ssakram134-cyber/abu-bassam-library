const fs=require('fs');
function read(p){if(!fs.existsSync(p))throw new Error(`missing ${p}`);return fs.readFileSync(p,'utf8')}
const errors=[];
const need=(s,t,l)=>{if(!s.includes(t))errors.push(`${l}: missing ${t}`)};
const forbid=(s,t,l)=>{if(s.includes(t))errors.push(`${l}: forbidden ${t}`)};
const pin=read('web/mediapipe-pin-runtime.js');
const loader=read('web/device-name-runtime.js');
const index=read('web/index.html');
const assets=read('scripts/prepare-android-assets.mjs');
for(const t of ["VERSION='0.1.1675465747'","const BASE='vendor/mediapipe/'",'window.getSelfie=async function','locateFile:file=>BASE+file'])need(pin,t,'local MediaPipe runtime');
for(const t of ['mediapipe-pin-runtime.js','loadMediaPipePin','loadPasswordPolicy','await loadMediaPipePin();','await loadPasswordPolicy();','await loadSecurity();'])need(loader,t,'startup dependency loader');
for(const t of ['MEDIAPIPE_ASSETS','selfie_segmentation.js','selfie_segmentation.tflite','selfie_segmentation_solution_wasm_bin.wasm','selfie_segmentation_solution_simd_wasm_bin.wasm'])need(assets,t,'offline MediaPipe build assets');
need(index,'vendor/mediapipe/selfie_segmentation.js','offline main page background removal');
forbid(index,'abuBassamBgConsent','obsolete network-consent flow');
forbid(index,'cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation','remote background removal asset');
forbid(pin,'cdn.jsdelivr.net','remote pinned background removal asset');
for(const file of ['web/mediapipe-pin-runtime.js','web/device-name-runtime.js']){try{new Function(read(file))}catch(e){errors.push(`${file}: JavaScript syntax error: ${e.message}`)}}
if(errors.length){process.stderr.write(errors.join('\n')+'\n');process.exit(1)}
process.stdout.write('External dependency checks passed: bundled local MediaPipe background removal uses pinned version 0.1.1675465747.\n');
