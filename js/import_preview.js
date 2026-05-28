const TYPE_LABELS = {
  actions: '行动',
  events: '事件',
  locations: '地点',
  maps: '地图',
  npcs: 'NPC',
  phone: '手机聊天',
  dialogues: '对话',
  game_config: '游戏配置',
};

function stripJson(fileName) {
  return String(fileName || '').replace(/\.json$/i, '');
}

function currentItems(type, data) {
  if (type === 'phone') return data?.phone_chats || [];
  if (type === 'actions') return data?.actions || [];
  if (type === 'events') return data?.events || [];
  if (type === 'locations') return data?.locations || [];
  if (type === 'maps') return data?.maps || [];
  if (type === 'npcs') return data?.npcs || [];
  return [];
}

function idKeyFor(type) {
  return type === 'phone' ? 'chat_id' : 'id';
}

function addCount(counts, operation) {
  counts[operation] = (counts[operation] || 0) + 1;
}

function operationForArrayItem(type, item, currentIds) {
  const id = item && item[idKeyFor(type)];
  return {
    id: id || '(missing id)',
    operation: id && currentIds.has(id) ? 'overwrite' : 'create',
  };
}

export function buildImportPreview(type, entries, currentData) {
  const counts = { create: 0, overwrite: 0, replace: 0, invalid: 0 };
  const items = [];
  const idKey = idKeyFor(type);
  const currentIds = new Set(currentItems(type, currentData).map(item => item && item[idKey]).filter(Boolean));
  const dialogueIds = new Set(Object.keys(currentData?.dialogues || {}));

  for (const entry of entries || []) {
    if (entry.error) {
      addCount(counts, 'invalid');
      items.push({ fileName: entry.fileName, operation: 'invalid', error: entry.error });
      continue;
    }

    if (type === 'game_config') {
      addCount(counts, 'replace');
      items.push({ fileName: entry.fileName, id: 'game_config', operation: 'replace' });
      continue;
    }

    if (type === 'dialogues') {
      const id = entry.payload?.dialogue_id || stripJson(entry.fileName);
      const operation = dialogueIds.has(id) ? 'overwrite' : 'create';
      addCount(counts, operation);
      items.push({ fileName: entry.fileName, id, operation });
      continue;
    }

    const payloadItems = Array.isArray(entry.payload) ? entry.payload : [entry.payload];
    for (const item of payloadItems) {
      const result = operationForArrayItem(type, item, currentIds);
      addCount(counts, result.operation);
      items.push({ fileName: entry.fileName, id: result.id, operation: result.operation });
    }
  }

  return {
    type,
    label: TYPE_LABELS[type] || type,
    counts,
    items,
    importableCount: counts.create + counts.overwrite + counts.replace,
  };
}

export function formatImportPreview(preview) {
  const counts = preview?.counts || {};
  const lines = [
    `导入预览：${preview?.label || preview?.type || ''}`,
    `新增 ${counts.create || 0} / 覆盖 ${counts.overwrite || 0} / 替换 ${counts.replace || 0} / 错误 ${counts.invalid || 0}`,
  ];
  const shown = (preview?.items || []).slice(0, 10);
  for (const item of shown) {
    const label = item.operation === 'create' ? '新增'
      : item.operation === 'overwrite' ? '覆盖'
      : item.operation === 'replace' ? '替换'
      : '错误';
    const detail = item.error ? `：${item.error}` : `：${item.id}`;
    lines.push(`- ${label} ${item.fileName}${detail}`);
  }
  if ((preview?.items || []).length > shown.length) {
    lines.push(`- 还有 ${(preview.items || []).length - shown.length} 项未显示`);
  }
  return lines.join('\n');
}
