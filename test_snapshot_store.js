const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, 'js', 'snapshot_store.js')).href);
  const releaseMod = await import(pathToFileURL(path.join(__dirname, 'js', 'release_store.js')).href);
  const auditMod = await import(pathToFileURL(path.join(__dirname, 'js', 'audit_store.js')).href);
  const {
    SNAPSHOT_KEY,
    createSnapshot,
    listSnapshots,
    deleteSnapshot,
    exportSnapshotPayload,
  } = mod;
  const {
    RELEASE_RECORDS_KEY,
    createReleaseRecord,
    listReleaseRecords,
    deleteReleaseRecord,
    exportReleaseRecordPayload,
  } = releaseMod;
  const {
    AUDIT_LOG_KEY,
    recordAuditEntry,
    listAuditEntries,
    deleteAuditEntry,
    clearAuditEntries,
    exportAuditEntryPayload,
  } = auditMod;

  const storage = createMemoryStorage();
  const first = createSnapshot(
    { actions: [{ id: 'a1' }], events: [], dialogues: {}, phone_chats: [], maps: [], locations: [], npcs: [], game_config: {} },
    { source: 'manual', label: 'Before edit', storage, now: () => 1000 }
  );

  assert(first.id);
  assert.strictEqual(first.source, 'manual');
  assert.strictEqual(first.label, 'Before edit');
  assert.strictEqual(first.created_at, 1000);
  assert.strictEqual(listSnapshots(storage).length, 1);

  first.data.actions[0].id = 'mutated';
  assert.strictEqual(listSnapshots(storage)[0].data.actions[0].id, 'a1');

  for (let i = 0; i < 12; i++) {
    createSnapshot(
      { actions: [{ id: `a${i}` }], events: [], dialogues: {}, phone_chats: [], maps: [], locations: [], npcs: [], game_config: {} },
      { source: 'import', label: `Import ${i}`, storage, now: () => 2000 + i }
    );
  }

  const capped = listSnapshots(storage);
  assert.strictEqual(capped.length, 10);
  assert.strictEqual(capped[0].created_at, 2011);
  assert.strictEqual(capped[9].created_at, 2002);

  const deletedId = capped[0].id;
  assert.strictEqual(deleteSnapshot(deletedId, storage), true);
  assert(!listSnapshots(storage).some(s => s.id === deletedId));
  assert.strictEqual(deleteSnapshot('missing', storage), false);

  const payload = exportSnapshotPayload(listSnapshots(storage)[0]);
  assert(payload.snapshot);
  assert(payload.data);

  storage.setItem(SNAPSHOT_KEY, '{not json');
  assert.deepStrictEqual(listSnapshots(storage), []);

  const releaseStorage = createMemoryStorage();
  const release = createReleaseRecord({
    version: 'content-test-001',
    snapshot: { id: 'snap_release_1' },
    gate: { status: 'pass', errorCount: 0, warningCount: 0, repairableCount: 0, manualCount: 0 },
    user: 'Alice',
    files: ['actions.json', 'events.json'],
    data: {
      actions: [{ id: 'a1' }],
      events: [{ id: 'e1' }],
      dialogues: { intro: {} },
      phone_chats: [{ chat_id: 'band' }],
      maps: [{ id: 'town' }],
      locations: [{ id: 'room' }],
      npcs: [{ id: 'npc_a' }],
    },
  }, { storage: releaseStorage, now: () => 3000 });

  assert(release.id);
  assert.strictEqual(release.version, 'content-test-001');
  assert.strictEqual(release.snapshot_id, 'snap_release_1');
  assert.strictEqual(release.user, 'Alice');
  assert.deepStrictEqual(release.files, ['actions.json', 'events.json']);
  assert.strictEqual(release.counts.actions, 1);
  assert.strictEqual(release.counts.dialogues, 1);
  assert.strictEqual(listReleaseRecords(releaseStorage).length, 1);

  release.counts.actions = 99;
  assert.strictEqual(listReleaseRecords(releaseStorage)[0].counts.actions, 1);

  for (let i = 0; i < 22; i++) {
    createReleaseRecord({
      snapshot: { id: `snap_${i}` },
      gate: { status: 'warning', errorCount: 0, warningCount: 1, repairableCount: 0, manualCount: 1 },
      user: 'Bob',
      files: ['actions.json'],
      data: { actions: [], events: [], dialogues: {}, phone_chats: [], maps: [], locations: [], npcs: [] },
    }, { storage: releaseStorage, now: () => 4000 + i });
  }

  const releases = listReleaseRecords(releaseStorage);
  assert.strictEqual(releases.length, 20);
  assert.strictEqual(releases[0].created_at, 4021);
  assert.strictEqual(releases[19].created_at, 4002);
  assert(releases[0].version.startsWith('content-'));

  const releasePayload = exportReleaseRecordPayload(releases[0]);
  assert(releasePayload.release);
  assert.strictEqual(releasePayload.release.snapshot_id, releases[0].snapshot_id);

  const releaseId = releases[0].id;
  assert.strictEqual(deleteReleaseRecord(releaseId, releaseStorage), true);
  assert(!listReleaseRecords(releaseStorage).some(item => item.id === releaseId));
  assert.strictEqual(deleteReleaseRecord('missing', releaseStorage), false);

  releaseStorage.setItem(RELEASE_RECORDS_KEY, '{not json');
  assert.deepStrictEqual(listReleaseRecords(releaseStorage), []);

  const auditStorage = createMemoryStorage();
  const audit = recordAuditEntry({
    action: 'save',
    doc_id: 'actions',
    doc_type: 'actions',
    user: 'Alice',
    summary: 'array:1',
  }, { storage: auditStorage, now: () => 5000 });

  assert(audit.id);
  assert.strictEqual(audit.action, 'save');
  assert.strictEqual(audit.doc_id, 'actions');
  assert.strictEqual(audit.doc_type, 'actions');
  assert.strictEqual(audit.user, 'Alice');
  assert.strictEqual(audit.summary, 'array:1');
  assert.strictEqual(listAuditEntries(auditStorage).length, 1);

  audit.summary = 'mutated';
  assert.strictEqual(listAuditEntries(auditStorage)[0].summary, 'array:1');

  for (let i = 0; i < 205; i++) {
    recordAuditEntry({
      action: 'delete',
      doc_id: `dialogues/dlg_${i}`,
      doc_type: 'dialogues',
      user: 'Bob',
      summary: `delete ${i}`,
    }, { storage: auditStorage, now: () => 6000 + i });
  }

  const entries = listAuditEntries(auditStorage);
  assert.strictEqual(entries.length, 200);
  assert.strictEqual(entries[0].created_at, 6204);
  assert.strictEqual(entries[199].created_at, 6005);

  const auditPayload = exportAuditEntryPayload(entries[0]);
  assert(auditPayload.audit);
  assert.strictEqual(auditPayload.audit.id, entries[0].id);

  const auditId = entries[0].id;
  assert.strictEqual(deleteAuditEntry(auditId, auditStorage), true);
  assert(!listAuditEntries(auditStorage).some(item => item.id === auditId));
  assert.strictEqual(deleteAuditEntry('missing', auditStorage), false);

  clearAuditEntries(auditStorage);
  assert.deepStrictEqual(listAuditEntries(auditStorage), []);

  auditStorage.setItem(AUDIT_LOG_KEY, '{not json');
  assert.deepStrictEqual(listAuditEntries(auditStorage), []);
}

main()
  .then(() => console.log('snapshot store tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
