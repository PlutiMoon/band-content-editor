const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = __dirname;
const core = fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');

assert(!core.includes("from('documents').select"), 'core.js must not select documents directly');
assert(!core.includes("from('documents').upsert"), 'core.js must not upsert documents directly');
assert(!core.includes("from('documents').delete"), 'core.js must not delete documents directly');
assert(core.includes("rpc('editor_list_documents'"), 'core.js must pull through editor_list_documents RPC');
assert(core.includes("rpc('editor_upsert_document'"), 'core.js must save through editor_upsert_document RPC');
assert(core.includes("rpc('editor_delete_document'"), 'core.js must delete through editor_delete_document RPC');
assert(!core.includes('ACCESS_KEY'), 'core.js must not compare the access key client-side');
const legacyPassword = ['band', '2025'].join('');
assert(!config.includes(legacyPassword), 'config.js must not ship the editor password');
assert(core.includes('isAccessKeyError'), 'core.js must classify access-key RPC errors');
assert(core.includes('resetLoginState'), 'core.js must clear saved login state after access-key errors');
assert(core.includes('invalid editor access key'), 'core.js must recognize Supabase access-key errors');
assert(core.includes("error?.status === 403"), 'core.js must recognize Supabase 403 access-key errors');
assert(core.includes("removeItem('band_access_key')"), 'core.js must clear stored editor access key');
assert(core.includes("login.style.display = 'flex'"), 'core.js must restore the centered login layout after access-key errors');

console.log('RPC gate smoke test passed');
