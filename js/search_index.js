const KIND_LABELS = {
  action: '行动',
  event: '事件',
  dialogue: '对话',
  phone: '手机',
  map: '地图',
  location: '地点',
  npc: 'NPC',
  game_config: '配置',
};

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function compactJson(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function addRecord(records, kind, id, path, label, parts, body) {
  records.push({
    kind,
    kindLabel: KIND_LABELS[kind] || kind,
    id,
    path,
    label: label || id || path,
    haystack: parts.concat(body || []).filter(Boolean).map(compactJson).join(' '),
    body: (body || []).filter(Boolean).map(compactJson).join(' '),
  });
}

function buildRecords(project) {
  const records = [];

  for (const action of project?.actions || []) {
    addRecord(records, 'action', action.id, `action:${action.id}`, action.name || action.id, [
      action.id, action.name, action.description, action.location,
    ], [action.requirements, action.effects]);
  }

  for (const event of project?.events || []) {
    addRecord(records, 'event', event.id, `event:${event.id}`, event.name || event.id, [
      event.id, event.name, event.trigger_type, event.trigger_detail,
    ], [event.conditions, event.effects]);
  }

  for (const [dialogueId, dialogue] of Object.entries(project?.dialogues || {})) {
    addRecord(records, 'dialogue', dialogueId, `dialogue:${dialogueId}`, dialogue.name || dialogueId, [
      dialogueId, dialogue.name,
    ], []);
    for (const node of dialogue.nodes || []) {
      addRecord(records, 'dialogue', dialogueId, `dialogue:${dialogueId}/${node.id}`, `${dialogueId} / ${node.id}`, [
        dialogueId, node.id, node.speaker, node.text,
      ], [node.choices, node.effects]);
    }
  }

  for (const chat of project?.phone_chats || []) {
    addRecord(records, 'phone', chat.chat_id, `phone:${chat.chat_id}`, chat.chat_id, [chat.chat_id], []);
    for (const msg of chat.messages || []) {
      addRecord(records, 'phone', chat.chat_id, `phone:${chat.chat_id}/${msg.id}`, `${chat.chat_id} / ${msg.id}`, [
        chat.chat_id, msg.id, msg.sender, msg.text, msg.trigger_event,
      ], []);
    }
  }

  for (const map of project?.maps || []) {
    addRecord(records, 'map', map.id, `map:${map.id}`, map.name || map.id, [map.id, map.name, map.description], [map]);
  }

  for (const location of project?.locations || []) {
    addRecord(records, 'location', location.id, `location:${location.id}`, location.name || location.id, [
      location.id, location.name, location.description, location.map_id,
    ], [location]);
  }

  for (const npc of project?.npcs || []) {
    addRecord(records, 'npc', npc.id, `npc:${npc.id}`, npc.name || npc.id, [
      npc.id, npc.name, npc.description, npc.map_id, npc.dialogue_id,
    ], [npc]);
  }

  addRecord(records, 'game_config', 'game_config', 'game_config', '游戏配置', ['game_config'], [project?.game_config]);
  return records;
}

function scoreRecord(record, query) {
  const q = normalize(query);
  const path = normalize(record.path);
  const label = normalize(record.label);
  const haystack = normalize(record.haystack);
  if (!haystack.includes(q) && !path.includes(q) && !label.includes(q)) return 0;
  let score = 1;
  if (path === q || label === q) score += 10;
  else if (path.includes(q)) score += 6;
  else if (label.includes(q)) score += 4;
  if (normalize(record.body).includes(q)) score += 1;
  return score;
}

function snippetFor(record, query) {
  const source = record.haystack || record.label || record.path;
  const lowerSource = source.toLowerCase();
  const lowerQuery = normalize(query);
  const index = lowerSource.indexOf(lowerQuery);
  if (index < 0) return source.slice(0, 120);
  const start = Math.max(0, index - 36);
  const end = Math.min(source.length, index + lowerQuery.length + 60);
  return `${start > 0 ? '...' : ''}${source.slice(start, end)}${end < source.length ? '...' : ''}`;
}

export function searchContent(project, query, options = {}) {
  const q = normalize(query);
  if (!q) return [];
  const kind = options.kind && options.kind !== 'all' ? options.kind : '';
  return buildRecords(project)
    .filter(record => !kind || record.kind === kind)
    .map(record => ({ record, score: scoreRecord(record, q) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.record.path.localeCompare(b.record.path))
    .map(({ record, score }) => ({
      kind: record.kind,
      kindLabel: record.kindLabel,
      id: record.id,
      path: record.path,
      label: record.label,
      snippet: snippetFor(record, q),
      score,
    }));
}

export function resolveSearchNavigation(project, path) {
  if (!path) return null;
  if (path === 'game_config') return { tab: 'world', worldSection: 'config' };

  const [kind, rest = ''] = String(path).split(':');
  const [id] = rest.split('/');
  if (!id) return null;

  if (kind === 'action') {
    const selectedIdx = (project?.actions || []).findIndex(item => item.id === id);
    return selectedIdx >= 0 ? { tab: 'actions', selectedIdx } : null;
  }
  if (kind === 'event') {
    const selectedIdx = (project?.events || []).findIndex(item => item.id === id);
    return selectedIdx >= 0 ? { tab: 'events', selectedIdx } : null;
  }
  if (kind === 'dialogue') {
    const keys = Object.keys(project?.dialogues || {});
    const selectedDialogueIdx = keys.indexOf(id);
    return selectedDialogueIdx >= 0 ? { tab: 'dialogues', selectedDialogueIdx } : null;
  }
  if (kind === 'phone') {
    const selectedChatIdx = (project?.phone_chats || []).findIndex(item => item.chat_id === id);
    return selectedChatIdx >= 0 ? { tab: 'phone', selectedChatIdx } : null;
  }
  if (kind === 'location') {
    const selectedLocationIdx = (project?.locations || []).findIndex(item => item.id === id);
    return selectedLocationIdx >= 0 ? { tab: 'world', worldSection: 'locations', selectedLocationIdx } : null;
  }
  if (kind === 'map') {
    const selectedMapIdx = (project?.maps || []).findIndex(item => item.id === id);
    return selectedMapIdx >= 0 ? { tab: 'world', worldSection: 'maps', selectedMapIdx } : null;
  }
  if (kind === 'npc') {
    const selectedNPCIdx = (project?.npcs || []).findIndex(item => item.id === id);
    return selectedNPCIdx >= 0 ? { tab: 'world', worldSection: 'npcs', selectedNPCIdx } : null;
  }
  return null;
}
