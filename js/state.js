// ════════════════════════════════════════════
// GLOBAL STATE — mutable, shared across all modules
// ════════════════════════════════════════════

export let supabase = null;
export const clientId = sessionStorage.getItem('band_client_id') || ('u_' + Math.random().toString(36).slice(2,10));
sessionStorage.setItem('band_client_id', clientId);

export let currentTab = 'actions';
export let selectedIdx = -1;
export let selectedDialogueIdx = -1;
export let selectedChatIdx = -1;
export let data = { actions: [], events: [], dialogues: {}, phone_chats: [], maps: [], locations: [], npcs: [], game_config: {} };
export let userName = '';
export let editorAccessKey = '';

// ── Mobile navigation state ──
export let mobilePhoneView = 'list';       // 'list' | 'chat'
export let mobileDialogueView = 'list';    // 'list' | 'nodes' | 'editor'
export let mobileEditingNodeIdx = -1;
export let mobileEditingMsgIdx = -1;

// ── World tab state ──
export let worldSection = 'config';  // 'config' | 'locations' | 'npcs'
export let selectedLocationIdx = -1;
export let selectedNPCIdx = -1;
export let selectedMapIdx = -1;

// ── Setters (for imports that need to reassign) ──
export function setSupabase(v) { supabase = v; }
export function setCurrentTab(v) { currentTab = v; }
export function setSelectedIdx(v) { selectedIdx = v; }
export function setSelectedDialogueIdx(v) { selectedDialogueIdx = v; }
export function setSelectedChatIdx(v) { selectedChatIdx = v; }
export function setData(v) { data = v; }
export function setUserName(v) { userName = v; }
export function setEditorAccessKey(v) { editorAccessKey = v; }
export function setMobilePhoneView(v) { mobilePhoneView = v; }
export function setMobileDialogueView(v) { mobileDialogueView = v; }
export function setMobileEditingNodeIdx(v) { mobileEditingNodeIdx = v; }
export function setMobileEditingMsgIdx(v) { mobileEditingMsgIdx = v; }
export function setWorldSection(v) { worldSection = v; }
export function setSelectedLocationIdx(v) { selectedLocationIdx = v; }
export function setSelectedNPCIdx(v) { selectedNPCIdx = v; }
export function setSelectedMapIdx(v) { selectedMapIdx = v; }
