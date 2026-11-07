import { fetchOpenRouterModels } from '../lib/openrouter';
import type { ChatMessage, Lang, Settings } from '../types';
import { CloudAgent } from './cloudAgent';
import { LocalAgent } from './localAgent';

/** A function the model can call. The browser runs it and sends the result back to the model. */
export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema for the arguments, kept to the subset all providers accept. */
  parameters: Record<string, unknown>;
  run(args: Record<string, unknown>): string;
  /** Calling it ends the turn (e.g. hanging up), so the model isn't asked to continue. */
  endsTurn?: boolean;
}

/** Common interface so the interview loop doesn't care which LLM layer is behind it. */
export interface InterviewAgent {
  /**
   * Returns the assistant reply to the last message in `messages`. With `tools`, the model may call
   * them first (act → observe → continue) before producing its reply.
   */
  reply(system: string, messages: ChatMessage[], tools?: AgentTool[]): Promise<string>;
  /** Set once the model turned out not to support tools; later calls should go without them. */
  readonly toolsUnsupported: boolean;
  destroy(): void;
}

export function createAgent(settings: Settings, lang: Lang, onDownloadProgress?: (ratio: number) => void): InterviewAgent {
  return settings.llm === 'local' ? new LocalAgent(lang, onDownloadProgress) : new CloudAgent(settings.cloud);
}

/**
 * Whether the selected model can use tools ("agent mode"). Chrome's local model can't; OpenRouter
 * lists support per model; the big providers' current models do (and the proxy falls back if not).
 */
export async function supportsTools(settings: Settings): Promise<boolean> {
  if (settings.llm === 'local') return false;
  if (settings.cloud.provider !== 'openrouter') return true;
  try {
    const model = (await fetchOpenRouterModels()).find((m) => m.id === settings.cloud.model.trim());
    return model ? model.tools : true;
  } catch {
    return true;
  }
}
