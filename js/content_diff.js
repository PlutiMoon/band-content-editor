const COLLECTIONS = [
  ['action', 'actions', '行动'],
  ['event', 'events', '事件'],
  ['map', 'maps', '地图'],
  ['location', 'locations', '地点'],
  ['npc', 'npcs', 'NPC'],
  ['phone', 'phone_chats', '手机聊天', 'chat_id'],
];

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableValue(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function addChange(items, counts, kind, kindLabel, id, operation, changes = []) {
  items.push({ kind, kindLabel, id, operation, changes });
  counts[operation] += 1;
}

function diffValues(before, after, prefix = '') {
  if (stableStringify(before) === stableStringify(after)) return [];
  const beforeIsObject = before && typeof before === 'object' && !Array.isArray(before);
  const afterIsObject = after && typeof after === 'object' && !Array.isArray(after);
  if (!beforeIsObject || !afterIsObject) {
    return [{ path: prefix || '(root)', before, after }];
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes = [];
  for (const key of [...keys].sort()) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    changes.push(...diffValues(before[key], after[key], nextPath));
  }
  return changes;
}

function mapById(items, idKey) {
  const map = new Map();
  for (const item of items || []) {
    const id = item && item[idKey];
    if (id) map.set(id, item);
  }
  return map;
}

function diffCollection(items, counts, kind, field, kindLabel, idKey, baseData, currentData) {
  const base = mapById(baseData?.[field] || [], idKey);
  const current = mapById(currentData?.[field] || [], idKey);
  const ids = new Set([...base.keys(), ...current.keys()]);
  for (const id of [...ids].sort()) {
    if (!base.has(id)) addChange(items, counts, kind, kindLabel, id, 'added');
    else if (!current.has(id)) addChange(items, counts, kind, kindLabel, id, 'removed');
    else if (stableStringify(base.get(id)) !== stableStringify(current.get(id))) {
      addChange(items, counts, kind, kindLabel, id, 'modified', diffValues(base.get(id), current.get(id)));
    }
  }
}

function diffDialogues(items, counts, baseData, currentData) {
  const base = baseData?.dialogues || {};
  const current = currentData?.dialogues || {};
  const ids = new Set([...Object.keys(base), ...Object.keys(current)]);
  for (const id of [...ids].sort()) {
    if (!(id in base)) addChange(items, counts, 'dialogue', '对话', id, 'added');
    else if (!(id in current)) addChange(items, counts, 'dialogue', '对话', id, 'removed');
    else if (stableStringify(base[id]) !== stableStringify(current[id])) {
      addChange(items, counts, 'dialogue', '对话', id, 'modified', diffValues(base[id], current[id]));
    }
  }
}

export function diffContent(baseData, currentData) {
  const items = [];
  const counts = { added: 0, removed: 0, modified: 0 };
  for (const [kind, field, kindLabel, idKey = 'id'] of COLLECTIONS) {
    diffCollection(items, counts, kind, field, kindLabel, idKey, baseData, currentData);
  }
  diffDialogues(items, counts, baseData, currentData);
  if (stableStringify(baseData?.game_config || {}) !== stableStringify(currentData?.game_config || {})) {
    addChange(items, counts, 'game_config', '配置', 'game_config', 'modified', diffValues(baseData?.game_config || {}, currentData?.game_config || {}));
  }
  return { counts, items };
}

export function formatDiffSummary(diff) {
  const counts = diff?.counts || {};
  return `新增 ${counts.added || 0} / 删除 ${counts.removed || 0} / 修改 ${counts.modified || 0}`;
}
