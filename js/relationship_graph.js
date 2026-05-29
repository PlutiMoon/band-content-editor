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

function addIssue(issues, issue) {
  const key = `${issue.type}:${issue.source}:${issue.target || ''}:${issue.title}`;
  if (!issues.has(key)) issues.set(key, { key, ...issue });
}

function knownIdsFor(project) {
  return {
    map: new Set((project?.maps || []).map(item => item.id).filter(Boolean)),
    location: new Set((project?.locations || []).map(item => item.id).filter(Boolean)),
    action: new Set((project?.actions || []).map(item => item.id).filter(Boolean)),
    event: new Set((project?.events || []).map(item => item.id).filter(Boolean)),
    dialogue: new Set(Object.keys(project?.dialogues || {})),
    npc: new Set((project?.npcs || []).map(item => item.id).filter(Boolean)),
  };
}

function hasKnown(knownIds, kind, id) {
  return !id || knownIds[kind]?.has(id);
}

function addMissingReferenceIssue(issues, knownIds, sourceKind, sourceId, targetKind, targetId, label) {
  if (!targetId || hasKnown(knownIds, targetKind, targetId)) return;
  addIssue(issues, {
    type: 'missing_reference',
    severity: 'error',
    source: nodeKey(sourceKind, sourceId),
    target: nodeKey(targetKind, targetId),
    sourceKind,
    sourceId,
    targetKind,
    targetId,
    title: '缺失引用',
    detail: `${label} 指向不存在的 ${KIND_LABELS[targetKind] || targetKind}: ${targetId}`,
  });
}

function addRelationshipEdges(edges, source, obj) {
  for (const rel of (obj && Array.isArray(obj.relationships) ? obj.relationships : [])) {
    if (!rel.npc_id) continue;
    addEdge(edges, source, nodeKey('npc', rel.npc_id), EDGE_LABELS.relationship, 'relationship');
  }
}

function addRelationshipIssues(issues, knownIds, sourceKind, sourceId, obj, label) {
  for (const rel of (obj && Array.isArray(obj.relationships) ? obj.relationships : [])) {
    addMissingReferenceIssue(issues, knownIds, sourceKind, sourceId, 'npc', rel.npc_id, label);
  }
}

function addIsolatedNodeIssues(issues, nodes, edges) {
  const degree = new Map(nodes.map(node => [node.key, 0]));
  for (const edge of edges) {
    if (!degree.has(edge.source) || !degree.has(edge.target)) continue;
    degree.set(edge.source, degree.get(edge.source) + 1);
    degree.set(edge.target, degree.get(edge.target) + 1);
  }
  for (const node of nodes) {
    if (degree.get(node.key) !== 0) continue;
    addIssue(issues, {
      type: 'isolated_node',
      severity: 'warning',
      source: node.key,
      sourceKind: node.kind,
      sourceId: node.id,
      title: '孤立节点',
      detail: `${node.kindLabel} ${node.id} 没有任何可见关系`,
    });
  }
}

function layoutGraph(nodes, edges, issues = []) {
  const nodeKeys = new Set(nodes.map(node => node.key));
  const visibleEdges = edges.filter(edge => nodeKeys.has(edge.source) && nodeKeys.has(edge.target));
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
    edges: visibleEdges,
    issues,
    width: 80 + Object.keys(KIND_COLUMNS).length * 180,
    height: 120 + maxRows * 82,
  };
}

function filterGraphByKeys(graph, keptKeys) {
  const nodes = (graph.nodes || []).filter(node => keptKeys.has(node.key));
  const edges = (graph.edges || []).filter(edge => keptKeys.has(edge.source) && keptKeys.has(edge.target));
  const issues = (graph.issues || []).filter(issue => keptKeys.has(issue.source) || keptKeys.has(issue.target));
  return layoutGraph(nodes, edges, issues);
}

export function buildContentGraph(project) {
  const nodeMap = new Map();
  const edgeMap = new Map();
  const issueMap = new Map();
  const knownIds = knownIdsFor(project);

  for (const map of project?.maps || []) {
    addNode(nodeMap, 'map', map.id, labelFor(map, map.id));
  }
  for (const location of project?.locations || []) {
    const locationKey = addNode(nodeMap, 'location', location.id, labelFor(location, location.id));
    const mapKey = addNode(nodeMap, 'map', location.map_id, location.map_id);
    addMissingReferenceIssue(issueMap, knownIds, 'location', location.id, 'map', location.map_id, '所属地图');
    addEdge(edgeMap, mapKey, locationKey, EDGE_LABELS.map_location, 'map_location');
  }
  for (const action of project?.actions || []) {
    const actionKey = addNode(nodeMap, 'action', action.id, labelFor(action, action.id));
    const locationKey = addNode(nodeMap, 'location', action.location, action.location);
    addMissingReferenceIssue(issueMap, knownIds, 'action', action.id, 'location', action.location, '行动地点');
    addEdge(edgeMap, locationKey, actionKey, EDGE_LABELS.location_action, 'location_action');
    addRelationshipEdges(edgeMap, actionKey, action.requirements);
    addRelationshipEdges(edgeMap, actionKey, action.effects);
    addRelationshipIssues(issueMap, knownIds, 'action', action.id, action.requirements, '行动关系要求');
    addRelationshipIssues(issueMap, knownIds, 'action', action.id, action.effects, '行动关系变化');
  }
  for (const event of project?.events || []) {
    const eventKey = addNode(nodeMap, 'event', event.id, labelFor(event, event.id));
    if (event.trigger_type === 'action_complete' && event.trigger_detail) {
      addMissingReferenceIssue(issueMap, knownIds, 'event', event.id, 'action', event.trigger_detail, '行动触发器');
      addEdge(edgeMap, nodeKey('action', event.trigger_detail), eventKey, EDGE_LABELS.action_event, 'action_event');
    }
    if (event.trigger_type === 'location' && event.trigger_detail) {
      addMissingReferenceIssue(issueMap, knownIds, 'event', event.id, 'location', event.trigger_detail, '地点触发器');
      addEdge(edgeMap, nodeKey('location', event.trigger_detail), eventKey, EDGE_LABELS.location_event, 'location_event');
    }
    if (event.effects && event.effects.dialogue) {
      addMissingReferenceIssue(issueMap, knownIds, 'event', event.id, 'dialogue', event.effects.dialogue, '事件打开对话');
      addEdge(edgeMap, eventKey, nodeKey('dialogue', event.effects.dialogue), EDGE_LABELS.event_dialogue, 'event_dialogue');
    }
    addRelationshipEdges(edgeMap, eventKey, event.conditions);
    addRelationshipEdges(edgeMap, eventKey, event.effects);
    addRelationshipIssues(issueMap, knownIds, 'event', event.id, event.conditions, '事件关系条件');
    addRelationshipIssues(issueMap, knownIds, 'event', event.id, event.effects, '事件关系变化');
  }
  for (const [id, dialogue] of Object.entries(project?.dialogues || {})) {
    const dialogueKey = addNode(nodeMap, 'dialogue', id, dialogue.name || id);
    for (const node of dialogue.nodes || []) {
      addRelationshipEdges(edgeMap, dialogueKey, node.effects);
      addRelationshipIssues(issueMap, knownIds, 'dialogue', id, node.effects, `对话节点 ${node.id} 关系变化`);
    }
  }
  for (const npc of project?.npcs || []) {
    const npcKey = addNode(nodeMap, 'npc', npc.id, labelFor(npc, npc.id));
    const mapKey = addNode(nodeMap, 'map', npc.map_id, npc.map_id);
    addMissingReferenceIssue(issueMap, knownIds, 'npc', npc.id, 'map', npc.map_id, 'NPC 所在地图');
    addEdge(edgeMap, mapKey, npcKey, EDGE_LABELS.map_npc, 'map_npc');
    if (npc.dialogue_id) {
      addMissingReferenceIssue(issueMap, knownIds, 'npc', npc.id, 'dialogue', npc.dialogue_id, 'NPC 默认对话');
      addEdge(edgeMap, npcKey, nodeKey('dialogue', npc.dialogue_id), EDGE_LABELS.npc_dialogue, 'npc_dialogue');
    }
  }

  const nodes = [...nodeMap.values()];
  const edges = [...edgeMap.values()];
  addIsolatedNodeIssues(issueMap, nodes, edges);
  return layoutGraph(nodes, edges, [...issueMap.values()]);
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
  const keptIssues = (graph.issues || []).filter(issue => {
    if (keptKeys.has(issue.source) || keptKeys.has(issue.target)) return true;
    return issue.sourceKind === kind || issue.targetKind === kind;
  });
  return layoutGraph((graph.nodes || []).filter(node => keptKeys.has(node.key)), keptEdges, keptIssues);
}

export function filterIssueGraph(graph) {
  const nodeKeys = new Set((graph.nodes || []).map(node => node.key));
  const keptKeys = new Set();
  for (const issue of graph.issues || []) {
    if (nodeKeys.has(issue.source)) keptKeys.add(issue.source);
    if (nodeKeys.has(issue.target)) keptKeys.add(issue.target);
  }
  return filterGraphByKeys(graph, keptKeys);
}

export function filterNeighborhoodGraph(graph, selectedKey) {
  if (!selectedKey) return graph;
  const keptKeys = new Set([selectedKey]);
  for (const edge of graph.edges || []) {
    if (edge.source === selectedKey) keptKeys.add(edge.target);
    if (edge.target === selectedKey) keptKeys.add(edge.source);
  }
  return filterGraphByKeys(graph, keptKeys);
}
