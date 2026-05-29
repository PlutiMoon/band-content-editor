const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, 'js', 'issue_navigation.js')).href);
  const { issueToContentPath, issueToGraphNodeKey, nodeKeyToContentPath } = mod;

  assert.strictEqual(issueToContentPath({ actionId: 'practice' }), 'action:practice');
  assert.strictEqual(issueToContentPath({ eventId: 'after_practice' }), 'event:after_practice');
  assert.strictEqual(issueToContentPath({ dialogueId: 'dlg_intro', nodeId: 'start' }), 'dialogue:dlg_intro/start');
  assert.strictEqual(issueToContentPath({ chatId: 'band', messageId: 'm1' }), 'phone:band/m1');
  assert.strictEqual(issueToContentPath({ locationId: 'room' }), 'location:room');
  assert.strictEqual(issueToContentPath({ mapId: 'town' }), 'map:town');
  assert.strictEqual(issueToContentPath({ npcId: 'alice' }), 'npc:alice');
  assert.strictEqual(issueToContentPath({ area: 'actions', id: 'practice' }), 'action:practice');
  assert.strictEqual(issueToContentPath({ area: 'events', eventId: 'after_practice', actionId: 'missing_action' }), 'event:after_practice');
  assert.strictEqual(issueToContentPath({ area: 'npcs', npcId: 'alice', dialogueId: 'missing_dialogue' }), 'npc:alice');
  assert.strictEqual(issueToContentPath({ area: 'phone', chatId: 'band', messageId: 'm1', eventId: 'missing_event' }), 'phone:band/m1');
  assert.strictEqual(issueToContentPath({ area: 'game_config', locationId: 'missing_room' }), 'game_config');
  assert.strictEqual(issueToContentPath({ source: 'event:after_practice' }), 'event:after_practice');
  assert.strictEqual(issueToContentPath({ target: 'npc:missing' }), 'npc:missing');
  assert.strictEqual(issueToContentPath({ area: 'unknown', id: 'x' }), null);

  assert.strictEqual(issueToGraphNodeKey({ source: 'action:practice' }), 'action:practice');
  assert.strictEqual(issueToGraphNodeKey({ target: 'npc:missing' }), 'npc:missing');
  assert.strictEqual(issueToGraphNodeKey({ locationId: 'room' }), 'location:room');
  assert.strictEqual(issueToGraphNodeKey({ chatId: 'band' }), null);

  assert.strictEqual(nodeKeyToContentPath('action:practice'), 'action:practice');
  assert.strictEqual(nodeKeyToContentPath('phone:band'), null);
}

main()
  .then(() => console.log('issue navigation tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
