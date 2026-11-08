// @vitest-environment jsdom
import { verifyEvent } from 'nostr-tools/pure';
import { generateSecretKey } from 'nostr-tools/pure';
import { bytesToHex } from 'nostr-tools/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useApp } from '../store';
import { extensionSigner, hasExtension, localSigner } from './signer';

const template = { kind: 30078, created_at: 1, tags: [['d', 'x']], content: 'c' };

afterEach(() => {
  delete (window as { nostr?: unknown }).nostr;
  vi.useRealTimers();
});

describe('localSigner', () => {
  it('signs valid events and encrypts only for itself', async () => {
    const signer = localSigner(bytesToHex(generateSecretKey()));
    const event = await signer.sign(template);
    expect(verifyEvent(event)).toBe(true);
    expect(event.pubkey).toBe(signer.pubkey);
    const secret = await signer.encryptToSelf('hola');
    expect(secret).not.toContain('hola');
    await expect(signer.decryptFromSelf(secret)).resolves.toBe('hola');
    await expect(localSigner(bytesToHex(generateSecretKey())).decryptFromSelf(secret)).rejects.toThrow();
  });
});

describe('extensionSigner', () => {
  it('uses the NIP-07 extension for keys, signing and NIP-44', async () => {
    const encrypt = vi.fn(async (_pk: string, text: string) => `enc:${text}`);
    (window as any).nostr = {
      getPublicKey: async () => 'pub',
      signEvent: async (t: object) => ({ ...t, id: 'id', sig: 'sig', pubkey: 'pub' }),
      nip44: { encrypt, decrypt: async (_pk: string, text: string) => text.replace('enc:', '') },
    };
    expect(hasExtension()).toBe(true);
    const signer = await extensionSigner();
    expect(signer.pubkey).toBe('pub');
    await expect(signer.encryptToSelf('hola')).resolves.toBe('enc:hola');
    expect(encrypt).toHaveBeenCalledWith('pub', 'hola');
    await expect(signer.decryptFromSelf('enc:hola')).resolves.toBe('hola');
    await expect(signer.sign(template)).resolves.toMatchObject({ sig: 'sig' });
  });

  it('explains when the extension lacks NIP-44 encryption', async () => {
    useApp.getState().setSettings({ uiLang: 'en' });
    (window as any).nostr = { getPublicKey: async () => 'pub', signEvent: async () => ({}) };
    await expect(extensionSigner()).rejects.toThrow("doesn't support NIP-44");
  });

  it('waits briefly for the extension to appear, then gives up with a clear message', async () => {
    useApp.getState().setSettings({ uiLang: 'en' });
    vi.useFakeTimers();
    const attempt = extensionSigner();
    const check = expect(attempt).rejects.toThrow('No Nostr extension found');
    await vi.advanceTimersByTimeAsync(2100);
    await check;
  });
});
