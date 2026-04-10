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

function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function addToQueue(collection) {
  const queue = await getQueue();
  const _id = generateId();
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
