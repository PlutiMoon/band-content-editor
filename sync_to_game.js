// sync_to_game.js - Supabase <-> assets/json content sync
// Usage:
//   node 内容工具/sync_to_game.js             Pull Supabase -> local assets/json
//   node 内容工具/sync_to_game.js --backup    Pull and backup overwritten local JSON first
//   node 内容工具/sync_to_game.js --seed      Push local assets/json -> Supabase
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  createEmptyProject,
  projectToAssetFiles,
  rowsToProject,
} = require('./js/sync_project_codec.js');
const {
  diffArray,
  diffDialogueDict,
  formatDiff,
  buildProjectDiff,
} = require('./js/sync_diff.js');
const {
  writeSyncBackup,
} = require('./js/sync_backup.js');
const {
  writeSyncOperationRecord,
} = require('./js/sync_operation_record.js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vgvghwcqcedycgpcvale.supabase.co';
const SR_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP = process.argv.includes('--backup');
const SEED = process.argv.includes('--seed');
const DRY_RUN = process.argv.includes('--dry-run');
const SYNC_BACKUP_DIR = process.env.BAND_SYNC_BACKUP_DIR || path.resolve(__dirname, '..', '..', 'backups', 'online-sync');
const SYNC_OPERATION_DIR = process.env.BAND_SYNC_OPERATION_DIR || path.resolve(__dirname, '..', '..', 'docs', 'operations');

function readPublishableKeyFromConfig() {
  try {
    const config = fs.readFileSync(path.join(__dirname, 'js', 'config.js'), 'utf8');
    const match = config.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

const CONFIG_PUBLISHABLE_KEY = readPublishableKeyFromConfig();

function requireServiceKey() {
  if (SR_KEY) return SR_KEY;
  console.error('Missing environment variable SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Set it in PowerShell and retry, for example:');
  console.error('[Environment]::SetEnvironmentVariable("SUPABASE_SECRET_KEY", "<secret_key>", "User")');
  process.exit(1);
}

function selectPullCredentials(env = process.env, configPublishableKey = CONFIG_PUBLISHABLE_KEY) {
  const editorAccessKey = env.BAND_EDITOR_ACCESS_KEY || env.BAND_ACCESS_KEY || '';
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || configPublishableKey || '';
  if (editorAccessKey && publishableKey) {
    return { mode: 'rpc', publishableKey, editorAccessKey };
  }

  const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (serviceKey) {
    return { mode: 'service', serviceKey };
  }

  return { mode: 'missing' };
}

function requirePullCredentials() {
  const credentials = selectPullCredentials();
  if (credentials.mode !== 'missing') return credentials;

  console.error('Missing pull credentials.');
  console.error('For low-privilege sync, set BAND_EDITOR_ACCESS_KEY.');
  console.error('For maintainer legacy sync, set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

function resolveJsonDir() {
  if (process.env.BAND_JSON_DIR) {
    return path.resolve(process.env.BAND_JSON_DIR);
  }
  const candidates = [
    path.resolve(__dirname, '..', 'assets', 'json'),
    path.resolve(__dirname, '..', '..', 'assets', 'json'),
  ];
  const found = candidates.find(dir => fs.existsSync(dir));
  if (!found) {
    console.error('Cannot find assets/json. Set BAND_JSON_DIR to override.');
    process.exit(1);
  }
  return found;
}

function authHeaders(serviceKey, extra = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    ...extra,
  };
}

async function fetchDocs(serviceKey) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/documents?select=*`, {
    headers: authHeaders(serviceKey),
  });
  if (!res.ok) throw new Error(`Pull failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchDocsViaRpc(publishableKey, editorAccessKey) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/editor_list_documents`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input_key: editorAccessKey }),
  });
  if (!res.ok) throw new Error(`Pull failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchDocsWithCredentials(credentials) {
  if (credentials.mode === 'rpc') {
    return fetchDocsViaRpc(credentials.publishableKey, credentials.editorAccessKey);
  }
  return fetchDocs(credentials.serviceKey);
}

function readJSON(jsonDir, filename) {
  const fp = path.join(jsonDir, filename);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

function readProjectFromAssets(jsonDir) {
  const project = createEmptyProject();
  project.actions = readJSON(jsonDir, 'actions.json') || [];
  project.events = readJSON(jsonDir, 'events.json') || [];
  project.phone_chats = readJSON(jsonDir, 'phone_chat.json') || [];
  project.locations = readJSON(jsonDir, 'locations.json') || [];
  project.maps = readJSON(jsonDir, 'maps.json') || [];
  project.npcs = readJSON(jsonDir, 'npcs.json') || [];
  project.game_config = readJSON(jsonDir, 'game_config.json') || {};

  const dialogueDir = path.join(jsonDir, 'dialogues');
  if (fs.existsSync(dialogueDir)) {
    fs.readdirSync(dialogueDir).filter(file => file.endsWith('.json')).forEach(file => {
      const data = readJSON(jsonDir, `dialogues/${file}`);
      if (data != null) project.dialogues[file.replace('.json', '')] = data;
    });
  }
  return project;
}

function writeJSON(jsonDir, filename, data) {
  const filepath = path.join(jsonDir, filename);
  if (BACKUP && fs.existsSync(filepath)) {
    const backupDir = path.join(jsonDir, '.backup');
    fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const bakName = path.basename(filename, '.json') + '_' + ts + '.json';
    fs.copyFileSync(filepath, path.join(backupDir, bakName));
  }
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, '\t'), 'utf8');
  console.log(`  OK ${filename}`);
}

function classifyPatchResult({ ok, status, body }) {
  if (!ok) return 'failed';
  if (status === 204) return 'updated';
  if (typeof body === 'string' && body.trim() === '[]') return 'missing';
  return 'updated';
}

function classifyHealthGate(gate) {
  const errorCount = Number(gate && gate.errorCount) || 0;
  const warningCount = Number(gate && gate.warningCount) || 0;
  const status = errorCount > 0 ? 'blocked' : (warningCount > 0 ? 'warning' : 'pass');
  return {
    canWrite: errorCount === 0,
    errorCount,
    warningCount,
    status,
  };
}

async function buildSyncHealthGate(project) {
  const gateUrl = pathToFileURL(path.join(__dirname, 'js', 'publish_gate.js')).href;
  const { buildPublishGate } = await import(gateUrl);
  return classifyHealthGate(buildPublishGate(project));
}

function printHealthGate(gate) {
  console.log(`Health: ${gate.errorCount} errors, ${gate.warningCount} warnings`);
  if (!gate.canWrite) {
    console.log('Sync blocked: fix red health errors before writing local JSON.');
  }
}

async function upsertDocument(serviceKey, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${encodeURIComponent(payload.id)}`, {
    method: 'PATCH',
    headers: authHeaders(serviceKey, {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }),
    body: JSON.stringify(payload),
  });

  const body = await res.text();
  const patchResult = classifyPatchResult({ ok: res.ok, status: res.status, body });
  if (patchResult === 'updated') return { ok: true, action: 'updated' };
  if (patchResult === 'failed') return { ok: false, action: 'failed', status: res.status, body };

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
    method: 'POST',
    headers: authHeaders(serviceKey, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    }),
    body: JSON.stringify([payload]),
  });
  return {
    ok: insertRes.ok,
    action: insertRes.ok ? 'inserted' : 'failed',
    status: insertRes.status,
    body: insertRes.ok ? '' : await insertRes.text(),
  };
}

async function seedDocs(jsonDir, serviceKey) {
  console.log('Uploading local JSON to Supabase...\n');

  const seeds = [
    { file: 'actions.json', id: 'actions', type: 'actions' },
    { file: 'events.json', id: 'events', type: 'events' },
    { file: 'phone_chat.json', id: 'phone_chats', type: 'phone_chats' },
    { file: 'maps.json', id: 'maps', type: 'maps' },
    { file: 'locations.json', id: 'locations', type: 'locations' },
    { file: 'npcs.json', id: 'npcs', type: 'npcs' },
    { file: 'game_config.json', id: 'game_config', type: 'game_config' },
  ];

  for (const s of seeds) {
    const data = readJSON(jsonDir, s.file);
    if (data == null) {
      console.log(`  SKIP ${s.file} missing or invalid JSON`);
      continue;
    }
    const payload = { id: s.id, type: s.type, data, updated_by: 'sync_script', updated_at: new Date().toISOString() };
    const result = await upsertDocument(serviceKey, payload);
    if (result.ok) {
      console.log(`  OK ${s.file} -> ${s.id} (${result.action})`);
    } else {
      console.log(`  FAIL ${s.file} -> ${s.id}: ${result.status} ${result.body || ''}`.trim());
    }
  }

  const dialogueDir = path.join(jsonDir, 'dialogues');
  if (fs.existsSync(dialogueDir)) {
    const dFiles = fs.readdirSync(dialogueDir).filter(f => f.endsWith('.json'));
    for (const df of dFiles) {
      const dk = df.replace('.json', '');
      const dData = readJSON(jsonDir, 'dialogues/' + df);
      if (dData == null) {
        console.log(`  SKIP dialogues/${df} invalid JSON`);
        continue;
      }
      const payload = { id: `dialogues/${dk}`, type: 'dialogues', data: dData, updated_by: 'sync_script', updated_at: new Date().toISOString() };
      const result = await upsertDocument(serviceKey, payload);
      if (result.ok) {
        console.log(`  OK dialogues/${df} -> dialogues/${dk} (${result.action})`);
      } else {
        console.log(`  FAIL dialogues/${df}: ${result.status} ${result.body || ''}`.trim());
      }
    }
  }

  console.log('\nUpload complete. Refresh the online editor to see the data.');
}

function printChangeSummary(projectDiff) {
  console.log('\nChange summary:');
  console.log(`  Actions      ${formatDiff(projectDiff.actions)}`);
  console.log(`  Events       ${formatDiff(projectDiff.events)}`);
  console.log(`  Maps         ${formatDiff(projectDiff.maps)}`);
  console.log(`  Dialogues    ${formatDiff(projectDiff.dialogues)}`);
  console.log(`  Phone chats  ${formatDiff(projectDiff.phone_chats)}`);
  console.log(`  Locations    ${formatDiff(projectDiff.locations)}`);
  console.log(`  NPCs         ${formatDiff(projectDiff.npcs)}`);
  console.log(`  Game config  ${projectDiff.game_config}`);
}

async function pullDocs(jsonDir, credentials) {
  console.log('Pulling data from Supabase...');
  const rows = await fetchDocsWithCredentials(credentials);
  console.log(`  Fetched ${rows.length} records\n`);

  const newData = rowsToProject(rows);
  const oldData = readProjectFromAssets(jsonDir);
  const projectDiff = buildProjectDiff(oldData, newData);
  const rowTypes = new Set(rows.map(row => row.type));
  const healthGate = await buildSyncHealthGate(newData);

  printHealthGate(healthGate);
  printChangeSummary(projectDiff);

  if (!healthGate.canWrite) {
    const record = writeSyncOperationRecord({
      operationDir: SYNC_OPERATION_DIR,
      mode: 'blocked',
      fetchedCount: rows.length,
      healthGate,
      projectDiff,
      writtenFiles: [],
    });
    console.log(`Operation record written: ${record.filepath}`);
    process.exitCode = 1;
    return;
  }

  if (DRY_RUN) {
    const record = writeSyncOperationRecord({
      operationDir: SYNC_OPERATION_DIR,
      mode: 'dry-run',
      fetchedCount: rows.length,
      healthGate,
      projectDiff,
      writtenFiles: [],
    });
    console.log(`Operation record written: ${record.filepath}`);
    console.log('\nDry run complete. No local files were changed.');
    return;
  }

  const backupResult = writeSyncBackup({
    backupDir: SYNC_BACKUP_DIR,
    files: projectToAssetFiles(oldData),
  });
  console.log(`\nFormal backup saved: ${backupResult.filepath}`);

  const writtenFiles = [];
  if (rowTypes.has('actions')) { writeJSON(jsonDir, 'actions.json', newData.actions); writtenFiles.push('actions.json'); }
  if (rowTypes.has('events')) { writeJSON(jsonDir, 'events.json', newData.events); writtenFiles.push('events.json'); }
  if (rowTypes.has('dialogues')) {
    for (const [id, data] of Object.entries(newData.dialogues)) {
      const filename = `dialogues/${id}.json`;
      writeJSON(jsonDir, filename, data);
      writtenFiles.push(filename);
    }
  }
  if (rowTypes.has('maps')) { writeJSON(jsonDir, 'maps.json', newData.maps); writtenFiles.push('maps.json'); }
  if (rowTypes.has('phone_chats')) { writeJSON(jsonDir, 'phone_chat.json', newData.phone_chats); writtenFiles.push('phone_chat.json'); }
  if (rowTypes.has('locations')) { writeJSON(jsonDir, 'locations.json', newData.locations); writtenFiles.push('locations.json'); }
  if (rowTypes.has('npcs')) { writeJSON(jsonDir, 'npcs.json', newData.npcs); writtenFiles.push('npcs.json'); }
  if (rowTypes.has('game_config')) { writeJSON(jsonDir, 'game_config.json', newData.game_config); writtenFiles.push('game_config.json'); }

  if (BACKUP) console.log('\nBackups saved to assets/json/.backup/');
  const record = writeSyncOperationRecord({
    operationDir: SYNC_OPERATION_DIR,
    mode: 'write',
    fetchedCount: rows.length,
    healthGate,
    projectDiff,
    backupPath: backupResult.filepath,
    writtenFiles,
  });
  console.log(`Operation record written: ${record.filepath}`);
  console.log('\nSync complete. Restart Godot to see updates.');
}

async function main() {
  const jsonDir = resolveJsonDir();
  if (SEED) {
    const serviceKey = requireServiceKey();
    await seedDocs(jsonDir, serviceKey);
  } else {
    const credentials = requirePullCredentials();
    await pullDocs(jsonDir, credentials);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message || err);
    process.exitCode = 1;
  });
}

module.exports = {
  classifyPatchResult,
  classifyHealthGate,
  selectPullCredentials,
  diffArray,
  diffDialogueDict,
  formatDiff,
  resolveJsonDir,
};
