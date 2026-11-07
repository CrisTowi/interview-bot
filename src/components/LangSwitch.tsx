import { useEffect } from 'react';
import { useT } from '../i18n';
import { useApp } from '../store';
import type { Lang } from '../types';

const LANGS: { value: Lang; label: string; name: string }[] = [
  { value: 'es', label: 'ES', name: 'Español' },
  { value: 'en', label: 'EN', name: 'English' },
];

/** ES | EN toggle for the app's language. The interview language follows it unless it was set apart. */
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

  return (
    <div className="lang-switch" role="group" aria-label={t.langSwitch}>
      {LANGS.map((l) => (
        <button
          key={l.value}
          type="button"
          lang={l.value}
          aria-label={l.name}
          aria-pressed={uiLang === l.value}
          className={uiLang === l.value ? 'active' : ''}
          onClick={() => choose(l.value)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
