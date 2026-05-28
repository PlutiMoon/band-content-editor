// sync_to_game.js - Supabase <-> assets/json content sync
// Usage:
//   node 内容工具/sync_to_game.js             Pull Supabase -> local assets/json
//   node 内容工具/sync_to_game.js --backup    Pull and backup overwritten local JSON first
//   node 内容工具/sync_to_game.js --seed      Push local assets/json -> Supabase
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vgvghwcqcedycgpcvale.supabase.co';
const SR_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP = process.argv.includes('--backup');
const SEED = process.argv.includes('--seed');

function requireServiceKey() {
  if (SR_KEY) return SR_KEY;
  console.error('Missing environment variable SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Set it in PowerShell and retry, for example:');
  console.error('[Environment]::SetEnvironmentVariable("SUPABASE_SECRET_KEY", "<secret_key>", "User")');
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

function readJSON(jsonDir, filename) {
  const fp = path.join(jsonDir, filename);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
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

function diffArray(oldData, newData, idKey) {
  const oldMap = new Map((oldData || []).map(x => [x[idKey] || x.id, x]));
  const newMap = new Map((newData || []).map(x => [x[idKey] || x.id, x]));
  let added = 0, removed = 0, changed = 0;
  for (const [k] of newMap) {
    if (!oldMap.has(k)) added++;
    else if (JSON.stringify(oldMap.get(k)) !== JSON.stringify(newMap.get(k))) changed++;
  }
  for (const [k] of oldMap) {
    if (!newMap.has(k)) removed++;
  }
  return { added, removed, changed, total: newMap.size };
}

function diffDialogueDict(oldData, newData) {
  const oldKeys = Object.keys(oldData || {});
  const newKeys = Object.keys(newData || {});
  let added = 0, removed = 0, changed = 0;
  for (const k of newKeys) {
    if (!oldKeys.includes(k)) added++;
    else if (JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])) changed++;
  }
  for (const k of oldKeys) {
    if (!newKeys.includes(k)) removed++;
  }
  return { added, removed, changed, total: newKeys.length };
}

function formatDiff(diff) {
  const parts = [];
  if (diff.added) parts.push(`+${diff.added}`);
  if (diff.removed) parts.push(`-${diff.removed}`);
  if (diff.changed) parts.push(`~${diff.changed}`);
  return parts.length ? `${diff.total}(${parts.join('/')})` : `${diff.total}(+0)`;
}

function classifyPatchResult({ ok, status, body }) {
  if (!ok) return 'failed';
  if (status === 204) return 'updated';
  if (typeof body === 'string' && body.trim() === '[]') return 'missing';
  return 'updated';
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

async function pullDocs(jsonDir, serviceKey) {
  console.log('Pulling data from Supabase...');
  const rows = await fetchDocs(serviceKey);
  console.log(`  Fetched ${rows.length} records\n`);

  const newData = {};
  for (const row of rows) {
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    switch (row.type) {
      case 'actions': newData.actions = data; break;
      case 'events': newData.events = data; break;
      case 'dialogues': {
        const id = row.id.replace('dialogues/', '');
        if (!newData.dialogues) newData.dialogues = {};
        newData.dialogues[id] = data;
        break;
      }
      case 'phone_chats': newData.phone_chats = data; break;
      case 'locations': newData.locations = data; break;
      case 'npcs': newData.npcs = data; break;
      case 'maps': newData.maps = data; break;
      case 'game_config': newData.game_config = data; break;
    }
  }

  const oldActions = readJSON(jsonDir, 'actions.json');
  const oldEvents = readJSON(jsonDir, 'events.json');
  const oldPhone = readJSON(jsonDir, 'phone_chat.json');
  const oldLocations = readJSON(jsonDir, 'locations.json');
  const oldMaps = readJSON(jsonDir, 'maps.json');
  const oldNPCs = readJSON(jsonDir, 'npcs.json');
  const oldGameConfig = readJSON(jsonDir, 'game_config.json');
  const oldDialogues = {};
  const dialogueDir = path.join(jsonDir, 'dialogues');
  if (fs.existsSync(dialogueDir)) {
    fs.readdirSync(dialogueDir).filter(f => f.endsWith('.json')).forEach(f => {
      oldDialogues[f.replace('.json', '')] = readJSON(jsonDir, 'dialogues/' + f);
    });
  }

  const diffActions = diffArray(oldActions, newData.actions, 'id');
  const diffEvents = diffArray(oldEvents, newData.events, 'id');
  const diffPhone = diffArray(oldPhone, newData.phone_chats, 'chat_id');
  const diffMaps = diffArray(oldMaps, newData.maps, 'id');
  const diffLocations = diffArray(oldLocations, newData.locations, 'id');
  const diffNPCs = diffArray(oldNPCs, newData.npcs, 'id');
  const diffGameConfig = (oldGameConfig && newData.game_config && JSON.stringify(oldGameConfig) !== JSON.stringify(newData.game_config))
    ? 'changed'
    : (!oldGameConfig && newData.game_config ? 'added' : (!newData.game_config ? 'missing' : 'unchanged'));
  const diffDials = diffDialogueDict(oldDialogues, newData.dialogues || {});

  if (newData.actions) writeJSON(jsonDir, 'actions.json', newData.actions);
  if (newData.events) writeJSON(jsonDir, 'events.json', newData.events);
  if (newData.dialogues) {
    for (const [id, data] of Object.entries(newData.dialogues)) {
      writeJSON(jsonDir, `dialogues/${id}.json`, data);
    }
  }
  if (newData.maps) writeJSON(jsonDir, 'maps.json', newData.maps);
  if (newData.phone_chats) writeJSON(jsonDir, 'phone_chat.json', newData.phone_chats);
  if (newData.locations) writeJSON(jsonDir, 'locations.json', newData.locations);
  if (newData.npcs) writeJSON(jsonDir, 'npcs.json', newData.npcs);
  if (newData.game_config) writeJSON(jsonDir, 'game_config.json', newData.game_config);

  console.log('\nChange summary:');
  console.log(`  Actions      ${formatDiff(diffActions)}`);
  console.log(`  Events       ${formatDiff(diffEvents)}`);
  console.log(`  Maps         ${formatDiff(diffMaps)}`);
  console.log(`  Dialogues    ${formatDiff(diffDials)}`);
  console.log(`  Phone chats  ${formatDiff(diffPhone)}`);
  console.log(`  Locations    ${formatDiff(diffLocations)}`);
  console.log(`  NPCs         ${formatDiff(diffNPCs)}`);
  console.log(`  Game config  ${diffGameConfig}`);
  if (BACKUP) console.log('\nBackups saved to assets/json/.backup/');
  console.log('\nSync complete. Restart Godot to see updates.');
}

async function main() {
  const serviceKey = requireServiceKey();
  const jsonDir = resolveJsonDir();
  if (SEED) {
    await seedDocs(jsonDir, serviceKey);
  } else {
    await pullDocs(jsonDir, serviceKey);
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
  diffArray,
  diffDialogueDict,
  formatDiff,
  resolveJsonDir,
};
