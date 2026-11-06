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
  provider: 'openai' | 'anthropic' | 'gemini';
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
  if (!['openai', 'anthropic', 'gemini'].includes(b.provider as string)) return 'Unknown provider';
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

async function readJson(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new UpstreamError(res.status, data?.error?.message ?? `Provider error (HTTP ${res.status})`);
  return data;
}

async function callOpenAI({ apiKey, model, system, messages }: ChatRequest): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  const data = await readJson(res);
  return data.choices?.[0]?.message?.content ?? '';
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

const PROVIDERS = { openai: callOpenAI, anthropic: callAnthropic, gemini: callGemini };

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
