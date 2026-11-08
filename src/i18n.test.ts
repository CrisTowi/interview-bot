// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { capitalize, t } from './i18n';
import { useApp } from './store';

/** Every leaf path of a dictionary, with functions called with sample arguments. */
function leaves(value: unknown, path = ''): [string, unknown][] {
  if (typeof value === 'function') return [[path, (value as (...a: unknown[]) => unknown)('X', 'Y', 'Z', 'W')]];
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [[path, value]];
}

function dictFor(lang: 'es' | 'en') {
  useApp.getState().setSettings({ uiLang: lang });
  return t();
}

describe('dictionaries', () => {
  it('have exactly the same keys in Spanish and English', () => {
    const es = leaves(dictFor('es')).map(([p]) => p);
    const en = leaves(dictFor('en')).map(([p]) => p);
    expect(en).toEqual(es);
  });

  it('have no empty strings, and their functions return text', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const [path, value] of leaves(dictFor(lang))) {
        expect(typeof value, `${lang}:${path}`).toBe('string');
        expect((value as string).trim(), `${lang}:${path}`).not.toBe('');
      }
    }
  });

  it('follow the app language setting', () => {
    expect(dictFor('es').home.start).toBe('Empezar entrevista');
    expect(dictFor('en').home.start).toBe('Start interview');
  });
});

it('capitalize uppercases only the first letter', () => {
  expect(capitalize('conflictos')).toBe('Conflictos');
  expect(capitalize('')).toBe('');
});
