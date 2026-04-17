import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {DeviceEventEmitter} from 'react-native';

const api = axios.create({
  timeout: 15000,
});

// Inject baseURL and auth token on every request
api.interceptors.request.use(async config => {
  const serverUrl = await AsyncStorage.getItem('server_url');
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

  const token = await AsyncStorage.getItem('auth_token');
  if (token) {
    config.headers['x-auth-token'] = token;
  }

  return config;
});

// On 401/403, clear token (caller handles navigation to Login)
api.interceptors.response.use(
  response => response,
  async error => {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
      DeviceEventEmitter.emit('session_expired');
    }
    return Promise.reject(error);
  },
);

export default api;
