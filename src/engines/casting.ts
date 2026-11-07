import type { Lang, Settings } from '../types';

/**
 * Picks the interviewer (name + gender) and the voice together, so a "Laura" never speaks with a man's
 * voice. Voice first: we look at what voices exist, then pick a name of the same gender.
 */

export type Gender = 'female' | 'male';

export interface Cast {
  name: string;
  /** Null when the voice's gender can't be told (custom voice IDs, unknown system voices, no voice). */
  gender: Gender | null;
  /** Browser voice to use (native TTS only). */
  nativeVoice?: SpeechSynthesisVoice;
  /** Voice id to request (premium TTS only). */
  premiumVoice?: string;
}

const NAMES: Record<Lang, Record<Gender, string[]>> = {
  es: { female: ['Laura', 'Sofía', 'Valeria', 'Mariana'], male: ['Daniel', 'Andrés', 'Martín', 'Diego'] },
  en: { female: ['Sarah', 'Emily', 'Priya', 'Rachel'], male: ['David', 'Michael', 'James', 'Ethan'] },
};

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

// --- Premium voices -----------------------------------------------------------------------------------

/** OpenAI TTS voices whose gender is clear; "alloy" is left out on purpose (it's androgynous). */
const OPENAI_VOICES: Record<string, Gender> = {
  nova: 'female',
  shimmer: 'female',
  coral: 'female',
  sage: 'female',
  onyx: 'male',
  echo: 'male',
  ash: 'male',
  ballad: 'male',
  verse: 'male',
  fable: 'male',
};
const ELEVENLABS_VOICES: Record<string, Gender> = {
  '21m00Tcm4TlvDQ8ikWAM': 'female', // Rachel
  pNInz6obpgDQGcFmaJgB: 'male', // Adam
};
const AUTO_VOICES: Record<Settings['premiumTts']['provider'], Record<Gender, string>> = {
  openai: { female: 'nova', male: 'onyx' },
  elevenlabs: { female: '21m00Tcm4TlvDQ8ikWAM', male: 'pNInz6obpgDQGcFmaJgB' },
};

function castPremium({ provider, voice }: Settings['premiumTts'], lang: Lang): Cast {
  const chosen = voice.trim();
  if (!chosen) {
    // Automatic: pick the interviewer, then the matching voice.
    const gender = pick<Gender>(['female', 'male']);
    return { name: pick(NAMES[lang][gender]), gender, premiumVoice: AUTO_VOICES[provider][gender] };
  }
  // The user chose a voice: respect it, and match the name to it when its gender is known.
  const gender = (provider === 'openai' ? OPENAI_VOICES[chosen.toLowerCase()] : ELEVENLABS_VOICES[chosen]) ?? null;
  return {
    name: pick(gender ? NAMES[lang][gender] : [...NAMES[lang].female, ...NAMES[lang].male]),
    gender,
    premiumVoice: chosen,
  };
}

// --- Browser voices -----------------------------------------------------------------------------------

/*
 * The Web Speech API doesn't expose a voice's gender, so we infer it from its name. These cover the
 * voices shipped by macOS/iOS, Windows/Edge (incl. "Online (Natural)") and Chrome in Spanish and English.
 */
const FEMALE = new Set(
  'samantha victoria karen moira tessa fiona veena serena allison ava susan zoe kate nicky joelle catherine isabella paulina monica marisol angelica francisca soledad esperanza ximena sabina helena laura elvira dalia elena paloma lupe penelope lucia conchita mia zira hazel heera jenny aria michelle sonia libby natasha clara emma salome renata camila valentina catalina beatriz larissa elsa nuria irene sara marta flo grandma sandy shelley tara kathy'.split(
    ' ',
  ),
);
const MALE = new Set(
  'alex daniel fred tom aaron arthur oliver gordon rishi ralph albert bruce junior jorge juan diego carlos pablo raul alvaro enrique miguel jacobo tomas gerardo rodrigo andres david mark guy ryan george eric roger christopher steffan brian liam william eddy reed grandpa rocko jaime cristian federico aman'.split(
    ' ',
  ),
);
/** macOS novelty voices: technically available, but nobody wants to be interviewed by them. */
const NOVELTY = new Set(
  'albert bahh bells boing bubbles cellos eddy flo fred grandma grandpa jester junior kathy organ ralph reed rocko sandy shelley superstar trinoids whisper wobble zarvox'.split(
    ' ',
  ),
);

const words = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean);

export function voiceGender(voice: SpeechSynthesisVoice): Gender | null {
  const w = words(voice.name);
  if (w.includes('female')) return 'female';
  if (w.includes('male')) return 'male';
  if (w.some((x) => FEMALE.has(x))) return 'female';
  if (w.some((x) => MALE.has(x))) return 'male';
  // Chrome's own voices ("Google español", "Google US English") are female unless labeled otherwise.
  if (w[0] === 'google') return 'female';
  return null;
}

function quality(voice: SpeechSynthesisVoice, lang: Lang): number {
  const w = words(voice.name);
  let score = 0;
  if (/natural|neural|premium|enhanced/i.test(voice.name)) score += 4;
  if (w[0] === 'google') score += 2;
  if (lang === 'es' && /^es-(mx|us|419)/i.test(voice.lang)) score += 1; // closer to a Latin American interviewer
  if (lang === 'en' && /^en-us/i.test(voice.lang)) score += 1;
  if (w.some((x) => NOVELTY.has(x))) score -= 10;
  return score;
}

/** Voices load asynchronously in most browsers; wait briefly for them. */
function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, timeoutMs);
  });
}

async function castNative(lang: Lang): Promise<Cast> {
  const voices = (await loadVoices()).filter((v) => v.lang.toLowerCase().startsWith(lang));
  const best = (list: SpeechSynthesisVoice[]) => [...list].sort((a, b) => quality(b, lang) - quality(a, lang))[0];
  const byGender: Record<Gender, SpeechSynthesisVoice[]> = { female: [], male: [] };
  for (const v of voices) {
    const g = voiceGender(v);
    if (g && quality(v, lang) > -10) byGender[g].push(v);
  }
  const available = (['female', 'male'] as const).filter((g) => byGender[g].length);
  if (!available.length) {
    // No voice we can recognize: any name, the best voice we have.
    return { name: pick([...NAMES[lang].female, ...NAMES[lang].male]), gender: null, nativeVoice: best(voices) };
  }
  const gender = pick([...available]);
  return { name: pick(NAMES[lang][gender]), gender, nativeVoice: best(byGender[gender]) };
}

export async function castInterviewer(settings: Settings, lang: Lang): Promise<Cast> {
  if (settings.tts === 'premium') return castPremium(settings.premiumTts, lang);
  if (settings.tts === 'native' && typeof speechSynthesis !== 'undefined') return castNative(lang);
  const gender = pick<Gender>(['female', 'male']);
  return { name: pick(NAMES[lang][gender]), gender };
}
