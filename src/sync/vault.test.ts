// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useApp } from '../store';
import { fingerprint, openVault, sealVault } from './vault';

const keys = { cloud: 'sk-ant-secret', tts: 'el-secret' };

describe('vault', () => {
  it('round-trips keys with the right password without exposing them', async () => {
    const vault = await sealVault(keys, 'correct horse');
    expect(JSON.stringify(vault)).not.toContain('secret');
    await expect(openVault(vault, 'correct horse')).resolves.toEqual(keys);
  });

  it('rejects a wrong password with a readable message in the app language', async () => {
    const vault = await sealVault(keys, 'correct horse');
    useApp.getState().setSettings({ uiLang: 'en' });
    await expect(openVault(vault, 'wrong')).rejects.toThrow("That password doesn't open your keys");
  });

  it('reuses the salt when resealing but never the IV', async () => {
    const first = await sealVault(keys, 'pw');
    const second = await sealVault(keys, 'pw', first.salt);
    expect(second.salt).toBe(first.salt);
    expect(second.iv).not.toBe(first.iv);
  });

  it('fingerprints keys deterministically', async () => {
    expect(await fingerprint(keys)).toBe(await fingerprint({ ...keys }));
    expect(await fingerprint(keys)).not.toBe(await fingerprint({ ...keys, cloud: 'other' }));
  });
});
