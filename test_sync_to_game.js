const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  classifyPatchResult,
  classifyHealthGate,
  selectPullCredentials,
  formatDiff,
} = require('./sync_to_game.js');
const {
  createEmptyProject,
  rowsToProject,
  projectToAssetFiles,
} = require('./js/sync_project_codec.js');
const {
  buildProjectDiff,
} = require('./js/sync_diff.js');
const {
  buildSyncBackupName,
  buildSyncBackupPayload,
} = require('./js/sync_backup.js');

assert.strictEqual(classifyPatchResult({ ok: true, status: 204 }), 'updated');
assert.strictEqual(classifyPatchResult({ ok: true, status: 200, body: '' }), 'updated');
assert.strictEqual(classifyPatchResult({ ok: true, status: 200, body: '[]' }), 'missing');
assert.strictEqual(classifyPatchResult({ ok: false, status: 401 }), 'failed');

assert.deepStrictEqual(
  classifyHealthGate({ errorCount: 1, warningCount: 0, status: 'blocked' }),
  { canWrite: false, errorCount: 1, warningCount: 0, status: 'blocked' }
);
assert.deepStrictEqual(
  classifyHealthGate({ errorCount: 0, warningCount: 2, status: 'warning' }),
  { canWrite: true, errorCount: 0, warningCount: 2, status: 'warning' }
);
assert.deepStrictEqual(
  selectPullCredentials({
    BAND_EDITOR_ACCESS_KEY: 'team-key',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    SUPABASE_SECRET_KEY: 'secret-key',
  }),
  { mode: 'rpc', publishableKey: 'publishable-key', editorAccessKey: 'team-key' }
);
assert.deepStrictEqual(
  selectPullCredentials({ SUPABASE_SECRET_KEY: 'secret-key' }),
  { mode: 'service', serviceKey: 'secret-key' }
);
assert.deepStrictEqual(
  selectPullCredentials({}),
  { mode: 'missing' }
);

assert.strictEqual(formatDiff({ added: 0, removed: 0, changed: 0, total: 9 }), '9(+0)');
assert.strictEqual(formatDiff({ added: 2, removed: 1, changed: 3, total: 10 }), '10(+2/-1/~3)');

const emptyProject = createEmptyProject();
assert.deepStrictEqual(emptyProject.actions, []);
assert.deepStrictEqual(emptyProject.dialogues, {});
assert.deepStrictEqual(emptyProject.game_config, {});

const rows = [
  { id: 'actions', type: 'actions', data: [{ id: 'practice' }] },
  { id: 'dialogues/npc_陈老师', type: 'dialogues', data: { nodes: [] } },
  { id: 'phone_chats', type: 'phone_chats', data: [{ chat_id: 'band_chat' }] },
  { id: 'game_config', type: 'game_config', data: '{"total_days":7}' },
];

const project = rowsToProject(rows);
assert.strictEqual(project.actions.length, 1);
assert.ok(project.dialogues['npc_陈老师']);
assert.strictEqual(project.phone_chats[0].chat_id, 'band_chat');
assert.strictEqual(project.game_config.total_days, 7);

const files = projectToAssetFiles(project);
assert.ok(files.some(file => file.filename === 'actions.json'));
assert.ok(files.some(file => file.filename === 'phone_chat.json'));
assert.ok(files.some(file => file.filename === 'dialogues/npc_陈老师.json'));

const oldProject = {
  ...createEmptyProject(),
  actions: [{ id: 'practice', title: 'old' }],
  dialogues: { npc_陈老师: { nodes: [{ id: 'start' }] } },
};
const newProject = {
  ...createEmptyProject(),
  actions: [{ id: 'practice', title: 'new' }, { id: 'busk' }],
  dialogues: {
    npc_陈老师: { nodes: [{ id: 'start' }, { id: 'end' }] },
    test_hello: { nodes: [] },
  },
};
const projectDiff = buildProjectDiff(oldProject, newProject);
assert.deepStrictEqual(projectDiff.actions, { added: 1, removed: 0, changed: 1, total: 2 });
assert.deepStrictEqual(projectDiff.dialogues, { added: 1, removed: 0, changed: 1, total: 2 });

const backupDate = new Date('2026-05-29T13:25:56+08:00');
assert.strictEqual(
  buildSyncBackupName(backupDate),
  'band-online-sync-before-write-20260529-132556.json'
);
const backupPayload = buildSyncBackupPayload({
  createdAt: backupDate,
  files: [
    { filename: 'actions.json', data: [{ id: 'practice' }] },
    { filename: 'dialogues/npc_陈老师.json', data: { nodes: [] } },
  ],
});
assert.strictEqual(backupPayload.backup_type, 'band-online-sync-before-write');
assert.strictEqual(backupPayload.asset_file_count, 2);
assert.strictEqual(backupPayload.files[1].filename, 'dialogues/npc_陈老师.json');

const syncScript = fs.readFileSync(path.join(__dirname, 'sync_to_game.js'), 'utf8');
assert(syncScript.includes("'--dry-run'"), 'sync_to_game.js must support --dry-run');
assert(syncScript.includes('Dry run complete'), 'dry-run must report that no files were changed');
assert(syncScript.includes('buildPublishGate'), 'sync_to_game.js must run the publish health gate before writing');
assert(syncScript.includes('Sync blocked'), 'health errors must block local writes');
assert(syncScript.includes('editor_list_documents'), 'pull mode must support low-privilege RPC document listing');
assert(syncScript.includes('BAND_EDITOR_ACCESS_KEY'), 'pull mode must accept the team editor access key');
assert(syncScript.includes('writeSyncBackup'), 'real sync writes must create a formal backup before overwriting assets');

console.log('sync_to_game tests passed');
