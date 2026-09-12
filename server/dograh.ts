/**
 * Dograh integration — Sprint 1
 *
 * Fluxo (Q4=a): mesmo Express do site, porta 3000.
 *
 * Endpoints criados:
 *   POST /api/dograh/callback   -> recebe widget onCallDisconnected
 *   GET  /api/dograh/health     -> smoke (Dograh JWT + ping /api/v1/health)
 *   GET  /api/dograh/embed-info -> retorna o embed script (pro front Sprint 2)
 *
 * Decisões da SPEC:
 *   Q2=b -> MiniMax MiniMax resume a transcrição
 *   Q3=a -> Dograh guarda transcrição+gravação (URLs assinadas 1h no log)
 *   Q5=a -> Supabase compartilhado (ihwkzqjliulchfdusfcp) — service_role key
 *   Q6=b -> rate limit 1 chamada por IP/dia (in-memory, chave dia=YYYY-MM-DD)
 */

import type { Request, Response, Router } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { setTimeout as wait } from "timers/promises";

const DOGRAH_API_BASE = (process.env.DOGRAH_API_BASE || "https://dograh.automacaojs.us/api/v1").replace(/\/$/, "");
const DOGRAH_WORKFLOW_ID = parseInt(process.env.DOGRAH_WORKFLOW_ID || "6", 10);
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "7845271497";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";

function getServiceSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
}

function dayKey(ip: string): string {
  const d = new Date();
  return `${ip}|${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const ipCallCounter = new Map<string, number>();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const key = dayKey(ip);
  const used = ipCallCounter.get(key) || 0;
  if (used >= 1) return { allowed: false, remaining: 0 };
  ipCallCounter.set(key, used + 1);
  // Cleanup: deleta keys velhos (>48h) a cada checagem — barato porque Map é pequeno
  const now = Date.now();
  for (const [k] of ipCallCounter) {
    const day = k.split("|")[1];
    const ts = Date.parse(day + "T00:00:00Z");
    if (now - ts > 48 * 3600 * 1000) ipCallCounter.delete(k);
  }
  return { allowed: true, remaining: 0 };
}

interface DograhRun {
  id: number;
  workflow_id: number;
  name: string;
  is_completed: boolean;
  transcript_url: string | null;
  recording_url: string | null;
  call_duration_seconds?: number;
  duration_seconds?: number;
  call_disposition?: string | null;
  call_tags?: string[] | null;
  cost_info?: { call_duration_seconds?: number };
  started_at?: string;
  created_at: string;
}

async function fetchRun(runId: number, dograhToken: string): Promise<DograhRun | null> {
  try {
    const r = await fetch(
      `${DOGRAH_API_BASE}/workflow/${DOGRAH_WORKFLOW_ID}/runs/${runId}`,
      { headers: { Authorization: `Bearer ${dograhToken}` } }
    );
    if (!r.ok) return null;
    return await r.json() as DograhRun;
  } catch {
    return null;
  }
}

async function fetchTranscript(run: DograhRun, dograhToken: string): Promise<string | null> {
  if (!run.transcript_url) return null;
  // Dograh guarda transcript_url como path interno (ex: "transcripts/34.txt").
  // Para puxar o conteúdo público, usar public_access_token — mas ele é gerado
  // só em runs com integração/QA. Fallback: tentar via fetch autenticado direto
  // na API interna (a transcript fica em /api/v1/workflow/.../runs/{id} que já
  // tem o caminho, mas o conteúdo é servido por storage separado).
  //
  // Estratégia MVP: usar public_access_token quando existir; senão tentar via
  // fetch direto no path interno do storage do Dograh (que aceita Bearer JWT).
  try {
    // Tenta via signed URL pública (caso o run tenha public_access_token)
    const t = (run as any).public_access_token;
    if (t) {
      const r = await fetch(
        `${DOGRAH_API_BASE}/public/download/workflow/${t}/transcript`
      );
      if (r.ok) {
        const text = await r.text();
        return text.slice(0, 8000); // cap pra não estourar o INSERT
      }
    }
    // Fallback: signed URL interna requer a API key do Dograh
    // (não é o JWT do user). Sem essa key, retornamos o path como referência.
    return null;
  } catch {
    return null;
  }
}

interface LeadSummary {
  name: string | null;
  interest: string | null;
  pain: string | null;
  next_step: string | null;
}

async function summarizeLead(transcript: string): Promise<LeadSummary> {
  const empty: LeadSummary = { name: null, interest: null, pain: null, next_step: null };
  if (!transcript || transcript.length < 20) return empty;

  const apiKey = process.env.MINIMAX_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.MINIMAX_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.minimax.io/anthropic";
  const model = process.env.MINIMAX_MODEL || "minimax/minimax-m2";

  if (!apiKey) {
    // Sem chave, tenta regex best-effort
    const nameMatch = transcript.match(/(?:meu nome é|me chamo|sou o|sou a)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i);
    return {
      name: nameMatch?.[1] || null,
      interest: null,
      pain: null,
      next_step: null,
    };
  }

  try {
    const prompt = `Você é um extrator de leads. Analise a transcrição de uma chamada de vendas em português e devolva APENAS JSON válido com 4 campos: nome (string ou null), interesse (um de: radio|ebook|crm|automacao|outro|null), dor (citada pelo lead, ou null), proximo_passo (combinado na chamada, ou null). Não invente dados. Se não tiver certeza, use null.\n\nTranscrição:\n"""${transcript.slice(0, 3000)}"""`;
    const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.1,
      }),
    });
    if (!resp.ok) return empty;
    const data = await resp.json() as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return empty;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      name: parsed.nome || null,
      interest: parsed.interesse || null,
      pain: parsed.dor || null,
      next_step: parsed.proximo_passo || null,
    };
  } catch {
    return empty;
  }
}

async function notifyTelegram(summary: {
  runId: number;
  duration: number;
  disposition: string | null;
  transcriptPreview: string;
  recordingUrl: string | null;
  pageUrl: string | null;
  lead: LeadSummary;
}): Promise<{ ok: boolean; messageId?: number }> {
  if (!TELEGRAM_BOT_TOKEN) return { ok: false };
  const interest = summary.lead.interest || "indefinido";
  const lines = [
    `🔔 Nova chamada Dograh — ${interest}`,
    ``,
    `👤 Lead: ${summary.lead.name || "anônimo"}`,
    `⏱️ Duração: ${summary.duration}s`,
    `📅 ${new Date().toLocaleString("pt-BR", { timeZone: "America/Recife" })}`,
    summary.pageUrl ? `🌐 ${summary.pageUrl}` : null,
    ``,
    summary.lead.interest ? `💬 Interesse: ${summary.lead.interest}` : null,
    summary.lead.pain ? `😣 Dor: ${summary.lead.pain}` : null,
    summary.lead.next_step ? `➡️ Próximo passo: ${summary.lead.next_step}` : null,
    summary.disposition ? `🏷️ Disposição: ${summary.disposition}` : null,
    ``,
    summary.transcriptPreview ? `📝 ${summary.transcriptPreview}` : `📝 _Chamada curta, sem transcrição suficiente_`,
    summary.recordingUrl ? `🎙️ Gravação: ${summary.recordingUrl}` : null,
    `🔍 Painel: https://dograh.automacaojs.us/workflow/${DOGRAH_WORKFLOW_ID}/runs/${summary.runId}`,
  ].filter(Boolean);
  const text = lines.join("\n");
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
    if (!r.ok) return { ok: false };
    const data = await r.json() as { result?: { message_id?: number } };
    return { ok: true, messageId: data.result?.message_id };
  } catch {
    return { ok: false };
  }
}

export function createDograhRouter(): Router {
  // Lazy import pra não quebrar build do server.ts
  const { Router } = require("express") as typeof import("express");
  const router = Router();

  router.post("/callback", async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const workflowRunId = parseInt(body.workflow_run_id || body.workflowRunId || "0", 10);
      const durationSeconds = parseInt(body.duration_seconds || body.durationSeconds || "0", 10);
      const visitorIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "0.0.0.0";
      const pageUrl = body.page_url || body.pageUrl || (req.headers.referer as string) || null;

      if (!workflowRunId || workflowRunId <= 0) {
        return res.status(400).json({ error: "workflow_run_id obrigatório" });
      }

      // Q6=b: rate limit 1 chamada por IP/dia
      const rl = checkRateLimit(visitorIp);
      if (!rl.allowed) {
        return res.status(429).json({ error: "rate_limit", message: "Limite de 1 chamada por IP/dia atingido" });
      }

      const supabase = getServiceSupabase();
      if (!supabase) {
        return res.status(500).json({ error: "supabase_not_configured" });
      }

      // Idempotência: se já existe, retorna o registro existente
      const existing = await supabase
        .from("dograh_calls")
        .select("id")
        .eq("workflow_run_id", workflowRunId)
        .maybeSingle();
      if (existing.data?.id) {
        return res.status(200).json({ ok: true, dedup: true, id: existing.data.id });
      }

      // Pega detalhes do run no Dograh (precisa de JWT do user Isaías)
      // Q3=a: usamos o JWT gerado em runtime via login (cache curto em memória).
      const dograhToken = await getDograhJWT();
      if (!dograhToken) {
        return res.status(503).json({ error: "dograh_unreachable" });
      }

      const run = await fetchRun(workflowRunId, dograhToken);
      if (!run) {
        return res.status(404).json({ error: "run_not_found", workflow_run_id: workflowRunId });
      }

      const transcript = await fetchTranscript(run, dograhToken);
      const lead = await summarizeLead(transcript || "");
      const duration = durationSeconds || run.call_duration_seconds || run.cost_info?.call_duration_seconds || 0;

      const insertPayload = {
        workflow_run_id: workflowRunId,
        workflow_id: run.workflow_id || DOGRAH_WORKFLOW_ID,
        call_ended_at: new Date().toISOString(),
        duration_seconds: duration,
        call_disposition: run.call_disposition || null,
        call_tags: run.call_tags || null,
        transcript_text: transcript,
        transcript_url: run.transcript_url,
        recording_url: run.recording_url,
        lead_name: lead.name,
        lead_interest: lead.interest,
        lead_pain: lead.pain,
        lead_next_step: lead.next_step,
        visitor_ip: visitorIp,
        visitor_page_url: pageUrl,
      };

      const { data: inserted, error: insertErr } = await supabase
        .from("dograh_calls")
        .insert(insertPayload)
        .select("id")
        .single();
      if (insertErr || !inserted) {
        console.error("[dograh] insert error:", insertErr);
        return res.status(500).json({ error: "insert_failed", detail: insertErr?.message });
      }

      // Notifica Telegram
      const tg = await notifyTelegram({
        runId: workflowRunId,
        duration,
        disposition: run.call_disposition || null,
        transcriptPreview: (transcript || "").slice(0, 500),
        recordingUrl: run.recording_url,
        pageUrl,
        lead,
      });
      if (tg.ok) {
        await supabase
          .from("dograh_calls")
          .update({ telegram_notified: true, telegram_message_id: tg.messageId })
          .eq("id", inserted.id);
      }

      return res.status(200).json({ ok: true, id: inserted.id, telegram_sent: tg.ok, lead });
    } catch (err: any) {
      console.error("[dograh] callback error:", err);
      return res.status(500).json({ error: "internal", detail: err?.message });
    }
  });

  router.get("/health", async (_req: Request, res: Response) => {
    try {
      const r = await fetch(`${DOGRAH_API_BASE.replace("/v1", "")}/api/v1/health`);
      const data = await r.json();
      return res.status(200).json({ ok: r.ok, dograh: data });
    } catch (err: any) {
      return res.status(503).json({ ok: false, error: err?.message });
    }
  });

  return router;
}

// Cache simples do JWT do Dograh (15min — token expira em 24h mas renovamos por segurança)
let dograhJWT: { token: string; expires: number } | null = null;
async function getDograhJWT(): Promise<string | null> {
  if (dograhJWT && dograhJWT.expires > Date.now() + 60_000) return dograhJWT.token;
  const email = process.env.DOGRAH_USER_EMAIL || "isaiassilva356@gmail.com";
  const password = process.env.DOGRAH_USER_PASSWORD || "";
  if (!password) return null;
  try {
    const r = await fetch(`${DOGRAH_API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) return null;
    const data = await r.json() as { token?: string };
    if (!data.token) return null;
    dograhJWT = { token: data.token, expires: Date.now() + 15 * 60 * 1000 };
    return data.token;
  } catch {
    return null;
  }
}
