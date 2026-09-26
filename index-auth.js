import { Linking } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const AUTH_CALLBACK_KEY = 'abu_bassam_auth_callback_v1';
const AUTH_CALLBACK_PREFIX = 'abu-bassam-library://auth/callback';
let lastCallback = '';

async function captureAuthCallback(url) {
  const value = String(url || '').trim();
  if (!value || !value.startsWith(AUTH_CALLBACK_PREFIX) || value === lastCallback) return;
  lastCallback = value;
  try { await SecureStore.setItemAsync(AUTH_CALLBACK_KEY, value); } catch (_) {}
}

Linking.getInitialURL().then(captureAuthCallback).catch(() => {});
Linking.addEventListener('url', (event) => captureAuthCallback(event?.url));

require('./index.js');
