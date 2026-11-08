import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentTool } from './agent';
import { CloudAgent } from './cloudAgent';

const config = { provider: 'anthropic' as const, apiKey: ' key ', model: ' model ' };
const history = [{ role: 'user' as const, content: 'hola' }];

function mockReplies(...replies: object[]) {
  const bodies: any[] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const reply = replies[Math.min(bodies.length - 1, replies.length - 1)];
    return new Response(JSON.stringify(reply), { status: 'error' in reply ? 500 : 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return bodies;
}

function tool(name: string, endsTurn = false): AgentTool & { run: ReturnType<typeof vi.fn> } {
  return {
    name,
    description: name,
    parameters: { type: 'object', properties: {} },
    endsTurn,
    run: vi.fn(() => `${name} ok`),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('CloudAgent', () => {
  it('sends trimmed credentials and returns the text', async () => {
    const bodies = mockReplies({ text: 'Hola, soy Laura.' });
    await expect(new CloudAgent(config).reply('SYS', history)).resolves.toBe('Hola, soy Laura.');
    expect(bodies[0]).toMatchObject({
      provider: 'anthropic',
      apiKey: 'key',
      model: 'model',
      system: 'SYS',
      messages: history,
    });
    expect(bodies[0].tools).toBeUndefined();
  });

  it('runs the tools the model calls and shows it the results before it answers', async () => {
    const note = tool('take_note');
    const bodies = mockReplies(
      { text: '', toolCalls: [{ id: 'c1', name: 'take_note', args: { observation: 'x' } }] },
      { text: 'Siguiente pregunta.' },
    );
    const text = await new CloudAgent(config).reply('SYS', history, [note]);
    expect(text).toBe('Siguiente pregunta.');
    expect(note.run).toHaveBeenCalledWith({ observation: 'x' });
    expect(bodies[1].messages.slice(1)).toEqual([
      { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'take_note', args: { observation: 'x' } }] },
      { role: 'tool', toolCallId: 'c1', name: 'take_note', content: 'take_note ok' },
    ]);
    expect(bodies[1].tools.map((t: AgentTool) => t.name)).toEqual(['take_note']);
  });

  it('stops right after a tool that ends the turn, keeping the goodbye', async () => {
    const end = tool('end_interview', true);
    const bodies = mockReplies({ text: '¡Hasta pronto!', toolCalls: [{ id: 'e', name: 'end_interview', args: {} }] });
    await expect(new CloudAgent(config).reply('SYS', history, [end])).resolves.toBe('¡Hasta pronto!');
    expect(bodies).toHaveLength(1);
    expect(end.run).toHaveBeenCalledOnce();
  });

  it('answers unknown tools with an error result instead of crashing', async () => {
    const bodies = mockReplies({ toolCalls: [{ id: 'u', name: 'launch_rocket', args: {} }] }, { text: 'Ok' });
    await new CloudAgent(config).reply('SYS', history, [tool('take_note')]);
    expect(bodies[1].messages.at(-1)).toMatchObject({ role: 'tool', content: 'Unknown tool: launch_rocket' });
  });

  it('gives up after a bounded number of steps if the model keeps calling tools', async () => {
    const bodies = mockReplies({ toolCalls: [{ id: 'x', name: 'take_note', args: {} }] });
    await new CloudAgent(config).reply('SYS', history, [tool('take_note')]);
    expect(bodies).toHaveLength(6);
  });

  it('switches to basic mode when the provider rejects tools', async () => {
    const agent = new CloudAgent(config);
    const bodies = mockReplies({ text: 'Sin herramientas.', toolsUnsupported: true });
    await agent.reply('SYS', history, [tool('take_note')]);
    expect(agent.toolsUnsupported).toBe(true);
    await agent.reply('SYS', history, [tool('take_note')]);
    expect(bodies[1].tools).toBeUndefined();
  });

  it('surfaces the provider error message', async () => {
    mockReplies({ error: 'rate-limited upstream' });
    await expect(new CloudAgent(config).reply('SYS', history)).rejects.toThrow('rate-limited upstream');
  });
});
