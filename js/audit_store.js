export const AUDIT_LOG_KEY = 'band_editor_audit_log_v1';
const MAX_AUDIT_ENTRIES = 200;

function getStorage(storage) {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data || {}));
}

function readEntries(storage) {
  const store = getStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(AUDIT_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeEntries(items, storage) {
  const store = getStorage(storage);
  if (!store) return;
  store.setItem(AUDIT_LOG_KEY, JSON.stringify(items));
}

function createId(nowValue) {
  return `audit_${nowValue}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listAuditEntries(storage) {
  return readEntries(storage).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).map(cloneData);
}

export function recordAuditEntry(entry, options = {}) {
  const storage = options.storage;
  const now = options.now || Date.now;
  const createdAt = now();
  const record = {
    id: createId(createdAt),
    created_at: createdAt,
    action: entry.action || 'unknown',
    doc_id: entry.doc_id || '',
    doc_type: entry.doc_type || '',
    user: entry.user || '',
    summary: entry.summary || '',
  };

  const next = [record, ...listAuditEntries(storage)]
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .slice(0, MAX_AUDIT_ENTRIES);
  writeEntries(next, storage);
  return cloneData(record);
}

export function deleteAuditEntry(id, storage) {
  const current = listAuditEntries(storage);
  const next = current.filter(item => item.id !== id);
  if (next.length === current.length) return false;
  writeEntries(next, storage);
  return true;
}

export function clearAuditEntries(storage) {
  writeEntries([], storage);
}

export function exportAuditEntryPayload(entry) {
  return { audit: cloneData(entry) };
}
