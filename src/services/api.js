import axios from 'axios';
import {DeviceEventEmitter} from 'react-native';
import * as secureStorage from './secureStorage';

const api = axios.create({
  timeout: 15000,
});

// Inject baseURL and auth token on every request
api.interceptors.request.use(async config => {
  const serverUrl = await secureStorage.getItem('server_url');
  if (serverUrl) {
    // Only allow HTTPS URLs as the base
    try {
      const parsed = new URL(serverUrl);
      if (parsed.protocol === 'https:') {
        config.baseURL = serverUrl;
      }
    } catch {
      // Invalid URL stored — skip setting baseURL
    }
  }

  const token = await secureStorage.getItem('auth_token');
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
      await secureStorage.multiRemove(['auth_token', 'auth_user']);
      DeviceEventEmitter.emit('session_expired');
    }
    return Promise.reject(error);
  },
);

export default api;
