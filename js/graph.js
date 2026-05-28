import { data } from './state.js';
import { esc } from './forms.js';
import { formatReferenceSummary } from './delete_guards.js';
import { buildContentGraph, filterContentGraph } from './relationship_graph.js';

const KIND_LABELS = {
  all: '全部',
  map: '地图',
  location: '地点',
  action: '行动',
  event: '事件',
  dialogue: '对话',
  npc: 'NPC',
};

const KIND_COLORS = {
  map: '#53a8b6',
  location: '#7bc96f',
  action: '#f39c12',
  event: '#e94560',
  dialogue: '#b58cff',
  npc: '#f6c85f',
};

let selectedKind = 'all';
let selectedNodeKey = '';

function renderKindOptions() {
  return Object.entries(KIND_LABELS)
    .map(([kind, label]) => `<option value="${kind}" ${kind === selectedKind ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function edgePath(edge, nodeByKey) {
  const source = nodeByKey.get(edge.source);
  const target = nodeByKey.get(edge.target);
  if (!source || !target) return '';
  const x1 = source.x + 64;
  const y1 = source.y;
  const x2 = target.x - 64;
  const y2 = target.y;
  const mid = Math.max(x1 + 32, (x1 + x2) / 2);
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

function renderEdges(graph, nodeByKey) {
  return graph.edges.map(edge => {
    const path = edgePath(edge, nodeByKey);
    if (!path) return '';
    return `<path d="${path}" fill="none" stroke="rgba(224,224,224,0.28)" stroke-width="1.5" marker-end="url(#graph-arrow)">
      <title>${esc(edge.label)}</title>
    </path>`;
  }).join('');
}

function renderNodes(graph) {
  return graph.nodes.map(node => {
    const color = KIND_COLORS[node.kind] || '#53a8b6';
    const selected = node.key === selectedNodeKey;
    const label = node.label || node.id;
    return `<g class="graph-node" data-node-key="${esc(node.key)}" transform="translate(${node.x},${node.y})" style="cursor:pointer;">
      <rect x="-64" y="-24" width="128" height="48" rx="7" fill="var(--bg2)" stroke="${selected ? 'var(--accent)' : color}" stroke-width="${selected ? '2.5' : '1.5'}"></rect>
      <circle cx="-48" cy="-8" r="4" fill="${color}"></circle>
      <text x="-36" y="-5" fill="var(--text2)" font-size="10">${esc(node.kindLabel)}</text>
      <text x="0" y="12" fill="var(--text)" font-size="12" font-weight="700" text-anchor="middle">${esc(label)}</text>
      <title>${esc(node.kindLabel)} / ${esc(node.id)}</title>
    </g>`;
  }).join('');
}

function renderSummary(node, fullGraph) {
  if (!node) {
    return `<div style="padding:12px;background:var(--bg2);border-left:3px solid var(--accent2);">
      <div style="font-size:0.75rem;color:var(--text2);">选择一个节点</div>
      <div style="font-weight:700;color:var(--accent2);">点击图上的节点查看引用摘要</div>
    </div>`;
  }
  const refs = formatReferenceSummary(node.kind, node.id, data);
  const outgoing = fullGraph.edges.filter(edge => edge.source === node.key).length;
  const incoming = fullGraph.edges.filter(edge => edge.target === node.key).length;
  return `<div style="padding:12px;background:var(--bg2);border-left:3px solid ${KIND_COLORS[node.kind] || 'var(--accent2)'};">
    <div style="font-size:0.75rem;color:var(--text2);">${esc(node.kindLabel)} / ${esc(node.id)}</div>
    <div style="font-weight:700;color:var(--text);margin:2px 0 6px;">${esc(node.label)}</div>
    <div style="color:var(--accent2);font-size:0.85rem;">${esc(refs)}</div>
    <div style="color:var(--text2);font-size:0.78rem;margin-top:6px;">入边 ${incoming} · 出边 ${outgoing}</div>
  </div>`;
}

export function renderGraph() {
  const fullGraph = buildContentGraph(data);
  const graph = filterContentGraph(fullGraph, selectedKind);
  const visibleKeys = new Set(graph.nodes.map(node => node.key));
  if (selectedNodeKey && !visibleKeys.has(selectedNodeKey)) selectedNodeKey = '';

  const nodeByKey = new Map(graph.nodes.map(node => [node.key, node]));
  const selectedNode = fullGraph.nodes.find(node => node.key === selectedNodeKey);

  const tb = document.getElementById('toolbar');
  tb.innerHTML = `<span>关系图</span>
    <span class="hint">${graph.nodes.length} 个节点 / ${graph.edges.length} 条关系</span>
    <select id="graph-kind" style="width:120px;">${renderKindOptions()}</select>`;

  const ct = document.getElementById('content');
  ct.innerHTML = `<div style="display:grid;grid-template-columns:minmax(520px,1fr) 280px;gap:12px;min-height:100%;">
    <div style="overflow:auto;background:var(--bg);border:1px solid var(--border);border-radius:6px;">
      <svg width="${Math.max(graph.width, 760)}" height="${Math.max(graph.height, 420)}" viewBox="0 0 ${Math.max(graph.width, 760)} ${Math.max(graph.height, 420)}" role="img" aria-label="内容关系图">
        <defs>
          <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(224,224,224,0.42)"></path>
          </marker>
        </defs>
        ${renderEdges(graph, nodeByKey)}
        ${renderNodes(graph)}
      </svg>
    </div>
    <div>
      ${renderSummary(selectedNode, fullGraph)}
      <div style="margin-top:12px;color:var(--text2);font-size:0.78rem;line-height:1.6;">
        <div>地图 → 地点 / NPC</div>
        <div>地点 → 行动 / 事件</div>
        <div>行动 → 事件 → 对话</div>
        <div>行动、事件、对话 → NPC 关系</div>
      </div>
    </div>
  </div>`;

  document.getElementById('graph-kind').onchange = function() {
    selectedKind = this.value;
    renderGraph();
  };
  ct.querySelectorAll('.graph-node').forEach(nodeEl => {
    nodeEl.addEventListener('click', () => {
      selectedNodeKey = nodeEl.dataset.nodeKey;
      renderGraph();
    });
  });
}
