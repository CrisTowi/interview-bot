/**
 * Stateless LLM proxy (BYOK). Exists only to get around provider CORS restrictions.
 *
 * MUST NOT log or persist anything: no console.* calls, no storage. The API key and the
 * conversation live only in memory for the duration of the request.
 *
 * It also translates tool use between one neutral format (used by the browser, which runs the
 * agent loop and executes the tools) and each provider's own format.
 *
 * Kept self-contained (no local imports) so Vercel bundles it without ESM resolution issues.
 */

interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the arguments (kept to the subset every provider accepts). */
  parameters: Record<string, unknown>;
}
interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Provider data that must be echoed back unchanged (e.g. Gemini's thought signatures). */
  meta?: unknown;
}
type Message =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };
interface ChatRequest {
  provider: 'openai' | 'anthropic' | 'gemini' | 'openrouter';
  apiKey: string;
  model: string;
  system: string;
  messages: Message[];
  tools?: ToolSpec[];
}
interface Reply {
  text: string;
  toolCalls: ToolCall[];
}

const MAX_MESSAGES = 300;
const MAX_CHARS = 200_000;
const MAX_TOOLS = 10;

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
  for (const m of b.messages as any[]) {
    if (!m || typeof m.content !== 'string') return 'Invalid message';
    if (m.role === 'tool') {
      if (typeof m.toolCallId !== 'string' || typeof m.name !== 'string') return 'Invalid tool result';
    } else if (m.role === 'assistant') {
      if (
        m.toolCalls !== undefined &&
        (!Array.isArray(m.toolCalls) || m.toolCalls.some((c: any) => typeof c?.name !== 'string'))
      ) {
        return 'Invalid tool call';
      }
    } else if (m.role !== 'user') {
      return 'Invalid message';
    }
    chars += m.content.length;
  }
  if (b.tools !== undefined) {
    if (!Array.isArray(b.tools) || b.tools.length > MAX_TOOLS) return 'Invalid tools';
    for (const t of b.tools) {
      if (typeof t?.name !== 'string' || typeof t.description !== 'string' || typeof t.parameters !== 'object') {
        return 'Invalid tool';
      }
    }
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

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw || '{}'));
  } catch {
    return {};
  }
}

// --- OpenAI Chat Completions (also OpenRouter) ---------------------------------------------------

async function callChatCompletions(
  url: string,
  { apiKey, model, system, messages, tools }: ChatRequest,
  extraHeaders: Record<string, string> = {},
): Promise<Reply> {
  const wire: unknown[] = system ? [{ role: 'system', content: system }] : [];
  for (const m of messages) {
    if (m.role === 'tool') wire.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    else if (m.role === 'assistant' && m.toolCalls?.length) {
      wire.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      });
    } else wire.push({ role: m.role, content: m.content });
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify({
      model,
      messages: wire,
      ...(tools?.length
        ? {
            tools: tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
          }
        : {}),
    }),
  });
  const message = (await readJson(res)).choices?.[0]?.message ?? {};
  return {
    text: message.content ?? '',
    toolCalls: (message.tool_calls ?? []).map((c: any) => ({
      id: c.id,
      name: c.function?.name,
      args: parseArgs(c.function?.arguments),
    })),
  };
}

const callOpenAI = (req: ChatRequest) => callChatCompletions('https://api.openai.com/v1/chat/completions', req);

async function callOpenRouter(req: ChatRequest): Promise<Reply> {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  // X-Title only labels the app in the user's own OpenRouter dashboard.
  const headers = { 'x-title': 'interview-bot' };
  try {
    return await callChatCompletions(url, req, headers);
  } catch (err) {
    // Some models (e.g. Gemma on Google AI Studio) reject system prompts. Retry once with the
    // instructions folded into the first user message; if that fails too, report the original error.
    const first = req.messages[0];
    if (!(err instanceof UpstreamError) || err.status !== 400 || first?.role !== 'user' || isToolError(err)) throw err;
    const folded = {
      ...req,
      system: '',
      messages: [{ role: 'user' as const, content: `${req.system}\n\n${first.content}` }, ...req.messages.slice(1)],
    };
    try {
      return await callChatCompletions(url, folded, headers);
    } catch {
      throw err;
    }
  }
}

// --- Anthropic Messages --------------------------------------------------------------------------

async function callAnthropic({ apiKey, model, system, messages, tools }: ChatRequest): Promise<Reply> {
  const wire: { role: string; content: unknown }[] = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      // Consecutive tool results go back together in one user turn.
      const last = wire[wire.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content)) (last.content as unknown[]).push(block);
      else wire.push({ role: 'user', content: [block] });
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      wire.push({
        role: 'assistant',
        content: [
          ...(m.content ? [{ type: 'text', text: m.content }] : []),
          ...m.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args })),
        ],
      });
    } else wire.push({ role: m.role, content: m.content });
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages: wire,
      ...(tools?.length
        ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) }
        : {}),
    }),
  });
  const blocks: any[] = (await readJson(res)).content ?? [];
  return {
    text: blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(''),
    toolCalls: blocks
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, args: parseArgs(b.input) })),
  };
}

// --- Gemini --------------------------------------------------------------------------------------

async function callGemini({ apiKey, model, system, messages, tools }: ChatRequest): Promise<Reply> {
  const contents: { role: string; parts: unknown[] }[] = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const part = { functionResponse: { name: m.name, response: { content: m.content } } };
      const last = contents[contents.length - 1];
      if (last?.role === 'user' && last.parts.every((p: any) => p.functionResponse)) last.parts.push(part);
      else contents.push({ role: 'user', parts: [part] });
    } else if (m.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [
          ...(m.content ? [{ text: m.content }] : []),
          // Echo the original part back: newer Gemini models require its thought signature.
          ...(m.toolCalls ?? []).map((c) => c.meta ?? { functionCall: { name: c.name, args: c.args } }),
        ],
      });
    } else contents.push({ role: 'user', parts: [{ text: m.content }] });
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      ...(tools?.length
        ? {
            tools: [
              {
                functionDeclarations: tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters,
                })),
              },
            ],
          }
        : {}),
    }),
  });
  const parts: any[] = (await readJson(res)).candidates?.[0]?.content?.parts ?? [];
  return {
    text: parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join(''),
    toolCalls: parts
      .filter((p) => p.functionCall)
      .map((p, i) => ({ id: `call_${i}`, name: p.functionCall.name, args: parseArgs(p.functionCall.args), meta: p })),
  };
}

const PROVIDERS = { openai: callOpenAI, anthropic: callAnthropic, gemini: callGemini, openrouter: callOpenRouter };

/** A provider/model that can't do tool use answers with a 4xx mentioning tools or functions. */
function isToolError(err: unknown): boolean {
  return err instanceof UpstreamError && [400, 404, 422].includes(err.status) && /tool|function/i.test(err.message);
}

/** For a retry without tools: keep only the plain conversation. */
function withoutTools(req: ChatRequest): ChatRequest {
  const messages = req.messages
    .filter((m) => m.role !== 'tool')
    .map((m) => (m.role === 'assistant' ? { role: 'assistant' as const, content: m.content } : m))
    .filter((m) => m.role === 'user' || m.content);
  return { ...req, tools: undefined, messages };
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const parsed = validate(body);
  if (typeof parsed === 'string') return json({ error: parsed }, 400);
  const call = PROVIDERS[parsed.provider];

  try {
    if (!parsed.tools?.length) return json(await call(parsed));
    try {
      return json(await call(parsed));
    } catch (err) {
      // The model doesn't support tools: answer without them and tell the browser to switch to basic mode.
      if (!isToolError(err)) throw err;
      return json({ ...(await call(withoutTools(parsed))), toolsUnsupported: true });
    }
  } catch (err) {
    if (err instanceof UpstreamError) return json({ error: err.message }, err.status);
    return json({ error: 'Could not reach the provider' }, 502);
  }
}
