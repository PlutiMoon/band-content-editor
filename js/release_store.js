export const RELEASE_RECORDS_KEY = 'band_editor_release_records_v1';
const MAX_RELEASE_RECORDS = 20;

function getStorage(storage) {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data || {}));
}

function readRecords(storage) {
  const store = getStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(RELEASE_RECORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeRecords(items, storage) {
  const store = getStorage(storage);
  if (!store) return;
  store.setItem(RELEASE_RECORDS_KEY, JSON.stringify(items));
}

function createId(nowValue) {
  return `rel_${nowValue}_${Math.random().toString(36).slice(2, 8)}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function createVersion(createdAt) {
  const d = new Date(createdAt);
  return `content-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function countData(data) {
  const d = data || {};
  return {
    actions: (d.actions || []).length,
    events: (d.events || []).length,
    dialogues: Object.keys(d.dialogues || {}).length,
    phone_chats: (d.phone_chats || []).length,
    maps: (d.maps || []).length,
    locations: (d.locations || []).length,
    npcs: (d.npcs || []).length,
  };
}

export function listReleaseRecords(storage) {
  return readRecords(storage).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).map(cloneData);
}

export function createReleaseRecord(payload, options = {}) {
  const storage = options.storage;
  const now = options.now || Date.now;
  const createdAt = now();
  const gate = payload.gate || {};
  const record = {
    id: createId(createdAt),
    version: payload.version || createVersion(createdAt),
    created_at: createdAt,
    user: payload.user || '',
    snapshot_id: payload.snapshot_id || payload.snapshot?.id || '',
    gate_status: gate.status || 'unknown',
    gate: {
      status: gate.status || 'unknown',
      errorCount: gate.errorCount || 0,
      warningCount: gate.warningCount || 0,
      repairableCount: gate.repairableCount || 0,
      manualCount: gate.manualCount || 0,
    },
    files: [...(payload.files || [])],
    counts: countData(payload.data),
  };

  const next = [record, ...listReleaseRecords(storage)]
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .slice(0, MAX_RELEASE_RECORDS);
  writeRecords(next, storage);
  return cloneData(record);
}

export function deleteReleaseRecord(id, storage) {
  const current = listReleaseRecords(storage);
  const next = current.filter(item => item.id !== id);
  if (next.length === current.length) return false;
  writeRecords(next, storage);
  return true;
}

export function exportReleaseRecordPayload(record) {
  return { release: cloneData(record) };
}
