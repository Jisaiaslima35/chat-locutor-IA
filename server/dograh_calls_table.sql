-- Dograh calls table — Sprint 1 da integração Dograh
-- Q5=a: compartilhando o Supabase do Leitor (`ihwkzqjliulchfdusfcp.supabase.co`)

CREATE TABLE IF NOT EXISTS dograh_calls (
  id BIGSERIAL PRIMARY KEY,
  workflow_run_id BIGINT NOT NULL,
  workflow_id INTEGER NOT NULL DEFAULT 6,
  call_started_at TIMESTAMPTZ,
  call_ended_at TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER,
  call_disposition TEXT,
  call_tags TEXT[],
  transcript_text TEXT,
  transcript_url TEXT,
  recording_url TEXT,
  lead_name TEXT,
  lead_interest TEXT,
  lead_pain TEXT,
  lead_next_step TEXT,
  visitor_ip INET,
  visitor_page_url TEXT,
  telegram_notified BOOLEAN DEFAULT FALSE,
  telegram_message_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uniq_run UNIQUE (workflow_run_id)
);

CREATE INDEX IF NOT EXISTS idx_dograh_calls_created ON dograh_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dograh_calls_notified
  ON dograh_calls(telegram_notified) WHERE telegram_notified = FALSE;

-- Q5=a: nenhum usuário anon/authenticated deve ler essa tabela direto.
-- Backend usa service_role key; frontend não precisa acessar.
ALTER TABLE dograh_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dograh_calls_anon_read ON dograh_calls;
DROP POLICY IF EXISTS dograh_calls_auth_read ON dograh_calls;
CREATE POLICY dograh_calls_anon_read ON dograh_calls FOR SELECT TO anon USING (false);
CREATE POLICY dograh_calls_auth_read ON dograh_calls FOR SELECT TO authenticated USING (false);

-- INSERT/UPDATE/DELETE bloqueados pra anon e authenticated (só service_role via backend)
DROP POLICY IF EXISTS dograh_calls_anon_write ON dograh_calls;
DROP POLICY IF EXISTS dograh_calls_auth_write ON dograh_calls;
CREATE POLICY dograh_calls_anon_write ON dograh_calls FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY dograh_calls_auth_write ON dograh_calls FOR ALL TO authenticated USING (false) WITH CHECK (false);
