// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const catalog = {
  data: [
    {
      id: 'z/paid',
      name: 'Zeta Paid',
      pricing: { prompt: '0.000002', completion: '0.00001' },
      architecture: { output_modalities: ['text'] },
      supported_parameters: ['tools'],
    },
    {
      id: 'a/free:free',
      name: 'Alpha Free',
      pricing: { prompt: '0', completion: '0' },
      architecture: { output_modalities: ['text'] },
      supported_parameters: [],
    },
    {
      id: 'z/paid:batch',
      name: 'Zeta Batch',
      pricing: { prompt: '0', completion: '0' },
      architecture: { output_modalities: ['text'] },
    },
    {
      id: 'g/lyria',
      name: 'Music',
      pricing: { prompt: '0', completion: '0' },
      architecture: { output_modalities: ['text', 'audio'] },
    },
    {
      id: 'r/router',
      name: 'Router',
      pricing: { prompt: '-1', completion: '-1' },
      architecture: { output_modalities: ['text'] },
    },
  ],
};

let mod: typeof import('./openrouter');
let store: typeof import('../store');

beforeEach(async () => {
  vi.resetModules();
  mod = await import('./openrouter');
  store = await import('../store');
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchOpenRouterModels', () => {
  it('keeps text-only models, drops batch duplicates and flags free and tool-capable ones', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(catalog))),
    );
    const models = await mod.fetchOpenRouterModels();
    expect(models.map((m) => m.id)).toEqual(['a/free:free', 'r/router', 'z/paid']);
    expect(models[0]).toMatchObject({ free: true, tools: false });
    expect(models[2]).toMatchObject({ free: false, tools: true, inputPerM: 2, outputPerM: 10 });
  });

  it('caches the catalog but retries after a failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValue(new Response(JSON.stringify(catalog)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(mod.fetchOpenRouterModels()).rejects.toThrow('503');
    await mod.fetchOpenRouterModels();
    await mod.fetchOpenRouterModels();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('price labels', () => {
  const paid = { id: 'p', name: 'P', free: false, tools: true, inputPerM: 2, outputPerM: 10 };

  it('formats prices and the cost of one interview in the app language', () => {
    store.useApp.getState().setSettings({ uiLang: 'es' });
    expect(mod.priceLabel(paid)).toBe('$2.00 / $10 por 1M tokens');
    expect(mod.interviewCostLabel(paid)).toBe('≈ $0.15 por entrevista');
    store.useApp.getState().setSettings({ uiLang: 'en' });
    expect(mod.priceLabel(paid)).toBe('$2.00 / $10 per 1M tokens');
  });

  it('labels free and variable-price models and gives no per-interview cost for them', () => {
    store.useApp.getState().setSettings({ uiLang: 'en' });
    const free = { ...paid, free: true, inputPerM: 0, outputPerM: 0 };
    const variable = { ...paid, inputPerM: -1e6, outputPerM: -1e6 };
    expect(mod.priceLabel(free)).toBe('Free');
    expect(mod.priceLabel(variable)).toBe('Variable price');
    expect(mod.interviewCostLabel(free)).toBeNull();
    expect(mod.interviewCostLabel(variable)).toBeNull();
    expect(mod.priceLabel({ ...paid, inputPerM: 0.001, outputPerM: 12 })).toBe('<$0.01 / $12 per 1M tokens');
  });
});
