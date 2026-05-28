const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'js', 'actions.js'), 'utf8');
const events = fs.readFileSync(path.join(root, 'js', 'events.js'), 'utf8');
const dialogues = fs.readFileSync(path.join(root, 'js', 'dialogues.js'), 'utf8');
const forms = fs.readFileSync(path.join(root, 'js', 'forms.js'), 'utf8');
const world = fs.readFileSync(path.join(root, 'js', 'world.js'), 'utf8');

for (const name of ['validateLocation', 'validateNPC', 'validateMap', 'validateGameConfig']) {
  assert(forms.includes(`export function ${name}`), `forms.js must export ${name}`);
  assert(world.includes(name), `world.js must call or import ${name}`);
}

assert(world.includes("validateLocation(l, data.locations)"), 'locations must be validated before save');
assert(world.includes("validateNPC(n, data.npcs)"), 'NPCs must be validated before save');
assert(world.includes("validateMap(m, data.maps)"), 'maps must be validated before save');
assert(world.includes('validateGameConfig(gc)'), 'game config must be validated before save');

for (const name of [
  'validateAction',
  'validateEvent',
  'validateLocation',
  'validateNPC',
  'validateMap',
  'validateGameConfig',
  'validateDialogueNode',
  'validateMessage',
]) {
  assert(app.includes(name), `app.js import validation should use ${name}`);
}

assert(app.includes('getImportValidationError'), 'app.js must centralize import validation');
assert(app.includes('validateImportPayload'), 'app.js must validate import payload before saveDoc');
assert(
  app.indexOf('validateImportPayload(type, obj, file.name)') < app.indexOf("saveDoc('game_config'"),
  'game_config import must validate before save'
);
assert(
  app.indexOf('validateImportPayload(type, target, file.name)') < app.indexOf('saveDoc(docId, docType, target)'),
  'array imports must validate before save'
);

for (const [name, source] of Object.entries({ actions, events, dialogues, world })) {
  assert(source.includes('formatDeleteBlocker'), `${name} delete handlers must use formatDeleteBlocker`);
}

console.log('editor validation smoke test passed');
