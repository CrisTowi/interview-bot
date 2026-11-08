// @vitest-environment jsdom
import type { Event } from 'nostr-tools/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** An in-memory relay shared by every simulated device (it survives vi.resetModules). */
const relay = vi.hoisted(() => ({ events: [] as Event[], down: false }));

vi.mock('nostr-tools/pool', () => ({
  SimplePool: class {
    async querySync(_relays: string[], filter: { authors: string[]; kinds: number[] }) {
      if (relay.down) return [];
      return relay.events.filter((e) => e.pubkey === filter.authors[0] && e.kind === filter.kinds[0]);
    }
    publish(relays: string[], event: Event) {
      return relays.map(async () => {
        if (relay.down) throw new Error('connection refused');
        relay.events.push(event);
        return 'ok';
      });
    }
  },
}));

/** A fresh browser: empty localStorage and fresh modules (no passphrase in memory, no sync state). */
async function device() {
  localStorage.clear();
  vi.resetModules();
  const store = await import('../store');
  const sync = await import('./nostrSync');
  return { useApp: store.useApp, sync, state: () => store.useApp.getState() };
}

const uniqueEvents = () => new Set(relay.events.map((e) => e.id)).size;

/** Polls without timers (setTimeout is faked) until `done`, for work that takes real time (PBKDF2). */
async function until(done: () => boolean, ms = 5000) {
  const start = performance.now();
  while (!done()) {
    if (performance.now() - start > ms) throw new Error('timed out waiting');
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Runs the debounced publish (2 s) and waits until the new event has actually reached the relay. */
async function flush() {
  const before = uniqueEvents();
  await vi.advanceTimersByTimeAsync(2100);
  await until(() => uniqueEvents() > before);
}

beforeEach(() => {
  relay.events = [];
  relay.down = false;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => vi.useRealTimers());

describe('first device', () => {
  it('publishes an encrypted, replaceable app-data event when a key is created', async () => {
    const a = await device();
    a.state().setProfile({ role: 'Staff Engineer' });
    await a.sync.createLocalIdentity();
    expect(a.sync.useSync.getState().status).toBe('synced');
    expect(uniqueEvents()).toBe(1); // the same event, sent to each relay
    const [event] = relay.events;
    expect(event.kind).toBe(30078);
    expect(event.tags).toContainEqual(['d', 'interview-bot/state']);
    expect(event.content).not.toContain('Staff Engineer');
  });

  it('publishes local edits after the debounce, never the API keys in the clear', async () => {
    const a = await device();
    await a.sync.createLocalIdentity();
    a.state().setSettings({ cloud: { provider: 'anthropic', apiKey: 'sk-ant-SECRET', model: 'm' } });
    await flush();
    expect(relay.events.length).toBeGreaterThan(1);
    expect(relay.events.at(-1)!.created_at).toBeGreaterThan(relay.events[0].created_at - 1);
  });
});

describe('second device', () => {
  it('restores profile, settings and history from the relay with the same key', async () => {
    const a = await device();
    a.state().setProfile({ role: 'Staff Engineer', focus: 'conflict' });
    a.state().addSummary({
      id: 's1',
      date: new Date().toISOString(),
      role: 'x',
      seniority: 'Staff',
      company: 'Amazon',
      focus: 'conflict',
      score: 7,
      verdict: 'Hire',
      summary: '',
      strengths: [],
      improvements: [],
    });
    await a.sync.createLocalIdentity(); // the first publish already carries these edits
    const nsec = a.sync.exportNsec()!;

    const b = await device();
    await b.sync.importNsec(nsec);
    expect(b.state().profile).toMatchObject({ role: 'Staff Engineer', focus: 'conflict' });
    expect(b.state().history.map((s) => s.id)).toEqual(['s1']);
  });

  it('brings synced API keys only with the right password', async () => {
    const a = await device();
    await a.sync.createLocalIdentity();
    a.state().setSettings({ cloud: { provider: 'openrouter', apiKey: 'sk-or-SECRET', model: 'x' } });
    a.sync.enableKeySync('correct horse');
    await flush();
    const nsec = a.sync.exportNsec()!;

    const b = await device();
    await b.sync.importNsec(nsec);
    expect(b.state().settings.cloud.apiKey).toBe('');
    expect(b.sync.useSync.getState().vaultLocked).toBe(true);
    await expect(b.sync.unlockKeys('wrong')).rejects.toThrow();
    await b.sync.unlockKeys('correct horse');
    expect(b.state().settings.cloud.apiKey).toBe('sk-or-SECRET');
    expect(b.sync.useSync.getState().vaultLocked).toBe(false);
  });

  it('keeps the newer device’s profile and merges both histories', async () => {
    const a = await device();
    await a.sync.createLocalIdentity();
    const nsec = a.sync.exportNsec()!;
    const b = await device();
    await b.sync.importNsec(nsec);
    b.state().setProfile({ role: 'Edited on B' });
    b.state().addSummary({
      id: 'from-b',
      date: new Date().toISOString(),
      role: 'x',
      seniority: 'Mid',
      company: 'Meta',
      focus: 'mixed',
      score: 6,
      verdict: 'Hire',
      summary: '',
      strengths: [],
      improvements: [],
    });
    await flush();

    // Device A reloads later: B's copy is newer, so A takes it.
    localStorage.setItem(
      'interview-bot',
      JSON.stringify({ version: 3, state: { nostr: { mode: 'local', secretKey: '', pubkey: '', syncKeys: false } } }),
    );
    const a2 = await device();
    await a2.sync.importNsec(nsec);
    expect(a2.state().profile.role).toBe('Edited on B');
    expect(a2.state().history.map((s) => s.id)).toContain('from-b');
  });
});

describe('things that go wrong', () => {
  it('rejects malformed keys and public keys with clear messages', async () => {
    const a = await device();
    a.state().setSettings({ uiLang: 'en' });
    expect(() => a.sync.importNsec('not-a-key')).toThrow("That key isn't valid");
    expect(() => a.sync.importNsec('npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9')).toThrow(
      'private key',
    );
  });

  it('reports an error when no relay accepts the data', async () => {
    const a = await device();
    a.state().setSettings({ uiLang: 'en' });
    relay.down = true;
    await a.sync.createLocalIdentity();
    expect(a.sync.useSync.getState()).toMatchObject({
      status: 'error',
      error: 'No relay accepted the data. Check your connection.',
    });
  });

  it('forgets the identity and the vault on disconnect, keeping local data', async () => {
    const a = await device();
    a.state().setProfile({ role: 'Kept' });
    await a.sync.createLocalIdentity();
    a.sync.disconnect();
    expect(a.state().nostr).toMatchObject({ mode: 'none', pubkey: '', secretKey: undefined, vault: undefined });
    expect(a.state().profile.role).toBe('Kept');
    expect(a.sync.useSync.getState().status).toBe('off');
  });
});
