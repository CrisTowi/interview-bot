import type { Lang, Settings } from '../types';
import type { Cast } from './casting';

/** Common interface so the interview loop doesn't care which TTS layer is behind it. */
export interface VoiceEngine {
  /** Resolves when speech finishes or is stopped. */
  speak(text: string): Promise<void>;
  stop(): void;
}

const LOCALES: Record<Lang, string> = { es: 'es-ES', en: 'en-US' };

/** Code blocks and markdown sound terrible when read aloud. */
function toSpeakable(text: string, lang: Lang): string {
  const codeNote = lang === 'es' ? ' (ver el código en pantalla) ' : ' (see the code on screen) ';
  return text
    .replace(/```[\s\S]*?```/g, codeNote)
    .replace(/[`*_#>]/g, '')
    .trim();
}

/** Layer 1: the browser's built-in Web Speech API. */
class NativeVoice implements VoiceEngine {
  private generation = 0;

  constructor(
    private lang: Lang,
    /** Chosen by the casting so it matches the interviewer's gender. */
    private voice?: SpeechSynthesisVoice,
  ) {}

  speak(text: string): Promise<void> {
    this.stop();
    const generation = this.generation;
    // Chrome cuts off long utterances, so speak sentence by sentence.
    const chunks = toSpeakable(text, this.lang).match(/[^.!?¿¡]+[.!?]*|[¿¡][^.!?]+[.!?]*/g) ?? [];
    const voice = this.voice;

    return new Promise((resolve) => {
      let i = 0;
      const next = () => {
        if (generation !== this.generation || i >= chunks.length) return resolve();
        const utterance = new SpeechSynthesisUtterance(chunks[i++].trim());
        utterance.lang = voice?.lang ?? LOCALES[this.lang];
        if (voice) utterance.voice = voice;
        utterance.rate = 1.05;
        utterance.onend = next;
        utterance.onerror = next;
        speechSynthesis.speak(utterance);
      };
      next();
    });
  }

  stop() {
    this.generation++;
    speechSynthesis.cancel();
  }
}

/** Layer 2: OpenAI TTS / ElevenLabs with the user's key, through the stateless /api/tts proxy. */
class PremiumVoice implements VoiceEngine {
  private generation = 0;
  private audio?: HTMLAudioElement;
  private finish?: () => void;

  constructor(
    private config: Settings['premiumTts'],
    private lang: Lang,
    /** Voice id matching the interviewer (empty setting = automatic). */
    private voiceId: string,
  ) {}

  async speak(text: string): Promise<void> {
    this.stop();
    const generation = this.generation;
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: this.config.provider,
        apiKey: this.config.apiKey.trim(),
        voice: this.voiceId,
        text: toSpeakable(text, this.lang),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Error de voz ${res.status}`);
    }
    const url = URL.createObjectURL(await res.blob());
    if (generation !== this.generation) return URL.revokeObjectURL(url);

    const audio = new Audio(url);
    this.audio = audio;
    await new Promise<void>((resolve) => {
      this.finish = resolve;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
  }

  stop() {
    this.generation++;
    this.audio?.pause();
    this.finish?.();
  }
}

class SilentVoice implements VoiceEngine {
  async speak() {}
  stop() {}
}

export function createVoice(settings: Settings, lang: Lang, cast: Cast): VoiceEngine {
  if (settings.tts === 'premium') {
    return new PremiumVoice(settings.premiumTts, lang, cast.premiumVoice ?? settings.premiumTts.voice.trim());
  }
  if (settings.tts === 'native' && 'speechSynthesis' in window) return new NativeVoice(lang, cast.nativeVoice);
  return new SilentVoice();
}
