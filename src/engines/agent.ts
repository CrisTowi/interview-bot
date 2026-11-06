import type { ChatMessage, Lang, Settings } from '../types';
import { CloudAgent } from './cloudAgent';
import { LocalAgent } from './localAgent';

/** Common interface so the interview loop doesn't care which LLM layer is behind it. */
export interface InterviewAgent {
  /** Returns the assistant reply to the last message in `messages`. */
  reply(system: string, messages: ChatMessage[]): Promise<string>;
  destroy(): void;
}

export function createAgent(settings: Settings, lang: Lang, onDownloadProgress?: (ratio: number) => void): InterviewAgent {
  return settings.llm === 'local' ? new LocalAgent(lang, onDownloadProgress) : new CloudAgent(settings.cloud);
}
