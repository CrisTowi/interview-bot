import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelOption } from '../lib/openrouter';
import type { Settings } from '../types';

// A plain stub (not vi.fn): a vi.fn that returns a rejected promise is reported by Vitest as an unhandled
// rejection even when the code under test catches it.
const catalog = vi.hoisted(() => ({ calls: 0, load: async (): Promise<Partial<ModelOption>[]> => [] }));
vi.mock('../lib/openrouter', () => ({
  fetchOpenRouterModels: () => {
    catalog.calls++;
    return catalog.load();
  },
}));
const { supportsTools } = await import('./agent');

const settings = (llm: Settings['llm'], provider: Settings['cloud']['provider'], model = 'm'): Settings =>
  ({ llm, cloud: { provider, apiKey: 'k', model } }) as Settings;

beforeEach(() => {
  catalog.calls = 0;
  catalog.load = async () => [];
});

describe('supportsTools', () => {
  it('is false for Chrome’s local model', async () => {
    await expect(supportsTools(settings('local', 'openai'))).resolves.toBe(false);
  });

  it('is true for the big providers without asking anyone', async () => {
    await expect(supportsTools(settings('cloud', 'anthropic'))).resolves.toBe(true);
    expect(catalog.calls).toBe(0);
  });

  it('follows OpenRouter’s catalog for the chosen model', async () => {
    catalog.load = async () => [
      { id: 'with', tools: true },
      { id: 'without', tools: false },
    ];
    await expect(supportsTools(settings('cloud', 'openrouter', 'with'))).resolves.toBe(true);
    await expect(supportsTools(settings('cloud', 'openrouter', ' without '))).resolves.toBe(false);
    await expect(supportsTools(settings('cloud', 'openrouter', 'unlisted'))).resolves.toBe(true);
  });

  it('assumes support when the catalog cannot be loaded (the proxy falls back if wrong)', async () => {
    catalog.load = async () => {
      throw new Error('offline');
    };
    await expect(supportsTools(settings('cloud', 'openrouter'))).resolves.toBe(true);
  });
});
