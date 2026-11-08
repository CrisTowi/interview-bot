import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../api/tts';

const call = (body: unknown) => POST(new Request('http://x/api/tts', { method: 'POST', body: JSON.stringify(body) }));

function upstream(status: number, body: BodyInit | null, contentType = 'audio/mpeg') {
  const sent: { url: string; body: any; headers: Record<string, string> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
      return new Response(body, { status, headers: { 'content-type': contentType } });
    }),
  );
  return sent;
}

afterEach(() => vi.unstubAllGlobals());

describe('api/tts', () => {
  it.each([
    [{ provider: 'openai', apiKey: '', text: 'hola' }, 'Missing API key'],
    [{ provider: 'openai', apiKey: 'k', text: '' }, 'Invalid text'],
    [{ provider: 'openai', apiKey: 'k', text: 'x'.repeat(4001) }, 'Invalid text'],
    [{ provider: 'acme', apiKey: 'k', text: 'hola' }, 'Unknown provider'],
  ])('rejects %j', async (body, error) => {
    const res = await call(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
  });

  it('streams OpenAI speech back as audio, defaulting the voice', async () => {
    const sent = upstream(200, 'AUDIO');
    const res = await call({ provider: 'openai', apiKey: 'k', voice: '', text: 'hola' });
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(await res.text()).toBe('AUDIO');
    expect(sent[0].body).toMatchObject({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: 'hola' });
  });

  it('uses the chosen ElevenLabs voice, or Rachel by default', async () => {
    const sent = upstream(200, 'AUDIO');
    await call({ provider: 'elevenlabs', apiKey: 'k', voice: 'abc', text: 'hola' });
    await call({ provider: 'elevenlabs', apiKey: 'k', text: 'hola' });
    expect(sent[0].url).toBe('https://api.elevenlabs.io/v1/text-to-speech/abc');
    expect(sent[1].url).toContain('21m00Tcm4TlvDQ8ikWAM');
    expect(sent[0].headers['xi-api-key']).toBe('k');
  });

  it('passes the provider error through', async () => {
    upstream(401, JSON.stringify({ detail: { message: 'Invalid API key' } }), 'application/json');
    const res = await call({ provider: 'elevenlabs', apiKey: 'bad', text: 'hola' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid API key' });
  });

  it('answers 502 when the provider cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('down'))),
    );
    expect((await call({ provider: 'openai', apiKey: 'k', text: 'hola' })).status).toBe(502);
  });
});
