export const SNAPSHOT_KEY = 'band_editor_snapshots_v1';
const MAX_SNAPSHOTS = 10;

function getStorage(storage) {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data || {}));
}

function readSnapshots(storage) {
  const store = getStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(SNAPSHOT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeSnapshots(items, storage) {
  const store = getStorage(storage);
  if (!store) return;
  store.setItem(SNAPSHOT_KEY, JSON.stringify(items));
}

function createId(nowValue) {
  return `snap_${nowValue}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listSnapshots(storage) {
  return readSnapshots(storage).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

export function createSnapshot(data, options = {}) {
  const storage = options.storage;
  const now = options.now || Date.now;
  const createdAt = now();
  const snapshot = {
    id: createId(createdAt),
    created_at: createdAt,
    source: options.source || 'manual',
    label: options.label || '',
    data: cloneData(data),
  };

  const next = [snapshot, ...listSnapshots(storage)]
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .slice(0, MAX_SNAPSHOTS);
  writeSnapshots(next, storage);
  return cloneData(snapshot);
}

export function deleteSnapshot(id, storage) {
  const current = listSnapshots(storage);
  const next = current.filter(item => item.id !== id);
  if (next.length === current.length) return false;
  writeSnapshots(next, storage);
  return true;
}

export function exportSnapshotPayload(snapshot) {
  return {
    snapshot: {
      id: snapshot.id,
      created_at: snapshot.created_at,
      source: snapshot.source,
      label: snapshot.label,
    },
    data: cloneData(snapshot.data),
  };
}
