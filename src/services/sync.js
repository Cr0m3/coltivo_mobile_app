import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import {getQueue, removeFromQueue} from './offline';

let _syncing = false;

/**
 * Flush the offline queue to the server, then refresh route cache.
 * Returns { synced, failed, errors }
 * Guards against concurrent invocations to prevent duplicate submissions.
 */
export async function syncOfflineQueue() {
  if (_syncing) {
    return {synced: 0, failed: 0, errors: []};
  }
  _syncing = true;

  const queue = await getQueue();
  if (queue.length === 0) {
    _syncing = false;
    return {synced: 0, failed: 0, errors: []};
  }

  let synced = 0;
  let failed = 0;
  const errors = [];

  try {
    for (const item of queue) {
      try {
        const {_id, _timestamp, ...payload} = item;
        await api.post('/collections/add', payload);
        await removeFromQueue(_id ?? _timestamp);
        synced++;
      } catch (err) {
        failed++;
        errors.push(err?.message || 'Unknown error');
      }
    }

    // Refresh route cache only if something was actually synced
    if (synced > 0) {
      await refreshRouteCache();
    }
  } finally {
    _syncing = false;
  }

  return {synced, failed, errors};
}

async function refreshRouteCache() {
  try {
    const userRaw = await AsyncStorage.getItem('auth_user');
    if (!userRaw) {
      return;
    }
    const user = JSON.parse(userRaw);
    const response = await api.get('/routes', {
      params: {driver: user._id, status: 'planned'},
    });
    await AsyncStorage.setItem('cached_routes', JSON.stringify(response.data));
  } catch {
    // Cache refresh is best-effort; don't throw
  }
}
