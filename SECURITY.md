# Security policy

Interview Bot handles people's API keys and their interview history, so security reports get priority.

## Reporting a vulnerability

Please report it privately through [GitHub's security advisories](https://github.com/CrisTowi/interview-bot/security/advisories/new), not in a public issue. Include what an attacker could do, how to reproduce it, and the affected files or URL. You'll get an answer within a few days, and credit in the fix if you'd like it.

Never include real API keys, Nostr private keys (`nsec`) or vault passwords in a report.

## What we protect

- **The proxy (`api/`) is stateless.** It never logs, stores or forwards API keys, prompts or conversations beyond the single provider call. Any change that adds logging, storage or a third-party call there is a vulnerability.
- **Data stays in the browser.** Profile, settings, history and API keys live in `localStorage`. Nothing user-specific is stored on a server we run.
- **Sync is end-to-end encrypted.** Synced state is encrypted with NIP-44 to the user's own key before it leaves the browser. API keys sync only inside a vault sealed with a separate password (PBKDF2, 600,000 iterations, + AES-GCM), which never leaves memory.

## Known limitations (by design, not vulnerabilities)

- Anyone with access to the browser profile can read `localStorage`, including API keys and a locally created Nostr key. Using a NIP-07 extension keeps the Nostr key out of the page.
- Requests to cloud models go to the provider the user picked, under that provider's privacy terms. Chrome's built-in model stays on device.
- Dictation uses the browser's `SpeechRecognition`, which in Chrome sends audio to Google.
- Synced events stay on public relays; they are ciphertext, but a leaked `nsec` would decrypt them (the API keys would still need the vault password).
