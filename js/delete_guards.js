const KIND_LABELS = {
  action: '行动',
  event: '事件',
  dialogue: '对话',
  location: '地点',
  map: '地图',
  npc: 'NPC',
};

function relationshipRefs(obj, npcId) {
  return (obj && Array.isArray(obj.relationships) && obj.relationships.some(r => r.npc_id === npcId));
}

function addActionReferences(refs, project, id) {
  for (const event of project.events || []) {
    if (event.trigger_type === 'action_complete' && event.trigger_detail === id) {
      refs.push(`事件 ${event.id}`);
    }
  }
}

function addEventReferences(refs, project, id) {
  for (const chat of project.phone_chats || []) {
    for (const msg of chat.messages || []) {
      if (msg.trigger_event === id) refs.push(`手机 ${chat.chat_id}/${msg.id}`);
    }
  }
}

function addDialogueReferences(refs, project, id) {
  for (const event of project.events || []) {
    if (event.effects && event.effects.dialogue === id) refs.push(`事件 ${event.id}`);
  }
  for (const npc of project.npcs || []) {
    if (npc.dialogue_id === id) refs.push(`NPC ${npc.id}`);
  }
}

function addLocationReferences(refs, project, id) {
  for (const action of project.actions || []) {
    if (action.location === id) refs.push(`行动 ${action.id}`);
  }
  for (const event of project.events || []) {
    if (event.trigger_type === 'location' && event.trigger_detail === id) refs.push(`事件 ${event.id}`);
  }
  if (project.game_config && project.game_config.starting_location === id) refs.push('初始地点');
}

function addMapReferences(refs, project, id) {
  for (const location of project.locations || []) {
    if (location.map_id === id) refs.push(`地点 ${location.id}`);
  }
  for (const npc of project.npcs || []) {
    if (npc.map_id === id) refs.push(`NPC ${npc.id}`);
  }
  if (project.game_config && project.game_config.starting_map === id) refs.push('初始地图');
}

function addNPCReferences(refs, project, id) {
  for (const action of project.actions || []) {
    if (relationshipRefs(action.requirements, id) || relationshipRefs(action.effects, id)) {
      refs.push(`行动 ${action.id}`);
    }
  }
  for (const event of project.events || []) {
    if (relationshipRefs(event.conditions, id) || relationshipRefs(event.effects, id)) {
      refs.push(`事件 ${event.id}`);
    }
  }
  for (const [dialogueId, dialogue] of Object.entries(project.dialogues || {})) {
    for (const node of dialogue.nodes || []) {
      if (relationshipRefs(node.effects, id)) refs.push(`对话 ${dialogueId}/${node.id}`);
    }
  }
}

export function findDeleteReferences(kind, id, project) {
  const refs = [];
  if (!project || !id) return refs;
  if (kind === 'action') addActionReferences(refs, project, id);
  if (kind === 'event') addEventReferences(refs, project, id);
  if (kind === 'dialogue') addDialogueReferences(refs, project, id);
  if (kind === 'location') addLocationReferences(refs, project, id);
  if (kind === 'map') addMapReferences(refs, project, id);
  if (kind === 'npc') addNPCReferences(refs, project, id);
  return [...new Set(refs)];
}

export function formatDeleteBlocker(kind, id, project) {
  const refs = findDeleteReferences(kind, id, project);
  if (!refs.length) return null;
  const label = KIND_LABELS[kind] || kind;
  const shown = refs.slice(0, 5);
  const suffix = refs.length > shown.length ? ` 等 ${refs.length} 处` : '';
  return `不能删除${label} ${id}：被 ${shown.join('、')} 引用${suffix}`;
}

export function formatReferenceSummary(kind, id, project) {
  const refs = findDeleteReferences(kind, id, project);
  if (!refs.length) return '未被引用';
  const shown = refs.slice(0, 3);
  const suffix = refs.length > shown.length ? ` 等 ${refs.length} 处` : '';
  return `被 ${refs.length} 处引用：${shown.join('、')}${suffix}`;
}
