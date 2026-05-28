const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
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

console.log('editor validation smoke test passed');
