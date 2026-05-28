const RUNTIME_TRIGGERS = new Set(['phase_start', 'action_complete', 'location', 'stat_threshold', 'week_end']);

function issue(severity, area, code, message, extra = {}) {
  return { severity, area, code, message, ...extra };
}

function idOf(value) {
  return String(value || '').trim();
}

function hasId(items, id) {
  return (items || []).some(item => item && item.id === id);
}

function addDuplicateIdIssues(issues, items, area, label) {
  const seen = new Set();
  for (const item of items || []) {
    const id = idOf(item && item.id);
    if (!id) continue;
    if (seen.has(id)) {
      issues.push(issue('error', area, `duplicate_${label}_id`, `${area}: ID 重复 ${id}`, { id }));
    }
    seen.add(id);
  }
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validateDialogue(issues, dialogueId, dialogue) {
  const nodes = Array.isArray(dialogue && dialogue.nodes) ? dialogue.nodes : [];
  const byId = new Map();

  for (const node of nodes) {
    const nodeId = idOf(node && node.id);
    if (!nodeId) {
      issues.push(issue('error', 'dialogues', 'dialogue_node_missing_id', `${dialogueId}: 节点缺少 ID`, { dialogueId }));
      continue;
    }
    if (byId.has(nodeId)) {
      issues.push(issue('error', 'dialogues', 'dialogue_duplicate_node', `${dialogueId}: 节点重复 ${nodeId}`, { dialogueId, nodeId }));
    }
    byId.set(nodeId, node);
  }

  if (!byId.has('start')) {
    issues.push(issue('error', 'dialogues', 'dialogue_missing_start', `${dialogueId}: 缺少 start 节点`, { dialogueId }));
  }
  if (!byId.has('end')) {
    issues.push(issue('error', 'dialogues', 'dialogue_missing_end', `${dialogueId}: 缺少 end 节点`, { dialogueId }));
  }

  for (const node of nodes) {
    const nodeId = idOf(node && node.id);
    const next = idOf(node && node.next);
    if (next && !byId.has(next)) {
      issues.push(issue('error', 'dialogues', 'dialogue_missing_next', `${dialogueId}/${nodeId}: next 指向不存在节点 ${next}`, { dialogueId, nodeId, next }));
    }
    for (const choice of node.choices || []) {
      const choiceNext = idOf(choice && choice.next);
      if (choiceNext && !byId.has(choiceNext)) {
        issues.push(issue('error', 'dialogues', 'dialogue_missing_choice_next', `${dialogueId}/${nodeId}: 选项指向不存在节点 ${choiceNext}`, { dialogueId, nodeId, next: choiceNext }));
      }
    }
  }
}

export function runHealthCheck(project) {
  const data = project || {};
  const issues = [];
  const actions = data.actions || [];
  const events = data.events || [];
  const locations = data.locations || [];
  const maps = data.maps || [];
  const npcs = data.npcs || [];
  const phoneChats = data.phone_chats || [];
  const dialogues = data.dialogues || {};
  const gameConfig = data.game_config || {};

  const actionIds = new Set(actions.map(a => a && a.id));
  const eventIds = new Set(events.map(e => e && e.id));
  const locationIds = new Set(locations.map(l => l && l.id));
  const mapIds = new Set(maps.map(m => m && m.id));
  const dialogueIds = new Set(Object.keys(dialogues));

  addDuplicateIdIssues(issues, actions, 'actions', 'action');
  addDuplicateIdIssues(issues, events, 'events', 'event');
  addDuplicateIdIssues(issues, locations, 'locations', 'location');
  addDuplicateIdIssues(issues, maps, 'maps', 'map');
  addDuplicateIdIssues(issues, npcs, 'npcs', 'npc');

  for (const action of actions) {
    if (action.location && !locationIds.has(action.location)) {
      issues.push(issue('error', 'actions', 'action_unknown_location', `行动 ${action.id} 引用了不存在的地点 ${action.location}`, { actionId: action.id, locationId: action.location }));
    }
    if (action.time_cost !== undefined && action.time_cost !== null && !isNonNegativeInteger(action.time_cost)) {
      issues.push(issue('error', 'actions', 'action_invalid_time_cost', `行动 ${action.id} 的 time_cost 必须是非负整数`, { actionId: action.id }));
    }
    if (action.max_per_day !== undefined && action.max_per_day !== null && !isNonNegativeInteger(action.max_per_day)) {
      issues.push(issue('error', 'actions', 'action_invalid_max_per_day', `行动 ${action.id} 的 max_per_day 必须是非负整数`, { actionId: action.id }));
    }
  }

  for (const event of events) {
    if (!RUNTIME_TRIGGERS.has(event.trigger_type)) {
      issues.push(issue('warning', 'events', 'runtime_trigger_not_wired', `事件 ${event.id} 使用了未接入运行时的触发类型 ${event.trigger_type}`, { eventId: event.id }));
    }
    if (event.trigger_type === 'action_complete') {
      if (!event.trigger_detail) {
        issues.push(issue('error', 'events', 'event_action_trigger_missing_detail', `事件 ${event.id} 缺少行动触发详情`, { eventId: event.id }));
      } else if (!actionIds.has(event.trigger_detail)) {
        issues.push(issue('error', 'events', 'event_action_missing', `事件 ${event.id} 引用了不存在的行动 ${event.trigger_detail}`, { eventId: event.id, actionId: event.trigger_detail }));
      }
    }
    if (event.trigger_type === 'location') {
      if (!event.trigger_detail) {
        issues.push(issue('error', 'events', 'event_location_trigger_missing_detail', `事件 ${event.id} 缺少地点触发详情`, { eventId: event.id }));
      } else if (!locationIds.has(event.trigger_detail)) {
        issues.push(issue('error', 'events', 'event_location_missing', `事件 ${event.id} 引用了不存在的地点 ${event.trigger_detail}`, { eventId: event.id, locationId: event.trigger_detail }));
      }
    }
    if (event.effects && event.effects.dialogue && !dialogueIds.has(event.effects.dialogue)) {
      issues.push(issue('error', 'events', 'event_dialogue_missing', `事件 ${event.id} 引用了不存在的对话 ${event.effects.dialogue}`, { eventId: event.id, dialogueId: event.effects.dialogue }));
    }
  }

  for (const location of locations) {
    if (location.map_id && !mapIds.has(location.map_id)) {
      issues.push(issue('error', 'locations', 'location_unknown_map', `地点 ${location.id} 引用了不存在的地图 ${location.map_id}`, { locationId: location.id, mapId: location.map_id }));
    }
  }

  for (const map of maps) {
    if (map.width !== undefined && map.width !== null && !isPositiveNumber(map.width)) {
      issues.push(issue('error', 'maps', 'map_invalid_width', `地图 ${map.id} 宽度必须大于 0`, { mapId: map.id }));
    }
    if (map.height !== undefined && map.height !== null && !isPositiveNumber(map.height)) {
      issues.push(issue('error', 'maps', 'map_invalid_height', `地图 ${map.id} 高度必须大于 0`, { mapId: map.id }));
    }
  }

  for (const npc of npcs) {
    if (npc.map_id && !mapIds.has(npc.map_id)) {
      issues.push(issue('error', 'npcs', 'npc_unknown_map', `NPC ${npc.id} 引用了不存在的地图 ${npc.map_id}`, { npcId: npc.id, mapId: npc.map_id }));
    }
    if (npc.dialogue_id && !dialogueIds.has(npc.dialogue_id)) {
      issues.push(issue('error', 'npcs', 'npc_dialogue_missing', `NPC ${npc.id} 引用了不存在的对话 ${npc.dialogue_id}`, { npcId: npc.id, dialogueId: npc.dialogue_id }));
    }
  }

  for (const chat of phoneChats) {
    for (const msg of chat.messages || []) {
      if (msg.trigger_event && !eventIds.has(msg.trigger_event)) {
        issues.push(issue('error', 'phone', 'phone_unknown_event', `手机消息 ${chat.chat_id}/${msg.id} 引用了不存在的事件 ${msg.trigger_event}`, { chatId: chat.chat_id, messageId: msg.id, eventId: msg.trigger_event }));
      }
    }
  }

  if (gameConfig.starting_map && !mapIds.has(gameConfig.starting_map)) {
    issues.push(issue('error', 'game_config', 'game_config_unknown_starting_map', `初始地图不存在：${gameConfig.starting_map}`, { mapId: gameConfig.starting_map }));
  }
  if (gameConfig.starting_location && !locationIds.has(gameConfig.starting_location)) {
    issues.push(issue('error', 'game_config', 'game_config_unknown_starting_location', `初始地点不存在：${gameConfig.starting_location}`, { locationId: gameConfig.starting_location }));
  }

  for (const [dialogueId, dialogue] of Object.entries(dialogues)) {
    validateDialogue(issues, dialogueId, dialogue);
  }

  return issues;
}
