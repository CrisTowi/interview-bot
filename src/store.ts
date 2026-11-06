import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CloudProvider, NostrIdentity, Profile, SessionSummary, Settings, SyncPayload, TtsProvider } from './types';

export const DEFAULT_MODELS: Record<CloudProvider, string> = {
  openai: 'gpt-5-mini',
  anthropic: 'claude-sonnet-5-5',
  gemini: 'gemini-flash-latest',
  openrouter: 'anthropic/claude-sonnet-5.5',
};

export const DEFAULT_VOICES: Record<TtsProvider, string> = {
  openai: 'alloy',
  elevenlabs: '21m00Tcm4TlvDQ8ikWAM',
};

const MAX_HISTORY = 50;

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

const noIdentity: NostrIdentity = { mode: 'none', pubkey: '', syncKeys: false };

interface AppState {
  profile: Profile;
  settings: Settings;
  history: SessionSummary[];
  /** Last time the user changed synced data. Drives last-writer-wins against the remote copy. */
  updatedAt: number;
  /** Sessions dated before this were deleted, so merges must not bring them back. */
  historyClearedAt: number;
  nostr: NostrIdentity;
  setProfile: (patch: Partial<Profile>) => void;
  setSettings: (patch: Partial<Settings>) => void;
  addSummary: (summary: SessionSummary) => void;
  clearHistory: () => void;
  setNostr: (patch: Partial<NostrIdentity>, opts?: { touch?: boolean }) => void;
  /** Sets API keys without counting as a local edit (they came from the synced vault). */
  setKeysSilently: (keys: { cloud: string; tts: string }) => void;
  /** Merges a decrypted remote copy. History is always unioned; the rest is taken only if `remoteWins`. */
  applyRemote: (remote: SyncPayload, remoteWins: boolean) => void;
}

function mergeHistory(a: SessionSummary[], b: SessionSummary[], clearedAt: number): SessionSummary[] {
  const byId = new Map([...a, ...b].map((s) => [s.id, s]));
  return [...byId.values()]
    .filter((s) => Date.parse(s.date) > clearedAt)
    .sort((x, y) => y.date.localeCompare(x.date))
    .slice(0, MAX_HISTORY);
}

/**
 * All app state lives in the browser (localStorage). When a Nostr identity is connected,
 * src/sync/nostrSync.ts mirrors it to relays as a NIP-44 encrypted event.
 */
export const useApp = create<AppState>()(
  persist(
    (set) => ({
      profile: defaultProfile,
      settings: defaultSettings,
      history: [],
      updatedAt: 0,
      historyClearedAt: 0,
      nostr: noIdentity,
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch }, updatedAt: Date.now() })),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch }, updatedAt: Date.now() })),
      addSummary: (summary) =>
        set((s) => ({ history: [summary, ...s.history].slice(0, MAX_HISTORY), updatedAt: Date.now() })),
      clearHistory: () => set({ history: [], historyClearedAt: Date.now(), updatedAt: Date.now() }),
      setNostr: (patch, opts) =>
        set((s) => ({ nostr: { ...s.nostr, ...patch }, ...(opts?.touch ? { updatedAt: Date.now() } : {}) })),
      setKeysSilently: (keys) =>
        set((s) => ({
          settings: {
            ...s.settings,
            cloud: { ...s.settings.cloud, apiKey: keys.cloud },
            premiumTts: { ...s.settings.premiumTts, apiKey: keys.tts },
          },
        })),
      applyRemote: (remote, remoteWins) =>
        set((s) => {
          const historyClearedAt = Math.max(s.historyClearedAt, remote.historyClearedAt);
          const history = mergeHistory(remote.history, s.history, historyClearedAt);
          if (!remoteWins) return { history, historyClearedAt };
          return {
            history,
            historyClearedAt,
            updatedAt: remote.updatedAt,
            profile: { ...s.profile, ...remote.profile },
            settings: {
              ...s.settings,
              ...remote.settings,
              // Keys never travel in the clear part of the payload; keep the local ones.
              cloud: { ...remote.settings.cloud, apiKey: s.settings.cloud.apiKey },
              premiumTts: { ...remote.settings.premiumTts, apiKey: s.settings.premiumTts.apiKey },
            },
            nostr: { ...s.nostr, vault: remote.vault, syncKeys: !!remote.vault },
          };
        }),
    }),
    {
      name: 'interview-bot',
      version: 3,
      // Fill in fields added since the data was saved instead of dropping them.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          profile: { ...current.profile, ...p.profile },
          settings: { ...current.settings, ...p.settings },
          nostr: { ...current.nostr, ...p.nostr },
        };
      },
    },
  ),
);
