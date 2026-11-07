# interview-bot

Simulador de entrevistas **behavioral** estilo Big Tech con IA (STAR, Leadership Principles, etc.). Privado: sin cuentas, sin base de datos y sin guardar nada en el servidor.

## Cómo funciona

- **Frontend estático** (Vite + React + TypeScript, Zustand). El perfil, los ajustes, las API keys y los resúmenes se guardan en el `localStorage` del navegador y, si lo activas, se sincronizan cifrados por Nostr.
- **Motor de IA intercambiable** (`src/engines/agent.ts` → `InterviewAgent`)
  - Capa 1: Chrome Built-in AI (Gemini Nano, Prompt API). Local, gratis y privado.
  - Capa 2: BYOK (OpenAI / Anthropic / Gemini) a través de `api/chat.ts`.
- **Voz intercambiable** (`src/engines/voice.ts` → `VoiceEngine`)
  - Capa 1: Web Speech API (`speechSynthesis`).
  - Capa 2: OpenAI TTS / ElevenLabs a través de `api/tts.ts`.
- **Dictado** opcional con `SpeechRecognition`. Ojo: en Chrome, ese audio lo procesan los servidores de Google.
- **Bilingüe (español / inglés):** el idioma de la app (selector ES | EN, `src/i18n.ts`) es independiente del idioma de la entrevista.
- **Contexto entre sesiones**: al terminar se genera una evaluación (score, fortalezas, puntos a mejorar), y las próximas entrevistas reciben los últimos 3 resúmenes en el prompt.

Los archivos de `api/` son Vercel Functions sin estado: no tienen `console.*` ni almacenamiento, y la key solo vive en memoria durante la petición. Están en un único archivo cada una a propósito, sin imports locales.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173 (sirve también /api, no hace falta Vercel CLI)
npm run build
```

## Deploy gratis en Vercel

1. Sube el repo a GitHub.
2. En [vercel.com/new](https://vercel.com/new) importa el repo. Vercel detecta Vite solo y no hace falta configurar variables de entorno.
3. Deploy. El plan Hobby (gratis) alcanza: el sitio es estático y las funciones solo se ejecutan cuando alguien usa una key propia.

O desde la terminal: `npx vercel`.

## Chrome AI local

Requiere Chrome de escritorio reciente con Gemini Nano. Si no aparece disponible, activa `chrome://flags/#prompt-api-for-gemini-nano` y reinicia. El modelo (~2 GB) se descarga la primera vez.

## Roadmap

- [x] Fase 1: MVP local, UI de preferencias por capas, proxy serverless BYOK
- [x] Fase 2: resumen al final de cada sesión, inyectado en las siguientes
- [x] Fase 3: sync con Nostr (NIP-07 / NIP-44)

## Sincronización (Nostr)

Opcional, desde **Ajustes → Sincronizar entre dispositivos** (`src/sync/`):

- **Identidad:** una extensión NIP-07 (Alby, nos2x…) o una clave creada/importada en el navegador (`nsec`).
- **Datos:** perfil, ajustes e historial se cifran con NIP-44 hacia tu propia clave pública y se publican como un único evento reemplazable NIP-78 (kind `30078`, `d=interview-bot/state`) en `relay.damus.io`, `nos.lol` y `relay.primal.net`. Los relays solo ven texto cifrado.
- **API keys:** no se sincronizan por defecto. Si lo activas, se cifran además con una frase de paso (PBKDF2 600k + AES-GCM, WebCrypto) antes del cifrado NIP-44, así que filtrar la `nsec` no basta para leerlas. La frase solo vive en memoria.
- **Conflictos:** gana la copia editada más recientemente; el historial se une por id entre dispositivos.
- `localStorage` sigue siendo la fuente local; los relays son el punto de encuentro entre dispositivos.
