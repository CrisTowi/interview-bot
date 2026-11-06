/**
 * Stateless LLM proxy (BYOK). Exists only to get around provider CORS restrictions.
 *
 * MUST NOT log or persist anything: no console.* calls, no storage. The API key and the
 * conversation live only in memory for the duration of the request.
 *
 * Kept self-contained (no local imports) so Vercel bundles it without ESM resolution issues.
 */

type Role = 'user' | 'assistant';
interface Message {
  role: Role;
  content: string;
}
interface ChatRequest {
  provider: 'openai' | 'anthropic' | 'gemini' | 'openrouter';
  apiKey: string;
  model: string;
  system: string;
  messages: Message[];
}

const MAX_MESSAGES = 200;
const MAX_CHARS = 200_000;

class UpstreamError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function validate(body: unknown): ChatRequest | string {
  const b = body as Partial<ChatRequest> | null;
  if (!b || typeof b !== 'object') return 'Invalid body';
  if (!['openai', 'anthropic', 'gemini', 'openrouter'].includes(b.provider as string)) return 'Unknown provider';
  if (typeof b.apiKey !== 'string' || !b.apiKey.trim()) return 'Missing API key';
  if (typeof b.model !== 'string' || !b.model.trim()) return 'Missing model';
  if (typeof b.system !== 'string') return 'Missing system prompt';
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > MAX_MESSAGES) {
    return 'Invalid messages';
  }
  let chars = b.system.length;
  for (const m of b.messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      return 'Invalid message';
    }
    chars += m.content.length;
  }
  if (chars > MAX_CHARS) return 'Conversation too long';
  return b as ChatRequest;
}

function upstreamMessage(data: any, status: number): string {
  const err = data?.error;
  let message: string = err?.message ?? `Provider error (HTTP ${status})`;
  // OpenRouter wraps the underlying provider's error in metadata.raw; without it the message is just "Provider returned error".
  const raw = err?.metadata?.raw;
  if (raw) {
    let detail = typeof raw === 'string' ? raw : JSON.stringify(raw);
    try {
      const parsed = JSON.parse(detail);
      detail = parsed?.error?.message ?? parsed?.message ?? detail;
    } catch {
      // Not JSON: use it as is.
    }
    message += `: ${String(detail).slice(0, 300)}`;
  }
  if (err?.metadata?.provider_name) message += ` (${err.metadata.provider_name})`;
  return message;
}

async function readJson(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new UpstreamError(res.status, upstreamMessage(data, res.status));
  return data;
}

/** OpenAI's Chat Completions format, which OpenRouter also speaks. */
async function callChatCompletions(
  url: string,
  { apiKey, model, system, messages }: ChatRequest,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ model, messages: system ? [{ role: 'system', content: system }, ...messages] : messages }),
  });
  const data = await readJson(res);
  return data.choices?.[0]?.message?.content ?? '';
}

const callOpenAI = (req: ChatRequest) => callChatCompletions('https://api.openai.com/v1/chat/completions', req);

async function callOpenRouter(req: ChatRequest): Promise<string> {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  // X-Title only labels the app in the user's own OpenRouter dashboard.
  const headers = { 'x-title': 'interview-bot' };
  try {
    return await callChatCompletions(url, req, headers);
  } catch (err) {
    // Some models (e.g. Gemma on Google AI Studio) reject system prompts. Retry once with the
    // instructions folded into the first user message; if that fails too, report the original error.
    if (!(err instanceof UpstreamError) || err.status !== 400 || req.messages[0]?.role !== 'user') throw err;
    const [first, ...rest] = req.messages;
    const folded = { ...req, system: '', messages: [{ role: 'user' as const, content: `${req.system}\n\n${first.content}` }, ...rest] };
    try {
      return await callChatCompletions(url, folded, headers);
    } catch {
      throw err;
    }
  }
}

async function callAnthropic({ apiKey, model, system, messages }: ChatRequest): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 2048, system, messages }),
  });
  const data = await readJson(res);
  return (data.content ?? [])
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('');
}

async function callGemini({ apiKey, model, system, messages }: ChatRequest): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    }),
  });
  const data = await readJson(res);
  return (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
}

const PROVIDERS = { openai: callOpenAI, anthropic: callAnthropic, gemini: callGemini, openrouter: callOpenRouter };

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const parsed = validate(body);
  if (typeof parsed === 'string') return json({ error: parsed }, 400);

  try {
    const text = await PROVIDERS[parsed.provider](parsed);
    return json({ text });
  } catch (err) {
    if (err instanceof UpstreamError) return json({ error: err.message }, err.status);
    return json({ error: 'Could not reach the provider' }, 502);
  }
}
