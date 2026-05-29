const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, 'js', 'content_diff.js')).href);
  const { diffContent, formatDiffSummary } = mod;

  const base = {
    actions: [{ id: 'practice', name: 'Practice' }],
    events: [{ id: 'old_event', name: 'Old' }],
    dialogues: { intro: { nodes: [{ id: 'start', text: 'hello' }] } },
    maps: [{ id: 'town', name: 'Town' }],
    locations: [],
    npcs: [],
    phone_chats: [],
    game_config: { starting_map: 'town' },
  };

  const current = {
    actions: [
      { id: 'practice', name: 'Practice' },
      { id: 'sleep', name: 'Sleep' },
    ],
    events: [],
    dialogues: { intro: { nodes: [{ id: 'start', text: 'hello changed' }] } },
    maps: [{ id: 'town', name: 'Town' }],
    locations: [],
    npcs: [],
    phone_chats: [],
    game_config: { starting_map: 'new_town' },
  };

  const diff = diffContent(base, current);
  assert(diff.items.some(item => item.kind === 'action' && item.id === 'sleep' && item.operation === 'added'));
  assert(diff.items.some(item => item.kind === 'event' && item.id === 'old_event' && item.operation === 'removed'));
  assert(diff.items.some(item => item.kind === 'dialogue' && item.id === 'intro' && item.operation === 'modified'));
  assert(diff.items.some(item => item.kind === 'game_config' && item.id === 'game_config' && item.operation === 'modified'));
  assert(!diff.items.some(item => item.kind === 'action' && item.id === 'practice'));
  assert.strictEqual(diff.counts.added, 1);
  assert.strictEqual(diff.counts.removed, 1);
  assert.strictEqual(diff.counts.modified, 2);
  assert(formatDiffSummary(diff).includes('新增 1'));
  assert(formatDiffSummary(diff).includes('修改 2'));

  const fieldBase = {
    actions: [{ id: 'practice', name: 'Practice', effects: { stat: { energy: -1 } } }],
  };
  const fieldCurrent = {
    actions: [{ id: 'practice', name: 'Practice Guitar', effects: { stat: { energy: -2 } } }],
  };
  const fieldDiff = diffContent(fieldBase, fieldCurrent);
  const modifiedAction = fieldDiff.items.find(item => item.kind === 'action' && item.id === 'practice');
  assert(modifiedAction);
  assert(modifiedAction.changes.some(change => change.path === 'name' && change.before === 'Practice' && change.after === 'Practice Guitar'));
  assert(modifiedAction.changes.some(change => change.path === 'effects.stat.energy' && change.before === -1 && change.after === -2));
}

main()
  .then(() => console.log('content diff tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
