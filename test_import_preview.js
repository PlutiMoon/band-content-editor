const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, 'js', 'import_preview.js')).href);
  const { buildImportPreview, formatImportPreview } = mod;

  const currentData = {
    actions: [{ id: 'practice', name: 'Practice' }],
    events: [],
    locations: [],
    maps: [],
    npcs: [],
    phone_chats: [{ chat_id: 'band', messages: [] }],
    dialogues: { dlg_intro: { nodes: [] } },
    game_config: { starting_map: 'town' },
  };

  const actionPreview = buildImportPreview('actions', [
    { fileName: 'practice.json', payload: { id: 'practice', name: 'Practice New' } },
    { fileName: 'sleep.json', payload: { id: 'sleep', name: 'Sleep' } },
  ], currentData);
  assert.strictEqual(actionPreview.counts.overwrite, 1);
  assert.strictEqual(actionPreview.counts.create, 1);
  assert(actionPreview.items.some(item => item.id === 'practice' && item.operation === 'overwrite'));
  assert(actionPreview.items.some(item => item.id === 'sleep' && item.operation === 'create'));

  const dialoguePreview = buildImportPreview('dialogues', [
    { fileName: 'dlg_intro.json', payload: { nodes: [] } },
    { fileName: 'dlg_new.json', payload: { dialogue_id: 'dlg_new', nodes: [] } },
  ], currentData);
  assert.strictEqual(dialoguePreview.counts.overwrite, 1);
  assert.strictEqual(dialoguePreview.counts.create, 1);

  const configPreview = buildImportPreview('game_config', [
    { fileName: 'game_config.json', payload: { starting_map: 'new_town' } },
  ], currentData);
  assert.strictEqual(configPreview.counts.replace, 1);

  const invalidPreview = buildImportPreview('actions', [
    { fileName: 'bad.json', error: 'JSON parse error' },
  ], currentData);
  assert.strictEqual(invalidPreview.counts.invalid, 1);
  assert(formatImportPreview(invalidPreview).includes('bad.json'));
  assert(formatImportPreview(actionPreview).includes('新增 1'));
  assert(formatImportPreview(actionPreview).includes('覆盖 1'));
}

main()
  .then(() => console.log('import preview tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
