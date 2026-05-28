const KIND_COLUMNS = {
  map: 0,
  location: 1,
  action: 2,
  event: 3,
  dialogue: 4,
  npc: 5,
};

const KIND_LABELS = {
  map: '地图',
  location: '地点',
  action: '行动',
  event: '事件',
  dialogue: '对话',
  npc: 'NPC',
};

const EDGE_LABELS = {
  map_location: '包含地点',
  map_npc: 'NPC 所在',
  location_action: '行动地点',
  location_event: '地点触发',
  action_event: '行动触发',
  event_dialogue: '打开对话',
  npc_dialogue: '默认对话',
  relationship: '关系影响/条件',
};

function nodeKey(kind, id) {
  return `${kind}:${id}`;
}

function labelFor(item, fallback) {
  return item && item.name ? item.name : fallback;
}

function addNode(nodes, kind, id, label) {
  if (!id) return null;
  const key = nodeKey(kind, id);
  if (!nodes.has(key)) {
    nodes.set(key, {
      key,
      kind,
      id,
      label: label || id,
      kindLabel: KIND_LABELS[kind] || kind,
    });
  }
  return key;
}

function addEdge(edges, source, target, label, type) {
  if (!source || !target || source === target) return;
  const key = `${source}->${target}:${type || label}`;
  if (!edges.has(key)) {
    edges.set(key, { key, source, target, label, type });
  }
}

function addRelationshipEdges(edges, source, obj) {
  for (const rel of (obj && Array.isArray(obj.relationships) ? obj.relationships : [])) {
    if (!rel.npc_id) continue;
    addEdge(edges, source, nodeKey('npc', rel.npc_id), EDGE_LABELS.relationship, 'relationship');
  }
}

function layoutGraph(nodes, edges) {
  const rowsByKind = new Map();
  const laidOut = nodes.map(node => {
    const col = KIND_COLUMNS[node.kind] ?? 0;
    const row = rowsByKind.get(node.kind) || 0;
    rowsByKind.set(node.kind, row + 1);
    return {
      ...node,
      x: 80 + col * 180,
      y: 60 + row * 82,
    };
  });

  const maxRows = Math.max(1, ...rowsByKind.values());
  return {
    nodes: laidOut,
    edges,
    width: 80 + Object.keys(KIND_COLUMNS).length * 180,
    height: 120 + maxRows * 82,
  };
}

export function buildContentGraph(project) {
  const nodeMap = new Map();
  const edgeMap = new Map();

  for (const map of project?.maps || []) {
    addNode(nodeMap, 'map', map.id, labelFor(map, map.id));
  }
  for (const location of project?.locations || []) {
    const locationKey = addNode(nodeMap, 'location', location.id, labelFor(location, location.id));
    const mapKey = addNode(nodeMap, 'map', location.map_id, location.map_id);
    addEdge(edgeMap, mapKey, locationKey, EDGE_LABELS.map_location, 'map_location');
  }
  for (const action of project?.actions || []) {
    const actionKey = addNode(nodeMap, 'action', action.id, labelFor(action, action.id));
    const locationKey = addNode(nodeMap, 'location', action.location, action.location);
    addEdge(edgeMap, locationKey, actionKey, EDGE_LABELS.location_action, 'location_action');
    addRelationshipEdges(edgeMap, actionKey, action.requirements);
    addRelationshipEdges(edgeMap, actionKey, action.effects);
  }
  for (const event of project?.events || []) {
    const eventKey = addNode(nodeMap, 'event', event.id, labelFor(event, event.id));
    if (event.trigger_type === 'action_complete' && event.trigger_detail) {
      addEdge(edgeMap, nodeKey('action', event.trigger_detail), eventKey, EDGE_LABELS.action_event, 'action_event');
    }
    if (event.trigger_type === 'location' && event.trigger_detail) {
      addEdge(edgeMap, nodeKey('location', event.trigger_detail), eventKey, EDGE_LABELS.location_event, 'location_event');
    }
    if (event.effects && event.effects.dialogue) {
      addEdge(edgeMap, eventKey, nodeKey('dialogue', event.effects.dialogue), EDGE_LABELS.event_dialogue, 'event_dialogue');
    }
    addRelationshipEdges(edgeMap, eventKey, event.conditions);
    addRelationshipEdges(edgeMap, eventKey, event.effects);
  }
  for (const [id, dialogue] of Object.entries(project?.dialogues || {})) {
    const dialogueKey = addNode(nodeMap, 'dialogue', id, dialogue.name || id);
    for (const node of dialogue.nodes || []) {
      addRelationshipEdges(edgeMap, dialogueKey, node.effects);
    }
  }
  for (const npc of project?.npcs || []) {
    const npcKey = addNode(nodeMap, 'npc', npc.id, labelFor(npc, npc.id));
    const mapKey = addNode(nodeMap, 'map', npc.map_id, npc.map_id);
    addEdge(edgeMap, mapKey, npcKey, EDGE_LABELS.map_npc, 'map_npc');
    if (npc.dialogue_id) {
      addEdge(edgeMap, npcKey, nodeKey('dialogue', npc.dialogue_id), EDGE_LABELS.npc_dialogue, 'npc_dialogue');
    }
  }

  return layoutGraph([...nodeMap.values()], [...edgeMap.values()]);
}

export function filterContentGraph(graph, kind) {
  if (!kind || kind === 'all') return graph;
  const nodeByKey = new Map((graph.nodes || []).map(node => [node.key, node]));
  const keptEdges = (graph.edges || []).filter(edge => {
    const source = nodeByKey.get(edge.source);
    const target = nodeByKey.get(edge.target);
    return source?.kind === kind || target?.kind === kind;
  });
  const keptKeys = new Set((graph.nodes || []).filter(node => node.kind === kind).map(node => node.key));
  for (const edge of keptEdges) {
    keptKeys.add(edge.source);
    keptKeys.add(edge.target);
  }
  return layoutGraph((graph.nodes || []).filter(node => keptKeys.has(node.key)), keptEdges);
}
