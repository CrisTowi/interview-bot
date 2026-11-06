import type { EventTemplate, VerifiedEvent } from 'nostr-tools/core';
import * as nip44 from 'nostr-tools/nip44';
import type { WindowNostr } from 'nostr-tools/nip07';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';

/** Signs events and encrypts data to the user's own pubkey, whether the key lives here or in an extension. */
export interface Signer {
  pubkey: string;
  sign(template: EventTemplate): Promise<VerifiedEvent>;
  encryptToSelf(plaintext: string): Promise<string>;
  decryptFromSelf(payload: string): Promise<string>;
}

export function localSigner(secretKeyHex: string): Signer {
  const sk = hexToBytes(secretKeyHex);
  const pubkey = getPublicKey(sk);
  const conversationKey = nip44.getConversationKey(sk, pubkey);
  return {
    pubkey,
    sign: async (template) => finalizeEvent(template, sk),
    encryptToSelf: async (plaintext) => nip44.encrypt(plaintext, conversationKey),
    decryptFromSelf: async (payload) => nip44.decrypt(payload, conversationKey),
  };
}

function getExtension(): WindowNostr | undefined {
  return (window as { nostr?: WindowNostr }).nostr;
}

export function hasExtension(): boolean {
  return !!getExtension();
}

/** Extensions inject `window.nostr` after page load, so give them a moment. */
async function waitForExtension(timeoutMs = 2000): Promise<WindowNostr | undefined> {
  const start = Date.now();
  while (!getExtension() && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 100));
  }
  return getExtension();
}

export async function extensionSigner(): Promise<Signer> {
  const ext = await waitForExtension();
  if (!ext) throw new Error('No se encontró una extensión de Nostr (Alby, nos2x…).');
  const crypto = ext.nip44;
  if (!crypto) throw new Error('Tu extensión de Nostr no soporta cifrado NIP-44. Actualízala o usa otra.');
  const pubkey = await ext.getPublicKey();
  return {
    pubkey,
    sign: (template) => ext.signEvent(template),
    encryptToSelf: (plaintext) => crypto.encrypt(pubkey, plaintext),
    decryptFromSelf: (payload) => crypto.decrypt(pubkey, payload),
  };
}
