import { useState } from 'react';
import { InlinePicker, type PickerOption } from '../components/InlinePicker';
import { ScoreBadge, useEngineReady } from '../components/ui';
import { capitalize, useT } from '../i18n';
import { APP_NAME, useDocumentTitle } from '../lib/title';
import { useApp } from '../store';
import type { Company, Duration, Focus, SessionSummary, Seniority } from '../types';

const SENIORITIES: Seniority[] = ['Junior', 'Mid', 'Senior', 'Staff'];
const COMPANIES: Company[] = ['Amazon', 'Google', 'Meta', 'Startup'];
const FOCUSES: Focus[] = ['mixed', 'leadership', 'conflict', 'failure', 'impact', 'ambiguity'];
const DURATIONS: Duration[] = ['quick', 'standard', 'full'];
const PROVIDER_LABELS = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', openrouter: 'OpenRouter' };

interface Props {
  onStart: () => void;
  onOpenSettings: () => void;
  onViewSummary: (summary: SessionSummary) => void;
}

export function Home({ onStart, onOpenSettings, onViewSummary }: Props) {
  const { profile, setProfile, settings, history, clearHistory, nostr } = useApp();
  const { ready, localStatus } = useEngineReady();
  const t = useT();
  const checking = settings.llm === 'local' && localStatus === 'checking';
  useDocumentTitle(`${APP_NAME} — ${t.title.home}`);
  // The full interview is the default and goes unsaid; the switch adds the length to the sentence.
  const chooseLength = !!profile.chooseLength;
  const [lengthJustAdded, setLengthJustAdded] = useState(false);

  const { seniorityHints, companyLabels, companyHints, focusLabels, focusHints, durationLabels, durationHints } =
    t.options;
  const seniorityOptions: PickerOption<Seniority>[] = SENIORITIES.map((v) => ({
    value: v,
    label: v,
    hint: seniorityHints[v],
  }));
  const companyOptions: PickerOption<Company>[] = COMPANIES.map((v) => ({
    value: v,
    label: companyLabels[v],
    hint: companyHints[v],
  }));
  const focusOptions: PickerOption<Focus>[] = FOCUSES.map((v) => ({
    value: v,
    label: focusLabels[v],
    hint: focusHints[v],
  }));
  const durationOptions: PickerOption<Duration>[] = DURATIONS.map((v) => ({
    value: v,
    label: durationLabels[v],
    hint: durationHints[v],
  }));

  let status: string;
  if (settings.llm === 'cloud') {
    status = ready ? t.home.usingProvider(PROVIDER_LABELS[settings.cloud.provider]) : t.home.missingKey;
  } else if (localStatus === 'checking') {
    status = t.home.checkingLocal;
  } else if (localStatus === 'unavailable') {
    status = t.home.localUnavailable;
  } else {
    status = t.home.usingLocal;
  }

  const [beforeLevel, levelToRole, roleToCompany, companyToFocus, focusToDuration, after] = t.home.sentence;

  return (
    <main className="home" id="main" tabIndex={-1}>
      <h1 className="sr-only">
        {APP_NAME}: {t.title.home}
      </h1>
      <p className="sentence">
        {beforeLevel}{' '}
        <InlinePicker
          label={t.home.level}
          value={profile.seniority}
          options={seniorityOptions}
          onChange={(seniority) => setProfile({ seniority })}
        />{' '}
        {levelToRole}{' '}
        <input
          className="inline-input"
          aria-label={t.home.role}
          value={profile.role}
          onChange={(e) => setProfile({ role: e.target.value })}
          placeholder={t.home.rolePlaceholder}
        />{' '}
        {roleToCompany}{' '}
        <InlinePicker
          label={t.home.company}
          value={profile.company}
          options={companyOptions}
          onChange={(company) => setProfile({ company })}
        />
        {companyToFocus}{' '}
        <InlinePicker
          label={t.home.focus}
          value={profile.focus}
          options={focusOptions}
          onChange={(focus) => setProfile({ focus })}
        />
        {chooseLength && (
          <>
            {focusToDuration}{' '}
            <InlinePicker
              label={t.home.duration}
              value={profile.duration}
              options={durationOptions}
              onChange={(duration) => setProfile({ duration })}
              openOnMount={lengthJustAdded}
            />
          </>
        )}
        {after}
      </p>

      <div className="start">
        <button
          className="primary big"
          disabled={!profile.role.trim() || checking}
          onClick={ready ? onStart : onOpenSettings}
        >
          {ready || checking ? t.home.start : t.home.chooseEngine}
        </button>
        <p className="status">
          <span className={`dot ${ready ? 'ok' : checking ? '' : 'warn'}`} />
          {status}.{' '}
          <button className="link" onClick={onOpenSettings}>
            {t.home.change}
          </button>
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={chooseLength}
        className="switch length-switch"
        onClick={() => {
          setLengthJustAdded(!chooseLength);
          setProfile({ chooseLength: !chooseLength });
        }}
      >
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        {t.home.chooseLength}
      </button>

      {history.length > 0 && (
        <section className="history">
          <div className="history-head">
            <h2>{t.home.history}</h2>
            <button
              className="link muted-link"
              onClick={() => confirm(t.home.confirmClear(history.length, nostr.mode !== 'none')) && clearHistory()}
            >
              {t.home.clearHistory}
            </button>
          </div>
          <ul>
            {history.slice(0, 8).map((s) => (
              <li key={s.id}>
                <button className="history-item" onClick={() => onViewSummary(s)}>
                  <span className="history-main">
                    {capitalize(focusLabels[s.focus] ?? focusLabels.mixed)}, {s.company}
                    <small>
                      {s.seniority} {s.role}, {new Date(s.date).toLocaleDateString(t.locale)}
                    </small>
                  </span>
                  <ScoreBadge score={s.score} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
