(() => {
  'use strict';
  const DEVICE_ID_KEY = 'abuBassamLockedDeviceIdV3';
  const DEVICE_NAME_KEY = 'abuBassamLockedDeviceNameV3';
  const DEVICE_CREATED_KEY = 'abuBassamLockedDeviceCreatedV3';
  const SECURE_DEVICE_ID_KEY = 'abu_bassam_device_id_v1';
  const APP_VERSION = String(window.__ABU_APP_META__?.version || '');
  function uuid(){const id=globalThis.crypto?.randomUUID?.();if(!id)throw new Error('SECURE_DEVICE_ID_RANDOM_REQUIRED');return id}
  function platform(){const agent=navigator.userAgent||'';if(/Android/i.test(agent))return'Android';if(/Windows/i.test(agent))return'Windows';if(/iPhone|iPad/i.test(agent))return'iOS';return'جهاز آخر'}
  function normalizeName(value){return String(value||'').trim()||'جهاز المكتبة'}
  function signalBootReady(){try{window.ReactNativeWebView?.postMessage(JSON.stringify({type:'webBootReady',at:Date.now()}))}catch(_){}}
  function dismissSplash(){const splash=document.getElementById('splash');if(!splash)return;splash.style.transition='none';splash.style.opacity='0';splash.style.visibility='hidden';splash.style.display='none';splash.setAttribute('aria-hidden','true')}
  function current(){const name=normalizeName(localStorage.getItem(DEVICE_NAME_KEY)||'جهاز المكتبة');return{id:localStorage.getItem(DEVICE_ID_KEY)||'',name,createdAt:localStorage.getItem(DEVICE_CREATED_KEY)||''}}
  function validIdentityId(value){return /^[A-Za-z0-9._:-]{8,180}$/.test(String(value||''))}
  function native(action,payload={}){const api=window.AbuBassamNativeSecurity;if(!api?.request)return Promise.reject(new Error('SECURE_DEVICE_ID_STORE_REQUIRED'));return api.request(action,payload)}
  function writeLocalIdentity(identity){localStorage.setItem(DEVICE_ID_KEY,identity.id);localStorage.setItem(DEVICE_NAME_KEY,identity.name);localStorage.setItem(DEVICE_CREATED_KEY,identity.createdAt);localStorage.removeItem('abuBassamDeviceNameV1');return identity}
  function ensureIdentity(){let identity=current();if(validIdentityId(identity.id))return identity;identity={id:uuid(),name:identity.name||'جهاز المكتبة',createdAt:identity.createdAt||new Date().toISOString()};return writeLocalIdentity(identity)}
  async function stabilizeIdentity(){
    let identity=current(),secureId=String(await native('secureGet',{key:SECURE_DEVICE_ID_KEY})||'').trim();
    if(secureId&&!validIdentityId(secureId))throw new Error('SECURE_DEVICE_ID_INVALID');
    if(secureId){
      if(identity.id!==secureId)identity=writeLocalIdentity({id:secureId,name:identity.name||'جهاز المكتبة',createdAt:identity.createdAt||new Date().toISOString()});
      return identity
    }
    identity=ensureIdentity();
    await native('secureSet',{key:SECURE_DEVICE_ID_KEY,value:identity.id});
    const verified=String(await native('secureGet',{key:SECURE_DEVICE_ID_KEY})||'').trim();
    if(verified!==identity.id)throw new Error('SECURE_DEVICE_ID_PERSIST_FAILED');
    return identity
  }
  async function heartbeat(){return stabilizeIdentity()}
  // Boot must fail closed; periodic identity checks are best-effort and must
  // never create unhandled Promise rejections during offline/background use.
  function heartbeatSafely(){
    if(document.visibilityState==='hidden')return;
    void heartbeat().catch(error=>console.warn('Abu Bassam background device check failed',error));
  }
  async function adoptIdentity(id){
    const value=String(id||'').trim();if(!validIdentityId(value))throw new Error('SECURE_DEVICE_ID_INVALID');
    await native('secureSet',{key:SECURE_DEVICE_ID_KEY,value});
    const verified=String(await native('secureGet',{key:SECURE_DEVICE_ID_KEY})||'').trim();
    if(verified!==value)throw new Error('SECURE_DEVICE_ID_PERSIST_FAILED');
    const old=current();return writeLocalIdentity({id:value,name:old.name||'جهاز المكتبة',createdAt:old.createdAt||new Date().toISOString()})
  }
  async function list(){const identity=await heartbeat(),registry=window.AbuBassamDeviceRegistry;if(window.AbuBassamSecurity?.role?.()==='owner'&&registry?.rows){try{return(await registry.rows()).map(row=>({id:row.device_id,name:row.device_name,...row}))}catch(_){}}const now=new Date().toISOString();return[{id:identity.id,name:identity.name,platform:platform(),locked:true,first_seen:identity.createdAt,last_seen:now,updated_at:now,app_version:APP_VERSION}]}
  function deviceName(){return normalizeName(current().name||'جهاز المكتبة')}
  function loadScript(id,src,guard){
    return new Promise((resolve,reject)=>{
      if(document.getElementById(id)||(guard&&window[guard])){resolve(true);return}
      const script=document.createElement('script');
      script.id=id;script.src=src;script.async=false;
      script.onload=()=>{document.dispatchEvent(new CustomEvent('abu-runtime-loaded',{detail:{id,src}}));resolve(true)};
      script.onerror=()=>reject(new Error(src+' failed to load'));
      (document.head||document.documentElement).appendChild(script)
    })
  }
  const loadFeatureRecovery=()=>loadScript('abuFeatureRecoveryRuntime','feature-recovery-runtime.js','__ABU_FEATURE_RECOVERY_V1__');
  const loadChildTemplates=()=>loadScript('abuChildTemplatesRuntime','child-card-templates-runtime.js','__ABU_CHILD_TEMPLATES_V1__');
  const loadCardModels=()=>loadScript('abuCardModelsRuntime','card-models-runtime.js','__ABU_CARD_MODELS_V1__');
  const loadStandaloneCardModels=()=>loadScript('abuStandaloneCardModelsRuntime','standalone-card-models-runtime.js','__ABU_STANDALONE_CARD_MODELS_V2__');
  const loadStrictWorkflow=()=>loadScript('abuStrictWorkflowRuntime','strict-workflow-runtime.js','__ABU_STRICT_WORKFLOW_V1__');
  const loadStandaloneFold=()=>loadScript('abuStandaloneFoldRuntime','standalone-fold-runtime.js','__ABU_STANDALONE_FOLD_V1__');
  const loadA4CardEditor=()=>loadScript('abuA4CardSheetEditorV2Runtime','a4-card-sheet-editor-v2-runtime.js','__ABU_A4_CARD_SHEET_EDITOR_V2__');
  const loadDeviceReconcile=()=>loadScript('abuDeviceReconcileRuntime','device-reconcile-runtime.js','__ABU_DEVICE_RECONCILE_V2__');
  const loadPermissionGuard=()=>loadScript('abuPermissionGuardRuntime','permission-guard-runtime.js','__ABU_PERMISSION_GUARD_V1__');
  const loadAdminPermissions=()=>loadScript('abuAdminPermissionsRuntime','admin-permissions-runtime.js','__ABU_ADMIN_PERMISSIONS_V1__');
  const loadPermissionSectionGuards=()=>loadScript('abuPermissionSectionGuardsRuntime','permission-section-guards-runtime.js','__ABU_PERMISSION_SECTION_GUARDS_V1__');
  const loadCustomerPermissionsHardening=()=>loadScript('abuCustomerPermissionsHardeningRuntime','customer-permissions-hardening-runtime.js','__ABU_CUSTOMER_PERMISSIONS_HARDENING_V1__');
  const loadLoginInputDirection=()=>loadScript('abuLoginInputDirectionRuntime','login-input-direction-runtime.js','__ABU_LOGIN_INPUT_DIRECTION_V1__');
  const loadPasswordPolicy=()=>loadScript('abuPasswordPolicyRuntime','password-policy-runtime.js','__ABU_PASSWORD_POLICY_V1__');
  const loadMediaPipePin=()=>loadScript('abuMediaPipePinRuntime','mediapipe-pin-runtime.js','__ABU_MEDIAPIPE_PIN_V2__');
  const loadSettingsCorrections=()=>loadScript('abuSettingsCorrectionsRuntime','settings-corrections-runtime.js','__ABU_SETTINGS_CORRECTIONS_V1__');
  const loadSecurityBootstrapGuard=()=>loadScript('abuSecurityBootstrapGuardRuntime','security-bootstrap-guard-runtime.js','__ABU_SECURITY_BOOTSTRAP_GUARD_V1__');
  const loadSecurityHardening=()=>loadScript('abuSecurityHardeningRuntime','security-hardening-runtime.js','__ABU_SECURITY_HARDENING_V2__');
  const loadNotificationCorrections=()=>loadScript('abuNotificationCenterCorrectionsRuntime','notification-center-corrections-runtime.js','__ABU_NOTIFICATION_CENTER_CORRECTIONS_V2__');
  const loadNotificationExcel=()=>loadScript('abuNotificationExcelRuntime','notification-excel-runtime.js','__ABU_NOTIFICATION_EXCEL_V1__');
  const loadBranchVault=()=>loadScript('abuBranchVaultRuntime','branch-vault-runtime.js','__ABU_BRANCH_VAULT_V1__');
  const loadDocumentVaultHardening=()=>loadScript('abuDocumentVaultHardeningRuntime','document-vault-hardening-runtime.js','__ABU_DOCUMENT_VAULT_HARDENING_V1__');
  const loadBackupCenter=()=>loadScript('abuBackupCenterRuntime','backup-center-runtime.js','__ABU_BACKUP_CENTER_V1__');
  const loadAppUpdate=()=>loadScript('abuAppUpdateRuntime','app-update-runtime.js','__ABU_APP_UPDATE_V1__');
  const loadAccountRecoveryHardening=()=>loadScript('abuAccountRecoveryHardeningRuntime','account-recovery-hardening-runtime.js','__ABU_ACCOUNT_RECOVERY_HARDENING_V1__');
  const loadAccountCenter=async()=>{await loadScript('abuAccountCenterRuntime','account-center-runtime.js','__ABU_ACCOUNT_CENTER_V1__');await loadAccountRecoveryHardening()};
  const loadPasswordRecovery=()=>loadScript('abuPasswordRecoveryRuntime','password-recovery-runtime.js','__ABU_PASSWORD_RECOVERY_V1__');
  const loadOperationLogStorageMigration=()=>loadScript('abuOperationLogStorageMigrationRuntime','operation-log-storage-migration-runtime.js','__ABU_OPERATION_LOG_STORAGE_MIGRATION_V1__');
  const loadOperationLogCorrections=async()=>{await loadScript('abuOperationLogCorrectionsRuntime','operation-log-corrections-runtime.js','__ABU_OPERATION_LOG_CORRECTIONS_V2__');await loadOperationLogStorageMigration()};
  const loadSecurityExtras=()=>loadScript('abuSecurityExtrasRuntime','security-extras-runtime.js','__ABU_SECURITY_EXTRAS_V1__');

  async function loadSecurity(){
    await loadSecurityBootstrapGuard();
    await loadScript('abuAppSecurityRuntime','app-security-runtime.js','__ABU_APP_SECURITY_V1__');
    await loadSecurityHardening();
    await loadSecurityExtras();
    await loadDeviceReconcile();
    await loadAdminPermissions();
    await loadPermissionGuard();
    await loadLoginInputDirection();
    await loadPasswordPolicy();
    await loadPermissionSectionGuards();
    await loadCustomerPermissionsHardening()
  }
  async function loadApprovedUi(){
    await loadMediaPipePin();
    await loadFeatureRecovery();
    await loadChildTemplates();
    await loadCardModels();
    await loadStandaloneCardModels();
    await loadStrictWorkflow();
    await loadStandaloneFold();
    await loadA4CardEditor();
    await loadNotificationCorrections();
    await loadNotificationExcel();
    await loadSecurity();
    await loadBranchVault();
    await loadDocumentVaultHardening();
    await loadBackupCenter();
    await loadAccountCenter();
    await loadPasswordRecovery();
    await loadAppUpdate();
    await loadSettingsCorrections();
    await loadOperationLogCorrections()
  }
  function showBootFailure(error){
    const splash=document.getElementById('splash');
    if(splash){
      splash.style.display='flex';splash.style.visibility='visible';splash.style.opacity='1';
      // The shipped splash contains only an image. Create an accessible error
      // message instead of leaving the user staring at an unchanged logo.
      let message=document.getElementById('splashText');
      if(!message){
        message=document.createElement('p');
        message.id='splashText';
        message.setAttribute('role','alert');
        Object.assign(message.style,{position:'absolute',zIndex:'2',left:'14px',right:'14px',bottom:'32px',padding:'14px',borderRadius:'12px',background:'#fffaf3',color:'#922d33',textAlign:'center',fontWeight:'700',fontSize:'14px'});
        splash.appendChild(message);
      }
      message.textContent='تعذر تحميل مكونات التطبيق بأمان. استخدم إعادة المحاولة لفتح التطبيق.';
    }
    // Alert natively as well: Android's loading layer covers the WebView until
    // webBootReady, so an error rendered only inside the WebView is invisible.
    try{window.ReactNativeWebView?.postMessage(JSON.stringify({type:'webBootFailed'}))}catch(_){}
    console.error('Abu Bassam runtime initialization failed',error)
  }
  async function startApprovedUi(){
    try{
      await stabilizeIdentity();
      await loadApprovedUi();
      const securityBoot=window.__ABU_SECURITY_BOOT_PROMISE__;
      if(!securityBoot||typeof securityBoot.then!=='function')throw new Error('APP_SECURITY_BOOT_PROMISE_REQUIRED');
      await securityBoot;
      if(!document.getElementById('abuSecurityGate'))throw new Error('APP_SECURITY_GATE_REQUIRED');
      window.__ABU_APPROVED_UI_READY__=true;
      document.dispatchEvent(new CustomEvent('abu-bassam-approved-ui-ready'));
      signalBootReady();
      dismissSplash();
      setTimeout(heartbeatSafely,200)
    }catch(error){showBootFailure(error)}
  }
  window.AbuBassamDevices={get:current,name:deviceName,ensure:ensureIdentity,stabilize:stabilizeIdentity,adopt:adoptIdentity,heartbeat,list,version:APP_VERSION};window.AbuBassamDeviceName=deviceName;
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',startApprovedUi,{once:true});else startApprovedUi();
  setInterval(heartbeatSafely,120000);
  window.addEventListener('online',heartbeatSafely);
  document.addEventListener('abu-bassam-auth-changed',()=>{
    heartbeatSafely();
    try{
      const recheck=window.AbuBassamSecurity?.onSessionChanged?.();
      if(recheck&&typeof recheck.catch==='function')void recheck.catch(error=>console.warn('Abu Bassam session device refresh failed',error));
    }catch(error){console.warn('Abu Bassam session device refresh failed',error)}
  });
})();
