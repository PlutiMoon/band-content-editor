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
  const {
    SNAPSHOT_KEY,
    createSnapshot,
    listSnapshots,
    deleteSnapshot,
    exportSnapshotPayload,
  } = mod;

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
}

main()
  .then(() => console.log('snapshot store tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
