function ensureId(id) {
  const value = String(id || '').trim();
  if (!value) throw new Error('id required');
  return value;
}

function assertUnique(items, id, label) {
  if ((items || []).some(item => item && item.id === id)) {
    throw new Error(`${label} already exists: ${id}`);
  }
}

function assertDialogueUnique(dialogues, id) {
  if (dialogues && dialogues[id]) throw new Error(`dialogue already exists: ${id}`);
}

function firstId(items) {
  return (items || []).find(item => item && item.id)?.id || '';
}

function findById(items, id) {
  return (items || []).find(item => item && item.id === id);
}

export function createActionTemplate(project, options = {}) {
  const id = ensureId(options.id);
  assertUnique(project?.actions || [], id, 'action');
  return {
    id,
    name: options.name || '模板行动',
    description: options.description || '',
    location: options.location || firstId(project?.locations) || '',
    time_cost: 1,
    max_per_day: 1,
    requirements: {},
    effects: {},
  };
}

export function createActionEventTemplate(project, options = {}) {
  const id = ensureId(options.id);
  const actionId = ensureId(options.actionId || firstId(project?.actions));
  assertUnique(project?.events || [], id, 'event');
  if (!findById(project?.actions || [], actionId)) throw new Error(`missing action: ${actionId}`);
  return {
    id,
    name: options.name || '行动完成事件',
    trigger_type: 'action_complete',
    trigger_detail: actionId,
    conditions: {},
    effects: {},
    one_shot: true,
  };
}

export function createLocationEventTemplate(project, options = {}) {
  const id = ensureId(options.id);
  const locationId = ensureId(options.locationId || firstId(project?.locations));
  assertUnique(project?.events || [], id, 'event');
  if (!findById(project?.locations || [], locationId)) throw new Error(`missing location: ${locationId}`);
  return {
    id,
    name: options.name || '地点触发事件',
    trigger_type: 'location',
    trigger_detail: locationId,
    conditions: {},
    effects: {},
    one_shot: true,
  };
}

export function createNPCDialogueTemplate(project, options = {}) {
  const id = ensureId(options.id);
  const npcId = ensureId(options.npcId || firstId(project?.npcs));
  assertDialogueUnique(project?.dialogues || {}, id);
  const npc = findById(project?.npcs || [], npcId);
  if (!npc) throw new Error(`missing npc: ${npcId}`);
  return {
    dialogue_id: id,
    nodes: [
      { id: 'start', speaker: npc.name || npc.id, text: '你好。', next: 'end' },
      { id: 'end', speaker: '', text: '' },
    ],
  };
}
