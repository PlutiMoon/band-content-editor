const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const core = fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

assert(core.includes('export function doLogout()'), 'core.js must export doLogout');
assert(core.includes("removeItem('band_logged_in')"), 'logout must clear logged-in state');
assert(core.includes("removeItem('band_user_name')"), 'logout must clear saved user name');
assert(core.includes("removeItem('band_access_key')"), 'logout must clear saved editor access key');
assert(core.includes("setUserName('')"), 'logout must clear in-memory user name');
assert(core.includes("setEditorAccessKey('')"), 'logout must clear in-memory editor access key');
assert(core.includes("window.doLogout = doLogout"), 'logout must be available to inline HTML handlers');
assert(core.includes("login.style.display = 'flex'"), 'logout must restore the centered login screen');
assert(app.includes('id="btn-logout"'), 'app.js must render the primary top-bar logout button');
assert(app.includes('presence-logout'), 'top-bar logout button must use the compact presence style');
assert(index.includes('id="btn-logout-sidebar"'), 'index.html must render a sidebar logout fallback');
assert(index.includes('onclick="doLogout()"'), 'logout buttons must call doLogout');

console.log('logout tests passed');
