const fs=require('fs'),vm=require('vm');
const read=p=>{if(!fs.existsSync(p))throw new Error('missing '+p);return fs.readFileSync(p,'utf8')};
const need=(s,t,l)=>{if(!s.includes(t))throw new Error(`admin permissions check failed: ${l}`)};
const forbid=(s,t,l)=>{if(s.includes(t))throw new Error(`admin permissions check failed: ${l}`)};
const runtime=read('web/admin-permissions-runtime.js');
const devices=read('web/device-reconcile-runtime.js');
const guards=read('web/permission-section-guards-runtime.js');
const loader=read('web/device-name-runtime.js');
const migration=read('supabase/migrations/202609250001_advanced_admin_permissions.sql');
const capacity=read('supabase/migrations/202609250003_advanced_permissions_capacity.sql');
const helper=read('supabase/migrations/202609250002_customer_permission_helper.sql');
const edge=read('supabase/functions/customer-documents/index.ts');
forbid(devices,'function signature(row)','device list must not collapse distinct registered devices by matching metadata');
need(devices,'const current=CURRENT_ID(),byId=new Map();','device list must deduplicate only exact device ids');
new vm.Script(runtime,{filename:'admin-permissions-runtime.js'});
need(guards,'function setGuardDisabled(el,denied)','permission UI guards must preserve existing disabled state');
need(guards,'const customerPhoneHtml=new WeakMap();','customer phone masking must be reversible without storing clear text in DOM attributes');
need(guards,"[['imageInput','edit'],['paperSize','settingsPrinting'],['photoSize','settingsPrinting']]","photo import must follow edit permission, not export permission");
forbid(guards,"[['imageInput','imageExport']",'photo import must not depend on export permission');
new vm.Script(guards,{filename:'permission-section-guards-runtime.js'});
new vm.Script(loader,{filename:'device-name-runtime.js'});
const items=[...runtime.matchAll(/\['([A-Za-z][A-Za-z0-9]+)','[^'\n]*',(true|false)\]/g)].map(m=>m[1]);
const unique=[...new Set(items)];
if(unique.length!==items.length)throw new Error('admin permissions check failed: duplicate detailed permission keys');
if(!items.length)throw new Error('admin permissions check failed: detailed permission catalog is empty');
const legacyKeys=['edit','print','export','appearance','sync','security','devices','reset'];
const allowedBlock=(migration.match(/_abu_bassam_permission_key_allowed[\s\S]*?any\(array\[([\s\S]*?)\]::text\[\]\)/)||[])[1]||'';
const serverAllowed=[...allowedBlock.matchAll(/'([A-Za-z][A-Za-z0-9]+)'/g)].map(m=>m[1]);
if(!serverAllowed.length)throw new Error('admin permissions check failed: server permission catalog could not be parsed');
const detailedServer=serverAllowed.filter(key=>!legacyKeys.includes(key));
const missingOnServer=unique.filter(key=>!detailedServer.includes(key));
const missingInUi=detailedServer.filter(key=>!unique.includes(key));
if(missingOnServer.length||missingInUi.length)throw new Error('admin permissions check failed: UI/server catalog mismatch; missingOnServer='+missingOnServer.join(',')+' missingInUi='+missingInUi.join(','));
for(const key of legacyKeys)if(!serverAllowed.includes(key))throw new Error('admin permissions check failed: legacy compatibility missing '+key);
for(const marker of [
  '__ABU_ADMIN_PERMISSIONS_V1__','صلاحيات متقدمة','السماح للكل','منع الكل','قراءة فقط','موظف طباعة','موظف مستمسكات','موظف تصميم','مخصص / الحالي',
  'vaultView','customerDocumentsView','cardsEdit','questionsEdit','compressSave','printGeneral','pdfSave','syncAutomatic','logsViewOwn','notificationsView','securityView','settingsView','adminViewAllBranches',
  'ADMIN_ONLY','saveDevicePermissions','abu_bassam_manage_device','AbuBassamPermissions','guardCustomerApi','guardQuestionDocument','guardCompressorDocument','guardMessage','SECURE_STORAGE_REQUIRED',"native('secureGet',{key:SECRET_KEY})"
])need(runtime,marker,marker);
forbid(runtime,'__dev_secure_','admin device secret must never fall back to localStorage');
for(const marker of ['PERMISSION_KEY_NOT_ALLOWED','PERMISSION_VALUE_INVALID','ADMIN_ONLY_PERMISSION','OWNER_PERMISSIONS_IMMUTABLE','_abu_bassam_permission_key_allowed','_abu_bassam_permission_admin_only'])need(migration,marker,'server validation '+marker);
need(capacity,'select count(*) into v_permission_count from jsonb_object_keys(p_permissions);','portable permission-key count');
forbid(capacity,'jsonb_object_length(','unsupported PostgreSQL jsonb_object_length must not return');
need(capacity,"if v_permission_count>260 then raise exception 'PERMISSIONS_TOO_LARGE'; end if;",'bounded permission payload capacity');
for(const marker of ['_abu_bassam_device_permission','secret_hash','p_permission'])need(helper,marker,'server permission helper '+marker);
for(const marker of ['admin-permissions-runtime.js','permission-section-guards-runtime.js','loadAdminPermissions()','loadPermissionSectionGuards()'])need(loader,marker,'startup loader '+marker);
for(const marker of ['customerDocumentsAdd','customerDocumentsEdit','customerDocumentsView','customerOriginalDocumentView','customerDocumentsDelete','sha256Hex','secret_hash'])need(edge,marker,'customer edge permission '+marker);
for(const marker of ['__ABU_PERMISSION_SECTION_GUARDS_V1__','logsViewOwn','notificationsView','securityBiometric','securityAutoLock','securityPrivacyMode','syncAutomatic','printGeneral','pdfSave','imageExport','cardsPrint','customerPhoneView','questionsView','compressUse'])need(guards,marker,'section guard '+marker);
for(const marker of [
  "wrap(s,'theme','settingsThemes')",
  "wrap(s,'archiveAutoSync','syncAutomatic')",
  "wrap(s,'backup','backupCreate')",
  "wrap(s,'sync','syncManual')",
  "wrap(s,'cloudLogin','cloudSettings')",
  "wrap(s,'saveWhatsApp','settingsWhatsApp')",
  "wrap(s,'shareWhatsApp','whatsappBackup')",
  "wrap(s,'printSettings','settingsPrinting')",
  "wrap(s,'systemSettings','settingsPermissions')",
  "wrap(s,'cleanCache','settingsStorage')"
])need(guards,marker,'direct settings permission '+marker);
need(guards,"const can=k=>!secondary()||window.AbuBassamPermissions?.can?.(k)===true;",'secondary section permissions must fail closed before permission runtime is ready');
need(guards,"wrap(window,'applyTheme','settingsThemes')",'global theme changes must require settingsThemes');
need(runtime,"[/ثيم|مظهر/,['settingsThemes']]",'central settings theme controls must use settingsThemes');
need(runtime,"[/خط/,['settingsFonts','settingsCardFonts']]",'central settings font controls must allow app or badge font permission');
need(runtime,"!keys.some(can)",'central settings UI rules must allow any accepted permission key');
const adminBlock=(runtime.match(/const ADMIN_ONLY=new Set\(\[([\s\S]*?)\]\);/)||[])[1]||'';
const adminKeys=[...adminBlock.matchAll(/'([A-Za-z][A-Za-z0-9]+)'/g)].map(m=>m[1]);
if(!adminKeys.length||new Set(adminKeys).size!==adminKeys.length)throw new Error('admin permissions check failed: invalid or duplicate UI admin-only keys');
const serverAdminBlock=(migration.match(/_abu_bassam_permission_admin_only[\s\S]*?any\(array\[([\s\S]*?)\]::text\[\]\)/)||[])[1]||'';
const serverAdminKeys=[...serverAdminBlock.matchAll(/'([A-Za-z][A-Za-z0-9]+)'/g)].map(m=>m[1]);
const adminMissingOnServer=adminKeys.filter(key=>!serverAdminKeys.includes(key));
const adminMissingInUi=serverAdminKeys.filter(key=>!adminKeys.includes(key));
if(adminMissingOnServer.length||adminMissingInUi.length)throw new Error('admin permissions check failed: admin-only UI/server mismatch; missingOnServer='+adminMissingOnServer.join(',')+' missingInUi='+adminMissingInUi.join(','));
async function testOwnerSessionFence(){
  const start=runtime.indexOf('async function saveDevicePermissions(');
  const end=runtime.indexOf('function style(){',start);
  if(start<0||end<=start)throw new Error('owner permission save missing');
  const factory=vm.runInNewContext('(deps)=>{'
    +'const {role,window,ownerSecret,normalize}=deps;'
    +runtime.slice(start,end)+';return saveDevicePermissions}');
  async function runCase(change){
    let owner=true,gateOpen=true,connected=true,revealSecret=null,rpcCalls=0;
    const app=factory({
      role:()=>owner?'owner':'secondary',
      window:{
        AbuBassamDevices:{ensure:()=>({id:'owner-phone'})},
        AbuBassamSecurity:{isOnlineUnlocked:()=>gateOpen},
        AbuBassamCloud:{
          client:{rpc:async()=>{rpcCalls++;return {data:{ok:true},error:null}}},
          isConnected:()=>connected
        }
      },
      ownerSecret:()=>new Promise(resolve=>{revealSecret=resolve}),
      normalize:value=>value
    });
    const pending=app('secondary-phone',{vaultView:true});
    for(let i=0;i<8&&!revealSecret;i++)await Promise.resolve();
    if(!revealSecret)throw Error('secure owner credential read did not start');
    if(change==='role')owner=false;
    if(change==='lock')gateOpen=false;
    if(change==='offline')connected=false;
    revealSecret('secret');
    let success=false,code='';
    try{await pending;success=true}catch(error){code=error.message}
    if(change){
      if(success||code!=='OWNER_SESSION_CHANGED'||rpcCalls)
        throw Error('owner privilege mutation survived '+change)
    }else if(!success||rpcCalls!==1){
      throw Error('legitimate owner permission save blocked')
    }
  }
  await runCase('role');
  await runCase('lock');
  await runCase('offline');
  await runCase('');
  need(runtime,"if(role()!=='owner'||window.AbuBassamSecurity?.isOnlineUnlocked?.()!==true)return;",
    'asynchronous owner editor must close after lost authorization');
}


async function testDeviceRegistrySessionFence(){
  const start=devices.indexOf('function ownerScope(){');
  const end=devices.indexOf('function rowHtml(',start);
  if(start<0||end<=start)throw Error('device registry owner scope helpers missing');
  const build=vm.runInNewContext('(opts)=>{'
    +'let ownerAuthEpoch=0,stored=5,gate=true,uid="owner",waitingSecret=null,waitingRpc=null,rpcCalls=0,cacheWrites=0;'
    +'const LIMIT_KEY="deviceLimit",CURRENT_ID=()=>"owner-phone",'
    +'owner=()=>gate,connected=()=>true,'
    +'window={AbuBassamCloud:{session:()=>({user:{id:uid}})}},'
    +'localStorage={getItem:()=>String(stored),setItem:(k,v)=>{stored=Number(v);cacheWrites++}},'
    +'secret=()=>opts.waitSecret?new Promise(resolve=>{waitingSecret=resolve}):Promise.resolve("secret"),'
    +'client=()=>({rpc:async(name,args)=>{rpcCalls++;'
    +'if(opts.waitRpc)return new Promise(resolve=>{waitingRpc=resolve});'
    +'if(opts.assertArgs)opts.assertArgs(name,args);'
    +'return {data:name==="abu_bassam_get_device_limit"?12:[{device_id:"other-phone"}],error:null}}}),'
    +'dedupe=rows=>rows;'
    +'function invalidateOwnerSession(){ownerAuthEpoch++}'
    +devices.slice(start,end)
    +';return{rows,readLimit,ownerArgs,invalidateOwnerSession,lock:()=>{gate=false},'
    +'unlock:()=>{gate=true},get:()=>({waitingSecret,waitingRpc,rpcCalls,stored,cacheWrites})}}');
  let app=build({waitSecret:true}),running=app.rows();
  for(let i=0;i<10&&!app.get().waitingSecret;i++)await Promise.resolve();
  if(!app.get().waitingSecret)throw Error('owner secret read never started');
  app.lock();app.invalidateOwnerSession();app.unlock();
  app.get().waitingSecret('valid-secret');
  let denied=false;
  try{await running}catch(error){denied=error.message==='OWNER_SESSION_CHANGED'}
  if(!denied||app.get().rpcCalls)throw Error('old owner secret authorized after relock');
  app=build({waitRpc:true});
  running=app.rows();
  for(let i=0;i<10&&!app.get().waitingRpc;i++)await Promise.resolve();
  if(!app.get().waitingRpc)throw Error('device list RPC not started');
  app.lock();app.invalidateOwnerSession();app.unlock();
  app.get().waitingRpc({data:[{device_id:'old-user'}],error:null});
  denied=false;
  try{await running}catch(error){denied=error.message==='OWNER_SESSION_CHANGED'}
  if(!denied)throw Error('old owner device list returned after relock');
  app=build({waitRpc:true});
  running=app.readLimit();
  for(let i=0;i<10&&!app.get().waitingRpc;i++)await Promise.resolve();
  if(!app.get().waitingRpc)throw Error('capacity RPC not started');
  app.lock();app.invalidateOwnerSession();app.unlock();
  app.get().waitingRpc({data:50,error:null});
  if(await running!==5||app.get().cacheWrites||app.get().stored!==5)
    throw Error('stale account limit modified local configuration');
  app=build({assertArgs:(name,args)=>{
    if(name==='abu_bassam_owner_devices'&&
      (!args||args.p_actor_device_id!=='owner-phone'||'scope' in args))
      throw Error('owner scope marker leaked to Supabase RPC arguments')
  }});
  const rows=await app.rows(),limit=await app.readLimit();
  if(rows[0]?.device_id!=='other-phone'||limit!==12)
    throw Error('current owner cannot read device registry and allowed capacity');

  const rowStart=devices.indexOf('function rowHtml(row){');
  const rowEnd=devices.indexOf('function syncSecurityCardLabel(){',rowStart);
  const actionStart=devices.indexOf('function onDeviceActionClick(event){');
  const actionEnd=devices.indexOf('function init(){',actionStart);
  if([rowStart,rowEnd,actionStart,actionEnd].some(x=>x<0))
    throw Error('safe device button renderer or delegated actions missing');
  const escapeValue=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const render=vm.runInNewContext('(esc,displayName,CURRENT_ID)=>{'
    +devices.slice(rowStart,rowEnd)+';return rowHtml}')(
      escapeValue,row=>row.device_name,()=> 'owner-phone');
  const dangerousName="O'Reilly');alert(1)//";
  const html=render({device_id:'branch-phone',device_name:dangerousName,
    role:'secondary',active:true});
  if(html.includes('onclick=')||!html.includes('data-abu-device-name="O&#39;Reilly'))
    throw Error('unsafe dynamic JavaScript in device buttons');
  let chosen=null;
  const button={dataset:{abuDeviceId:'branch-phone',abuDeviceAction:'rename',
    abuDeviceName:dangerousName}};
  const onClick=vm.runInNewContext('($,owner,window)=>{'
    +devices.slice(actionStart,actionEnd)+';return onDeviceActionClick}')(
      ()=>({contains:target=>target===button}),()=>true,
      {AbuBassamSecurity:{renameDevice:(id,name)=>{chosen=[id,name]}}});
  onClick({target:{closest:()=>button},preventDefault(){}});
  if(chosen?.[0]!=='branch-phone'||chosen[1]!==dangerousName)
    throw Error('delegated rename lost punctuation or correct target');
}

Promise.all([testOwnerSessionFence(),testDeviceRegistrySessionFence()]).then(()=>console.log(`advanced admin permissions checks passed: ${items.length} detailed permissions synchronized exactly with the server catalog + ${legacyKeys.length} legacy compatibility flags, ${adminKeys.length} synchronized admin-only protections, native SecureStore-only owner secrets, presets, server validation, customer document edge enforcement, and cross-section runtime guards`)).catch(error=>{console.error('owner session fence: '+error.message);process.exitCode=1});
