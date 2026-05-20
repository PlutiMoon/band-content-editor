-- 在 Supabase SQL Editor 中执行此脚本
-- https://supabase.com/dashboard/project/<你的项目ID>/sql/new

-- 1. 创建数据表
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  updated_by TEXT DEFAULT '匿名',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 开启实时广播
ALTER PUBLICATION supabase_realtime ADD TABLE documents;

-- 3. RLS 开放访问（游戏内容数据无敏感信息，通过密码页做软控制）
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_access" ON documents FOR ALL USING (true);

-- 4. 初始化种子数据（可选 — 把现有 JSON 内容写入数据库）
-- 使用方法：把下面 INSERT 语句的 data 值替换为你的 JSON 文件内容

-- INSERT INTO documents (id, type, data) VALUES
--   ('actions', 'actions', '[{"id":"work_livehouse","name":"打工",...}]'::jsonb),
--   ('events', 'events', '[{"id":"landlord_rent","name":"房东催租",...}]'::jsonb),
--   ('dialogues/npc_小明', 'dialogues', '{"dialogue_id":"npc_小明","nodes":[...]}'::jsonb),
--   ('phone_chats', 'phone_chats', '[{"chat_id":"band_group",...}]'::jsonb)
-- ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
