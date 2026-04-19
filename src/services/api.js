import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {DeviceEventEmitter} from 'react-native';

const api = axios.create({
  timeout: 15000,
});

const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$)/;

function isSafeServerUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !PRIVATE_HOST_RE.test(parsed.hostname);
  } catch {
    return false;
  }
}

// Inject baseURL and auth token on every request
api.interceptors.request.use(async config => {
  const serverUrl = await AsyncStorage.getItem('server_url');
  if (serverUrl && isSafeServerUrl(serverUrl)) {
    config.baseURL = serverUrl;
  }

  const token = await AsyncStorage.getItem('auth_token');
  if (token) {
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
