// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionSummary, SyncPayload } from './types';

const session = (id: string, date: string): SessionSummary => ({
  id,
  date,
  role: 'SWE',
  seniority: 'Senior',
  company: 'Amazon',
  focus: 'mixed',
  score: 5,
  verdict: 'Hire',
  summary: '',
  strengths: [],
  improvements: [],
});

async function freshStore(saved?: object) {
  localStorage.clear();
  if (saved) localStorage.setItem('interview-bot', JSON.stringify({ version: 2, state: saved }));
  vi.resetModules();
  return (await import('./store')).useApp;
}

beforeEach(() => localStorage.clear());

describe('local edits', () => {
  it('bump updatedAt so sync knows this device has newer data', async () => {
    const useApp = await freshStore();
    expect(useApp.getState().updatedAt).toBe(0);
    useApp.getState().setProfile({ role: 'Staff Engineer' });
    expect(useApp.getState().updatedAt).toBeGreaterThan(0);
  });

  it('keep at most 50 sessions, newest first', async () => {
    const useApp = await freshStore();
    for (let i = 0; i < 55; i++)
      useApp.getState().addSummary(session(`s${i}`, `2026-11-01T00:00:${String(i).padStart(2, '0')}Z`));
    expect(useApp.getState().history).toHaveLength(50);
    expect(useApp.getState().history[0].id).toBe('s54');
  });

  it('record when the history was cleared', async () => {
    const useApp = await freshStore();
    useApp.getState().addSummary(session('a', '2026-11-01T00:00:00Z'));
    useApp.getState().clearHistory();
    expect(useApp.getState().history).toEqual([]);
    expect(useApp.getState().historyClearedAt).toBeGreaterThan(0);
  });

  it('set keys from the vault without counting as an edit', async () => {
    const useApp = await freshStore();
    useApp.getState().setKeysSilently({ cloud: 'k1', tts: 'k2' });
    expect(useApp.getState().settings.cloud.apiKey).toBe('k1');
    expect(useApp.getState().updatedAt).toBe(0);
  });
});

describe('applyRemote', () => {
  const remote = (overrides: Partial<SyncPayload> = {}): SyncPayload => ({
    v: 1,
    updatedAt: 100,
    profile: {
      role: 'Remote role',
      seniority: 'Staff',
      company: 'Google',
      focus: 'impact',
      duration: 'quick',
      background: '',
      cvSummary: '',
      salary: '',
      lang: 'en',
    },
    settings: {
      uiLang: 'en',
      llm: 'cloud',
      cloud: { provider: 'anthropic', apiKey: '', model: 'm' },
      tts: 'off',
      premiumTts: { provider: 'openai', apiKey: '', voice: '' },
    },
    history: [session('remote', '2026-11-02T00:00:00Z')],
    historyClearedAt: 0,
    ...overrides,
  });

  it('takes the remote profile and settings when it wins, but keeps local API keys', async () => {
    const useApp = await freshStore();
    useApp.getState().setSettings({ cloud: { provider: 'openai', apiKey: 'local-key', model: 'x' } });
    useApp.getState().applyRemote(remote(), true);
    const { profile, settings, updatedAt } = useApp.getState();
    expect(profile.role).toBe('Remote role');
    expect(settings.cloud).toEqual({ provider: 'anthropic', apiKey: 'local-key', model: 'm' });
    expect(updatedAt).toBe(100);
  });

  it('keeps local profile when local is newer, yet still merges history from both sides', async () => {
    const useApp = await freshStore();
    useApp.getState().setProfile({ role: 'Local role' });
    useApp.getState().addSummary(session('local', '2026-11-03T00:00:00Z'));
    useApp.getState().applyRemote(remote(), false);
    expect(useApp.getState().profile.role).toBe('Local role');
    expect(useApp.getState().history.map((s) => s.id)).toEqual(['local', 'remote']);
  });

  it('does not bring back sessions deleted on either device', async () => {
    const useApp = await freshStore();
    useApp.getState().addSummary(session('old-local', '2026-11-01T00:00:00Z'));
    useApp.getState().applyRemote(remote({ historyClearedAt: Date.parse('2026-11-01T12:00:00Z') }), false);
    expect(useApp.getState().history.map((s) => s.id)).toEqual(['remote']);
  });

  it('adopts the remote key vault when the remote copy wins', async () => {
    const useApp = await freshStore();
    useApp.getState().applyRemote(remote({ vault: { salt: 's', iv: 'i', data: 'd' } }), true);
    expect(useApp.getState().nostr).toMatchObject({ syncKeys: true, vault: { salt: 's' } });
  });
});

describe('loading saved data from an older version', () => {
  it('fills in fields added later instead of dropping the saved state', async () => {
    const useApp = await freshStore({ profile: { role: 'Saved role', lang: 'es' }, settings: { llm: 'cloud' } });
    const { profile, settings } = useApp.getState();
    expect(profile).toMatchObject({ role: 'Saved role', focus: 'mixed', duration: 'full', cvSummary: '' });
    expect(settings).toMatchObject({ llm: 'cloud', tts: 'native' });
  });

  it('keeps the language the user already had for the app', async () => {
    const useApp = await freshStore({ profile: { lang: 'es' }, settings: { llm: 'local' } });
    expect(useApp.getState().settings.uiLang).toBe('es');
  });

  it('migrates the old fixed premium voices to automatic', async () => {
    const useApp = await freshStore({
      settings: { tts: 'premium', premiumTts: { provider: 'openai', apiKey: 'k', voice: 'alloy' } },
    });
    expect(useApp.getState().settings.premiumTts).toEqual({ provider: 'openai', apiKey: 'k', voice: '' });
  });
});
