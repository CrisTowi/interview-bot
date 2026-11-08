import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../types';
import { castInterviewer, voiceGender } from './casting';

const FEMALE_NAMES = ['Laura', 'Sofía', 'Valeria', 'Mariana', 'Sarah', 'Emily', 'Priya', 'Rachel'];
const genderOf = (name: string) => (FEMALE_NAMES.includes(name) ? 'female' : 'male');
const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;

function stubVoices(voices: SpeechSynthesisVoice[]) {
  vi.stubGlobal('speechSynthesis', { getVoices: () => voices, addEventListener: vi.fn() });
}

afterEach(() => vi.unstubAllGlobals());

describe('voiceGender', () => {
  it.each([
    ['Mónica', 'female'],
    ['Paulina (Spanish (Mexico))', 'female'],
    ['Microsoft Sabina - Spanish (Mexico)', 'female'],
    ['Samantha', 'female'],
    ['Jorge', 'male'],
    ['Daniel', 'male'],
    ['Microsoft Pablo Online (Natural)', 'male'],
    ['Google UK English Male', 'male'],
    ['Google UK English Female', 'female'],
    ['Google español', 'female'],
    ['Zarvox', null],
  ])('%s → %s', (name, expected) => {
    expect(voiceGender(voice(name, 'es-MX'))).toBe(expected);
  });
});

describe('castInterviewer · browser voice', () => {
  const native = { tts: 'native' } as Settings;

  it('only picks names whose gender has a voice', async () => {
    stubVoices([voice('Mónica', 'es-ES'), voice('Paulina', 'es-MX'), voice('Samantha', 'en-US')]);
    for (let i = 0; i < 25; i++) {
      const cast = await castInterviewer(native, 'es');
      expect(cast.gender).toBe('female');
      expect(genderOf(cast.name)).toBe('female');
      expect(voiceGender(cast.nativeVoice!)).toBe('female');
    }
  });

  it('never matches a name with a voice of the other gender when both exist', async () => {
    stubVoices([voice('Google US English', 'en-US'), voice('Google UK English Male', 'en-GB')]);
    for (let i = 0; i < 40; i++) {
      const cast = await castInterviewer(native, 'en');
      expect(voiceGender(cast.nativeVoice!)).toBe(genderOf(cast.name));
    }
  });

  it('never casts a novelty voice, even a regional one, and prefers higher quality voices', async () => {
    // Regression: a regional novelty voice (es-MX bonus) used to slip past a score threshold.
    stubVoices([
      voice('Rocko (Spanish (Mexico))', 'es-MX'),
      voice('Paulina', 'es-MX'),
      voice('Paulina (Enhanced)', 'es-MX'),
    ]);
    for (let i = 0; i < 30; i++) {
      const cast = await castInterviewer(native, 'es');
      expect(cast.gender).toBe('female');
      expect(cast.nativeVoice?.name).toBe('Paulina (Enhanced)');
    }
  });

  it('avoids novelty voices even when no voice gender can be recognized', async () => {
    stubVoices([voice('Zarvox', 'es-ES'), voice('Mystery Voice', 'es-ES')]);
    expect((await castInterviewer(native, 'es')).nativeVoice?.name).toBe('Mystery Voice');
  });

  it('still casts someone when no voice can be recognized', async () => {
    stubVoices([voice('Mystery Voice', 'es-ES')]);
    const cast = await castInterviewer(native, 'es');
    expect(cast.gender).toBeNull();
    expect(cast.nativeVoice?.name).toBe('Mystery Voice');
  });
});

describe('castInterviewer · premium voice', () => {
  const premium = (provider: 'openai' | 'elevenlabs', voiceId: string) =>
    ({ tts: 'premium', premiumTts: { provider, apiKey: 'k', voice: voiceId } }) as Settings;

  it('chooses the voice from the interviewer when set to automatic', async () => {
    for (let i = 0; i < 30; i++) {
      const cast = await castInterviewer(premium('openai', ''), 'es');
      expect(cast.premiumVoice).toBe(genderOf(cast.name) === 'female' ? 'nova' : 'onyx');
    }
  });

  it('keeps a voice the user chose and matches the name to it', async () => {
    const cast = await castInterviewer(premium('openai', 'Onyx'), 'en');
    expect(cast).toMatchObject({ gender: 'male', premiumVoice: 'Onyx' });
    expect(genderOf(cast.name)).toBe('male');
  });

  it('does not guess the gender of a custom ElevenLabs voice', async () => {
    const cast = await castInterviewer(premium('elevenlabs', 'custom-voice-id'), 'es');
    expect(cast).toMatchObject({ gender: null, premiumVoice: 'custom-voice-id' });
  });
});

it('casts an interviewer even without voice', async () => {
  const cast = await castInterviewer({ tts: 'off' } as Settings, 'en');
  expect(cast.name).toBeTruthy();
  expect(cast.nativeVoice).toBeUndefined();
});
