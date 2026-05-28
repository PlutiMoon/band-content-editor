// sync_to_game.js — Supabase ↔ assets/json/ 双向同步
// 用法:
//   node 内容工具/sync_to_game.js              从 Supabase 拉取 → 写入本地
//   node 内容工具/sync_to_game.js --backup      同上，覆盖前备份旧文件
//   node 内容工具/sync_to_game.js --seed        反向：读取本地 JSON → 上传到 Supabase（首次初始化）

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vgvghwcqcedycgpcvale.supabase.co';
const SR_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const JSON_DIR = resolveJsonDir();
const BACKUP = process.argv.includes('--backup');
const SEED = process.argv.includes('--seed');

if (!SR_KEY) {
  console.error('缺少环境变量 SUPABASE_SECRET_KEY 或 SUPABASE_SERVICE_ROLE_KEY。');
  console.error('请在 PowerShell 中设置后重试，例如：');
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
    console.error('找不到 assets/json 目录。可通过 BAND_JSON_DIR 指定。');
    process.exit(1);
  }
  return found;
}

async function fetchDocs() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/documents?select=*`, {
    headers: { 'apikey': SR_KEY, 'Authorization': `Bearer ${SR_KEY}` }
  });
  if (!res.ok) throw new Error(`拉取失败: ${res.status} ${await res.text()}`);
  return res.json();
}

function readJSON(filename) {
  const fp = path.join(JSON_DIR, filename);
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; }
}

function writeJSON(filename, data) {
  const filepath = path.join(JSON_DIR, filename);
  if (BACKUP && fs.existsSync(filepath)) {
    const backupDir = path.join(JSON_DIR, '.backup');
    fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const bakName = path.basename(filename, '.json') + '_' + ts + '.json';
    fs.copyFileSync(filepath, path.join(backupDir, bakName));
  }
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, '\t'), 'utf8');
  console.log(`  ✓ ${filename}`);
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

function fmt(diff) {
  const parts = [];
  if (diff.added) parts.push(`+${diff.added}`);
  if (diff.removed) parts.push(`-${diff.removed}`);
  if (diff.changed) parts.push(`~${diff.changed}`);
  return parts.length ? `${diff.total}(${parts.join('/')})` : `${diff.total}(±0)`;
}

// ── Seed: upload local JSON → Supabase ──
async function seedDocs() {
  console.log('🌱 从本地 JSON 上传到 Supabase...\n');

  const seeds = [
    { file: 'actions.json',     id: 'actions',         type: 'actions' },
    { file: 'events.json',      id: 'events',          type: 'events' },
    { file: 'phone_chat.json',  id: 'phone_chats',     type: 'phone_chats' },
    { file: 'maps.json',        id: 'maps',            type: 'maps' },
    { file: 'locations.json',   id: 'locations',       type: 'locations' },
    { file: 'npcs.json',        id: 'npcs',            type: 'npcs' },
    { file: 'game_config.json', id: 'game_config',     type: 'game_config' },
  ];

  for (const s of seeds) {
    const data = readJSON(s.file);
    if (data == null) {
      console.log(`  ⚠ ${s.file} 不存在或格式错误，跳过`);
      continue;
    }
    const payload = { id: s.id, type: s.type, data: data, updated_by: 'sync脚本', updated_at: new Date().toISOString() };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${encodeURIComponent(s.id)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SR_KEY, 'Authorization': `Bearer ${SR_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      // If PATCH affected 0 rows, do INSERT
      const txt = await res.text();
      if (!txt || txt === '[]') {
        // No existing row, try upsert via POST with Prefer: resolution=merge-duplicates
        const res2 = await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
          method: 'POST',
          headers: {
            'apikey': SR_KEY, 'Authorization': `Bearer ${SR_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify([payload])
        });
        if (res2.ok) {
          console.log(`  ✓ ${s.file} → ${s.id}（新增）`);
        } else {
          console.log(`  ✗ ${s.file} 新增失败: ${res2.status}`);
        }
      } else {
        console.log(`  ✓ ${s.file} → ${s.id}（更新）`);
      }
    } else {
      console.log(`  ✗ ${s.file} 上传失败: ${res.status}`);
    }
  }

  // Handle dialogues separately (one document per dialogue file)
  const dialogueDir = path.join(JSON_DIR, 'dialogues');
  if (fs.existsSync(dialogueDir)) {
    const dFiles = fs.readdirSync(dialogueDir).filter(f => f.endsWith('.json'));
    for (const df of dFiles) {
      const dk = df.replace('.json', '');
      const dData = readJSON('dialogues/' + df);
      if (dData == null) { console.log(`  ⚠ dialogues/${df} 格式错误，跳过`); continue; }
      const payload = { id: `dialogues/${dk}`, type: 'dialogues', data: dData, updated_by: 'sync脚本', updated_at: new Date().toISOString() };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
        method: 'POST',
        headers: {
          'apikey': SR_KEY, 'Authorization': `Bearer ${SR_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify([payload])
      });
      if (res.ok) {
        console.log(`  ✓ dialogues/${df} → dialogues/${dk}`);
      } else {
        console.log(`  ✗ dialogues/${df} 上传失败: ${res.status}`);
      }
    }
  }

  console.log('\n✅ 初始化完成！刷新编辑器页面即可看到数据。');
}

(async () => {
  if (SEED) {
    await seedDocs();
    return;
  }
  console.log('从 Supabase 拉取数据...');
  const rows = await fetchDocs();
  console.log(`  获取到 ${rows.length} 条记录\n`);

  // Build new data maps
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

  // Diff with existing files
  const oldActions = readJSON('actions.json');
  const oldEvents = readJSON('events.json');
  const oldPhone = readJSON('phone_chat.json');
  const oldLocations = readJSON('locations.json');
  const oldMaps = readJSON('maps.json');
  const oldNPCs = readJSON('npcs.json');
  const oldGameConfig = readJSON('game_config.json');
  const oldDialogues = {};
  const dialogueDir = path.join(JSON_DIR, 'dialogues');
  if (fs.existsSync(dialogueDir)) {
    fs.readdirSync(dialogueDir).filter(f => f.endsWith('.json')).forEach(f => {
      oldDialogues[f.replace('.json', '')] = readJSON('dialogues/' + f);
    });
  }

  const diffActions = diffArray(oldActions, newData.actions, 'id');
  const diffEvents = diffArray(oldEvents, newData.events, 'id');
  const diffPhone = diffArray(oldPhone, newData.phone_chats, 'chat_id');
  const diffMaps = diffArray(oldMaps, newData.maps, 'id');
  const diffLocations = diffArray(oldLocations, newData.locations, 'id');
  const diffNPCs = diffArray(oldNPCs, newData.npcs, 'id');
  const diffGameConfig = (oldGameConfig && newData.game_config && JSON.stringify(oldGameConfig) !== JSON.stringify(newData.game_config)) ? '已修改' : (!oldGameConfig && newData.game_config ? '新增' : (!newData.game_config ? '缺失' : '未变化'));
  const diffDials = diffDialogueDict(oldDialogues, newData.dialogues || {});

  // Write files
  if (newData.actions) writeJSON('actions.json', newData.actions);
  if (newData.events) writeJSON('events.json', newData.events);
  if (newData.dialogues) {
    for (const [id, data] of Object.entries(newData.dialogues)) {
      writeJSON(`dialogues/${id}.json`, data);
    }
  }
  if (newData.maps) writeJSON('maps.json', newData.maps);
  if (newData.phone_chats) writeJSON('phone_chat.json', newData.phone_chats);
  if (newData.locations) writeJSON('locations.json', newData.locations);
  if (newData.npcs) writeJSON('npcs.json', newData.npcs);
  if (newData.game_config) writeJSON('game_config.json', newData.game_config);

  // Summary
  console.log('\n📊 变更摘要:');
  console.log(`  行动  ${fmt(diffActions)}`);
  console.log(`  事件  ${fmt(diffEvents)}`);
  console.log(`  地图  ${fmt(diffMaps)}`);
  console.log(`  对话  ${fmt(diffDials)}`);
  console.log(`  手机  ${fmt(diffPhone)}`);
  console.log(`  地点  ${fmt(diffLocations)}`);
  console.log(`  NPC   ${fmt(diffNPCs)}`);
  console.log(`  游戏配置  ${diffGameConfig}`);
  if (BACKUP) console.log('\n💾 旧文件已备份到 assets/json/.backup/');
  console.log('\n✅ 同步完成！Godot 重新运行即可看到更新。');
})();
