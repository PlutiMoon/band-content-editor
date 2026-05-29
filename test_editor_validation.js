const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const core = fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'js', 'actions.js'), 'utf8');
const events = fs.readFileSync(path.join(root, 'js', 'events.js'), 'utf8');
const dialogues = fs.readFileSync(path.join(root, 'js', 'dialogues.js'), 'utf8');
const forms = fs.readFileSync(path.join(root, 'js', 'forms.js'), 'utf8');
const world = fs.readFileSync(path.join(root, 'js', 'world.js'), 'utf8');
const health = fs.readFileSync(path.join(root, 'js', 'health.js'), 'utf8');
const healthCheck = fs.readFileSync(path.join(root, 'js', 'health_check.js'), 'utf8');
const graph = fs.readFileSync(path.join(root, 'js', 'graph.js'), 'utf8');
const relationshipGraph = fs.readFileSync(path.join(root, 'js', 'relationship_graph.js'), 'utf8');
const search = fs.readFileSync(path.join(root, 'js', 'search.js'), 'utf8');
const contentNavigation = fs.readFileSync(path.join(root, 'js', 'content_navigation.js'), 'utf8');
const issueNavigation = fs.readFileSync(path.join(root, 'js', 'issue_navigation.js'), 'utf8');
const snapshots = fs.readFileSync(path.join(root, 'js', 'snapshots.js'), 'utf8');

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
assert(app.includes("import { buildImportPreview, formatImportPreview } from './js/import_preview.js'"), 'app.js must import import preview helpers');
assert(app.includes('const preview = buildImportPreview(type, entries, data)'), 'imports must build a preview before writing');
assert(app.includes('formatImportPreview(preview)'), 'imports must show formatted preview before writing');
assert(app.includes('function showImportPreviewModal'), 'imports must show preview in an in-app modal');
assert(app.includes('import-preview-modal'), 'import preview modal must have a stable DOM hook');
assert(
  app.indexOf('showImportPreviewModal(preview)') < app.indexOf("createSnapshot(data, { source: 'import'"),
  'import preview must be confirmed before creating import snapshot'
);
assert(
  app.indexOf('validateImportPayload(type, obj, fileName)') < app.indexOf("saveDoc('game_config'"),
  'game_config import must validate before save'
);
assert(
  app.indexOf('validateImportPayload(type, target, fileName)') < app.indexOf('saveDoc(docId, docType, target)'),
  'array imports must validate before save'
);

for (const [name, source] of Object.entries({ actions, events, dialogues, world })) {
  assert(source.includes('formatDeleteBlocker'), `${name} delete handlers must use formatDeleteBlocker`);
  assert(source.includes('formatReferenceSummary'), `${name} detail views must show reference summaries`);
}

assert(actions.includes('confirmReferenceRewrite'), 'actions must confirm ID reference rewrites');
assert(events.includes('confirmReferenceRewrite'), 'events must confirm ID reference rewrites');
assert(world.includes('confirmReferenceRewrite'), 'world must confirm ID reference rewrites');
assert(actions.includes('saveReferenceMigration'), 'actions must save ID reference rewrites');
assert(events.includes('saveReferenceMigration'), 'events must save ID reference rewrites');
assert(world.includes('saveReferenceMigration'), 'world must save ID reference rewrites');
assert(actions.includes('createActionTemplate'), 'actions must expose an action template');
assert(events.includes('createActionEventTemplate'), 'events must expose action-event templates');
assert(events.includes('createLocationEventTemplate'), 'events must expose location-event templates');
assert(dialogues.includes('createNPCDialogueTemplate'), 'dialogues must expose NPC dialogue templates');
assert(core.includes('toolbar-menu'), 'core toolbar should support grouped secondary actions');
assert(core.includes('data-toolbar-menu="${cfg.id}"'), 'toolbar menu should be keyed by toolbar id');
assert(actions.includes("id: 'action'"), 'actions should use the action toolbar group');
assert(events.includes("id: 'event'"), 'events should use the event toolbar group');
assert(dialogues.includes("id: 'dialogue'"), 'dialogues should use the dialogue toolbar group');

assert(index.includes('data-tab="health"'), 'index.html must expose the health tab');
assert(index.includes('value="health"'), 'mobile tab select must include health');
assert(index.includes('data-tab="snapshots"'), 'index.html must expose the snapshots tab');
assert(index.includes('value="snapshots"'), 'mobile tab select must include snapshots');
assert(index.includes('data-tab="references"'), 'index.html must expose the references tab');
assert(index.includes('value="references"'), 'mobile tab select must include references');
assert(index.includes('data-tab="graph"'), 'index.html must expose the graph tab');
assert(index.includes('value="graph"'), 'mobile tab select must include graph');
assert(index.includes('data-tab="search"'), 'index.html must expose the search tab');
assert(index.includes('value="search"'), 'mobile tab select must include search');
assert(index.includes('data-tab="releases"'), 'index.html must expose the releases tab');
assert(index.includes('value="releases"'), 'mobile tab select must include releases');
assert(index.includes('data-tab="audit"'), 'index.html must expose the audit tab');
assert(index.includes('value="audit"'), 'mobile tab select must include audit');
assert(index.includes('<optgroup label="常用内容">'), 'mobile tab select must group common content entries');
assert(index.includes('<optgroup label="质量工具">'), 'mobile tab select must group quality tools');
assert(index.includes('<optgroup label="发布与历史">'), 'mobile tab select must group release and history tools');
assert(
  index.indexOf('value="actions"') < index.indexOf('value="health"'),
  'mobile tab select should keep high-frequency content entries before quality tools'
);
assert(index.includes('mobile-sidebar-action'), 'sidebar action buttons must expose mobile action classes');
assert(style.includes('.mobile-sidebar-action'), 'style.css must define mobile sidebar action sizing');
assert(style.includes('.sidebar-actions-primary'), 'style.css must define primary mobile sidebar action styling');
assert(index.includes('_createManualSnapshot'), 'index.html must expose manual snapshot creation');
assert(app.includes("import { renderHealth } from './js/health.js'"), 'app.js must import renderHealth');
assert(app.includes("case 'health': renderHealth(); break;"), 'app.js must route the health tab');
assert(health.includes('buildHealthRepairPlan'), 'health panel must build repair plans');
assert(health.includes('applyHealthRepairPlan'), 'health panel must apply repair plans');
assert(health.includes('createSnapshot'), 'health repairs must snapshot before applying');
assert(health.includes('buildPublishGate'), 'health panel must show publish gate');
assert(style.includes('.status-badge'), 'style.css must expose reusable status badges');
assert(style.includes('.status-notice'), 'style.css must expose reusable status notices');
assert(style.includes('.status-error'), 'style.css must define error status styling');
assert(style.includes('.status-warning'), 'style.css must define warning status styling');
assert(style.includes('.status-success'), 'style.css must define success status styling');
assert(style.includes('.status-info'), 'style.css must define info status styling');
assert(!style.includes('--accent3'), 'style.css should not rely on undefined accent3 tokens');
assert(health.includes('status-badge'), 'health panel must use reusable status badges');
assert(health.includes('status-notice'), 'health panel must use reusable status notices');
assert(healthCheck.includes('buildContentGraph'), 'health check must include graph diagnostics');
assert(healthCheck.includes('graph_missing_reference'), 'health check must report graph missing references');
assert(healthCheck.includes('graph_isolated_node'), 'health check must report graph isolated nodes');
assert(app.includes("import { renderSnapshots, createManualSnapshot } from './js/snapshots.js'"), 'app.js must import snapshots UI');
assert(app.includes("case 'snapshots': renderSnapshots(); break;"), 'app.js must route the snapshots tab');
assert(app.includes("createSnapshot(data, { source: 'import'"), 'imports must create a snapshot before writing data');
assert(snapshots.includes('diffContent'), 'snapshots UI must compare snapshot content');
assert(snapshots.includes('data-snap-compare'), 'snapshots UI must expose compare buttons');
assert(snapshots.includes('snapshot-filter-kind'), 'snapshot compare UI must expose kind filtering');
assert(snapshots.includes('snapshot-filter-operation'), 'snapshot compare UI must expose operation filtering');
assert(snapshots.includes('data-diff-toggle'), 'snapshot compare UI must expose field detail toggles');
assert(snapshots.includes('renderFieldChanges'), 'snapshot compare UI must render field-level changes');
assert(snapshots.includes('status-badge'), 'snapshots UI must use reusable status badges');
assert(snapshots.includes('status-notice'), 'snapshots UI must use reusable status notices');
assert(app.includes("import { renderReferences } from './js/references.js'"), 'app.js must import references UI');
assert(app.includes("case 'references': renderReferences(); break;"), 'app.js must route the references tab');
assert(app.includes("import { renderGraph } from './js/graph.js'"), 'app.js must import graph UI');
assert(app.includes("case 'graph': renderGraph(); break;"), 'app.js must route the graph tab');
assert(graph.includes('buildContentGraph'), 'graph UI must use the relationship graph builder');
assert(graph.includes('filterContentGraph'), 'graph UI must support relationship graph filtering');
assert(graph.includes('filterIssueGraph'), 'graph UI must support issue-only graph filtering');
assert(graph.includes('filterNeighborhoodGraph'), 'graph UI must support selected-node neighborhood filtering');
assert(graph.includes('graph-view'), 'graph UI must expose view mode control');
assert(graph.includes('graph-zoom-in'), 'graph UI must expose zoom-in control');
assert(graph.includes('graph-zoom-out'), 'graph UI must expose zoom-out control');
assert(graph.includes('graph-zoom-reset'), 'graph UI must expose zoom reset control');
assert(relationshipGraph.includes('export function filterIssueGraph'), 'relationship graph must export issue filter');
assert(relationshipGraph.includes('export function filterNeighborhoodGraph'), 'relationship graph must export neighborhood filter');
assert(app.includes("import { renderSearch } from './js/search.js'"), 'app.js must import search UI');
assert(app.includes("case 'search': renderSearch(); break;"), 'app.js must route the search tab');
assert(search.includes('searchContent'), 'search UI must use the global search helper');
assert(search.includes('openContentPath'), 'search UI must open results through shared navigation');
assert(contentNavigation.includes('resolveSearchNavigation'), 'shared navigation must resolve content paths');
assert(contentNavigation.includes('window._switchTab'), 'shared navigation must switch tabs when opening content');
assert(health.includes('issueToContentPath'), 'health issues must expose content jump targets');
assert(health.includes('issueToGraphNodeKey'), 'health issues must expose graph jump targets');
assert(health.includes('health-open-content'), 'health table must expose open buttons');
assert(health.includes('health-open-graph'), 'health table must expose graph buttons');
assert(graph.includes('openGraphNode'), 'graph UI must expose node jump helper');
assert(graph.includes('graph-open-content'), 'graph UI must expose content open buttons');
assert(issueNavigation.includes('issueToContentPath'), 'issue navigation must map issues to content paths');
assert(issueNavigation.includes('issueToGraphNodeKey'), 'issue navigation must map issues to graph nodes');
assert(app.includes("import { renderReleases } from './js/releases.js'"), 'app.js must import releases UI');
assert(app.includes("case 'releases': renderReleases(); break;"), 'app.js must route the releases tab');
assert(app.includes("import { renderAudit } from './js/audit.js'"), 'app.js must import audit UI');
assert(app.includes("case 'audit': renderAudit(); break;"), 'app.js must route the audit tab');
assert(app.includes("import { createReleaseRecord } from './js/release_store.js'"), 'app.js must import release records');
assert(app.includes('createReleaseRecord({'), 'exportAll must record successful releases');
assert(core.includes('recordAuditEntry'), 'core writes must record audit entries');
assert(app.includes("action: 'release_export'"), 'release exports must be audited');
assert(app.includes("import { buildPublishGate, formatPublishGateMessage } from './js/publish_gate.js'"), 'app.js must import publish gate');
assert(app.includes('const gate = buildPublishGate(data)'), 'exportAll must run publish gate');
assert(app.includes("switchTab('health'"), 'blocked export must send user to health tab');

console.log('editor validation smoke test passed');
