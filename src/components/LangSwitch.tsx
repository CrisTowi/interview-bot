import { useEffect } from 'react';
import { useT } from '../i18n';
import { useApp } from '../store';
import type { Lang } from '../types';

const LANGS: { value: Lang; label: string; name: string }[] = [
  { value: 'es', label: 'ES', name: 'Español' },
  { value: 'en', label: 'EN', name: 'English' },
];

/** ES | EN toggle for the app's language (the whole pill is one button). The interview language follows it unless it was set apart. */
export function LangSwitch() {
  const uiLang = useApp((s) => s.settings.uiLang);
  const interviewLang = useApp((s) => s.profile.lang);
  const { setSettings, setProfile } = useApp();
  const t = useT();

  useEffect(() => {
    document.documentElement.lang = uiLang;
  }, [uiLang]);

  function choose(next: Lang) {
    if (next === uiLang) return;
    // Someone who practices in a different language than the app's keeps that choice.
    if (interviewLang === uiLang) setProfile({ lang: next });
    setSettings({ uiLang: next });
  }

  const other = LANGS.find((l) => l.value !== uiLang)!;

  // One button: clicking anywhere on the pill switches to the other language.
  return (
    <button type="button" className="lang-switch" title={t.langSwitch} onClick={() => choose(other.value)}>
      {/* Name read aloud: "App language: ES EN (Español)", so it contains what's on screen (WCAG 2.5.3). */}
      <span className="sr-only">{t.langSwitch}: </span>
      {LANGS.map((l) => (
        <span key={l.value} lang={l.value} className={uiLang === l.value ? 'active' : ''}>
          {l.label}
        </span>
      ))}
      <span className="sr-only"> ({LANGS.find((l) => l.value === uiLang)!.name})</span>
    </button>
  );
}
