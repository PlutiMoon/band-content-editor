const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, 'js', 'delete_guards.js')).href);
  const graphMod = await import(pathToFileURL(path.join(__dirname, 'js', 'relationship_graph.js')).href);
  const { findDeleteReferences, formatDeleteBlocker, formatReferenceSummary, rewriteContentReferences } = mod;
  const { buildContentGraph, filterContentGraph } = graphMod;

  const project = {
    actions: [
      { id: 'practice', location: 'room', requirements: { relationships: [{ npc_id: 'npc_a', op: '>=', value: 0 }] }, effects: { relationships: [{ npc_id: 'npc_a', delta: 1 }] } },
      { id: 'sleep', location: 'bedroom' },
    ],
    events: [
      { id: 'after_practice', trigger_type: 'action_complete', trigger_detail: 'practice', effects: { dialogue: 'dlg_intro' } },
      { id: 'enter_room', trigger_type: 'location', trigger_detail: 'room', conditions: { relationships: [{ npc_id: 'npc_a', op: '>=', value: 1 }] }, effects: { relationships: [{ npc_id: 'npc_a', delta: 1 }] } },
    ],
    locations: [
      { id: 'room', map_id: 'town' },
      { id: 'bedroom', map_id: 'town' },
    ],
    maps: [{ id: 'town' }],
    npcs: [{ id: 'npc_a', map_id: 'town', dialogue_id: 'dlg_intro' }],
    phone_chats: [
      { chat_id: 'band', messages: [{ id: 'm1', sender: 'A', text: 'go', trigger_event: 'after_practice' }] },
    ],
    game_config: { starting_map: 'town', starting_location: 'room' },
    dialogues: {
      dlg_intro: { nodes: [{ id: 'start', text: 'hi', next: 'end', effects: { relationships: [{ npc_id: 'npc_a', delta: 1 }] } }, { id: 'end', text: '' }] },
      unused: { nodes: [{ id: 'start', text: '', next: 'end' }, { id: 'end', text: '' }] },
    },
  };

  assert(findDeleteReferences('location', 'room', project).some(r => r.includes('行动 practice')));
  assert(findDeleteReferences('location', 'room', project).some(r => r.includes('事件 enter_room')));
  assert(findDeleteReferences('location', 'room', project).some(r => r.includes('初始地点')));

  assert(findDeleteReferences('map', 'town', project).some(r => r.includes('地点 room')));
  assert(findDeleteReferences('map', 'town', project).some(r => r.includes('NPC npc_a')));
  assert(findDeleteReferences('map', 'town', project).some(r => r.includes('初始地图')));

  assert(findDeleteReferences('action', 'practice', project).some(r => r.includes('事件 after_practice')));
  assert(findDeleteReferences('event', 'after_practice', project).some(r => r.includes('手机 band/m1')));
  assert(findDeleteReferences('dialogue', 'dlg_intro', project).some(r => r.includes('事件 after_practice')));
  assert(findDeleteReferences('dialogue', 'dlg_intro', project).some(r => r.includes('NPC npc_a')));
  assert(findDeleteReferences('npc', 'npc_a', project).some(r => r.includes('行动 practice')));
  assert(findDeleteReferences('npc', 'npc_a', project).some(r => r.includes('事件 enter_room')));
  assert(findDeleteReferences('npc', 'npc_a', project).some(r => r.includes('对话 dlg_intro/start')));

  assert.strictEqual(formatDeleteBlocker('dialogue', 'unused', project), null);
  assert(formatDeleteBlocker('location', 'room', project).startsWith('不能删除地点 room'));
  assert.strictEqual(formatReferenceSummary('dialogue', 'unused', project), '未被引用');
  assert(formatReferenceSummary('location', 'room', project).includes('被 3 处引用'));

  const cloneProject = () => JSON.parse(JSON.stringify(project));

  const actionProject = cloneProject();
  const actionMigration = rewriteContentReferences('action', 'practice', 'practice_new', actionProject);
  assert(actionMigration.changed);
  assert(actionMigration.docs.includes('events'));
  assert.strictEqual(actionProject.events[0].trigger_detail, 'practice_new');

  const eventProject = cloneProject();
  const eventMigration = rewriteContentReferences('event', 'after_practice', 'after_practice_new', eventProject);
  assert(eventMigration.changed);
  assert(eventMigration.docs.includes('phone_chats'));
  assert.strictEqual(eventProject.phone_chats[0].messages[0].trigger_event, 'after_practice_new');

  const dialogueProject = cloneProject();
  const dialogueMigration = rewriteContentReferences('dialogue', 'dlg_intro', 'dlg_intro_new', dialogueProject);
  assert(dialogueMigration.changed);
  assert(dialogueMigration.docs.includes('events'));
  assert(dialogueMigration.docs.includes('npcs'));
  assert.strictEqual(dialogueProject.events[0].effects.dialogue, 'dlg_intro_new');
  assert.strictEqual(dialogueProject.npcs[0].dialogue_id, 'dlg_intro_new');

  const locationProject = cloneProject();
  const locationMigration = rewriteContentReferences('location', 'room', 'room_new', locationProject);
  assert(locationMigration.changed);
  assert(locationMigration.docs.includes('actions'));
  assert(locationMigration.docs.includes('events'));
  assert(locationMigration.docs.includes('game_config'));
  assert.strictEqual(locationProject.actions[0].location, 'room_new');
  assert.strictEqual(locationProject.events[1].trigger_detail, 'room_new');
  assert.strictEqual(locationProject.game_config.starting_location, 'room_new');

  const mapProject = cloneProject();
  const mapMigration = rewriteContentReferences('map', 'town', 'town_new', mapProject);
  assert(mapMigration.changed);
  assert(mapMigration.docs.includes('locations'));
  assert(mapMigration.docs.includes('npcs'));
  assert(mapMigration.docs.includes('game_config'));
  assert(mapProject.locations.every(location => location.map_id === 'town_new'));
  assert.strictEqual(mapProject.npcs[0].map_id, 'town_new');
  assert.strictEqual(mapProject.game_config.starting_map, 'town_new');

  const npcProject = cloneProject();
  const npcMigration = rewriteContentReferences('npc', 'npc_a', 'npc_b', npcProject);
  assert(npcMigration.changed);
  assert(npcMigration.docs.includes('actions'));
  assert(npcMigration.docs.includes('events'));
  assert(npcMigration.dialogues.includes('dlg_intro'));
  assert.strictEqual(npcProject.actions[0].requirements.relationships[0].npc_id, 'npc_b');
  assert.strictEqual(npcProject.actions[0].effects.relationships[0].npc_id, 'npc_b');
  assert.strictEqual(npcProject.events[1].conditions.relationships[0].npc_id, 'npc_b');
  assert.strictEqual(npcProject.events[1].effects.relationships[0].npc_id, 'npc_b');
  assert.strictEqual(npcProject.dialogues.dlg_intro.nodes[0].effects.relationships[0].npc_id, 'npc_b');

  const graph = buildContentGraph(project);
  const nodeKeys = new Set(graph.nodes.map(node => node.key));
  for (const key of ['action:practice', 'event:after_practice', 'dialogue:dlg_intro', 'location:room', 'map:town', 'npc:npc_a']) {
    assert(nodeKeys.has(key), `graph must include ${key}`);
  }
  const edgeKeys = new Set(graph.edges.map(edge => `${edge.source}->${edge.target}`));
  for (const key of [
    'map:town->location:room',
    'location:room->action:practice',
    'action:practice->event:after_practice',
    'event:after_practice->dialogue:dlg_intro',
    'npc:npc_a->dialogue:dlg_intro',
  ]) {
    assert(edgeKeys.has(key), `graph must include edge ${key}`);
  }
  const eventGraph = filterContentGraph(graph, 'event');
  assert(eventGraph.nodes.some(node => node.kind === 'event'));
  assert(eventGraph.edges.every(edge => edge.source.startsWith('event:') || edge.target.startsWith('event:')));
}

main()
  .then(() => console.log('delete guard tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
