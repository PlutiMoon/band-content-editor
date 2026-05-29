const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const mod = await import(pathToFileURL(path.join(__dirname, 'js', 'relationship_graph.js')).href);
  const { buildContentGraph, filterIssueGraph, filterNeighborhoodGraph } = mod;

  const project = {
    maps: [{ id: 'town', name: 'Town' }],
    locations: [{ id: 'room', name: 'Room', map_id: 'town' }],
    actions: [
      { id: 'practice', name: 'Practice', location: 'room' },
      { id: 'lonely_action', name: 'Lonely', location: '' },
    ],
    events: [{ id: 'after_practice', trigger_type: 'action_complete', trigger_detail: 'practice', effects: { dialogue: 'intro' } }],
    dialogues: { intro: { name: 'Intro', nodes: [] } },
    npcs: [{ id: 'alice', name: 'Alice', map_id: 'town', dialogue_id: 'missing_dialogue' }],
  };

  const graph = buildContentGraph(project);
  const issueGraph = filterIssueGraph(graph);
  const issueKeys = new Set(issueGraph.nodes.map(node => node.key));
  assert(issueKeys.has('npc:alice'));
  assert(issueKeys.has('action:lonely_action'));
  assert(!issueKeys.has('event:after_practice'));

  const neighborhood = filterNeighborhoodGraph(graph, 'action:practice');
  const neighborKeys = new Set(neighborhood.nodes.map(node => node.key));
  assert(neighborKeys.has('action:practice'));
  assert(neighborKeys.has('location:room'));
  assert(neighborKeys.has('event:after_practice'));
  assert(!neighborKeys.has('npc:alice'));
  assert(neighborhood.edges.every(edge => neighborKeys.has(edge.source) && neighborKeys.has(edge.target)));
}

main()
  .then(() => console.log('relationship graph filter tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
