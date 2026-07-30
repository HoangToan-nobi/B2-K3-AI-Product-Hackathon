"""Tien ich dung chung cho pipeline: doc .env, goi DeepSeek API, log lai moi lan goi that.

Khong dung SDK ngoai — chi urllib (stdlib) — de repo chay duoc ma khong can pip install.
"""
import json
import os
import re
import ssl
import time
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(HERE, ".env")
LOG_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "eval", "runs", "ai-calls"))

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"


def _load_env():
    env = dict(os.environ)
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip())
    return env


_ENV = _load_env()


def get_api_key() -> str:
    key = _ENV.get("DEEPSEEK_API_KEY")
    if not key:
        raise RuntimeError(
            "Thieu DEEPSEEK_API_KEY. Tao file codebase/pipeline/.env voi dong "
            "DEEPSEEK_API_KEY=sk-... (file nay da nam trong .gitignore, khong commit)."
        )
    return key


def _extract_json(text: str) -> dict:
    """DeepSeek json_object mode thuong tra ve JSON thuan; phong ho neu model boc trong ```json."""
    stripped = text.strip()
    m = re.match(r"^```(?:json)?\s*(.*?)\s*```$", stripped, re.S)
    if m:
        stripped = m.group(1)
    return json.loads(stripped)


def call_ai_json(stage: str, system_prompt: str, user_prompt: str, max_tokens: int = 4000) -> dict:
    """Goi DeepSeek that, bat buoc tra ve JSON, va ghi log request/response ra eval/runs/ai-calls/.

    `stage` dat ten cho log (vd "cluster", "generate") — dung de truy vet lai lan goi nao
    tao ra ket qua nao, phuc vu R5 (chung minh khong hardcode).
    """
    key = get_api_key()
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": max_tokens,
        "temperature": 0,
    }
    req = urllib.request.Request(
        DEEPSEEK_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )

    started = time.time()
    timestamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    log_record = {
        "stage": stage,
        "model": DEEPSEEK_MODEL,
        "requested_at": timestamp,
        "request": {"system": system_prompt, "user": user_prompt},
    }

    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        log_record["error"] = {"http_status": e.code, "body": body}
        _write_log(stage, timestamp, log_record)
        raise RuntimeError(f"DeepSeek API loi {e.code}: {body}") from e
    except urllib.error.URLError as e:
        if isinstance(e.reason, ssl.SSLCertVerificationError):
            raise RuntimeError(
                "Khong verify duoc SSL certificate khi goi DeepSeek API. "
                "Neu dung Python tu python.org tren macOS, chay: "
                "'/Applications/Python 3.13/Install Certificates.command'"
            ) from e
        raise RuntimeError(f"Khong goi duoc DeepSeek API: {e}") from e

    elapsed_ms = int((time.time() - started) * 1000)
    response_json = json.loads(raw)
    content = response_json["choices"][0]["message"]["content"]

    log_record["raw_response"] = response_json
    log_record["latency_ms"] = elapsed_ms
    _write_log(stage, timestamp, log_record)

    return _extract_json(content)


def _write_log(stage: str, timestamp: str, record: dict):
    os.makedirs(LOG_DIR, exist_ok=True)
    path = os.path.join(LOG_DIR, f"{stage}-{timestamp}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)
