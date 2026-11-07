import type { ChatMessage, Settings } from '../types';
import type { AgentTool, InterviewAgent } from './agent';

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  meta?: unknown;
}
type WireMessage =
  | { role: 'user' | 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

/** Enough for a few notes plus a review before the model has to answer. */
const MAX_STEPS = 6;

/** Layer 2: user's own API key, forwarded through the stateless /api/chat proxy. */
export class CloudAgent implements InterviewAgent {
  toolsUnsupported = false;

  constructor(private config: Settings['cloud']) {}

  private async send(system: string, messages: WireMessage[], tools?: AgentTool[]) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: this.config.provider,
        apiKey: this.config.apiKey.trim(),
        model: this.config.model.trim(),
        system,
        messages,
        tools: tools?.map(({ name, description, parameters }) => ({ name, description, parameters })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
    return data as { text?: string; toolCalls?: ToolCall[]; toolsUnsupported?: boolean };
  }

  /** The agent loop: the model acts (tool calls), we run the tools and show it the results, until it answers. */
  async reply(system: string, messages: ChatMessage[], tools?: AgentTool[]): Promise<string> {
    const conversation: WireMessage[] = messages.map(({ role, content }) => ({ role, content }));
    let active = this.toolsUnsupported ? undefined : tools;
    let text = '';

    for (let step = 0; step < MAX_STEPS; step++) {
      const result = await this.send(system, conversation, active);
      if (result.toolsUnsupported) {
        this.toolsUnsupported = true;
        active = undefined;
      }
      if (result.text?.trim()) text = text ? `${text} ${result.text.trim()}` : result.text.trim();
      const calls = active ? (result.toolCalls ?? []) : [];
      if (!calls.length) break;

      conversation.push({ role: 'assistant', content: result.text ?? '', toolCalls: calls });
      let turnOver = false;
      for (const call of calls) {
        const tool = active!.find((t) => t.name === call.name);
        conversation.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: tool ? tool.run(call.args ?? {}) : `Unknown tool: ${call.name}`,
        });
        if (tool?.endsTurn) turnOver = true;
      }
      if (turnOver) break;
    }
    return text;
  }

  destroy() {}
}
