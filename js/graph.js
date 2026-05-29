import { data } from './state.js';
import { esc } from './forms.js';
import { formatReferenceSummary } from './delete_guards.js';
import { buildContentGraph, filterContentGraph, filterIssueGraph, filterNeighborhoodGraph } from './relationship_graph.js';
import { openContentPath } from './content_navigation.js';
import { nodeKeyToContentPath } from './issue_navigation.js';

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
let selectedGraphView = 'all';
let graphZoom = 1;

const VIEW_LABELS = {
  all: '全图',
  issues: '只看问题',
  neighborhood: '选中上下游',
};

function renderKindOptions() {
  return Object.entries(KIND_LABELS)
    .map(([kind, label]) => `<option value="${kind}" ${kind === selectedKind ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function renderViewOptions() {
  return Object.entries(VIEW_LABELS)
    .map(([view, label]) => `<option value="${view}" ${view === selectedGraphView ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function issuesByNode(issues) {
  const map = new Map();
  for (const issue of issues || []) {
    for (const key of [issue.source, issue.target]) {
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(issue);
    }
  }
  return map;
}

function nodeIssueState(node, issueMap) {
  const issues = issueMap.get(node.key) || [];
  if (issues.some(issue => issue.severity === 'error')) return 'error';
  if (issues.length) return 'warning';
  return 'ok';
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

function renderNodes(graph, issueMap) {
  return graph.nodes.map(node => {
    const color = KIND_COLORS[node.kind] || '#53a8b6';
    const selected = node.key === selectedNodeKey;
    const issueState = nodeIssueState(node, issueMap);
    const stroke = issueState === 'error' ? 'var(--danger)' : issueState === 'warning' ? 'var(--warn)' : color;
    const strokeWidth = selected || issueState !== 'ok' ? '2.5' : '1.5';
    const label = node.label || node.id;
    return `<g class="graph-node" data-node-key="${esc(node.key)}" transform="translate(${node.x},${node.y})" style="cursor:pointer;">
      <rect x="-64" y="-24" width="128" height="48" rx="7" fill="var(--bg2)" stroke="${selected ? 'var(--accent)' : stroke}" stroke-width="${strokeWidth}"></rect>
      <circle cx="-48" cy="-8" r="4" fill="${color}"></circle>
      <text x="-36" y="-5" fill="var(--text2)" font-size="10">${esc(node.kindLabel)}</text>
      <text x="0" y="12" fill="var(--text)" font-size="12" font-weight="700" text-anchor="middle">${esc(label)}</text>
      <title>${esc(node.kindLabel)} / ${esc(node.id)}</title>
    </g>`;
  }).join('');
}

function renderSummary(node, fullGraph, issueMap) {
  if (!node) {
    return `<div style="padding:12px;background:var(--bg2);border-left:3px solid var(--accent2);">
      <div style="font-size:0.75rem;color:var(--text2);">选择一个节点</div>
      <div style="font-weight:700;color:var(--accent2);">点击图上的节点查看引用摘要</div>
    </div>`;
  }
  const refs = formatReferenceSummary(node.kind, node.id, data);
  const outgoing = fullGraph.edges.filter(edge => edge.source === node.key).length;
  const incoming = fullGraph.edges.filter(edge => edge.target === node.key).length;
  const nodeIssues = issueMap.get(node.key) || [];
  const issueText = nodeIssues.length ? ` · 问题 ${nodeIssues.length}` : '';
  const contentPath = nodeKeyToContentPath(node.key);
  const openBtn = contentPath ? `<button class="btn-sm graph-open-content" data-content-path="${esc(contentPath)}" style="margin-top:8px;">打开编辑</button>` : '';
  return `<div style="padding:12px;background:var(--bg2);border-left:3px solid ${KIND_COLORS[node.kind] || 'var(--accent2)'};">
    <div style="font-size:0.75rem;color:var(--text2);">${esc(node.kindLabel)} / ${esc(node.id)}</div>
    <div style="font-weight:700;color:var(--text);margin:2px 0 6px;">${esc(node.label)}</div>
    <div style="color:var(--accent2);font-size:0.85rem;">${esc(refs)}</div>
    <div style="color:var(--text2);font-size:0.78rem;margin-top:6px;">入边 ${incoming} · 出边 ${outgoing}${issueText}</div>
    ${openBtn}
  </div>`;
}

function renderIssueList(issues) {
  if (!issues.length) {
    return `<div style="margin-top:12px;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text2);font-size:0.85rem;">
      当前视图没有发现断链或孤岛。
    </div>`;
  }
  return `<div style="margin-top:12px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;overflow:hidden;">
    <div style="padding:8px 10px;color:var(--accent2);font-weight:700;border-bottom:1px solid var(--border);">问题列表</div>
    ${issues.map(issue => {
      const color = issue.severity === 'error' ? 'var(--danger)' : 'var(--warn)';
      const contentPath = nodeKeyToContentPath(issue.source) || nodeKeyToContentPath(issue.target);
      const openBtn = contentPath ? `<button class="btn-sm graph-open-content" data-content-path="${esc(contentPath)}" style="margin-top:6px;">打开编辑</button>` : '';
      return `<div class="graph-issue" role="button" tabindex="0" data-node-key="${esc(issue.source)}" style="display:block;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--border);border-radius:0;padding:9px 10px;cursor:pointer;">
        <div style="color:${color};font-weight:700;font-size:0.82rem;">${esc(issue.title)}</div>
        <div style="color:var(--text);font-size:0.8rem;margin-top:2px;">${esc(issue.detail)}</div>
        ${openBtn}
      </div>`;
    }).join('')}
  </div>`;
}

export function openGraphNode(nodeKey) {
  if (!nodeKey) return false;
  selectedKind = 'all';
  selectedGraphView = 'neighborhood';
  selectedNodeKey = nodeKey;
  if (window._switchTab) window._switchTab('graph');
  else renderGraph();
  return true;
}

export function renderGraph() {
  const fullGraph = buildContentGraph(data);
  const kindGraph = filterContentGraph(fullGraph, selectedKind);
  let graph = kindGraph;
  if (selectedGraphView === 'issues') graph = filterIssueGraph(kindGraph);
  if (selectedGraphView === 'neighborhood' && selectedNodeKey) graph = filterNeighborhoodGraph(kindGraph, selectedNodeKey);
  const visibleKeys = new Set(graph.nodes.map(node => node.key));
  if (selectedNodeKey && !visibleKeys.has(selectedNodeKey)) selectedNodeKey = '';
  if (selectedGraphView === 'neighborhood' && !selectedNodeKey) graph = kindGraph;

  const nodeByKey = new Map(graph.nodes.map(node => [node.key, node]));
  const issueMap = issuesByNode(graph.issues);
  const fullIssueMap = issuesByNode(fullGraph.issues);
  const selectedNode = fullGraph.nodes.find(node => node.key === selectedNodeKey);

  const tb = document.getElementById('toolbar');
  const zoomLabel = `${Math.round(graphZoom * 100)}%`;
  tb.innerHTML = `<span>关系图</span>
    <span class="hint">${graph.nodes.length} 个节点 / ${graph.edges.length} 条关系 / ${graph.issues.length} 个问题</span>
    <select id="graph-kind" style="width:120px;">${renderKindOptions()}</select>
    <select id="graph-view" style="width:130px;">${renderViewOptions()}</select>
    <button class="btn-sm" id="graph-zoom-out">-</button>
    <button class="btn-sm" id="graph-zoom-reset">${zoomLabel}</button>
    <button class="btn-sm" id="graph-zoom-in">+</button>`;

  const ct = document.getElementById('content');
  const svgWidth = Math.max(graph.width, 760);
  const svgHeight = Math.max(graph.height, 420);
  ct.innerHTML = `<div style="display:grid;grid-template-columns:minmax(520px,1fr) 280px;gap:12px;min-height:100%;">
    <div style="overflow:auto;background:var(--bg);border:1px solid var(--border);border-radius:6px;">
      <svg width="${Math.round(svgWidth * graphZoom)}" height="${Math.round(svgHeight * graphZoom)}" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="内容关系图">
        <defs>
          <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(224,224,224,0.42)"></path>
          </marker>
        </defs>
        ${renderEdges(graph, nodeByKey)}
        ${renderNodes(graph, issueMap)}
      </svg>
    </div>
    <div>
      ${renderSummary(selectedNode, fullGraph, fullIssueMap)}
      ${renderIssueList(graph.issues)}
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
  document.getElementById('graph-view').onchange = function() {
    selectedGraphView = this.value;
    renderGraph();
  };
  document.getElementById('graph-zoom-out').onclick = function() {
    graphZoom = Math.max(0.6, Math.round((graphZoom - 0.1) * 10) / 10);
    renderGraph();
  };
  document.getElementById('graph-zoom-reset').onclick = function() {
    graphZoom = 1;
    renderGraph();
  };
  document.getElementById('graph-zoom-in').onclick = function() {
    graphZoom = Math.min(1.8, Math.round((graphZoom + 0.1) * 10) / 10);
    renderGraph();
  };
  ct.querySelectorAll('.graph-node').forEach(nodeEl => {
    nodeEl.addEventListener('click', () => {
      selectedNodeKey = nodeEl.dataset.nodeKey;
      renderGraph();
    });
  });
  ct.querySelectorAll('.graph-issue').forEach(issueEl => {
    issueEl.addEventListener('click', () => {
      selectedNodeKey = issueEl.dataset.nodeKey;
      renderGraph();
    });
  });
  ct.querySelectorAll('.graph-open-content').forEach(openEl => {
    openEl.addEventListener('click', e => {
      e.stopPropagation();
      openContentPath(openEl.dataset.contentPath);
    });
  });
}
