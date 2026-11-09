# Architecture

Interview Bot is a static single-page app plus a stateless proxy. All user state lives in the browser; the only server code forwards AI requests that browsers can't make directly. This page is the map; the code comments carry the details.

```
┌──────────────────────────── Browser ─────────────────────────────┐
│  Screens: Home ─▶ Interview (video call) ─▶ Summary              │
│      │               │            │                              │
│      │        InterviewAgent   VoiceEngine   SpeechInput         │
│      │        ├ LocalAgent ──▶ Chrome Prompt API (on device)     │
│      │        └ CloudAgent ─┐  ├ NativeVoice ─▶ Web Speech API   │
│      │          agent loop  │  └ PremiumVoice ─┐                 │
│  Zustand store ◀──▶ localStorage               │                 │
│      │  (optional) nostrSync ─▶ NIP-44 event ──┼──▶ Nostr relays │
└─────────────────────────────┼──────────────────┼─────────────────┘
                              ▼                  ▼
                 /api/chat (stateless)    /api/tts (stateless)
                              │                  │
     OpenAI · Anthropic · Gemini · OpenRouter    OpenAI TTS · ElevenLabs
```

## Principles

- **Zero-knowledge host.** Vercel serves static files and two functions that never log or store anything.
- **Bring your own key or compute.** Chrome's built-in model or the user's own API key; never ours.
- **Local-first.** `localStorage` is the source of truth; Nostr sync is opt-in and end-to-end encrypted.
- **Swappable layers that degrade.** AI and voice sit behind interfaces chosen at runtime. When a higher layer is missing (no tools, no premium voice), the app falls back and tells the user.

## Code map

| Path              | Responsibility                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`     | Switches between the three screens (no router) and moves focus to each new screen                                                                                                                   |
| `src/screens/`    | `Home` (setup sentence, history), `Interview` (call, captions, controls, agent wiring), `Summary` (evaluation, empty and error states)                                                              |
| `src/components/` | `Dropdown` (base for Profile/Settings), `SettingsMenu` (overview + side panel), `ProfileCard`, `SyncSection`, `InlinePicker`, `ModelPicker`, `LangSwitch`                                           |
| `src/store.ts`    | The single Zustand store, persisted to `localStorage`, with `migrate`/`merge` for older saved data and `applyRemote` for sync                                                                       |
| `src/engines/`    | `agent.ts` (interface + `supportsTools`), `cloudAgent.ts` (agent loop over `/api/chat`), `localAgent.ts` (Prompt API), `voice.ts`, `casting.ts` (interviewer name ↔ voice gender), `speechInput.ts` |
| `src/lib/`        | Pure logic: `prompts.ts` (system/evaluation prompts, tolerant JSON parsing), `interviewerTools.ts`, `cv.ts` (pdf.js text extraction), `openrouter.ts` (catalog and prices)                          |
| `src/sync/`       | `signer.ts` (NIP-07 extension or local key), `vault.ts` (passphrase-sealed API keys), `nostrSync.ts` (pull, merge, publish)                                                                         |
| `src/i18n.ts`     | Typed UI dictionaries (es, en)                                                                                                                                                                      |
| `api/`            | `chat.ts` and `tts.ts`, Vercel functions; `vite.config.ts` serves them in dev                                                                                                                       |

## How an interview runs

1. **Setup.** `Home` edits `profile` in the store (level, role, company style, focus, length, interview language, CV briefing).
2. **Casting.** `castInterviewer` looks at the available voices first and picks a name of the same gender (premium voices are chosen from the name instead). In parallel, `supportsTools` decides between agent and basic mode.
3. **Prompt.** `buildSystemPrompt` combines company style, focus, CV briefing, level, conversation rules, the planned length (`DURATIONS`: minutes and number of main questions), the tools section (agent mode only) and the last three evaluations. It's frozen for the call.
4. **Turns.** Each answer goes to `InterviewAgent.reply`. In agent mode, `CloudAgent` loops: send the conversation and tool definitions, run any tool calls (`take_note`, `review_notes`, `end_interview`), send the results back, and stop when the model answers without calls, a tool ends the turn, or after 6 steps. The reply is spoken by the `VoiceEngine` and shown as captions. The call shows the clock against the planned length; at 75% and 100% of it, `timeCheck` attaches a note to the candidate's answer (in the message's `context`, never shown or evaluated) so the interviewer wraps up on time, in both modes.
5. **Hang-up.** The user ends the call, or the interviewer calls `end_interview` and the app leaves once the goodbye has been spoken.
6. **Evaluation.** `buildSummaryPrompt` sends the transcript plus the interviewer's notes. `parseEvaluation` reads the JSON leniently (verdict, score, six 1–5 criteria, strengths, gaps, next step), and the result is saved to `history`.

## The proxy

`api/chat.ts` accepts one neutral format — `user` messages, `assistant` messages with optional `toolCalls`, and `tool` results — and translates it to each provider: Chat Completions (OpenAI, OpenRouter), `tool_use`/`tool_result` blocks (Anthropic) or `functionCall`/`functionResponse` parts (Gemini, echoing the original part so thought signatures survive). It always answers `{ text, toolCalls }`.

Two fallbacks: a model that rejects tools is retried without them and the response says `toolsUnsupported: true`, which switches the call to basic mode; and on OpenRouter, a 400 caused by a system prompt is retried with the instructions folded into the first message. Errors keep the provider's real cause (OpenRouter hides it in `error.metadata.raw`).

## State, persistence and sync

The store holds `profile`, `settings` (app language, engine, voice), `history` (last 50 evaluations), `nostr` (identity and key vault) and two timestamps used for sync: `updatedAt` and `historyClearedAt`. The persisted `version` comes with a `migrate` hook that keeps older saved state (without it, zustand discards it), and `merge` fills in new fields.

Sync is optional. The whole state is NIP-44-encrypted to the user's own public key and published as one replaceable NIP-78 event (kind `30078`, `d=interview-bot/state`) to three relays. On load, the remote copy is merged first and only then are local edits published, debounced by 2 s. The most recently edited copy wins, history is unioned by id (minus anything before `historyClearedAt`), and on first connect the remote copy wins. API keys only travel inside a vault sealed with a separate password (PBKDF2 + AES-GCM). A local, never-synced hash of the sealed keys tells "same browser", "new device" and "keys changed here" apart, so the app asks for that password only when it must.

## Internationalization and accessibility

`settings.uiLang` drives the interface; `profile.lang` drives what the interviewer says and the evaluation's language. Content produced in the interview language is marked with `lang` so screen readers pronounce it correctly. The app targets WCAG 2.2 AA: one `h1` per screen, focus moved on navigation, live regions for captions and errors, keyboard-operable menus and pickers, rem-based type, 4.5:1 contrast, forced-colors support and 24 px touch targets. `e2e/a11y.spec.ts` keeps axe at zero violations.

## Quality gates

| Gate                                     | Tool                         | Where it runs          |
| ---------------------------------------- | ---------------------------- | ---------------------- |
| Lint (TypeScript, React hooks, JSX a11y) | ESLint, zero warnings        | `npm run check`, CI    |
| Formatting                               | Prettier                     | `npm run check`, CI    |
| Types                                    | TypeScript (strict)          | `npm run check`, CI    |
| Logic                                    | Vitest + coverage thresholds | `npm run check`, CI    |
| User flows, accessibility, mobile        | Playwright + axe             | `npm run test:e2e`, CI |

Every pull request gets both CI jobs and a Vercel preview; merges to `main` deploy to production.
