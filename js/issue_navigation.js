const AREA_KIND = {
  actions: 'action',
  events: 'event',
  dialogues: 'dialogue',
  phone: 'phone',
  locations: 'location',
  maps: 'map',
  npcs: 'npc',
  game_config: 'game_config',
};

const GRAPH_KINDS = new Set(['map', 'location', 'action', 'event', 'dialogue', 'npc']);

function path(kind, id, childId = '') {
  if (!kind || !id) return null;
  return childId ? `${kind}:${id}/${childId}` : `${kind}:${id}`;
}

function isGraphNodeKey(value) {
  const [kind, id] = String(value || '').split(':');
  return GRAPH_KINDS.has(kind) && Boolean(id);
}

function ownerPathForIssue(issue) {
  if (issue.area === 'actions' && issue.actionId) return path('action', issue.actionId);
  if (issue.area === 'events' && issue.eventId) return path('event', issue.eventId);
  if (issue.area === 'dialogues' && issue.dialogueId) return path('dialogue', issue.dialogueId, issue.nodeId);
  if (issue.area === 'phone' && issue.chatId) return path('phone', issue.chatId, issue.messageId);
  if (issue.area === 'locations' && issue.locationId) return path('location', issue.locationId);
  if (issue.area === 'maps' && issue.mapId) return path('map', issue.mapId);
  if (issue.area === 'npcs' && issue.npcId) return path('npc', issue.npcId);
  if (issue.area === 'game_config') return 'game_config';
  if (issue.area && issue.id && AREA_KIND[issue.area]) return path(AREA_KIND[issue.area], issue.id);
  return null;
}

export function nodeKeyToContentPath(nodeKey) {
  return isGraphNodeKey(nodeKey) ? nodeKey : null;
}

export function issueToContentPath(issue) {
  if (!issue) return null;
  const ownerPath = ownerPathForIssue(issue);
  if (ownerPath) return ownerPath;
  if (issue.actionId) return path('action', issue.actionId);
  if (issue.eventId) return path('event', issue.eventId);
  if (issue.dialogueId) return path('dialogue', issue.dialogueId, issue.nodeId);
  if (issue.chatId) return path('phone', issue.chatId, issue.messageId);
  if (issue.locationId) return path('location', issue.locationId);
  if (issue.mapId) return path('map', issue.mapId);
  if (issue.npcId) return path('npc', issue.npcId);
  if (nodeKeyToContentPath(issue.source)) return issue.source;
  if (nodeKeyToContentPath(issue.target)) return issue.target;
  return null;
}

export function issueToGraphNodeKey(issue) {
  if (!issue) return null;
  if (isGraphNodeKey(issue.source)) return issue.source;
  if (isGraphNodeKey(issue.target)) return issue.target;
  const contentPath = issueToContentPath(issue);
  return nodeKeyToContentPath(contentPath);
}
