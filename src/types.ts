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

export type CloudProvider = 'openai' | 'anthropic' | 'gemini' | 'openrouter';
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

export type Dimension = 'structure' | 'specificity' | 'ownership' | 'impact' | 'scope' | 'communication';

export interface Evaluation {
  score: number;
  verdict: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  /** The single most important takeaway, one sentence. Missing on sessions saved before it existed. */
  headline?: string;
  /** 1-5 per criterion, with a one-line justification. */
  dimensions?: { key: Dimension; score: number; note: string }[];
  /** One concrete exercise to practice before the next interview. */
  nextStep?: string;
}

export interface SessionSummary extends Evaluation {
  id: string;
  date: string;
  role: string;
  seniority: Seniority;
  company: Company;
  focus: Focus;
}

/** API keys sealed with a passphrase (PBKDF2 + AES-GCM) before going into the synced payload. */
export interface Vault {
  salt: string;
  iv: string;
  data: string;
}

export interface NostrIdentity {
  /** 'extension' = NIP-07 signer (Alby, nos2x…); 'local' = key generated or imported in this browser. */
  mode: 'none' | 'extension' | 'local';
  pubkey: string;
  /** Hex secret key, only for 'local' mode. Never leaves this browser. */
  secretKey?: string;
  syncKeys: boolean;
  vault?: Vault;
}

/** What gets NIP-44 encrypted and published to relays. API keys only travel inside `vault`. */
export interface SyncPayload {
  v: 1;
  updatedAt: number;
  profile: Profile;
  settings: Settings;
  history: SessionSummary[];
  historyClearedAt: number;
  vault?: Vault;
}
