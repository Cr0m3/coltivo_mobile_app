import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {DeviceEventEmitter} from 'react-native';

const api = axios.create({
  timeout: 15000,
});

// Decode JWT payload and return expiry unix timestamp, or null if unavailable.
function getTokenExpiry(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

// Inject baseURL and auth token on every request
api.interceptors.request.use(async config => {
  const serverUrl = await AsyncStorage.getItem('server_url');
  if (serverUrl) {
    // Only allow HTTPS URLs with a non-empty hostname as the base
    try {
      const parsed = new URL(serverUrl);
      if (parsed.protocol === 'https:' && parsed.hostname.length > 0) {
        config.baseURL = serverUrl;
      }
    } catch {
      // Invalid URL stored — skip setting baseURL
    }
  }

  const token = await AsyncStorage.getItem('auth_token');
  if (token) {
    const exp = getTokenExpiry(token);
    if (exp !== null && exp * 1000 < Date.now()) {
      await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
      DeviceEventEmitter.emit('session_expired');
      return Promise.reject(new Error('auth_token_expired'));
    }
    config.headers['x-auth-token'] = token;
  }

  return config;
});

// On 401, clear token (caller handles navigation to Login)
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
      DeviceEventEmitter.emit('session_expired');
    }
    return Promise.reject(error);
  },
);

export default api;
