import EncryptedStorage from 'react-native-encrypted-storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Keys whose values are sensitive and must be stored encrypted
const SECURE_KEYS = new Set(['auth_token', 'auth_user', 'offline_queue', 'cached_routes']);

export function getItem(key) {
  return SECURE_KEYS.has(key)
    ? EncryptedStorage.getItem(key)
    : AsyncStorage.getItem(key);
}

export function setItem(key, value) {
  return SECURE_KEYS.has(key)
    ? EncryptedStorage.setItem(key, value)
    : AsyncStorage.setItem(key, value);
}

export function removeItem(key) {
  return SECURE_KEYS.has(key)
    ? EncryptedStorage.removeItem(key)
    : AsyncStorage.removeItem(key);
}

export async function multiRemove(keys) {
  await Promise.all(keys.map(removeItem));
}
