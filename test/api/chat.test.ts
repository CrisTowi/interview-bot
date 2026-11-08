import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../api/chat';

type Body = Record<string, unknown>;
const base = {
  provider: 'openai',
  apiKey: 'k',
  model: 'm',
  system: 'SYS',
  messages: [{ role: 'user', content: 'hola' }],
};
const call = (body: Body) =>
  POST(new Request('http://x/api/chat', { method: 'POST', body: JSON.stringify(body) })).then(async (r) => ({
    status: r.status,
    json: await r.json(),
  }));

/** Replies to successive upstream requests and records what was sent. */
function upstream(...replies: Array<[number, unknown]>) {
  const sent: { url: string; body: any; headers: Record<string, string> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
      const [status, body] = replies[Math.min(sent.length - 1, replies.length - 1)];
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return sent;
}

afterEach(() => vi.unstubAllGlobals());

describe('validation', () => {
  it.each([
    [{ ...base, provider: 'acme' }, 'Unknown provider'],
    [{ ...base, apiKey: '  ' }, 'Missing API key'],
    [{ ...base, model: '' }, 'Missing model'],
    [{ ...base, messages: [] }, 'Invalid messages'],
    [{ ...base, messages: [{ role: 'system', content: 'x' }] }, 'Invalid message'],
    [{ ...base, messages: [{ role: 'tool', content: 'x' }] }, 'Invalid tool result'],
    [{ ...base, messages: [{ role: 'assistant', content: '', toolCalls: [{}] }] }, 'Invalid tool call'],
    [{ ...base, tools: [{ name: 'x' }] }, 'Invalid tool'],
    [{ ...base, messages: [{ role: 'user', content: 'x'.repeat(200_001) }] }, 'Conversation too long'],
  ])('rejects %j', async (body, error) => {
    const sent = upstream([200, {}]);
    await expect(call(body)).resolves.toEqual({ status: 400, json: { error } });
    expect(sent).toHaveLength(0);
  });

  it('rejects a body that is not JSON', async () => {
    const res = await POST(new Request('http://x/api/chat', { method: 'POST', body: 'not json' }));
    expect(res.status).toBe(400);
  });
});

describe('provider translation', () => {
  const tools = [{ name: 'take_note', description: 'd', parameters: { type: 'object', properties: {} } }];
  const midLoop = [
    { role: 'user', content: 'hola' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'c1',
          name: 'take_note',
          args: { o: 'x' },
          meta: { functionCall: { name: 'take_note' }, thoughtSignature: 'SIG' },
        },
      ],
    },
    { role: 'tool', toolCallId: 'c1', name: 'take_note', content: 'Noted.' },
  ];

  it('OpenAI: system message, tool calls and tool results in Chat Completions format', async () => {
    const sent = upstream([
      200,
      {
        choices: [
          {
            message: {
              content: 'Bien.',
              tool_calls: [{ id: 'c2', function: { name: 'take_note', arguments: '{"o":"y"}' } }],
            },
          },
        ],
      },
    ]);
    const { json } = await call({ ...base, messages: midLoop, tools });
    expect(json).toEqual({ text: 'Bien.', toolCalls: [{ id: 'c2', name: 'take_note', args: { o: 'y' } }] });
    expect(sent[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(sent[0].headers.authorization).toBe('Bearer k');
    expect(sent[0].body.messages.map((m: Body) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(sent[0].body.messages[2].tool_calls[0].function.arguments).toBe('{"o":"x"}');
    expect(sent[0].body.tools[0]).toMatchObject({ type: 'function', function: { name: 'take_note' } });
  });

  it('OpenAI: tolerates malformed tool arguments', async () => {
    upstream([
      200,
      {
        choices: [
          {
            message: { content: null, tool_calls: [{ id: 'c', function: { name: 'take_note', arguments: '{oops' } }] },
          },
        ],
      },
    ]);
    const { json } = await call({ ...base, tools });
    expect(json).toEqual({ text: '', toolCalls: [{ id: 'c', name: 'take_note', args: {} }] });
  });

  it('Anthropic: tool_use / tool_result blocks, results grouped in one user turn', async () => {
    const sent = upstream([
      200,
      {
        content: [
          { type: 'text', text: 'Ok.' },
          { type: 'tool_use', id: 't9', name: 'take_note', input: { o: 'z' } },
        ],
      },
    ]);
    const twoResults = [...midLoop, { role: 'tool', toolCallId: 'c1b', name: 'take_note', content: 'Noted again.' }];
    const { json } = await call({ ...base, provider: 'anthropic', messages: twoResults, tools });
    expect(json).toEqual({ text: 'Ok.', toolCalls: [{ id: 't9', name: 'take_note', args: { o: 'z' } }] });
    expect(sent[0].headers['x-api-key']).toBe('k');
    expect(sent[0].body.system).toBe('SYS');
    expect(sent[0].body.messages[1].content[0]).toEqual({
      type: 'tool_use',
      id: 'c1',
      name: 'take_note',
      input: { o: 'x' },
    });
    expect(sent[0].body.messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'c1', content: 'Noted.' },
        { type: 'tool_result', tool_use_id: 'c1b', content: 'Noted again.' },
      ],
    });
    expect(sent[0].body.tools[0].input_schema).toEqual(tools[0].parameters);
  });

  it('Gemini: echoes the original function-call part (thought signature) and skips thoughts', async () => {
    const sent = upstream([
      200,
      {
        candidates: [
          {
            content: {
              parts: [
                { text: 'thinking…', thought: true },
                { text: 'Vale.' },
                { functionCall: { name: 'take_note', args: { o: 'w' } }, thoughtSignature: 'SIG2' },
              ],
            },
          },
        ],
      },
    ]);
    const { json } = await call({ ...base, provider: 'gemini', messages: midLoop, tools });
    expect(json.text).toBe('Vale.');
    expect(json.toolCalls[0]).toMatchObject({
      name: 'take_note',
      args: { o: 'w' },
      meta: { thoughtSignature: 'SIG2' },
    });
    expect(sent[0].url).toContain('/models/m:generateContent');
    expect(sent[0].body.contents[1]).toEqual({
      role: 'model',
      parts: [{ functionCall: { name: 'take_note' }, thoughtSignature: 'SIG' }],
    });
    expect(sent[0].body.contents[2].parts[0]).toEqual({
      functionResponse: { name: 'take_note', response: { content: 'Noted.' } },
    });
    expect(sent[0].body.tools[0].functionDeclarations[0].name).toBe('take_note');
  });

  it('OpenRouter: labels the app in the user’s dashboard', async () => {
    const sent = upstream([200, { choices: [{ message: { content: 'Hi' } }] }]);
    await call({ ...base, provider: 'openrouter' });
    expect(sent[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(sent[0].headers['x-title']).toBe('interview-bot');
  });
});

describe('fallbacks', () => {
  const tools = [{ name: 'take_note', description: 'd', parameters: { type: 'object', properties: {} } }];

  it('retries without tools when the model does not support them, and says so', async () => {
    const sent = upstream(
      [404, { error: { message: 'No endpoints found that support tool use' } }],
      [200, { choices: [{ message: { content: 'Plain.' } }] }],
    );
    const { status, json } = await call({ ...base, provider: 'openrouter', tools });
    expect(status).toBe(200);
    expect(json).toEqual({ text: 'Plain.', toolCalls: [], toolsUnsupported: true });
    expect(sent[1].body.tools).toBeUndefined();
  });

  it('does not hide other errors behind the tools fallback', async () => {
    upstream([401, { error: { message: 'invalid x-api-key' } }]);
    await expect(call({ ...base, provider: 'anthropic', tools })).resolves.toEqual({
      status: 401,
      json: { error: 'invalid x-api-key' },
    });
  });

  it('OpenRouter: folds the system prompt into the first message for models that reject it', async () => {
    const sent = upstream(
      [400, { error: { message: 'Developer instruction is not enabled' } }],
      [200, { choices: [{ message: { content: 'Ok' } }] }],
    );
    const { json } = await call({ ...base, provider: 'openrouter' });
    expect(json.text).toBe('Ok');
    expect(sent[1].body.messages).toEqual([{ role: 'user', content: 'SYS\n\nhola' }]);
  });

  it('OpenRouter: reports the original error if the folded retry fails too', async () => {
    upstream([400, { error: { message: 'first' } }], [400, { error: { message: 'second' } }]);
    await expect(call({ ...base, provider: 'openrouter' })).resolves.toEqual({ status: 400, json: { error: 'first' } });
  });
});

describe('errors', () => {
  it('surfaces the real cause OpenRouter hides in metadata.raw, with the provider name', async () => {
    upstream([
      429,
      {
        error: {
          message: 'Provider returned error',
          metadata: {
            raw: JSON.stringify({ error: { message: 'temporarily rate-limited upstream' } }),
            provider_name: 'Google AI Studio',
          },
        },
      },
    ]);
    await expect(call({ ...base, provider: 'openrouter' })).resolves.toEqual({
      status: 429,
      json: { error: 'Provider returned error: temporarily rate-limited upstream (Google AI Studio)' },
    });
  });

  it('answers 502 when the provider cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('network down'))),
    );
    await expect(call(base)).resolves.toEqual({ status: 502, json: { error: 'Could not reach the provider' } });
  });
});
