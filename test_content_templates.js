const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, 'js', 'content_templates.js')).href);
  const {
    createActionTemplate,
    createActionEventTemplate,
    createLocationEventTemplate,
    createNPCDialogueTemplate,
  } = mod;

  const project = {
    actions: [{ id: 'practice' }],
    events: [{ id: 'after_practice' }],
    locations: [{ id: 'room', name: 'Band Room' }],
    npcs: [{ id: 'alice', name: 'Alice' }],
    dialogues: { dlg_alice: {} },
  };

  const action = createActionTemplate(project, { id: 'practice_2' });
  assert.strictEqual(action.id, 'practice_2');
  assert.strictEqual(action.location, 'room');
  assert.strictEqual(action.time_cost, 1);
  assert(action.requirements);
  assert(action.effects);

  const actionEvent = createActionEventTemplate(project, { id: 'after_practice_2', actionId: 'practice' });
  assert.strictEqual(actionEvent.id, 'after_practice_2');
  assert.strictEqual(actionEvent.trigger_type, 'action_complete');
  assert.strictEqual(actionEvent.trigger_detail, 'practice');
  assert.strictEqual(actionEvent.one_shot, true);

  const locationEvent = createLocationEventTemplate(project, { id: 'enter_room', locationId: 'room' });
  assert.strictEqual(locationEvent.trigger_type, 'location');
  assert.strictEqual(locationEvent.trigger_detail, 'room');

  const dialogue = createNPCDialogueTemplate(project, { id: 'dlg_alice_2', npcId: 'alice' });
  assert.strictEqual(dialogue.dialogue_id, 'dlg_alice_2');
  assert(dialogue.nodes.some(node => node.id === 'start' && node.speaker === 'Alice'));
  assert(dialogue.nodes.some(node => node.id === 'end'));

  assert.throws(() => createActionTemplate(project, { id: 'practice' }), /already exists/);
  assert.throws(() => createActionEventTemplate(project, { id: 'after_practice_2', actionId: 'missing' }), /missing action/);
}

main()
  .then(() => console.log('content template tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
