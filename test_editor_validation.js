const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
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
  assert(source.includes('formatReferenceSummary'), `${name} detail views must show reference summaries`);
}

assert(index.includes('data-tab="health"'), 'index.html must expose the health tab');
assert(index.includes('value="health"'), 'mobile tab select must include health');
assert(index.includes('data-tab="snapshots"'), 'index.html must expose the snapshots tab');
assert(index.includes('value="snapshots"'), 'mobile tab select must include snapshots');
assert(index.includes('data-tab="references"'), 'index.html must expose the references tab');
assert(index.includes('value="references"'), 'mobile tab select must include references');
assert(index.includes('_createManualSnapshot'), 'index.html must expose manual snapshot creation');
assert(app.includes("import { renderHealth } from './js/health.js'"), 'app.js must import renderHealth');
assert(app.includes("case 'health': renderHealth(); break;"), 'app.js must route the health tab');
assert(app.includes("import { renderSnapshots, createManualSnapshot } from './js/snapshots.js'"), 'app.js must import snapshots UI');
assert(app.includes("case 'snapshots': renderSnapshots(); break;"), 'app.js must route the snapshots tab');
assert(app.includes("createSnapshot(data, { source: 'import'"), 'imports must create a snapshot before writing data');
assert(app.includes("import { renderReferences } from './js/references.js'"), 'app.js must import references UI');
assert(app.includes("case 'references': renderReferences(); break;"), 'app.js must route the references tab');

console.log('editor validation smoke test passed');
