(() => {
  'use strict';
  const DEVICE_ID_KEY = 'abuBassamLockedDeviceIdV3';
  const DEVICE_NAME_KEY = 'abuBassamLockedDeviceNameV3';
  const DEVICE_CREATED_KEY = 'abuBassamLockedDeviceCreatedV3';
  const APP_VERSION = '4.3.2';
  function uuid(){return globalThis.crypto?.randomUUID?.()||`device-${Date.now()}-${Math.random().toString(36).slice(2)}`}
  function platform(){const agent=navigator.userAgent||'';if(/Android/i.test(agent))return'Android';if(/Windows/i.test(agent))return'Windows';if(/iPhone|iPad/i.test(agent))return'iOS';return'جهاز آخر'}
  function normalizeName(value){return String(value||'').trim()||'جهاز المكتبة'}
  function signalBootReady(){try{window.ReactNativeWebView?.postMessage(JSON.stringify({type:'webBootReady',at:Date.now()}))}catch(_){}}
  function dismissSplash(){const splash=document.getElementById('splash');if(!splash)return;splash.style.transition='none';splash.style.opacity='0';splash.style.visibility='hidden';splash.style.display='none';splash.setAttribute('aria-hidden','true')}
  function current(){const name=normalizeName(localStorage.getItem(DEVICE_NAME_KEY)||'جهاز المكتبة');return{id:localStorage.getItem(DEVICE_ID_KEY)||'',name,createdAt:localStorage.getItem(DEVICE_CREATED_KEY)||''}}
  function ensureIdentity(){let identity=current();if(identity.id)return identity;identity={id:uuid(),name:'جهاز المكتبة',createdAt:new Date().toISOString()};localStorage.setItem(DEVICE_ID_KEY,identity.id);localStorage.setItem(DEVICE_NAME_KEY,identity.name);localStorage.setItem(DEVICE_CREATED_KEY,identity.createdAt);localStorage.removeItem('abuBassamDeviceNameV1');return identity}
  async function heartbeat(){return ensureIdentity()}
  async function list(){const identity=await heartbeat(),registry=window.AbuBassamDeviceRegistry;if(window.AbuBassamSecurity?.role?.()==='owner'&&registry?.rows){try{return(await registry.rows()).map(row=>({id:row.device_id,name:row.device_name,...row}))}catch(_){}}const now=new Date().toISOString();return[{id:identity.id,name:identity.name,platform:platform(),locked:true,first_seen:identity.createdAt,last_seen:now,updated_at:now,app_version:APP_VERSION}]}
  function deviceName(){return normalizeName(current().name||'جهاز المكتبة')}
  function loadScript(id,src,guard){
    if(guard&&window[guard])return Promise.resolve(true);
    let script=document.getElementById(id);
    if(script?.dataset?.abuLoadState==='loaded')return Promise.resolve(true);
    if(script?.dataset?.abuLoadState==='failed'){script.remove();script=null}
    return new Promise((resolve,reject)=>{
      const fresh=!script;
      if(fresh){script=document.createElement('script');script.id=id;script.async=false}
      let done=false;
      const finish=error=>{
        if(done)return;done=true;clearTimeout(timeout);
        script.removeEventListener('load',onLoad);script.removeEventListener('error',onError);
        if(error){script.dataset.abuLoadState='failed';script.remove();reject(error);return}
        script.dataset.abuLoadState='loaded';
        document.dispatchEvent(new CustomEvent('abu-runtime-loaded',{detail:{id,src}}));resolve(true)
      };
      const onLoad=()=>finish(null),onError=()=>finish(new Error(src+' failed to load'));
      const timeout=setTimeout(()=>finish(new Error(src+' load timed out')),15000);
      script.addEventListener('load',onLoad);script.addEventListener('error',onError);
      if(fresh){script.dataset.abuLoadState='loading';script.src=src;(document.head||document.documentElement).appendChild(script)}
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
  const loadMediaPipePin=()=>loadScript('abuMediaPipePinRuntime','mediapipe-pin-runtime.js','__ABU_MEDIAPIPE_PIN_V1__');
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
      let message=document.getElementById('splashText');
      if(!message){
        message=document.createElement('p');message.id='splashText';
        message.style.cssText='position:absolute;z-index:2;bottom:12%;left:6%;right:6%;padding:14px;border-radius:12px;background:#fffdf4;color:#8f2735;text-align:center;font-size:13px;font-weight:bold';
        splash.appendChild(message)
      }
      message.textContent='تعذر إكمال التهيئة الآمنة. أعد المحاولة، وإذا تكرر الخطأ راجع سجل التشغيل.'
    }
    try{window.ReactNativeWebView?.postMessage(JSON.stringify({type:'webBootFailed',reason:String(error?.message||error||'UNKNOWN').slice(0,160)}))}catch(_){}
    console.error('Abu Bassam runtime initialization failed',error)
  }
  async function startApprovedUi(){
    try{
      ensureIdentity();
      // The security gate is required before exposing the main view.
      await loadSecurity();
      if(!window.AbuBassamSecurity?.login||!window.__ABU_SECURITY_HARDENING_V2__)throw new Error('SECURITY_GATE_NOT_READY');
      signalBootReady();dismissSplash();setTimeout(heartbeat,200);
      void loadApprovedUi().catch(error=>{
        console.error('Non-critical feature initialization failed',error);
        document.dispatchEvent(new CustomEvent('abu-runtime-error',{detail:{message:String(error?.message||error)}}))
      })
    }catch(error){showBootFailure(error)}
  }
  window.AbuBassamDevices={get:current,name:deviceName,ensure:ensureIdentity,heartbeat,list,version:APP_VERSION};window.AbuBassamDeviceName=deviceName;
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',startApprovedUi,{once:true});else startApprovedUi();
  setInterval(()=>{if(document.visibilityState!=='hidden')heartbeat()},120000);
  window.addEventListener('online',heartbeat);document.addEventListener('abu-bassam-auth-changed',()=>{heartbeat();window.AbuBassamSecurity?.onSessionChanged?.()});
})();
