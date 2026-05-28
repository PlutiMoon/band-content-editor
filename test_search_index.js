const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, 'js', 'search_index.js')).href);
  const { searchContent } = mod;

  const project = {
    actions: [
      { id: 'practice', name: 'Practice Guitar', location: 'room', requirements: { relationships: [{ npc_id: 'alice' }] } },
      { id: 'sleep', name: 'Sleep', location: 'bedroom' },
    ],
    events: [
      { id: 'after_practice', name: 'After Practice', trigger_type: 'action_complete', trigger_detail: 'practice', effects: { dialogue: 'dlg_intro' } },
    ],
    dialogues: {
      dlg_intro: {
        nodes: [
          { id: 'start', speaker: 'Alice', text: 'Welcome to the band room', next: 'end' },
          { id: 'end', text: '' },
        ],
      },
    },
    phone_chats: [
      { chat_id: 'band', messages: [{ id: 'm1', sender: 'alice', text: 'Meet after practice', trigger_event: 'after_practice' }] },
    ],
    maps: [{ id: 'town', name: 'Town' }],
    locations: [{ id: 'room', name: 'Band Room', map_id: 'town' }],
    npcs: [{ id: 'alice', name: 'Alice', map_id: 'town', dialogue_id: 'dlg_intro' }],
    game_config: { starting_map: 'town', starting_location: 'room' },
  };

  const practice = searchContent(project, 'practice');
  assert(practice.some(result => result.kind === 'action' && result.path === 'action:practice'));

  const dialogue = searchContent(project, 'band room');
  assert(dialogue.some(result => result.kind === 'dialogue' && result.path === 'dialogue:dlg_intro/start'));

  const phone = searchContent(project, 'meet after');
  assert(phone.some(result => result.kind === 'phone' && result.path === 'phone:band/m1'));

  const alice = searchContent(project, 'ALICE');
  assert(alice.some(result => result.kind === 'npc' && result.path === 'npc:alice'));

  const dialogueOnly = searchContent(project, 'practice', { kind: 'dialogue' });
  assert(dialogueOnly.every(result => result.kind === 'dialogue'));
  assert(!dialogueOnly.some(result => result.kind === 'action'));

  assert.deepStrictEqual(searchContent(project, '   '), []);
}

main()
  .then(() => console.log('search index tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
