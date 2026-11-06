import type { ChatMessage, Settings } from '../types';
import type { InterviewAgent } from './agent';

/** Layer 2: user's own API key, forwarded through the stateless /api/chat proxy. */
export class CloudAgent implements InterviewAgent {
  constructor(private config: Settings['cloud']) {}

  async reply(system: string, messages: ChatMessage[]): Promise<string> {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: this.config.provider,
        apiKey: this.config.apiKey.trim(),
        model: this.config.model.trim(),
        system,
        messages: messages.map(({ role, content }) => ({ role, content })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
    return data.text ?? '';
  }

  destroy() {}
}
