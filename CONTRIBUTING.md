# Contributing to Interview Bot

Thanks for helping. This guide gets you from a fresh clone to a merged pull request. For how the system is built, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first: it's short.

## Ways to help

- **Report a bug or suggest an improvement** with the issue templates.
- **Pick an issue** labeled `good first issue` or `help wanted`, and comment that you're on it.
- **Improve a translation.** Every UI string lives in `src/i18n.ts`.
- **Test with assistive technology** (VoiceOver, NVDA, TalkBack, high-contrast mode) and report what's hard to use.

## Setup

Requirements: Node.js 22+ and a recent desktop Chrome (the e2e tests reuse it locally).

```bash
npm install
npm run dev          # http://localhost:5173, also serves the /api proxy
```

You don't need any API key to develop or run the tests: the unit and e2e suites mock every AI provider. To try the app by hand, use Chrome's built-in AI or your own key (see the README).

## Scripts

| Command                           | What it does                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`                     | Vite dev server with the `/api` functions                                                        |
| `npm run check`                   | Everything CI's quality job runs: lint, format check, typecheck, unit tests with coverage, build |
| `npm test` / `npm run test:watch` | Unit tests (Vitest), once or in watch mode                                                       |
| `npm run test:coverage`           | Unit tests plus a coverage report in `coverage/` (fails under the thresholds)                    |
| `npm run test:e2e`                | End-to-end tests (Playwright) against the dev server                                             |
| `npm run lint`                    | ESLint with zero warnings allowed                                                                |
| `npm run format`                  | Format everything with Prettier                                                                  |

Run `npm run check` and `npm run test:e2e` before opening a pull request. CI runs both.

## Tests

The rule of thumb: **logic gets unit tests, user flows get e2e tests.**

**Unit tests (Vitest)** sit next to the code they test (`src/**/*.test.ts`), except the proxy's, which live in `test/api/` because every file in `api/` is deployed as a serverless function. They cover prompts and evaluation parsing, the agent loop and tools, voice casting, the OpenRouter catalog, the key vault, the store's sync merge and migrations, Nostr sync (two devices against an in-memory relay) and the proxy's provider translation. Coverage thresholds live in `vitest.config.ts`: raise them as coverage grows, never lower them to make a PR pass.

Mock at the edge. Stub `fetch` with `vi.stubGlobal` instead of mocking our own modules, so the code under test runs for real. One trap: a `vi.fn()` that returns a rejected promise is reported as an unhandled rejection even when the code catches it, so use a plain stub (see `src/engines/agent.test.ts`).

**End-to-end tests (Playwright)** live in `e2e/` and run the real app in Chrome. Each test:

- seeds the saved state it needs with `seed(page, savedState({...}))`;
- scripts the AI with `mockChat(page, (request) => reply)`, a fake model that can also call tools;
- runs hermetically, with fonts, the OpenRouter catalog and relays mocked or blocked in `e2e/fixtures.ts`.

Find elements by role and accessible name (`getByRole('button', { name: 'Ajustes' })`), not CSS classes: if a test can't find something that way, a screen reader probably can't either. `e2e/a11y.spec.ts` runs axe (WCAG 2.2 AA) on the main screens in light and dark themes, and `e2e/mobile.spec.ts` runs at phone size.

Run a single file with `npx playwright test e2e/interview.spec.ts`, or debug with `npx playwright test --ui`.

## Coding standards

ESLint, Prettier and TypeScript enforce the mechanical parts. These are the ones they can't:

- **Privacy is a feature.** The proxy (`api/`) must never log, store or forward anything beyond the provider call: no `console.*`, no analytics, no storage. Nothing user-specific goes to a server we run. Keep each `api/*.ts` self-contained (no local imports) so Vercel bundles it reliably.
- **Every UI string goes through `src/i18n.ts`**, in Spanish and English. The English dictionary is typed against the Spanish one, so a missing key fails the build. Text the model reads (prompts) stays in English.
- **Accessibility is not optional.** Use real elements (`<button>`, `<label>`), give every control an accessible name, keep focus visible and managed (menus take focus and return it on Escape), mark content in the interview language with `lang`, and keep contrast at 4.5:1. If you add a screen or dialog, add it to `e2e/a11y.spec.ts`.
- **Degrade, don't break.** The AI engine and voice sit behind interfaces (`InterviewAgent`, `VoiceEngine`). New capabilities need a fallback when a layer doesn't support them, and the user should be able to see which mode they're in (as with agent vs. basic mode).
- **Keep the UI quiet.** Home is the sentence and the start button. New options go in the Profile or Settings menus, behind a one-line summary.
- **Persisted state changes need a migration.** If you change the shape of the store, make `merge` in `src/store.ts` handle older saved data and add a test in `src/store.test.ts`. Users must never lose their history or keys on an update.
- **Comments explain why, not what.** Match the density of the surrounding code.
- **Dependencies** need a reason. Prefer the platform (WebCrypto, Web Speech, `fetch`) over a library.

## Common changes

**Add an AI provider**

1. Add it to `CloudProvider` in `src/types.ts` and to `DEFAULT_MODELS` in `src/store.ts`.
2. In `api/chat.ts`, add a `call<Provider>` that translates the neutral message format (including `toolCalls` and `tool` results) to the provider's, and register it in `PROVIDERS` and `validate`.
3. Add it to `ENGINES`, `PROVIDER_LABELS` and `KEY_LINKS` in `src/components/SettingsMenu.tsx`.
4. Cover the translation in `test/api/chat.test.ts`.

**Add a UI language**

1. Add the code to `Lang` in `src/types.ts`.
2. Add a dictionary in `src/i18n.ts` typed as `Dict` and register it in `DICTS`. TypeScript lists every missing string.
3. Add the language to `LangSwitch.tsx`, the `LANGS` list in `SettingsMenu.tsx`, `LANGUAGE` in `src/lib/prompts.ts` and `src/lib/cv.ts`, and interviewer names in `src/engines/casting.ts`.

**Add an interviewer tool**

Define it in `src/lib/interviewerTools.ts` (name, description, JSON-schema parameters, `run`), describe when to use it in the tools section of `buildSystemPrompt`, and test both the tool (`interviewerTools.test.ts`) and the flow (`e2e/interview.spec.ts`). Keep parameter schemas to the subset every provider accepts: plain `type`, `properties`, `enum`, `required`.

## Pull requests

1. Branch from `main` (`feat/…`, `fix/…`, `docs/…`).
2. Keep each PR to one change, with tests. Write commit messages in the imperative, explaining why (`Show OpenRouter's upstream error instead of a generic one`).
3. Fill in the PR template. CI runs the quality and e2e jobs, and Vercel posts a preview deployment you can click through.
4. A maintainer reviews. Merging requires green CI. Every merge to `main` deploys to production.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind; assume good faith.
