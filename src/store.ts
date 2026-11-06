import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CloudProvider, Profile, SessionSummary, Settings, TtsProvider } from './types';

export const DEFAULT_MODELS: Record<CloudProvider, string> = {
  openai: 'gpt-5-mini',
  anthropic: 'claude-sonnet-5-5',
  gemini: 'gemini-flash-latest',
};

export const DEFAULT_VOICES: Record<TtsProvider, string> = {
  openai: 'alloy',
  elevenlabs: '21m00Tcm4TlvDQ8ikWAM',
};

const defaultProfile: Profile = {
  role: 'Software Engineer',
  seniority: 'Senior',
  company: 'Amazon',
  focus: 'mixed',
  background: '',
  salary: '',
  lang: 'es',
};

const defaultSettings: Settings = {
  llm: 'local',
  cloud: { provider: 'openai', apiKey: '', model: DEFAULT_MODELS.openai },
  tts: 'native',
  premiumTts: { provider: 'openai', apiKey: '', voice: DEFAULT_VOICES.openai },
};

interface AppState {
  profile: Profile;
  settings: Settings;
  history: SessionSummary[];
  setProfile: (patch: Partial<Profile>) => void;
  setSettings: (patch: Partial<Settings>) => void;
  addSummary: (summary: SessionSummary) => void;
  clearHistory: () => void;
}

/**
 * All app state lives in the browser (localStorage). Nothing is stored server-side.
 * Phase 3 (Nostr sync) plugs in here by swapping persist's `storage` for a NIP-44 encrypted adapter.
 */
export const useApp = create<AppState>()(
  persist(
    (set) => ({
      profile: defaultProfile,
      settings: defaultSettings,
      history: [],
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      addSummary: (summary) => set((s) => ({ history: [summary, ...s.history].slice(0, 50) })),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'interview-bot',
      version: 2,
      // Fill in fields added since the data was saved instead of dropping them.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          profile: { ...current.profile, ...p.profile },
          settings: { ...current.settings, ...p.settings },
        };
      },
    },
  ),
);
