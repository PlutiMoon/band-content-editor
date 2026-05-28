const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, 'js', 'health_check.js')).href);
  const { runHealthCheck } = mod;
  const repairMod = await import(pathToFileURL(path.join(__dirname, 'js', 'health_repairs.js')).href);
  const { buildHealthRepairPlan, applyHealthRepairPlan } = repairMod;
  const gateMod = await import(pathToFileURL(path.join(__dirname, 'js', 'publish_gate.js')).href);
  const { buildPublishGate } = gateMod;

  const broken = {
    actions: [
      { id: 'practice', name: 'Practice', location: 'missing_room', time_cost: 1, max_per_day: 1, requirements: { relationships: [{ npc_id: 'missing_npc' }] } },
      { id: 'practice', name: 'Duplicate', location: 'room', time_cost: 1, max_per_day: 1 },
    ],
    events: [
      { id: 'after_missing', name: 'Missing', trigger_type: 'action_complete', trigger_detail: 'missing_action', effects: {} },
      { id: 'bad_dialogue', name: 'Bad Dialogue', trigger_type: 'phase_start', effects: { dialogue: 'missing_dialogue' } },
    ],
    locations: [{ id: 'room', name: 'Room', map_id: 'missing_map' }],
    maps: [{ id: 'town', name: 'Town', width: 960, height: 270 }],
    npcs: [{ id: 'npc_a', name: 'NPC A', map_id: 'town', dialogue_id: 'missing_dialogue' }],
    phone_chats: [{ chat_id: 'band', messages: [{ id: 'm1', sender: 'A', text: 'go', trigger_event: 'missing_event' }] }],
    game_config: { starting_map: 'town', starting_location: 'missing_room' },
    dialogues: {
      dlg_intro: { nodes: [{ id: 'start', text: 'hello', next: 'end' }] },
      lonely: { nodes: [{ id: 'start', text: 'alone', next: 'end' }, { id: 'end', text: '' }] },
    },
  };

  const issues = runHealthCheck(broken);
  const codes = new Set(issues.map(i => i.code));

  assert(codes.has('duplicate_action_id'));
  assert(codes.has('action_unknown_location'));
  assert(codes.has('event_action_missing'));
  assert(codes.has('event_dialogue_missing'));
  assert(codes.has('location_unknown_map'));
  assert(codes.has('npc_dialogue_missing'));
  assert(codes.has('phone_unknown_event'));
  assert(codes.has('game_config_unknown_starting_location'));
  assert(codes.has('dialogue_missing_end'));
  assert(codes.has('graph_missing_reference'));
  assert(codes.has('graph_isolated_node'));

  const clean = {
    actions: [{ id: 'practice', name: 'Practice', location: 'room', time_cost: 1, max_per_day: 1 }],
    events: [{ id: 'after_practice', name: 'After', trigger_type: 'action_complete', trigger_detail: 'practice', effects: { dialogue: 'dlg_intro' } }],
    locations: [{ id: 'room', name: 'Room', map_id: 'town' }],
    maps: [{ id: 'town', name: 'Town', width: 960, height: 270 }],
    npcs: [{ id: 'npc_a', name: 'NPC A', map_id: 'town', dialogue_id: 'dlg_intro' }],
    phone_chats: [{ chat_id: 'band', messages: [{ id: 'm1', sender: 'A', text: 'go', trigger_event: 'after_practice' }] }],
    game_config: { starting_map: 'town', starting_location: 'room' },
    dialogues: { dlg_intro: { nodes: [{ id: 'start', text: 'hello', next: 'end' }, { id: 'end', text: '' }] } },
  };

  assert.strictEqual(runHealthCheck(clean).length, 0);

  const repairable = {
    actions: [{ id: 'bad_action', name: 'Bad', location: 'room', time_cost: -1, max_per_day: 1.5 }],
    events: [],
    locations: [{ id: 'room', name: 'Room', map_id: 'town' }],
    maps: [{ id: 'town', name: 'Town', width: 0, height: -10 }],
    npcs: [],
    phone_chats: [],
    game_config: { starting_map: 'town', starting_location: 'room' },
    dialogues: { dlg_bad: { nodes: [] } },
  };

  const repairIssues = runHealthCheck(repairable);
  const repairPlan = buildHealthRepairPlan(repairable, repairIssues);
  const repairableBeforeApply = JSON.parse(JSON.stringify(repairable));
  const repairCodes = new Set(repairPlan.repairable.map(item => item.code));
  assert(repairCodes.has('action_invalid_time_cost'));
  assert(repairCodes.has('action_invalid_max_per_day'));
  assert(repairCodes.has('map_invalid_width'));
  assert(repairCodes.has('map_invalid_height'));
  assert(repairCodes.has('dialogue_missing_start'));
  assert(repairCodes.has('dialogue_missing_end'));

  const repairResult = applyHealthRepairPlan(repairable, repairPlan);
  assert(repairResult.changed);
  assert(repairResult.docs.includes('actions'));
  assert(repairResult.docs.includes('maps'));
  assert(repairResult.dialogues.includes('dlg_bad'));
  assert.strictEqual(repairable.actions[0].time_cost, 1);
  assert.strictEqual(repairable.actions[0].max_per_day, 1);
  assert.strictEqual(repairable.maps[0].width, 960);
  assert.strictEqual(repairable.maps[0].height, 270);
  assert(repairable.dialogues.dlg_bad.nodes.some(node => node.id === 'start'));
  assert(repairable.dialogues.dlg_bad.nodes.some(node => node.id === 'end'));

  const warningOnly = {
    actions: [{ id: 'practice', name: 'Practice', location: 'room', time_cost: 1, max_per_day: 1 }],
    events: [{ id: 'custom_event', name: 'Custom', trigger_type: 'custom_debug', effects: {} }],
    locations: [{ id: 'room', name: 'Room', map_id: 'town' }],
    maps: [{ id: 'town', name: 'Town', width: 960, height: 270 }],
    npcs: [],
    phone_chats: [],
    game_config: { starting_map: 'town', starting_location: 'room' },
    dialogues: {},
  };

  assert.strictEqual(buildPublishGate(broken).status, 'blocked');
  assert.strictEqual(buildPublishGate(clean).status, 'pass');
  assert.strictEqual(buildPublishGate(warningOnly).status, 'warning');
  const repairGate = buildPublishGate(repairableBeforeApply);
  assert.strictEqual(repairGate.status, 'blocked');
  assert(repairGate.repairableCount > 0);
}

main()
  .then(() => console.log('health check tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
