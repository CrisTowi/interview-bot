import type { Vault } from '../types';

/**
 * Second layer for API keys: sealed with a passphrase before the whole payload is NIP-44 encrypted,
 * so a leaked Nostr key alone can't read them. Uses only the browser's WebCrypto.
 */

export interface VaultKeys {
  cloud: string;
  tts: string;
}

const ITERATIONS = 600_000; // OWASP recommendation for PBKDF2-HMAC-SHA256

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// PBKDF2 is deliberately slow; reuse the derived key while the passphrase and salt stay the same.
let cached: { passphrase: string; salt: string; key: CryptoKey } | null = null;

async function deriveKey(passphrase: string, salt: string): Promise<CryptoKey> {
  if (cached?.passphrase === passphrase && cached.salt === salt) return cached.key;
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  cached = { passphrase, salt, key };
  return key;
}

export async function sealVault(keys: VaultKeys, passphrase: string, salt?: string): Promise<Vault> {
  const vaultSalt = salt ?? toBase64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(passphrase, vaultSalt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(keys)));
  return { salt: vaultSalt, iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

export async function openVault(vault: Vault, passphrase: string): Promise<VaultKeys> {
  const key = await deriveKey(passphrase, vault.salt);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(vault.iv) }, key, fromBase64(vault.data));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error('Esa contraseña no abre tus keys. Revisa mayúsculas y espacios.');
  }
}

/** Identifies a set of keys without storing them, to detect local changes. */
export async function fingerprint(keys: VaultKeys): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([keys.cloud, keys.tts])));
  return toBase64(new Uint8Array(digest));
}
