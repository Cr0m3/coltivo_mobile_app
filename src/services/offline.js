import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'offline_queue';
const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    const cutoff = Date.now() - MAX_QUEUE_AGE_MS;
    // Evict items older than 7 days so stale GPS/collection data doesn't persist
    const fresh = parsed.filter(item => (item._timestamp ?? 0) >= cutoff);
    if (fresh.length !== parsed.length) {
      // Persist pruned list back to storage
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(fresh));
    }
    return fresh;
  } catch {
    return [];
  }
}

export async function addToQueue(collection) {
  const queue = await getQueue();
  const _id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  queue.push({...collection, _id, _timestamp: Date.now()});
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return queue.length;
}

export async function removeFromQueue(id) {
  const queue = await getQueue();
  // Support both new _id field and legacy _timestamp-based items
  const updated = queue.filter(item => (item._id ?? item._timestamp) !== id);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
  return updated;
}

export async function clearQueue() {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
