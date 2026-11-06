export type Lang = 'es' | 'en';
export type Seniority = 'Junior' | 'Mid' | 'Senior' | 'Staff';
export type Company = 'Google' | 'Meta' | 'Amazon' | 'Startup';
export type Focus = 'mixed' | 'leadership' | 'conflict' | 'failure' | 'impact' | 'ambiguity';

export interface Profile {
  role: string;
  seniority: Seniority;
  company: Company;
  focus: Focus;
  /** Free-form background the interviewer can draw on (years, domain, team size…). */
  background: string;
  salary: string;
  lang: Lang;
}

export type CloudProvider = 'openai' | 'anthropic' | 'gemini';
export type TtsProvider = 'openai' | 'elevenlabs';

export interface Settings {
  llm: 'local' | 'cloud';
  cloud: { provider: CloudProvider; apiKey: string; model: string };
  tts: 'native' | 'premium' | 'off';
  premiumTts: { provider: TtsProvider; apiKey: string; voice: string };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Sent to the model but not shown in the transcript (e.g. the kickoff message). */
  hidden?: boolean;
}

export interface Evaluation {
  score: number;
  verdict: string;
  summary: string;
  strengths: string[];
  improvements: string[];
}

export interface SessionSummary extends Evaluation {
  id: string;
  date: string;
  role: string;
  seniority: Seniority;
  company: Company;
  focus: Focus;
}
