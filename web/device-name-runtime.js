(() => {
  'use strict';
  const DEVICE_ID_KEY = 'abuBassamLockedDeviceIdV3';
  const DEVICE_NAME_KEY = 'abuBassamLockedDeviceNameV3';
  const DEVICE_CREATED_KEY = 'abuBassamLockedDeviceCreatedV3';
  const APP_VERSION = '4.3.2';

  function uuid() {
    return globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function platform() {
    const agent = navigator.userAgent || '';
    if (/Android/i.test(agent)) return 'Android';
    if (/Windows/i.test(agent)) return 'Windows';
    if (/iPhone|iPad/i.test(agent)) return 'iOS';
    return 'جهاز آخر';
  }

  function normalizeName(value) {
    return String(value || '').trim() || 'جهاز المكتبة';
  }

  function current() {
    const name = normalizeName(localStorage.getItem(DEVICE_NAME_KEY) || 'جهاز المكتبة');
    return {
      id: localStorage.getItem(DEVICE_ID_KEY) || '',
      name,
      createdAt: localStorage.getItem(DEVICE_CREATED_KEY) || '',
    };
  }

  function ensureIdentity() {
    let identity = current();
    if (identity.id) return identity;
    identity = { id: uuid(), name: 'جهاز المكتبة', createdAt: new Date().toISOString() };
    localStorage.setItem(DEVICE_ID_KEY, identity.id);
    localStorage.setItem(DEVICE_NAME_KEY, identity.name);
    localStorage.setItem(DEVICE_CREATED_KEY, identity.createdAt);
    localStorage.removeItem('abuBassamDeviceNameV1');
    return identity;
  }

  async function heartbeat() {
    const identity = ensureIdentity();
    const cloud = window.AbuBassamCloud;
    if (!navigator.onLine || !cloud?.isConnected()) return identity;
    const now = new Date().toISOString();
    const data = {
      id: identity.id,
      name: identity.name,
      platform: platform(),
      locked: true,
      first_seen: identity.createdAt || now,
      last_seen: now,
      app_version: APP_VERSION,
    };
    try { await cloud.upsert('device', identity.id, data); } catch (_) {}
    return identity;
  }

  async function list() {
    const identity = await heartbeat();
    const map = new Map();
    const cloud = window.AbuBassamCloud;
    if (navigator.onLine && cloud?.isConnected()) {
      try {
        if (window.AbuBassamSecurity?.device && cloud.client) {
          const result = await cloud.client.from('abu_bassam_devices').select('device_id,device_name,model,platform,role,active,first_seen,last_seen,app_version').order('first_seen', { ascending: true });
          if (!result.error) result.data?.forEach((row) => map.set(row.device_id, { id: row.device_id, name: row.device_name, ...row }));
        }
        if (!map.size) {
          const rows = await cloud.list('device', 100);
          rows.forEach((row) => {
            const data = row?.data || {};
            const id = String(data.id || row.client_id || '');
            if (id) map.set(id, { ...data, id, updated_at: row.updated_at });
          });
        }
      } catch (_) {}
    }
    if (!map.has(identity.id)) {
      const now = new Date().toISOString();
      map.set(identity.id, {
        id: identity.id,
        name: identity.name,
        platform: platform(),
        locked: true,
        first_seen: identity.createdAt,
        last_seen: now,
        updated_at: now,
        app_version: APP_VERSION,
      });
    }
    return [...map.values()].sort((left, right) => Date.parse(left.first_seen || left.updated_at || 0) - Date.parse(right.first_seen || right.updated_at || 0));
  }

  function deviceName() {
    return normalizeName(current().name || 'جهاز المكتبة');
  }

  function loadScript(id, src, guard, onload) {
    if (document.getElementById(id) || (guard && window[guard])) { if (onload) onload(); return; }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    if (onload) script.onload = onload;
    (document.head || document.documentElement).appendChild(script);
  }

  function loadFeatureRecovery() { loadScript('abuFeatureRecoveryRuntime', 'feature-recovery-runtime.js', '__ABU_FEATURE_RECOVERY_V1__'); }
  function loadPermissionGuard() { loadScript('abuPermissionGuardRuntime', 'permission-guard-runtime.js', '__ABU_PERMISSION_GUARD_V1__'); }
  function loadSecurityExtras() { loadScript('abuSecurityExtrasRuntime', 'security-extras-runtime.js', '__ABU_SECURITY_EXTRAS_V1__', () => setTimeout(loadPermissionGuard, 20)); }
  function loadSecurity() { loadScript('abuAppSecurityRuntime', 'app-security-runtime.js', '__ABU_APP_SECURITY_V1__', () => setTimeout(loadSecurityExtras, 20)); }

  window.AbuBassamDevices = { get: current, name: deviceName, ensure: ensureIdentity, heartbeat, list, version: APP_VERSION };
  window.AbuBassamDeviceName = deviceName;
  window.addEventListener('DOMContentLoaded', () => {
    ensureIdentity();
    loadFeatureRecovery();
    loadSecurity();
    setTimeout(heartbeat, 800);
    setInterval(() => { if (document.visibilityState !== 'hidden') heartbeat(); }, 120000);
  });
  if (document.readyState !== 'loading') { loadFeatureRecovery(); loadSecurity(); }
  window.addEventListener('online', heartbeat);
  document.addEventListener('abu-bassam-auth-changed', () => { heartbeat(); window.AbuBassamSecurity?.onSessionChanged?.(); });
})();
