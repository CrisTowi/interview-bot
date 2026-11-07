import { t } from '../i18n';
import type { ChatMessage, Lang } from '../types';
import type { InterviewAgent } from './agent';

/**
 * Layer 1: Chrome Built-in AI (Gemini Nano) via the Prompt API.
 * Current Chrome exposes it as the global `LanguageModel`; older builds used `window.ai.languageModel`.
 */

export type LocalAiStatus = 'checking' | 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface LMSession {
  prompt(input: string): Promise<string>;
  destroy(): void;
}
interface LanguageModelApi {
  availability?(options?: object): Promise<string>;
  capabilities?(): Promise<{ available: string }>;
  create(options?: object): Promise<LMSession>;
}

function getApi(): LanguageModelApi | undefined {
  const g = globalThis as any;
  return g.LanguageModel ?? g.ai?.languageModel;
}

export async function checkLocalAi(): Promise<LocalAiStatus> {
  const api = getApi();
  if (!api) return 'unavailable';
  try {
    if (api.availability) {
      const status = await api.availability();
      return (['available', 'downloadable', 'downloading'] as const).find((s) => s === status) ?? 'unavailable';
    }
    const caps = await api.capabilities?.();
    if (caps?.available === 'readily') return 'available';
    if (caps?.available === 'after-download') return 'downloadable';
  } catch {
    // Treat any failure as unavailable.
  }
  return 'unavailable';
}

export class LocalAgent implements InterviewAgent {
  /** Chrome's local model doesn't do tool use; the interview runs in basic mode. */
  readonly toolsUnsupported = true;

  private session?: LMSession;
  private sessionSystem = '';
  /** How many messages the current session already holds in its context. */
  private seen = 0;

  constructor(
    private lang: Lang,
    private onDownloadProgress?: (ratio: number) => void,
  ) {}

  async reply(system: string, messages: ChatMessage[]): Promise<string> {
    const prior = messages.slice(0, -1);
    const last = messages[messages.length - 1];

    // Reuse the session across turns; rebuild it only if the conversation diverged from what it has seen.
    if (!this.session || this.sessionSystem !== system || this.seen !== prior.length) {
      this.session?.destroy();
      this.session = await this.createSession(system, prior);
      this.sessionSystem = system;
    }
    try {
      const text = await this.session.prompt(last.content);
      this.seen = messages.length + 1;
      return text;
    } catch (err) {
      this.destroy();
      throw err;
    }
  }

  private async createSession(system: string, prior: ChatMessage[]): Promise<LMSession> {
    const api = getApi();
    if (!api) throw new Error(t().interview.localUnavailable);
    const onProgress = this.onDownloadProgress;
    const base = {
      initialPrompts: [{ role: 'system', content: system }, ...prior.map(({ role, content }) => ({ role, content }))],
      monitor(m: EventTarget) {
        m.addEventListener('downloadprogress', (e) => onProgress?.((e as ProgressEvent).loaded));
      },
    };
    const languages = [this.lang];
    try {
      return await api.create({
        ...base,
        expectedInputs: [{ type: 'text', languages }],
        expectedOutputs: [{ type: 'text', languages }],
      });
    } catch {
      // Older builds reject the language hints.
      return api.create(base);
    }
  }

  destroy() {
    this.session?.destroy();
    this.session = undefined;
    this.seen = 0;
  }
}
