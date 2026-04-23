import * as secureStorage from './secureStorage';
import api from './api';
import {getQueue, removeFromQueue} from './offline';

/**
 * Flush the offline queue to the server, then refresh route cache.
 * Returns { synced, failed, errors }
 */
export async function syncOfflineQueue() {
  const queue = await getQueue();
  if (queue.length === 0) {
    return {synced: 0, failed: 0, errors: []};
  }

  let synced = 0;
  let failed = 0;
  const errors = [];

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

  return {synced, failed, errors};
}

async function refreshRouteCache() {
  try {
    const userRaw = await secureStorage.getItem('auth_user');
    if (!userRaw) {
      return;
    }
    const user = JSON.parse(userRaw);
    const response = await api.get('/routes', {
      params: {driver: user._id, status: 'planned'},
    });
    await secureStorage.setItem('cached_routes', JSON.stringify(response.data));
  } catch {
    // Cache refresh is best-effort; don't throw
  }
}
