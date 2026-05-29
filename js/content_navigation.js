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
import { renderActions } from './actions.js';
import { renderEvents } from './events.js';
import { renderDialogues } from './dialogues.js';
import { renderPhone } from './phone.js';
import { renderWorld } from './world.js';
import { resolveSearchNavigation } from './search_index.js';

export function openContentPath(path) {
  const nav = resolveSearchNavigation(data, path);
  if (!nav || !window._switchTab) return false;
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
  return true;
}
