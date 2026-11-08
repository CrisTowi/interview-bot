import { test as base, expect, type Page, type Route } from '@playwright/test';

/** Saved app state as the app persists it (see src/store.ts). Tests override what they need. */
export function savedState(
  overrides: { settings?: object; profile?: object; history?: object[]; nostr?: object } = {},
) {
  return {
    version: 3,
    state: {
      settings: {
        uiLang: 'es',
        llm: 'cloud',
        cloud: { provider: 'anthropic', apiKey: 'test-key', model: 'claude-haiku-5-5' },
        tts: 'off',
        premiumTts: { provider: 'openai', apiKey: '', voice: '' },
        ...overrides.settings,
      },
      profile: {
        role: 'Software Engineer',
        seniority: 'Senior',
        company: 'Amazon',
        focus: 'leadership',
        background: '',
        cvSummary: '',
        salary: '',
        lang: 'es',
        ...overrides.profile,
      },
      history: overrides.history ?? [],
      updatedAt: 1,
      historyClearedAt: 0,
      nostr: { mode: 'none', pubkey: '', syncKeys: false, ...overrides.nostr },
    },
  };
}

export const session = (overrides: object = {}) => ({
  id: 'past-1',
  date: '2026-11-05T10:00:00.000Z',
  role: 'Software Engineer',
  seniority: 'Senior',
  company: 'Amazon',
  focus: 'conflict',
  score: 4,
  verdict: 'Lean No Hire',
  headline: 'Your role gets lost in the "we".',
  summary: 'Relevant stories, little ownership.',
  strengths: ['Clear context'],
  improvements: ['Speak in first person'],
  nextStep: 'Rewrite one story with three "I" sentences.',
  ...overrides,
});

/** Seeds localStorage once per test (not on reloads, so persistence can be tested). */
export async function seed(page: Page, state: object = savedState()) {
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('interview-bot', value);
      sessionStorage.setItem('seeded', '1');
    }
  }, JSON.stringify(state));
}

export interface ChatRequest {
  system: string;
  messages: { role: string; content: string; name?: string; toolCalls?: unknown[] }[];
  tools?: { name: string }[];
}
type Reply = { text?: string; toolCalls?: { id: string; name: string; args: object }[]; toolsUnsupported?: boolean };

/** Answers /api/chat with a scripted "model" and records every request it received. */
export async function mockChat(page: Page, respond: (req: ChatRequest) => Reply | { status: number; error: string }) {
  const requests: ChatRequest[] = [];
  await page.route('**/api/chat', async (route: Route) => {
    const req = route.request().postDataJSON() as ChatRequest;
    requests.push(req);
    const reply = respond(req);
    if ('error' in reply) return route.fulfill({ status: reply.status, json: { error: reply.error } });
    await route.fulfill({ json: { text: '', toolCalls: [], ...reply } });
  });
  return requests;
}

export const isEvaluation = (req: ChatRequest) => req.system.startsWith('You are a member');
export const isCvSummary = (req: ChatRequest) => req.system.startsWith('You turn a CV');
export const evaluation = (overrides: object = {}) =>
  JSON.stringify({
    score: 4,
    verdict: 'Lean No Hire',
    headline: 'Buen contexto, poco "yo".',
    summary: 'Historias relevantes, poco ownership.',
    dimensions: { ownership: { score: 2, note: 'Habló del equipo.' } },
    strengths: ['Contexto claro'],
    improvements: ['Hablar en primera persona'],
    nextStep: 'Reescribe una historia en primera persona.',
    ...overrides,
  });

export const openRouterCatalog = {
  data: [
    {
      id: 'anthropic/claude-haiku-5.5',
      name: 'Anthropic: Claude Haiku 5.5',
      pricing: { prompt: '0.0000001', completion: '0.0000005' },
      architecture: { output_modalities: ['text'] },
      supported_parameters: ['tools'],
    },
    {
      id: 'acme/no-tools',
      name: 'Acme: No Tools',
      pricing: { prompt: '0', completion: '0' },
      architecture: { output_modalities: ['text'] },
      supported_parameters: [],
    },
  ],
};

/** Every test runs hermetically: no fonts, no OpenRouter, no relays from the real network. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    await page.route('https://openrouter.ai/api/v1/models', (route) => route.fulfill({ json: openRouterCatalog }));
    await use(page);
  },
});

export { expect };
