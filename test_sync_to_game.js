const assert = require('assert');
const {
  classifyPatchResult,
  formatDiff,
} = require('./sync_to_game.js');

assert.strictEqual(classifyPatchResult({ ok: true, status: 204 }), 'updated');
assert.strictEqual(classifyPatchResult({ ok: true, status: 200, body: '' }), 'updated');
assert.strictEqual(classifyPatchResult({ ok: true, status: 200, body: '[]' }), 'missing');
assert.strictEqual(classifyPatchResult({ ok: false, status: 401 }), 'failed');

assert.strictEqual(formatDiff({ added: 0, removed: 0, changed: 0, total: 9 }), '9(+0)');
assert.strictEqual(formatDiff({ added: 2, removed: 1, changed: 3, total: 10 }), '10(+2/-1/~3)');

console.log('sync_to_game tests passed');
