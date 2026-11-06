import * as nip19 from 'nostr-tools/nip19';
import { SimplePool } from 'nostr-tools/pool';
import { generateSecretKey } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { create } from 'zustand';
import { useApp } from '../store';
import type { Settings, SyncPayload } from '../types';
import { extensionSigner, localSigner, type Signer } from './signer';
import { fingerprint, openVault, sealVault } from './vault';

/**
 * Multi-device sync over Nostr. The whole app state is NIP-44 encrypted to the user's own pubkey and
 * published as a single replaceable NIP-78 event, so relays only ever see ciphertext.
 * localStorage stays the source of truth on each device; relays are the meeting point between devices.
 */

export const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const KIND_APP_DATA = 30078; // NIP-78: arbitrary app data, replaceable per `d` tag
const D_TAG = 'interview-bot/state';
const MAX_PLAINTEXT_BYTES = 60_000; // NIP-44 caps plaintext at 65,535 bytes
const PUSH_DELAY_MS = 2000;

interface SyncState {
  status: 'off' | 'connecting' | 'syncing' | 'synced' | 'error';
  error: string;
  /** A synced key vault exists but this browser doesn't have the passphrase to read or update it. */
  vaultLocked: boolean;
}

export const useSync = create<SyncState>(() => ({ status: 'off', error: '', vaultLocked: false }));

let pool: SimplePool | null = null;
let signer: Signer | null = null;
/** Held in memory only; never persisted. */
let passphrase: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let unsubscribe: (() => void) | null = null;
let lastCreatedAt = 0;

const getPool = () => (pool ??= new SimplePool());

function fail(err: unknown) {
  const error = err instanceof AggregateError ? 'Ningún relay aceptó los datos. Revisa tu conexión.' : (err as Error).message;
  useSync.setState({ status: 'error', error: error || 'Error de sincronización.' });
}

function withoutKeys(settings: Settings): Settings {
  return {
    ...settings,
    cloud: { ...settings.cloud, apiKey: '' },
    premiumTts: { ...settings.premiumTts, apiKey: '' },
  };
}

async function fetchRemote(s: Signer): Promise<SyncPayload | null> {
  const events = await getPool().querySync(
    RELAYS,
    { kinds: [KIND_APP_DATA], authors: [s.pubkey], '#d': [D_TAG] },
    { maxWait: 5000 },
  );
  const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
  if (!latest) return null;
  lastCreatedAt = Math.max(lastCreatedAt, latest.created_at);
  const payload = JSON.parse(await s.decryptFromSelf(latest.content)) as SyncPayload;
  return payload.v === 1 ? payload : null;
}

async function buildPayload(): Promise<SyncPayload> {
  const state = useApp.getState();
  let vault = state.nostr.syncKeys ? state.nostr.vault : undefined;
  if (state.nostr.syncKeys && passphrase) {
    const keys = { cloud: state.settings.cloud.apiKey, tts: state.settings.premiumTts.apiKey };
    vault = await sealVault(keys, passphrase, vault?.salt);
    state.setNostr({ vault, keysFingerprint: await fingerprint(keys) });
  }
  const payload: SyncPayload = {
    v: 1,
    updatedAt: state.updatedAt,
    profile: state.profile,
    settings: withoutKeys(state.settings),
    history: [...state.history],
    historyClearedAt: state.historyClearedAt,
    vault,
  };
  // Drop the oldest sessions if the payload would exceed what NIP-44 can encrypt.
  while (payload.history.length && new TextEncoder().encode(JSON.stringify(payload)).length > MAX_PLAINTEXT_BYTES) {
    payload.history.pop();
  }
  return payload;
}

async function push() {
  if (!signer) return;
  const current = signer;
  useSync.setState({ status: 'syncing', error: '' });
  try {
    const content = await current.encryptToSelf(JSON.stringify(await buildPayload()));
    // Replaceable events are ordered by created_at (seconds), so keep it strictly increasing.
    lastCreatedAt = Math.max(Math.floor(Date.now() / 1000), lastCreatedAt + 1);
    const event = await current.sign({ kind: KIND_APP_DATA, created_at: lastCreatedAt, tags: [['d', D_TAG]], content });
    await Promise.any(getPool().publish(RELAYS, event));
    if (signer === current) useSync.setState({ status: 'synced' });
  } catch (err) {
    if (signer === current) fail(err);
  }
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, PUSH_DELAY_MS);
}

async function refreshVaultLock() {
  const { nostr, setKeysSilently } = useApp.getState();
  if (!nostr.syncKeys || !nostr.vault) return useSync.setState({ vaultLocked: false });
  if (!passphrase) return useSync.setState({ vaultLocked: true });
  try {
    const keys = await openVault(nostr.vault, passphrase);
    setKeysSilently(keys);
    useApp.getState().setNostr({ keysFingerprint: await fingerprint(keys) });
    useSync.setState({ vaultLocked: false });
  } catch {
    passphrase = null;
    useSync.setState({ vaultLocked: true });
  }
}

/** Merge the remote copy into local state, then publish if this device has something the relays don't. */
async function pull(initial: boolean) {
  const remote = await fetchRemote(signer!);
  if (!remote) return push();

  const local = useApp.getState();
  // On first connect, an existing remote copy beats whatever this browser had before.
  const remoteWins = initial || remote.updatedAt > local.updatedAt;
  const remoteIds = new Set(remote.history.map((s) => s.id));
  const localHasMore = local.history.some((s) => !remoteIds.has(s.id) && Date.parse(s.date) > remote.historyClearedAt);

  local.applyRemote(remote, remoteWins);
  await refreshVaultLock();
  if (!remoteWins || localHasMore) await push();
  else useSync.setState({ status: 'synced' });
}

function stop() {
  unsubscribe?.();
  unsubscribe = null;
  clearTimeout(pushTimer);
  signer = null;
}

/** Called on app load and after connecting. Safe to call again to retry after an error. */
export async function startSync(initial = false, prebuilt?: Signer) {
  stop();
  const { nostr } = useApp.getState();
  if (nostr.mode === 'none') return;
  useSync.setState({ status: 'connecting', error: '' });
  try {
    const current = prebuilt ?? (nostr.mode === 'local' && nostr.secretKey ? localSigner(nostr.secretKey) : await extensionSigner());
    if (current.pubkey !== nostr.pubkey) {
      // The extension switched accounts: the old vault belongs to someone else.
      useApp.getState().setNostr({ pubkey: current.pubkey, syncKeys: false, vault: undefined });
      initial = true;
    }
    signer = current;
    useSync.setState({ status: 'syncing' });
    await pull(initial);
    // Only start publishing local edits once we've merged the remote copy, so we never overwrite newer data.
    unsubscribe = useApp.subscribe((s, prev) => {
      if (s.updatedAt !== prev.updatedAt) schedulePush();
    });
  } catch (err) {
    fail(err);
  }
}

export async function connectExtension() {
  const s = await extensionSigner();
  useApp.getState().setNostr({ mode: 'extension', pubkey: s.pubkey, secretKey: undefined, syncKeys: false, vault: undefined });
  await startSync(true, s);
}

async function connectLocal(secretKeyHex: string) {
  const s = localSigner(secretKeyHex);
  useApp.getState().setNostr({ mode: 'local', pubkey: s.pubkey, secretKey: secretKeyHex, syncKeys: false, vault: undefined });
  await startSync(true, s);
}

export function createLocalIdentity() {
  return connectLocal(bytesToHex(generateSecretKey()));
}

export function importNsec(nsec: string) {
  let decoded: ReturnType<typeof nip19.decode>;
  try {
    decoded = nip19.decode(nsec.trim());
  } catch {
    throw new Error('Esa clave no es válida. Debe empezar con nsec1.');
  }
  if (decoded.type !== 'nsec') throw new Error('Pega tu clave privada (nsec1…), no la pública.');
  return connectLocal(bytesToHex(decoded.data));
}

export function disconnect() {
  stop();
  passphrase = null;
  useApp.getState().setNostr({
    mode: 'none',
    pubkey: '',
    secretKey: undefined,
    syncKeys: false,
    vault: undefined,
    keysFingerprint: undefined,
  });
  useSync.setState({ status: 'off', error: '', vaultLocked: false });
}

export function enableKeySync(newPassphrase: string) {
  passphrase = newPassphrase;
  // A fresh vault (new salt) under the new passphrase; touching updatedAt triggers the publish.
  useApp.getState().setNostr({ syncKeys: true, vault: undefined }, { touch: true });
  useSync.setState({ vaultLocked: false });
}

export function disableKeySync() {
  passphrase = null;
  useApp.getState().setNostr({ syncKeys: false, vault: undefined, keysFingerprint: undefined }, { touch: true });
  useSync.setState({ vaultLocked: false });
}

/** New device: bring the synced keys into this browser. */
export async function unlockKeys(candidate: string) {
  const { nostr, setKeysSilently, setNostr } = useApp.getState();
  if (!nostr.vault) return;
  const keys = await openVault(nostr.vault, candidate);
  setKeysSilently(keys);
  setNostr({ keysFingerprint: await fingerprint(keys) });
  passphrase = candidate;
  useSync.setState({ vaultLocked: false });
}

/** Keys changed in this browser: check the password, then re-seal the synced copy with the local keys. */
export async function updateSyncedKeys(candidate: string) {
  const { nostr, setNostr } = useApp.getState();
  if (!nostr.vault) return;
  await openVault(nostr.vault, candidate);
  passphrase = candidate;
  useSync.setState({ vaultLocked: false });
  setNostr({}, { touch: true });
}

export function exportNsec(): string | null {
  const { secretKey } = useApp.getState().nostr;
  return secretKey ? nip19.nsecEncode(hexToBytes(secretKey)) : null;
}

export function shortNpub(pubkey: string): string {
  const npub = nip19.npubEncode(pubkey);
  return `${npub.slice(0, 12)}…${npub.slice(-6)}`;
}
