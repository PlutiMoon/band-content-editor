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

-- 4. 操作历史表（每次修改自动记录快照）
CREATE TABLE IF NOT EXISTS documents_history (
  id SERIAL PRIMARY KEY,
  doc_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION log_document_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO documents_history (doc_id, type, data, updated_by, updated_at)
  VALUES (OLD.id, OLD.type, OLD.data, OLD.updated_by, OLD.updated_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_documents_history ON documents;
CREATE TRIGGER tr_documents_history
BEFORE UPDATE OR DELETE ON documents
FOR EACH ROW EXECUTE FUNCTION log_document_change();

-- 5. 初始化种子数据（可选 — 把现有 JSON 内容写入数据库）
-- 使用方法：把下面 INSERT 语句的 data 值替换为你的 JSON 文件内容

-- INSERT INTO documents (id, type, data) VALUES
--   ('actions', 'actions', '[{"id":"work_livehouse","name":"打工",...}]'::jsonb),
--   ('events', 'events', '[{"id":"landlord_rent","name":"房东催租",...}]'::jsonb),
--   ('dialogues/npc_小明', 'dialogues', '{"dialogue_id":"npc_小明","nodes":[...]}'::jsonb),
--   ('phone_chats', 'phone_chats', '[{"chat_id":"band_group",...}]'::jsonb)
-- ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
