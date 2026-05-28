-- Supabase RPC gate for the BAND content editor.
-- Run this after deploying the editor version that calls the RPC functions.
--
-- Replace CHANGE_ME_EDITOR_ACCESS_KEY before running in Supabase SQL Editor.
-- Do not commit the real editor access key.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_settings FROM anon, authenticated;

INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'editor_access_key_hash',
  crypt('CHANGE_ME_EDITOR_ACCESS_KEY', gen_salt('bf')),
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION public.verify_editor_access_key(input_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  stored_hash TEXT;
BEGIN
  IF input_key IS NULL OR length(btrim(input_key)) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT value INTO stored_hash
  FROM public.app_settings
  WHERE key = 'editor_access_key_hash';

  IF stored_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN stored_hash = crypt(input_key, stored_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.editor_list_documents(input_key TEXT)
RETURNS TABLE (
  id TEXT,
  type TEXT,
  data JSONB,
  updated_by TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.verify_editor_access_key(input_key) THEN
    RAISE EXCEPTION 'invalid editor access key' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT d.id, d.type, d.data, d.updated_by, d.updated_at
  FROM public.documents d
  ORDER BY d.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.editor_upsert_document(
  input_key TEXT,
  doc_id TEXT,
  doc_type TEXT,
  doc_data JSONB,
  updater TEXT DEFAULT 'anonymous'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.verify_editor_access_key(input_key) THEN
    RAISE EXCEPTION 'invalid editor access key' USING ERRCODE = '28000';
  END IF;

  IF doc_id IS NULL OR length(btrim(doc_id)) = 0 THEN
    RAISE EXCEPTION 'doc_id is required' USING ERRCODE = '22023';
  END IF;

  IF doc_type IS NULL OR length(btrim(doc_type)) = 0 THEN
    RAISE EXCEPTION 'doc_type is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.documents (id, type, data, updated_by, updated_at)
  VALUES (
    doc_id,
    doc_type,
    COALESCE(doc_data, '{}'::jsonb),
    COALESCE(NULLIF(updater, ''), 'anonymous'),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET type = EXCLUDED.type,
      data = EXCLUDED.data,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.editor_delete_document(input_key TEXT, doc_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.verify_editor_access_key(input_key) THEN
    RAISE EXCEPTION 'invalid editor access key' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.documents
  WHERE id = doc_id;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_editor_access_key(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.editor_list_documents(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.editor_upsert_document(TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.editor_delete_document(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.editor_list_documents(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.editor_upsert_document(TEXT, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.editor_delete_document(TEXT, TEXT) TO anon, authenticated;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access" ON public.documents;
DROP POLICY IF EXISTS "deny_direct_select" ON public.documents;
DROP POLICY IF EXISTS "deny_direct_insert" ON public.documents;
DROP POLICY IF EXISTS "deny_direct_update" ON public.documents;
DROP POLICY IF EXISTS "deny_direct_delete" ON public.documents;

CREATE POLICY "deny_direct_select" ON public.documents
FOR SELECT TO anon, authenticated
USING (FALSE);

CREATE POLICY "deny_direct_insert" ON public.documents
FOR INSERT TO anon, authenticated
WITH CHECK (FALSE);

CREATE POLICY "deny_direct_update" ON public.documents
FOR UPDATE TO anon, authenticated
USING (FALSE)
WITH CHECK (FALSE);

CREATE POLICY "deny_direct_delete" ON public.documents
FOR DELETE TO anon, authenticated
USING (FALSE);
