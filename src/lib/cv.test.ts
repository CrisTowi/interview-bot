// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useApp } from '../store';
import { buildCvSummaryPrompt, extractText } from './cv';

const file = (text: string, name = 'cv.txt') => new File([text], name, { type: 'text/plain' });

describe('extractText', () => {
  it('reads text files and tidies whitespace', async () => {
    const text = await extractText(
      file(`Senior   Engineer\t at PagoFácil\n\n\n\n${'Led the payments migration. '.repeat(4)}`),
    );
    expect(text.startsWith('Senior Engineer at PagoFácil\n\nLed the payments')).toBe(true);
  });

  it('trims very long CVs so small models can handle them', async () => {
    expect(await extractText(file('a'.repeat(20_000)))).toHaveLength(15_000);
  });

  it('explains what to do when a file has no usable text (e.g. a scanned PDF)', async () => {
    useApp.getState().setSettings({ uiLang: 'en' });
    await expect(extractText(file('too short'))).rejects.toThrow('paste the text instead');
  });
});

describe('buildCvSummaryPrompt', () => {
  it('asks for labeled lines in the interview language and forbids invented facts and contact details', () => {
    const es = buildCvSummaryPrompt('es');
    expect(es).toContain('Write in Spanish');
    expect(es).toContain('Temas para preguntar:');
    expect(es).toContain('never invent numbers');
    expect(es).toContain('Leave out personal contact details');
    expect(buildCvSummaryPrompt('en')).toContain('Topics to ask about:');
  });
});
