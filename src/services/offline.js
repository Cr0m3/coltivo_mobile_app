import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'offline_queue';

export async function getQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
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
