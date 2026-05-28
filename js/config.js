// ════════════════════════════════════════════
// CONFIG — 部署前修改这里
// ════════════════════════════════════════════
export const SUPABASE_URL = 'https://vgvghwcqcedycgpcvale.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_2sZdHKX2tAedbQDun5Cw4A_qch2a9Eg';

// ── Game Constants ──
export const STAT_NAMES = ['演奏力','创作力','社交力','魅力','执行力','精神状态'];
export const PHASES = ['早晨','下午','傍晚','深夜'];
export const LOCATIONS = ['livehouse','rehearsal_room','rental_room','bar','poster_wall'];
export const LOCATION_LABELS = { livehouse:'Livehouse', rehearsal_room:'排练室', rental_room:'出租屋', bar:'酒吧', poster_wall:'海报墙' };
export const TRIGGER_TYPES = ['phase_start','action_complete','location','stat_threshold','week_end'];
export const TRIGGER_LABELS = { phase_start:'进入时段', action_complete:'完成行动后', location:'进入地点时', stat_threshold:'属性达标', week_end:'一周结束时' };
export const OPS = ['>=','<=','>','<','==','!='];
export const NPC_IDS = ['npc_xiao_ming','npc_lao_wang','npc_zhang_jie','npc_li_ge','npc_chen_lao_shi'];
export const NPC_NAMES = ['小明','老王','张姐','李哥','陈老师'];
