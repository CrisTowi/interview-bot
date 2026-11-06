/**
 * Stateless premium TTS proxy (BYOK). Streams the provider's audio straight back to the browser.
 *
 * MUST NOT log or persist anything: no console.* calls, no storage.
 * Kept self-contained (no local imports) so Vercel bundles it without ESM resolution issues.
 */

const MAX_CHARS = 4000;
const DEFAULT_ELEVENLABS_VOICE = '21m00Tcm4TlvDQ8ikWAM';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function upstreamRequest(provider: string, apiKey: string, voice: string, text: string): Promise<Response> | null {
  if (provider === 'openai') {
    return fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: voice || 'alloy', input: text, response_format: 'mp3' }),
    });
  }
  if (provider === 'elevenlabs') {
    const voiceId = encodeURIComponent(voice || DEFAULT_ELEVENLABS_VOICE);
    return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
    });
  }
  return null;
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const { provider, apiKey, voice, text } = body ?? {};
  if (typeof apiKey !== 'string' || !apiKey.trim()) return json({ error: 'Missing API key' }, 400);
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_CHARS) return json({ error: 'Invalid text' }, 400);

  const pending = upstreamRequest(provider, apiKey, typeof voice === 'string' ? voice : '', text);
  if (!pending) return json({ error: 'Unknown provider' }, 400);

  try {
    const res = await pending;
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      const message = data?.error?.message ?? data?.detail?.message ?? `Provider error (HTTP ${res.status})`;
      return json({ error: message }, res.status || 502);
    }
    return new Response(res.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
  } catch {
    return json({ error: 'Could not reach the provider' }, 502);
  }
}
