import {
  data,
  setSelectedIdx,
  setSelectedDialogueIdx,
  setSelectedChatIdx,
  setMobilePhoneView,
  setMobileDialogueView,
  setWorldSection,
  setSelectedLocationIdx,
  setSelectedNPCIdx,
  setSelectedMapIdx,
} from './state.js';
import { esc } from './forms.js';
import { renderActions } from './actions.js';
import { renderEvents } from './events.js';
import { renderDialogues } from './dialogues.js';
import { renderPhone } from './phone.js';
import { renderWorld } from './world.js';
import { resolveSearchNavigation, searchContent } from './search_index.js';

const KIND_OPTIONS = [
  ['all', '全部'],
  ['action', '行动'],
  ['event', '事件'],
  ['dialogue', '对话'],
  ['phone', '手机'],
  ['map', '地图'],
  ['location', '地点'],
  ['npc', 'NPC'],
  ['game_config', '配置'],
];

let searchQuery = '';
let selectedKind = 'all';

function renderKindOptions() {
  return KIND_OPTIONS
    .map(([kind, label]) => `<option value="${kind}" ${kind === selectedKind ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function renderResults(results) {
  if (!searchQuery.trim()) {
    return `<div style="padding:48px 16px;background:var(--bg2);text-align:center;color:var(--text2);">
      输入 ID、名称、对话文本、事件效果或地点/NPC 关键词开始搜索。
    </div>`;
  }
  if (!results.length) {
    return `<div style="padding:48px 16px;background:var(--bg2);text-align:center;color:var(--text2);">
      没有找到匹配内容。
    </div>`;
  }
  let html = '<table><thead><tr><th>类型</th><th>位置</th><th>名称</th><th>片段</th><th></th></tr></thead><tbody>';
  for (const result of results) {
    html += `<tr class="search-result" data-search-path="${esc(result.path)}">
      <td>${esc(result.kindLabel)}</td>
      <td><code>${esc(result.path)}</code></td>
      <td>${esc(result.label)}</td>
      <td>${esc(result.snippet)}</td>
      <td><button class="btn-sm search-open" data-search-path="${esc(result.path)}">打开</button></td>
    </tr>`;
  }
  html += '</tbody></table>';
  return html;
}

function openSearchResult(path) {
  const nav = resolveSearchNavigation(data, path);
  if (!nav || !window._switchTab) return;
  window._switchTab(nav.tab);

  if (nav.tab === 'actions') {
    setSelectedIdx(nav.selectedIdx);
    renderActions();
  } else if (nav.tab === 'events') {
    setSelectedIdx(nav.selectedIdx);
    renderEvents();
  } else if (nav.tab === 'dialogues') {
    setSelectedDialogueIdx(nav.selectedDialogueIdx);
    setMobileDialogueView('nodes');
    renderDialogues();
  } else if (nav.tab === 'phone') {
    setSelectedChatIdx(nav.selectedChatIdx);
    setMobilePhoneView('chat');
    renderPhone();
  } else if (nav.tab === 'world') {
    setWorldSection(nav.worldSection || 'config');
    setSelectedLocationIdx(nav.selectedLocationIdx ?? -1);
    setSelectedNPCIdx(nav.selectedNPCIdx ?? -1);
    setSelectedMapIdx(nav.selectedMapIdx ?? -1);
    renderWorld();
  }
}

export function renderSearch() {
  const results = searchContent(data, searchQuery, { kind: selectedKind });
  const tb = document.getElementById('toolbar');
  tb.innerHTML = `<span>搜索</span>
    <span class="hint">${searchQuery.trim() ? `${results.length} 条结果` : '全局内容检索'}</span>
    <select id="search-kind" style="width:120px;">${renderKindOptions()}</select>`;

  const ct = document.getElementById('content');
  ct.innerHTML = `<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;">
      <input id="search-query" value="${esc(searchQuery)}" placeholder="搜索 ID、名称、文本、触发器、效果..." style="max-width:520px;">
      <button id="search-clear" class="btn-sm">清空</button>
    </div>
    ${renderResults(results)}`;

  const input = document.getElementById('search-query');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  input.oninput = function() {
    searchQuery = this.value;
    renderSearch();
  };
  document.getElementById('search-kind').onchange = function() {
    selectedKind = this.value;
    renderSearch();
  };
  document.getElementById('search-clear').onclick = function() {
    searchQuery = '';
    renderSearch();
  };
  ct.querySelectorAll('.search-result, .search-open').forEach(el => {
    el.onclick = function(e) {
      e.stopPropagation();
      openSearchResult(this.dataset.searchPath);
    };
  });
}
