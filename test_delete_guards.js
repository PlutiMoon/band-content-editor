const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, 'js', 'delete_guards.js')).href);
  const { findDeleteReferences, formatDeleteBlocker, formatReferenceSummary } = mod;

  const project = {
    actions: [
      { id: 'practice', location: 'room', effects: { relationships: [{ npc_id: 'npc_a', delta: 1 }] } },
      { id: 'sleep', location: 'bedroom' },
    ],
    events: [
      { id: 'after_practice', trigger_type: 'action_complete', trigger_detail: 'practice', effects: { dialogue: 'dlg_intro' } },
      { id: 'enter_room', trigger_type: 'location', trigger_detail: 'room', conditions: { relationships: [{ npc_id: 'npc_a', op: '>=', value: 1 }] } },
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
}

main()
  .then(() => console.log('delete guard tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
