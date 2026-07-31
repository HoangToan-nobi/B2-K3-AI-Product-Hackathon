// Goi DeepSeek API o server (Next.js API route / server component) — API key doc tu
// process.env.DEEPSEEK_API_KEY, khong bao gio gui ve trinh duyet.
// Dat DEEPSEEK_API_KEY trong .env.local khi chay dev, va trong Vercel Project Settings ->
// Environment Variables khi deploy.

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 90_000;

function deepSeekTimeoutMs(): number {
  const raw = Number(process.env.DEEPSEEK_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 15_000) return raw;
  return DEFAULT_DEEPSEEK_TIMEOUT_MS;
}

export class DeepSeekError extends Error {}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    throw new DeepSeekError(
      "AI live trả về JSON chưa hoàn chỉnh hoặc không hợp lệ. Hệ thống sẽ dùng fallback grounded từ slide để demo không bị gián đoạn."
    );
  }
}

export async function callDeepSeekJson(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 8000
): Promise<unknown> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new DeepSeekError(
      "Thieu DEEPSEEK_API_KEY. Them vao .env.local (dev) hoac Vercel Environment Variables (deploy)."
    );
  }

  const timeoutMs = deepSeekTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        temperature: 0,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new DeepSeekError(`DeepSeek API quá ${Math.round(timeoutMs / 1000)} giây chưa trả lời; chuyển sang fallback grounded từ slide.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new DeepSeekError(`DeepSeek API loi ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    choices: { finish_reason?: string; message: { content: string } }[];
  };
  const choice = data.choices[0];
  if (choice?.finish_reason === "length") {
    throw new DeepSeekError(
      "AI live bị cắt output vì nội dung quá dài. Hệ thống sẽ dùng fallback grounded từ slide để demo không bị gián đoạn."
    );
  }
  const content = choice?.message?.content ?? "";
  return extractJson(content);
}
