# SPEC — Integração Dograh no isaias.automacaojs.us

**Status:** RASCUNHO — aguardando LionLab Spec Review (Q2-Q6) do Isaías
**Data:** 06/09/2026
**Autor:** Claudinho (Modo Mentor 🎓)
**Pré-requisito:** PRD.md aprovado por Isaías em msg 3890 (Q1 resolvida: Agent ID 6 "Automacaojs" v2 published)
**Projeto-alvo:** https://isaias.automacaojs.us/ (Express + Vite + React + Socket.IO, porta 3000)
**Plataforma voz:** https://dograh.automacaojs.us/ (self-hosted FastAPI + Next.js, container Docker)

---

## 1. Descobertas técnicas (probes feitas em 06/09/2026)

Inspecionei os routers do container `dograh-api-1` (`/app/api/routes/`) e o widget JS (`/app/public/embed/dograh-widget.js`). Endpoints REAIS sob `/api/v1`:

| Endpoint | Método | Auth | Função |
|---|---|---|---|
| `/api/v1/workflow/{wf_id}/versions` | GET | JWT | Lista versões (publicadas/archived). v9 = published, v8 = archived |
| `/api/v1/workflow/{wf_id}/runs` | GET | JWT | Lista runs. Retorna `id`, `workflow_id`, `name`, `is_completed`, `transcript_url`, `recording_url`, `gathered_context.call_disposition`, `call_tags`, `cost_info.call_duration_seconds` |
| `/api/v1/workflow/{wf_id}/runs/{run_id}` | GET | JWT | Detalhe do run (mesmos campos) |
| `/api/v1/workflow/{wf_id}/embed-token` | POST | JWT | Cria/atualiza embed token. Body: `{allowed_domains, settings, usage_limit, expires_in_days}`. Retorna `{token, embed_script}` com `<script src=".../embed/dograh-widget.js?token=...">` |
| `/api/v1/workflow/{wf_id}/embed-token` | GET | JWT | Retorna token ativo ou `null` |
| `/api/v1/public/embed/init` | POST | público | Body: `{token, workflow_id}`. Usado pelo widget pra iniciar sessão |
| `/api/v1/public/download/workflow/{token}/{artifact_type}` | GET | público | URL assinada de 1h para `recording` / `transcript` / `user_recording` / `bot_recording`. Redireciona 302 |
| `/api/v1/auth/login` | POST | público | JWT user (já testado) |
| `/api/v1/user/api-keys` | GET | JWT | Lista API keys internas (`dgr_qV5f...` é a padrão) |

**Webhooks nativos no Dograh: NÃO EXISTEM pra fim de chamada.** Só callbacks JS no widget (`onCallConnected`, `onCallDisconnected`, `onCallEnd`, `onCallStart`). O `onCallDisconnected` já passa `workflowRunId` direto no payload:

```js
state.callbacks.onCallDisconnected({
  agentId: state.config.workflowId || null,
  token: state.config.token || null,
  workflowRunId: state.workflowRunId || null,
  durationSeconds
});
```

**Decisão arquitetural simplificadora:** nosso frontend captura o callback, faz `POST /api/webhook/dograh-call` pro nosso Express com `{workflow_run_id, agent_id, duration_seconds}`, e o Express busca transcript+recording via `GET /api/v1/workflow/{agent_id}/runs/{workflow_run_id}` (autenticado como Isaías com API key interna). Zero polling, zero infra extra.

---

## 2. Sprints

### Sprint 1 — Backend webhook + persistência (zero UI)
**Objetivo:** Express recebe evento de fim de chamada, persiste no Supabase, dispara Telegram.
- [ ] Adicionar rota `POST /api/webhook/dograh-call` no `server.ts` (porta 3000)
- [ ] Adicionar rota `GET /api/dograh/runs/:workflowId/:runId` (proxy autenticado pra Dograh — usado internamente pelo webhook)
- [ ] Criar tabela Supabase `dograh_calls` (schema em §3)
- [ ] Helper `summarizeLead(transcript)` que extrai: nome, interesse, dor citada, próximo passo. **Decisão pendente Q2: regex no Node ou chamar MiniMax?**
- [ ] Helper `notifyTelegram(leadSummary)` que dispara pro `@Claude_356_bot` (formato em §4)
- [ ] Rate limit: 1 chamada por IP/sessão (cookie httpOnly `dograh_session_id` + Redis-style in-memory set)
- [ ] Health check: `GET /api/dograh/health` → testa JWT Dograh + ping `/api/v1/health`

### Sprint 2 — Widget embed + front
**Objetivo:** Snippet Dograh visível em todas as páginas do site.
- [ ] Criar embed token via `POST /api/v1/workflow/6/embed-token` com `allowed_domains=["isaias.automacaojs.us", "isaias.local"]`, `expires_in_days=90`
- [ ] Variável `DOGRAH_EMBED_TOKEN` no `.env` (carregada do cofre Hermes, gerada 1x)
- [ ] Adicionar `<div id="dograh-voice-widget">` + `<script>` em `index.html` (carrega `dograh-widget.js?token=...` lazy on `window.DograhVoice` ready)
- [ ] Floating button canto inferior direito com label "Fale comigo" (cor primaria do site)
- [ ] Capturar `onCallDisconnected` → `POST /api/webhook/dograh-call` com `{workflow_run_id, agent_id: 6, duration_seconds}`
- [ ] Loading state durante chamada (mostra timer)
- [ ] Fallback: se Dograh cair ou token expirar, esconder botão (não mostrar erro feio)

### Sprint 3 — Hardening + testes E2E
**Objetivo:** Pronto pra produção.
- [ ] Smoke: 3 chamadas de teste (lead quente, lead frio, lead "só olhando") → 3 mensagens Telegram diferentes
- [ ] iOS Safari real (iPhone Isaías): mic pede permissão corretamente
- [ ] Mobile Android: teste de fechar aba durante chamada (cleanup)
- [ ] Teste Dograh offline: widget reporta "indisponível" em <5s, sem travar UI
- [ ] Verificar: notificação Telegram chega em ≤60s do fim da chamada
- [ ] RLS Supabase na tabela `dograh_calls` (somente service_role lê tudo; ninguém escreve via anon)
- [ ] Limpeza: revogar embed token de teste, gerar novo definitivo pra prod

---

## 3. Schema Supabase

```sql
CREATE TABLE dograh_calls (
  id BIGSERIAL PRIMARY KEY,
  workflow_run_id BIGINT NOT NULL,                  -- run.id no Dograh
  workflow_id INTEGER NOT NULL DEFAULT 6,            -- sempre Agent "Automacaojs"
  call_started_at TIMESTAMPTZ,
  call_ended_at TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER,
  call_disposition TEXT,                             -- user_hangup | user_qualified | etc
  call_tags TEXT[],                                  -- ex: ['user_qualified', 'user_speech']
  transcript_text TEXT,                              -- baixado via /api/v1/public/download/...
  transcript_url TEXT,                               -- URL assinada 1h do Dograh
  recording_url TEXT,                                -- URL assinada 1h do Dograh
  lead_name TEXT,
  lead_interest TEXT,                                -- radio | ebook | crm | automacao | outro
  lead_pain TEXT,
  lead_next_step TEXT,
  visitor_ip INET,                                   -- pra rate limit + auditoria
  visitor_page_url TEXT,                             -- de onde veio a chamada
  telegram_notified BOOLEAN DEFAULT FALSE,
  telegram_message_id BIGINT,                        -- pra editar depois se precisar
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uniq_run UNIQUE (workflow_run_id)
);

CREATE INDEX idx_dograh_calls_created ON dograh_calls(created_at DESC);
CREATE INDEX idx_dograh_calls_notified ON dograh_calls(telegram_notified) WHERE telegram_notified = FALSE;

ALTER TABLE dograh_calls ENABLE ROW LEVEL SECURITY;
-- Service role (backend) lê tudo e escreve; anon/authenticated não acessa direto
-- Política: USING (false) pra todos os roles exceto service_role
```

---

## 4. Formato da mensagem Telegram

Bot: `@Claude_356_bot` (chat_id Isaías: `7845271497`)

```
🔔 Nova chamada Dograh — <interesse>

👤 Lead: <nome ou "anônimo">
⏱️ Duração: <Xs>
📅 <DD/MM HH:MM>
🌐 <page_url>

💬 Interesse: <interesse>
😣 Dor: <dor citada ou "não citada">
➡️ Próximo passo: <passo combinado>

📝 Transcrição: <primeiras 500 chars>...
🎙️ Gravação: <link URL assinada 1h>
🔍 Painel Dograh: https://dograh.automacaojs.us/workflow/6/runs/<run_id>
```

Se transcrição vazia (chamada <5s): mensagem simplificada com "Chamada curta, sem transcrição suficiente".

---

## 5. Dependências / Variáveis de ambiente

| Var | Valor | Origem |
|---|---|---|
| `DOGRAH_EMBED_TOKEN` | token gerado pelo `POST /api/v1/workflow/6/embed-token` | Sprint 2, vai pro `/root/.hermes/secrets/site-automacaojs.env` |
| `DOGRAH_API_KEY` | `dgr_qV5f...` (já obtida via `/api/v1/user/api-keys`) | cofre |
| `DOGRAH_API_BASE` | `https://dograh.automacaojs.us/api/v1` | fixo |
| `DOGRAH_WORKFLOW_ID` | `6` | fixo (Agent "Automacaojs") |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | já existem no `.env` | reaproveita |
| `TELEGRAM_BOT_TOKEN` | já existe no cofre | reaproveita, target `7845271497` |

**Nenhuma dep npm nova.** Só `dotenv`, `express`, `supabase-js` que já estão.

---

## 6. Arquivos

### Novos (3)
- `/var/www/site-automacaojs/server/dograh.ts` (~150 linhas) — webhook + proxy + summarize + notify
- `/var/www/site-automacaojs/server/dograh_calls_table.sql` — DDL §3
- `/var/www/site-automacaojs/src/components/DograhVoiceWidget.tsx` (~80 linhas) — wrapper React do widget JS

### Modificados (3)
- `/var/www/site-automacaojs/server.ts` — `import dograhRouter` + `app.use("/api", dograhRouter)`
- `/var/www/site-automacaojs/index.html` — `<div id="dograh-voice-widget-mount">` antes do `</body>`
- `/var/www/site-automacaojs/.env` (local) + `/root/.hermes/secrets/site-automacaojs.env` (cofre) — 5 vars novas

---

## 7. Riscos técnicos (atualizado)

| Risco | Mitigação concreta |
|---|---|
| Embed token expira em 90d | Cron mensal `regenerateEmbedToken()` (adicionar depois, fora do MVP) |
| Dograh 503 durante chamada | Widget mostra "Indisponível" via `onError` callback |
| Visitante recusa mic | Mensagem "Clique no ícone do cadeado no navegador e libere o microfone" |
| Visitante abre 5 abas e fala 5x | Rate limit 1 chamada/sessão/IP via cookie httpOnly |
| Transcrição >1500 chars (problema recorrente nos outros projetos) | Limitar primeiros 500 chars + link pra Dograh UI |
| Telegram offline | INSERT mesmo assim, `telegram_notified=FALSE`; job retry depois |

---

## 8. For the record — endpoints que NÃO servem

Pra evitar que eu ou Isaías percamos tempo testando de novo:
- ❌ `/api/v1/agents` — não existe (Dograh chama de "workflow")
- ❌ `/api/v1/workflows/*` (com s) — também não existe (singular é `/workflow`)
- ❌ `/api/v1/webhook` — não existe como receptor de fim de chamada (só telephony webhook)
- ❌ `/api/v1/user` (sem path) — 404, só `/api/v1/user/api-keys` serve
- ❌ `/api/v1/openapi.json` — redireciona pra `/auth/login` (frontend Next.js engolindo o path)
- ✅ Dograh OpenAPI real fica em `/api/openapi.json` ou via Swagger UI em `/docs`

---

## 📝 Aprovação — LionLab Spec Review (Q2-Q6)

Responde em PT-BR, marca **uma** letra por pergunta:

**Q2 — Como gerar o resumo estruturado do lead (nome, interesse, dor, próximo passo) que vai no Telegram?**
- a) **Regex no Node** sobre o texto bruto da transcrição (rápido, sem custo LLM, frágil se formato mudar)
- b) **Chamar MiniMax MiniMax** com prompt focado (custo ~$0.001/chamada, robusto, adiciona ~2s de latência)
- c) **Híbrido** — regex pra campos simples (nome detectado por "meu nome é X"), MiniMax só pra dor/próximo passo

**Q3 — Onde armazenar transcrição e gravação?**
- a) **Só no Dograh** (URL assinada 1h + link pro painel) — simples, dograh cuida do storage
- b) **Baixar pra Supabase Storage** na hora —耐久性, URLs永久, custo extra
- c) **URLs do Dograh + cache local no Supabase Storage com TTL 7d** — compromisso

**Q4 — Onde hospedar a lógica de webhook/persistência?**
- a) **Mesmo Express atual do site** (`isaias.automacaojs.us` porta 3000) — reaproveita tudo, mesmo deploy
- b) **Subdomínio novo** `api.isaias.automacaojs.us` — separação limpa, TLS dedicado
- c) **Worker separado** rodando só pra Dograh — overkill pro MVP

**Q5 — Supabase dedicado ou compartilhar com o Leitor?**
- a) **Compartilhar Supabase do Leitor** (já temos URL+key, tabela `dograh_calls` num schema público separado)
- b) **Supabase novo dedicado** (`isaias-site`) — isolamento, mais config
- c) **Sem Supabase, só arquivo JSON local** — vale pra MVP mínimo se tiver ≤50 chamadas/dia

**Q6 — Anti-duplicidade / rate limit de chamadas por visitante**
- a) **1 chamada por sessão (cookie httpOnly 24h)** — simples, sufoca abuso
- b) **1 chamada por IP por dia** — mais agressivo, evita VPN bypass
- c) **Sem limite** — confia no widget oficial Dograh pra tracking
- d) **Rate limit adaptativo** — 1ª chamada ok, 2ª pede CAPTCHA invisível

---

Responde Q2-Q6 e me devolve. Depois disso eu disparo o **aviso pedagógico de limpar contexto** (Fase 4 do Mentor) antes de codar Sprint 1.
