#!/usr/bin/env python3
"""
Dograh Callback API — Sprint 1 da integração Dograh no isaias.automacaojs.us

Roda como serviço Python stdlib na porta 8129. Recebe eventos do widget Dograh,
persiste no Supabase compartilhado (ihwkzqjliulchfdusfcp), resume lead via
MiniMax MiniMax e dispara Telegram.

Decisões da SPEC:
  Q2=b -> MiniMax MiniMax resume a transcrição
  Q3=a -> Dograh guarda transcrição+gravação
  Q4=a -> mesmo backend do site (proxy nginx /api/dograh/* -> 8129)
  Q5=a -> Supabase compartilhado (service_role key)
  Q6=b -> rate limit 1 chamada por IP/dia (in-memory, chave dia=YYYY-MM-DD)

Endpoints:
  POST /callback  -> recebe widget onCallDisconnected
  GET  /health    -> smoke
"""

import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse
import re
import threading
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

PORT = int(os.environ.get("DOGRAH_CALLBACK_PORT", "8129"))

DOGRAH_API_BASE = os.environ.get("DOGRAH_API_BASE", "https://dograh.automacaojs.us/api/v1").rstrip("/")
DOGRAH_WORKFLOW_ID = int(os.environ.get("DOGRAH_WORKFLOW_ID", "6"))
DOGRAH_USER_EMAIL = os.environ.get("DOGRAH_USER_EMAIL", "isaiassilva356@gmail.com")
DOGRAH_USER_PASSWORD = os.environ.get("DOGRAH_USER_PASSWORD", "")

# === B1 (Set/2026): embed config injetado dinamicamente ===
# Antes o token embed ia hardcoded no index.html (view-source leak).
# Agora o frontend faz fetch /api/dograh/config e o backend serve do env.
DOGRAH_EMBED_TOKEN = os.environ.get("DOGRAH_EMBED_TOKEN", "").strip()
DOGRAH_PUBLIC_URL = os.environ.get("DOGRAH_PUBLIC_URL", "https://dograh.automacaojs.us").rstrip("/")

# === B4 (Set/2026): HMAC validation de webhook ===
# Quando DOGRAH_WEBHOOK_SECRET está setado, valida X-Dograh-Signature: sha256=<hex>
# calculado sobre o body raw. Sem secret setado → modo compat (aceita sem validar).
# Quando Dograh começar a mandar a assinatura, basta setar o secret no env
# do serviço systemd e reiniciar — sem mudar código.
DOGRAH_WEBHOOK_SECRET = os.environ.get("DOGRAH_WEBHOOK_SECRET", "").strip()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yfnzlowtgnlqizobnslh.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "") or os.environ.get("SUPABASE_ANON_KEY", "")

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "7845271497")

MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY", "") or os.environ.get("OPENAI_API_KEY", "")
MINIMAX_BASE_URL = os.environ.get("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic").rstrip("/")
MINIMAX_MODEL = os.environ.get("MINIMAX_MODEL", "minimax/minimax-m2")

# MinIO local — bypass do tunnel CF (que não tem rota pra /voice-audio/)
# Dograh grava transcripts no bucket voice-audio/anon-leitura OK.
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://127.0.0.1:9000").rstrip("/")
MINIO_BUCKET = os.environ.get("MINIO_BUCKET", "voice-audio")

# Rate limit 50 chamadas por IP/dia (Isaías msg 4184: pediu pra subir de 1/dia
# pra permitir testes contínuos do IP 187.19.252.10 sem ficar bloqueado).
# Mantém in-memory (zera no restart do service) + cleanup de chaves > 48h.
_RATE_LIMIT_PER_IP_PER_DAY = 50
_ip_counter = {}
_ip_lock = Lock()


def day_key(ip: str) -> str:
    d = datetime.now(timezone.utc)
    return f"{ip}|{d.year}-{d.month:02d}-{d.day:02d}"


def check_rate_limit(ip: str) -> bool:
    with _ip_lock:
        key = day_key(ip)
        used = _ip_counter.get(key, 0)
        if used >= _RATE_LIMIT_PER_IP_PER_DAY:
            return False
        _ip_counter[key] = used + 1
        # cleanup keys > 48h
        cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
        for k in list(_ip_counter.keys()):
            try:
                day_part = k.split("|")[1]
                ts = datetime.strptime(day_part, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                if ts < cutoff.replace(hour=0, minute=0, second=0, microsecond=0):
                    del _ip_counter[k]
            except Exception:
                pass
        return True


def http_json(url: str, method: str = "GET", headers: dict | None = None, body: dict | None = None, timeout: int = 15):
    """Wrapper urllib → retorna (status, dict|str|None)."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw.decode("utf-8"))
            except Exception:
                return resp.status, raw.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, None
    except Exception as e:
        return 0, str(e)


# Dograh JWT cache (15min)
_dograh_jwt = {"token": None, "expires": 0}


def get_dograh_jwt() -> str | None:
    now = datetime.now(timezone.utc).timestamp()
    if _dograh_jwt["token"] and _dograh_jwt["expires"] > now + 60:
        return _dograh_jwt["token"]
    if not DOGRAH_USER_PASSWORD:
        return None
    status, data = http_json(
        f"{DOGRAH_API_BASE}/auth/login",
        method="POST",
        headers={"Content-Type": "application/json"},
        body={"email": DOGRAH_USER_EMAIL, "password": DOGRAH_USER_PASSWORD},
    )
    if status != 200 or not isinstance(data, dict):
        return None
    token = data.get("token")
    if not token:
        return None
    _dograh_jwt["token"] = token
    _dograh_jwt["expires"] = now + 15 * 60
    return token


def fetch_run(run_id: int, dograh_token: str):
    status, data = http_json(
        f"{DOGRAH_API_BASE}/workflow/{DOGRAH_WORKFLOW_ID}/runs/{run_id}",
        headers={"Authorization": f"Bearer {dograh_token}"},
    )
    if status != 200 or not isinstance(data, dict):
        return None
    return data


def fetch_transcript(run: dict, dograh_token: str) -> str | None:
    """Baixa transcrição do run. Cap em 8000 chars.

    Estratégia preferida: MinIO local direto. O endpoint público do Dograh devolve
    302 redirect pra `/voice-audio/transcripts/<id>.txt`, mas o tunnel CF não tem
    rota pra `/voice-audio/` (caí no frontend → HTML). Como o bucket voice-audio tá
    aberto pra leitura anônima, é mais confiável ir direto no MinIO local.

    Fallback: signed URL do Dograh seguindo redirect manualmente.
    """
    transcript_path = run.get("transcript_url")  # ex: transcripts/32.txt
    if transcript_path and MINIO_ENDPOINT:
        try:
            url = f"{MINIO_ENDPOINT}/{MINIO_BUCKET}/{transcript_path}"
            with urllib.request.urlopen(urllib.request.Request(url, method="GET"), timeout=15) as resp:
                raw = resp.read()
            data = raw.decode("utf-8", errors="replace")
        except Exception:
            data = None
        if data and len(data) >= 20 and not data.lstrip().startswith("<!DOCTYPE") and not data.lstrip().startswith("<html"):
            return data[:8000]

    # Fallback: Dograh signed URL (segue redirect manualmente)
    transcript_public_url = run.get("transcript_public_url")
    if transcript_public_url:
        url = transcript_public_url
    else:
        token = run.get("public_access_token")
        if not token:
            return None
        url = f"{DOGRAH_API_BASE}/public/download/workflow/{token}/transcript"

    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status in (301, 302, 303, 307, 308):
                loc = resp.headers.get("Location")
                if loc:
                    if loc.startswith("/"):
                        parsed = urllib.parse.urlparse(url)
                        loc = f"{parsed.scheme}://{parsed.netloc}{loc}"
                    req = urllib.request.Request(loc, method="GET")
                    with urllib.request.urlopen(req, timeout=15) as resp2:
                        data = resp2.read().decode("utf-8", errors="replace")
                else:
                    return None
            else:
                data = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError:
        return None
    except Exception:
        return None

    if not isinstance(data, str) or len(data) < 20:
        return None
    stripped = data.strip()
    if stripped.startswith("<!DOCTYPE") or stripped.startswith("<html") or "<head" in stripped[:200].lower():
        return None
    return data[:8000]


def _build_lead_corpus(transcript: str, user_inputs: list) -> str:
    """Combina transcrição de áudio + inputs textuais do frontend num corpus único.
    Frontend v1.0.5+ envia user_inputs (texto digitado no input flutuante) que
    NÃO aparece na transcrição WebRTC do Dograh. Sem esse merge, lead vira
    'anônimo' mesmo quando o usuário digitou nome + interesse (msg 4187/4188)."""
    parts = []
    if transcript:
        parts.append("[TRANSCRIÇÃO DE VOZ]\n" + transcript.strip())
    if user_inputs:
        items = []
        for x in user_inputs:
            if isinstance(x, dict):
                t = (x.get("text") or "").strip()
                if t:
                    items.append("- " + t)
            elif isinstance(x, str):
                t = x.strip()
                if t:
                    items.append("- " + t)
        if items:
            parts.append("[INPUTS DIGITADOS PELO USUÁRIO NO CHAT]\n" + "\n".join(items))
    return "\n\n".join(parts)


def summarize_lead(transcript: str, user_inputs: list = None) -> dict:
    """Q2=b: MiniMax MiniMax extrai {nome, interesse, dor, proximo_passo}. Fallback regex."""
    user_inputs = user_inputs or []
    corpus = _build_lead_corpus(transcript, user_inputs)
    empty = {"name": None, "interest": None, "pain": None, "next_step": None}

    if not corpus or len(corpus) < 20:
        # Regex fallback pra nome mesmo sem LLM
        m = re.search(r"(?:meu nome é|me chamo|sou o|sou a)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)", corpus or "", re.IGNORECASE)
        empty["name"] = m.group(1) if m else None
        return empty

    if not MINIMAX_API_KEY:
        m = re.search(r"(?:meu nome é|me chamo|sou o|sou a)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)", corpus, re.IGNORECASE)
        empty["name"] = m.group(1) if m else None
        return empty

    prompt = (
        "Você é um extrator de leads. Analise o corpus abaixo (transcrição de voz + "
        "mensagens digitadas pelo usuário no chat) de uma chamada de vendas em "
        "português e devolva APENAS JSON válido com 4 campos: nome (string ou null), "
        "interesse (um de: radio|ebook|crm|automacao|outro|null), dor (citada pelo "
        "lead, ou null), proximo_passo (combinado na chamada, ou null). Não invente "
        "dados. Se não tiver certeza, use null.\n\nCorpus:\n\"\"\""
        + corpus[:4000]
        + "\"\"\""
    )
    # MiniMax M3 expõe Anthropic-compat em /v1/messages (NÃO /v1/chat/completions)
    status, data = http_json(
        f"{MINIMAX_BASE_URL}/v1/messages",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": MINIMAX_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        body={
            "model": MINIMAX_MODEL,
            "max_tokens": 300,
            "temperature": 0.1,
            "messages": [{"role": "user", "content": prompt}],
        },
    )
    if status != 200 or not isinstance(data, dict):
        return empty
    # Anthropic-style: content é lista de blocos [{type:text, text:...}]
    parts = data.get("content") or []
    raw = ""
    for part in parts:
        if isinstance(part, dict) and part.get("type") == "text":
            raw += part.get("text", "")
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        return empty
    try:
        parsed = json.loads(match.group(0))
    except Exception:
        return empty
    return {
        "name": parsed.get("nome"),
        "interest": parsed.get("interesse"),
        "pain": parsed.get("dor"),
        "next_step": parsed.get("proximo_passo"),
    }


def notify_telegram(summary: dict) -> dict:
    if not TELEGRAM_BOT_TOKEN:
        return {"ok": False}
    interest = summary["lead"].get("interest") or "indefinido"
    lines = [
        f"🔔 Nova chamada Dograh — {interest}",
        "",
        f"👤 Lead: {summary['lead'].get('name') or 'anônimo'}",
        f"⏱️ Duração: {summary['duration']}s",
        f"📅 {datetime.now().strftime('%d/%m/%Y %H:%M')}",
    ]
    if summary.get("page_url"):
        lines.append(f"🌐 {summary['page_url']}")
    lines.append("")
    if summary["lead"].get("interest"):
        lines.append(f"💬 Interesse: {summary['lead']['interest']}")
    if summary["lead"].get("pain"):
        lines.append(f"😣 Dor: {summary['lead']['pain']}")
    if summary["lead"].get("next_step"):
        lines.append(f"➡️ Próximo passo: {summary['lead']['next_step']}")
    if summary.get("disposition"):
        lines.append(f"🏷️ Disposição: {summary['disposition']}")
    if summary.get("user_inputs"):
        sample = []
        for x in summary["user_inputs"][:5]:
            if isinstance(x, dict):
                t = (x.get("text") or "").strip()
                if t:
                    sample.append(f"• {t[:120]}")
            elif isinstance(x, str):
                sample.append(f"• {x[:120]}")
        if sample:
            lines.append("")
            lines.append("⌨️ Digitou no chat:")
            lines.extend(sample)
    lines.append("")
    if summary.get("transcript_preview"):
        lines.append(f"📝 {summary['transcript_preview']}")
    else:
        lines.append("📝 _Chamada curta, sem transcrição suficiente_")
    if summary.get("recording_url"):
        lines.append(f"🎙️ Gravação: {summary['recording_url']}")
    lines.append(f"🔍 Painel: https://dograh.automacaojs.us/workflow/{DOGRAH_WORKFLOW_ID}/runs/{summary['run_id']}")
    text = "\n".join(lines)
    status, data = http_json(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        method="POST",
        headers={"Content-Type": "application/json"},
        body={"chat_id": TELEGRAM_CHAT_ID, "text": text, "disable_web_page_preview": True},
    )
    if status == 200 and isinstance(data, dict):
        return {"ok": True, "message_id": (data.get("result") or {}).get("message_id")}
    return {"ok": False, "status": status}


def notify_telegram_alert(reason: str, run_id: int = 0, visitor_ip: str = "", page_url: str = "", extra: str = ""):
    """Fire-and-forget: avisa Isaías quando callback falha silenciosamente (404/429/503).
    Roda em thread daemon pra não segurar o response HTTP. Sem persistência no Supabase."""
    def _send():
        if not TELEGRAM_BOT_TOKEN:
            return
        lines = [
            "⚠️ Falha silenciosa Dograh callback",
            "",
            f"🚨 Motivo: {reason}",
        ]
        if run_id:
            lines.append(f"🔖 workflow_run_id: {run_id}")
        if visitor_ip:
            lines.append(f"🌐 IP: {visitor_ip}")
        if page_url:
            lines.append(f"📄 {page_url}")
        if extra:
            lines.append(f"ℹ️ {extra}")
        lines.append("")
        lines.append(f"⏰ {datetime.now().strftime('%d/%m/%Y %H:%M')}")
        lines.append("🔗 https://dograh.automacaojs.us/workflow/" + str(DOGRAH_WORKFLOW_ID) + "/runs/" + str(run_id))
        text = "\n".join(lines)
        try:
            http_json(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                method="POST",
                headers={"Content-Type": "application/json"},
                body={"chat_id": TELEGRAM_CHAT_ID, "text": text, "disable_web_page_preview": True},
                timeout=5,
            )
        except Exception:
            pass
    threading.Thread(target=_send, daemon=True).start()


def insert_call(record: dict) -> tuple[bool, dict]:
    if not SUPABASE_SERVICE_KEY:
        return False, {"error": "supabase_not_configured"}
    status, data = http_json(
        f"{SUPABASE_URL}/rest/v1/dograh_calls",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Prefer": "return=representation",
        },
        body=record,
    )
    if status not in (200, 201) or not isinstance(data, list):
        return False, {"status": status, "data": data}
    return True, data[0]


def update_call(call_id, updates: dict) -> bool:
    if not SUPABASE_SERVICE_KEY:
        return False
    status, _ = http_json(
        f"{SUPABASE_URL}/rest/v1/dograh_calls?id=eq.{call_id}",
        method="PATCH",
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        },
        body=updates,
    )
    return status in (200, 204)


def find_existing_run(run_id: int):
    if not SUPABASE_SERVICE_KEY:
        return None
    url = f"{SUPABASE_URL}/rest/v1/dograh_calls?workflow_run_id=eq.{run_id}&select=id&limit=1"
    status, data = http_json(url, headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    })
    if status == 200 and isinstance(data, list) and data:
        return data[0].get("id")
    return None



def _verify_webhook_hmac(raw_body: bytes, signature_header: str | None) -> tuple[bool, str]:
    """Verifica X-Dograh-Signature: sha256=<hex> contra HMAC-SHA256 do body raw.
    Retorna (ok, motivo). Modo compat: sem secret setado, aceita sem validar
    (mas loga warning). Modo strict: secret setado exige signature valida."""
    if not DOGRAH_WEBHOOK_SECRET:
        return True, "no_secret_configured"  # modo compat (B4 desabilitado)
    if not signature_header:
        return False, "missing_signature"
    sig = signature_header.strip()
    if sig.startswith("sha256="):
        sig = sig[len("sha256="):]
    try:
        import hmac, hashlib
        expected = hmac.new(
            DOGRAH_WEBHOOK_SECRET.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
    except Exception as e:
        return False, f"hmac_error:{e}"
    if hmac.compare_digest(expected.lower(), sig.lower()):
        return True, "valid"
    return False, "signature_mismatch"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stderr.write(f"[dograh-callback] {self.address_string()} {format % args}\n")

    def _send(self, code: int, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health" or self.path.startswith("/health?"):
            return self._send(200, {"ok": True, "service": "dograh-callback", "port": PORT})
        # === B1 (Set/2026): serve embed config dinamicamente ===
        # Frontend faz fetch /api/dograh/config antes de carregar o widget script.
        # Token NUNCA vai hardcoded no HTML; so serve aqui se o env tiver.
        if self.path == "/api/dograh/config" or self.path.startswith("/api/dograh/config?"):
            if not DOGRAH_EMBED_TOKEN:
                return self._send(503, {"error": "embed_token_not_configured"})
            return self._send(200, {
                "token": DOGRAH_EMBED_TOKEN,
                "apiEndpoint": DOGRAH_PUBLIC_URL,
                "workflowId": DOGRAH_WORKFLOW_ID,
            })
        return self._send(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/callback":
            return self._send(404, {"error": "not_found"})

        # Parse body
        try:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length > 0 else b"{}"
            body = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            return self._send(400, {"error": "invalid_json"})

        # === B4 (Set/2026): HMAC validation ===
        # Quando DOGRAH_WEBHOOK_SECRET setado, exige X-Dograh-Signature valido.
        # Sem secret → modo compat (aceita sem validar, loga warning).
        sig_header = self.headers.get("X-Dograh-Signature") or self.headers.get("X-Signature")
        ok_sig, sig_reason = _verify_webhook_hmac(raw, sig_header)
        if not ok_sig:
            visitor_ip_pre = (self.headers.get("X-Forwarded-For") or self.client_address[0] or "0.0.0.0").split(",")[0].strip()
            notify_telegram_alert(
                reason=f"hmac_rejected:{sig_reason}",
                run_id=int((body or {}).get("workflow_run_id") or (body or {}).get("workflowRunId") or 0) or 0,
                visitor_ip=visitor_ip_pre,
                page_url=(body or {}).get("page_url") or (body or {}).get("pageUrl") or self.headers.get("Referer") or "",
                extra="callback REJEITADO (HMAC invalido) - possivel injecao de lead falso",
            )
            sys.stderr.write(f"[dograh-callback] HMAC rejected ({sig_reason}) ip={visitor_ip_pre}\n")
            return self._send(401, {"error": "invalid_signature", "reason": sig_reason})
        elif DOGRAH_WEBHOOK_SECRET:
            # Modo strict: passou na validacao. Log discreto.
            sys.stderr.write(f"[dograh-callback] HMAC OK ip={self.client_address[0]}\n")

        try:
            run_id = int(body.get("workflow_run_id") or body.get("workflowRunId") or 0)
        except (TypeError, ValueError):
            run_id = 0
        try:
            duration = int(body.get("duration_seconds") or body.get("durationSeconds") or 0)
        except (TypeError, ValueError):
            duration = 0
        visitor_ip = (self.headers.get("X-Forwarded-For") or self.client_address[0] or "0.0.0.0").split(",")[0].strip()
        page_url = body.get("page_url") or body.get("pageUrl") or self.headers.get("Referer")
        # v1.0.5+: lista de textos digitados pelo usuário no input flutuante
        # (Dograh não aceita texto via WS signaling — só WebRTC de áudio). Esses
        # itens NUNCA aparecem em transcript_text, então mesclamos no corpus.
        user_inputs_raw = body.get("user_inputs") or body.get("userInputs") or []
        if isinstance(user_inputs_raw, list):
            user_inputs = [x for x in user_inputs_raw if x]
        else:
            user_inputs = []

        if not run_id:
            return self._send(400, {"error": "workflow_run_id_required"})

        # Rate limit 50 chamadas/IP/dia (Isaías msg 4184)
        if not check_rate_limit(visitor_ip):
            notify_telegram_alert(
                reason="rate_limit",
                run_id=run_id,
                visitor_ip=visitor_ip,
                page_url=page_url,
                extra=f"IP já tinha {_RATE_LIMIT_PER_IP_PER_DAY} chamadas hoje — lead NÃO foi salvo e NÃO foi notificado",
            )
            return self._send(429, {"error": "rate_limit", "message": f"Limite de {_RATE_LIMIT_PER_IP_PER_DAY} chamadas por IP/dia atingido"})

        # Idempotência
        existing = find_existing_run(run_id)
        if existing:
            return self._send(200, {"ok": True, "dedup": True, "id": existing})

        # Auth Dograh
        dograh_token = get_dograh_jwt()
        if not dograh_token:
            notify_telegram_alert(
                reason="dograh_unreachable",
                run_id=run_id,
                visitor_ip=visitor_ip,
                page_url=page_url,
                extra="get_dograh_jwt() retornou None (credenciais inválidas ou Dograh offline?)",
            )
            return self._send(503, {"error": "dograh_unreachable"})

        run = fetch_run(run_id, dograh_token)
        if not run:
            notify_telegram_alert(
                reason="run_not_found",
                run_id=run_id,
                visitor_ip=visitor_ip,
                page_url=page_url,
                extra="widget mandou workflow_run_id que não existe no Dograh",
            )
            return self._send(404, {"error": "run_not_found", "workflow_run_id": run_id})

        transcript = fetch_transcript(run, dograh_token)
        lead = summarize_lead(transcript or "", user_inputs=user_inputs)
        actual_duration = duration or run.get("call_duration_seconds") or (run.get("cost_info") or {}).get("call_duration_seconds") or 0

        record = {
            "workflow_run_id": run_id,
            "workflow_id": run.get("workflow_id") or DOGRAH_WORKFLOW_ID,
            "duration_seconds": actual_duration,
            "call_disposition": run.get("call_disposition"),
            "call_tags": run.get("call_tags") or [],
            "transcript_text": transcript,
            "transcript_url": run.get("transcript_url"),
            "recording_url": run.get("recording_url"),
            "lead_name": lead.get("name"),
            "lead_interest": lead.get("interest"),
            "lead_pain": lead.get("pain"),
            "lead_next_step": lead.get("next_step"),
            "visitor_ip": visitor_ip,
            "visitor_page_url": page_url,
            "user_inputs_json": user_inputs,
        }

        ok, inserted = insert_call(record)
        if not ok:
            return self._send(500, {"error": "insert_failed", "detail": inserted})

        call_id = inserted.get("id")
        tg = notify_telegram({
            "run_id": run_id,
            "duration": actual_duration,
            "disposition": run.get("call_disposition"),
            "transcript_preview": (transcript or "")[:500],
            "recording_url": run.get("recording_url"),
            "page_url": page_url,
            "lead": lead,
            "user_inputs": user_inputs,
        })
        if tg.get("ok"):
            update_call(call_id, {"telegram_notified": True, "telegram_message_id": tg.get("message_id")})

        return self._send(200, {
            "ok": True,
            "id": call_id,
            "telegram_sent": tg.get("ok"),
            "lead": lead,
        })


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[dograh-callback] listening on 127.0.0.1:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
