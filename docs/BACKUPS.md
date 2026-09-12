# BACKUPS.md — snapshots da integração Dograh

> Cada entrada = ponto estável commitado e arquivado em `/var/www/.backups/`.

## v1.0.5-stable-pre-b1b4 — 11/09/2026 21:19 BRT

**Status:** produção rodando, callback saudável, integração voz+texto funcionando (commit `cdbb0e1`).

**Tag Git:** `v1.0.5-stable-pre-b1b4` (pushed em origin).

**Último commit antes do snapshot:** `dfa1403` — chore: snapshot estável v1.0.5-pre-B1B4.

**Backup local:** `/var/www/.backups/site-automacaojs-v1.0.5-stable-20260911-2119.tar.gz`
- SHA256: `d5dc4daab957a54de1fa9f356db61f47995f50a4a85ca73100fec50a02c085c9`
- Tamanho: 88 KB (sem `node_modules`, `dist`, `.git`, `__pycache__`)

**O que está incluído (sem segredo):**
- `bot.py` (não existe; é `dograh_callback.py`)
- `server/dograh_callback.py` (callback Python)
- `server/dograh.ts` (stub TS não usado em runtime, mantido pra referência)
- `server/dograh_calls_table.sql` (schema Supabase)
- `docs/PRD.md`, `docs/SPEC.md`, `docs/BACKUPS.md`
- `index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`
- `src/` (código-fonte Vite/React)

**O que NÃO está incluído (excluído do tar):**
- `node_modules/` (deps npm, restaurável com `npm ci`)
- `dist/` (build Vite, restaurável com `npm run build`)
- `.git/` (metadata, restaurável com `git clone`)
- `__pycache__/` (cache Python)
- `.env` (segredos — nunca versionado)

**Validação pós-restore:**
```bash
cd /var/www/site-automacaojs
npm ci
npm run build
sudo systemctl restart site-dograh-callback.service
curl http://127.0.0.1:8129/health
# esperado: {"ok": true, "service": "dograh-callback", "port": 8129}
```

**Plano pós-snapshot:**
1. **B1 — Token dinâmico.** Mover `EMBED_TOKEN` do HTML inline pra env do backend + endpoint `/api/dograh/config`. Quebra o vazamento em view-source.
2. **B4 — HMAC validation.** Backend valida `X-Dograh-Signature: sha256=<hex>` quando `DOGRAH_WEBHOOK_SECRET` configurado. Bloqueia injeção de leads falsos.
3. **Diagnóstico Sofia+texto.** Mapear qual tipo WS (`user_message` / `chat_input` / `text`) a Sofia aceita.

Cada melhoria posterior → nova tag + nova entrada aqui.
