# PRD — Integração Dograh no isaias.automacaojs.us

**Status:** RASCUNHO — aguardando aprovação do Isaías
**Data:** 06/09/2026
**Autor:** Claudinho (Modo Mentor 🎓)
**Projeto-alvo:** https://isaias.automacaojs.us/ (Express + Vite + React + Socket.IO)
**Plataforma voz:** https://dograh.automacaojs.us/ (self-hosted, container Docker)

---

## 1. Contexto / Problema

Isaías quer **transformar visitantes anônimos do site pessoal em leads qualificados** através de uma conversa de voz (microfone do navegador) com um agente de IA que vende ativamente seus serviços. Hoje o site é estático/informativo — o visitante lê e sai. Falta um ponto de conversão ativo, especialmente fora do horário comercial.

**Por que Dograh (e não outra solução):**
- Já roda self-hosted no VPS (https://dograh.automacaojs.us/)
- Open-source BSD-2 (Vapi/Retell alternativa)
- BYO-models (STT/LLM/TTS) — usa MiniMax MiniMax que já temos
- Workflow builder visual — Isaías pode ajustar o pitch sem mexer em código
- Widget embed oficial com 1 snippet `<script>`

**Estado atual:**
- Login Dograh funcional (`isaiassilva356@gmail.com`, senha atualizada hoje)
- Workflow/agent ID 6 "Automacaojs" já criado no painel Dograh (precisa validar que existe — ver §10)
- Site isaias.automacaojs.us em HTTPS via Cloudflare Tunnel — pronto pra embed

---

## 2. DENTRO de escopo ✅

| # | Funcionalidade | Detalhe |
|---|---|---|
| F1 | **Widget de voz flutuante** | Botão canto inferior direito em **todas** as páginas do site, em pt-BR, abrindo chamada de áudio ao vivo (WebRTC) |
| F2 | **Agente ID 6 "Automacaojs"** | Refinar o pitch atual pra: captar lead, qualificar interesse (rádio/ebook/CRM/automação), anotar dor, oferecer próximo passo concreto |
| F3 | **Webhook de fim de chamada** | Endpoint `POST /api/webhook/dograh-call` no Express local — recebe evento `onCallDisconnected`, busca transcrição+gravação via API Dograh, persiste no banco Supabase, dispara notificação no Telegram |
| F4 | **Persistência completa** | Cada chamada vira um registro em tabela `dograh_calls` no Supabase com: `run_id`, `agent_id`, `started_at`, `ended_at`, `duration_seconds`, `transcript_json`, `recording_url`, `lead_extracted_json`, `page_url` |
| F5 | **Resumo estruturado no Telegram** | Bot `@Claude_356_bot` (canal Isaías) recebe: lead name (se informado), interesse principal, dor citada, próximo passo combinado, link da gravação, link pro registro no painel |
| F6 | **Anti-duplicidade / spam** | Limite 1 chamada por sessão por IP (proteção de abuso). Limite removível em horário comercial |

## 3. FORA de escopo ❌

- ❌ Telefonia SIP/Twilio (chamadas de celular real) — só web no navegador
- ❌ Múltiplos agentes especializados — apenas 1 (ID 6 "Automacaojs"). Criar agentes extras fica pra v2
- ❌ Painel admin no site pra visualizar leads — Isaías vê no painel Dograh (https://dograh.automacaojs.us/) + Telegram
- ❌ Transferência pra humano (handoff ao vivo) — fluxo 100% IA por enquanto
- ❌ Agendamento automático de reunião (Calendly inline) — fora; o agente só captura interesse, follow-up é manual via Telegram
- ❌ Chat de texto (só voz no MVP)
- ❌ Análise de sentimento / scoring automático — fora, lead vira dado bruto
- ❌ Multi-idioma — só pt-BR

## 4. Personas

### P1 — Visitante anônimo (lead frio)
- Chegou pelo Google, rede social, indicação
- Passou 30s+ no site, tem interesse em algo (rádio, ebook, CRM, IA)
- **Dor:** "não tenho tempo de preencher formulário" / "será que esse cara resolve mesmo?"
- **Desejo:** ser atendido rápido, sem fricção, tirar dúvida real

### P2 — Isaías (operador)
- Quer leads quentes direto no celular
- **Dor:** "chego de manhã e não sei se alguém visitou"
- **Desejo:** notificação resumida no Telegram com próximo passo claro

## 5. User Stories

| ID | Como | Quero | Pra |
|---|---|---|---|
| US1 | P1 | Clicar num botão no canto do site e falar com a IA em até 5s | Tirar minha dúvida sem preencher formulário |
| US2 | P1 | Que a IA me entenda, responda em pt-BR e ofereça algo concreto | Decidir se contrato |
| US3 | P2 | Receber no Telegram cada chamada com resumo do lead e link da gravação | Responder em <1h quando o lead tá quente |
| US4 | P2 | Ver todas as chamadas registradas no painel Dograh pra escutar de novo | Lembrar contexto em follow-ups |
| US5 | P2 | Ajustar o pitch do agente pelo painel visual sem mexer em código | Iterar mensagem sem deploy |

## 6. Critérios de aceite (Definition of Done)

- [ ] Botão flutuante aparece em **100% das páginas** do site, responsivo (mobile + desktop)
- [ ] Clicar inicia a chamada em ≤5s (rede boa)
- [ ] Mensagem da IA em pt-BR, tom profissional + simpático
- [ ] Ao fim da chamada, registro criado em `dograh_calls` em ≤30s
- [ ] Notificação Telegram chega em ≤60s do fim da chamada
- [ ] Gravação fica acessível por ≥7 dias (URL pública temporária do Dograh ou cache local)
- [ ] Teste manual: 3 chamadas de teste (lead quente, lead frio, lead "só olhando") geram 3 mensagens Telegram diferentes com resumos coerentes
- [ ] Mobile: microfone pede permissão corretamente, sem travar em iOS Safari
- [ ] Smoke test: 1 chamada real do Isaías + 1 minha + 1 de lead de teste (a combinar)
- [ ] Site NÃO quebra se Dograh cair (try/catch no snippet; botão fica oculto ou mostra "Indisponível")

## 7. Arquitetura de alto nível

```
┌──────────────────────────────────┐         ┌──────────────────────────┐
│  Visitante no site               │         │  isaias.automacaojs.us   │
│  isaias.automacaojs.us           │ ◄─────► │  Express + Vite + React  │
│  (navegador)                     │  HTTPS  │  /var/www/site-automacaojs
└──────────────────────────────────┘         └──────────────────────────┘
        │                                              │
        │ WebRTC áudio                                  │
        ▼                                              ▼
┌──────────────────────────────────┐         ┌──────────────────────────┐
│  Dograh Widget (dograh-widget.js)│         │  Backend Express         │
│  carregado por <script>          │         │  server.ts               │
│  callbacks onCallConnected/      │         │                          │
│  onCallDisconnected              │         │  POST /api/webhook/      │
└──────────────────────────────────┘         │  dograh-call             │
        │                                     │                          │
        │ HTTPS                               │  - busca transcript      │
        ▼                                     │    via Dograh API        │
┌──────────────────────────────────┐         │  - INSERT Supabase       │
│  dograh.automacaojs.us           │ ◄───────│  - send Telegram msg     │
│  (Vapi-like self-hosted)         │         │                          │
│                                  │         └──────────────────────────┘
│  Agent ID 6 "Automacaojs"        │                  │            │
│  workflow no painel visual       │                  ▼            ▼
│                                  │         ┌──────────────┐ ┌──────────────┐
└──────────────────────────────────┘         │  Supabase    │ │  Telegram    │
                                            │  (Postgres)  │ │  @Claude_356 │
                                            └──────────────┘ └──────────────┘
```

## 8. Dependências / Restrições

- **HTTPS obrigatório** (já temos, via Cloudflare Tunnel)
- **Dograh rodando** (containers ativos, validado)
- **Supabase acessível** do backend Express (credenciais em `/root/.hermes/secrets/leitor-supabase.env` ou similar)
- **Telegram bot token** carregado do cofre Hermes (já temos, ver `feedback-cofre-hermes-permissao`)
- **Variável `DOGRAH_API_TOKEN`** a criar — API key do usuário Isaías no painel Dograh (criar via `POST /api/v1/user/api-keys` na Fase 4)
- **Cloudflare Tunnel** — pode precisar adicionar rota se backend ficar em subdomínio novo (`api.isaias.automacaojs.us`?) — definir na SPEC

## 9. Riscos iniciais

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Dograh UI/embed muda de schema sem aviso | Média | Alto | Widget oficial + versionar snippet; testar build nova em staging antes |
| Áudio WebRTC bloqueado por firewall corporativo de visitante | Alta | Médio | Mostrar mensagem "Use headphones e libere o mic"; fallback pra chat (futuro) |
| Limite de uso/custo de LLM/MiniMax sobe com tráfego | Média | Médio | Rate-limit 1 chamada/sessão/IP + dashboard de uso no Dograh |
| Transcript vazio se visitante desligar antes de 5s | Média | Baixo | Salvar só o que tiver; notificar Telegram com "chamada curta, sem transcript" |
| iOS Safari recusa mic sem user gesture no botão | Alta | Médio | Widget oficial já trata; testar em iPhone real antes do go-live |
| Bot Telegram offline | Baixa | Alto | Retry com fila local em JSON, reenviar quando bot voltar |
| Lead inventado / abusador | Média | Médio | Limite 1/sessão + Supabase RLS + WAF Cloudflare |

## 10. Dúvidas / Validações pendentes pra Fase 3 (SPEC)

Antes da SPEC, preciso validar:
- **Q1:** O Agent ID 6 "Automacaojs" existe mesmo? (não consegui listar via API — endpoint retornou 404, investigar na SPEC se precisa de permissões ou path diferente)
- **Q2:** Dograh expõe webhook de fim de chamada OU só callback JS no front? (docs mencionam `onCallDisconnected` no widget + endpoint `GET /runs/{run_id}` pra puxar detalhes depois)
- **Q3:** Como pegar transcript completo? Via `GET /runs/{run_id}` ou webhook POST?
- **Q4:** Embed token do widget — onde gera? (provavelmente `POST /api/v1/embed_tokens` ou via UI do painel)
- **Q5:** Hospedar backend em subdomínio novo (`api.isaias.automacaojs.us`) ou em path `/api/...` no domínio atual?
- **Q6:** Usar Supabase do Leitor ou criar projeto Supabase novo dedicado ao isaias-site?

---

## 📝 Aprovação

**Isaías, leu o PRD? Marca a opção e me devolve:**

a) ✅ Aprovado como está — manda pra Fase 3 (SPEC)
b) ⚠️ Aprovado com ajustes — vou listar embaixo
c) ❌ Reprovar — voltar pra Fase 1 (explorar mais / refazer escopo)

**Observações que vão pra SPEC como restrições:**
(Isaías escreve aqui)
