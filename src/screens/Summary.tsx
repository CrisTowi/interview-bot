import { useEffect, useState } from 'react';
import { createAgent } from '../engines/agent';
import { capitalize, useT, type Dict } from '../i18n';
import { buildSummaryPrompt, parseEvaluation, transcriptText } from '../lib/prompts';
import { APP_NAME, useDocumentTitle } from '../lib/title';
import { useApp } from '../store';
import type { ChatMessage, SessionSummary } from '../types';

interface Props {
  /** Show a saved summary... */
  existing?: SessionSummary;
  /** ...or evaluate a just-finished interview. */
  transcript?: ChatMessage[];
  onHome: () => void;
  onRetry: () => void;
}

/** The hiring-committee scale, worst to best (the model answers with these English keys). */
const VERDICT_KEYS = ['no hire', 'lean no hire', 'lean hire', 'hire', 'strong hire'] as const;

function verdictIndex(verdict: string, score: number): number {
  const i = VERDICT_KEYS.findIndex((v) => v === verdict.trim().toLowerCase());
  if (i >= 0) return i;
  // Unknown or missing verdict: place it on the scale from the score.
  return score <= 3 ? 0 : score <= 5 ? 1 : score <= 6 ? 2 : score <= 8 ? 3 : 4;
}

const tone = (index: number) => (index <= 1 ? 'low' : index === 2 ? 'mid' : 'good');

function StarGuide({ t }: { t: Dict }) {
  return (
    <section className="star-guide" aria-label={t.summary.starLabel}>
      <h3>{t.summary.starTitle}</h3>
      <ol>
        {t.summary.starSteps.map((step) => (
          <li key={step.letter}>
            <span className="star-letter" aria-hidden="true">
              {step.letter}
            </span>
            <strong>{step.title}</strong>
            <span>{step.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Summary({ existing, transcript, onHome, onRetry }: Props) {
  const { profile, settings, addSummary } = useApp();
  const t = useT();
  const [summary, setSummary] = useState<SessionSummary | undefined>(existing);
  const [error, setError] = useState('');
  const answered = transcript?.some((m) => m.role === 'user' && !m.hidden) ?? false;
  useDocumentTitle(
    summary?.score
      ? `${t.title.result}: ${t.summary.verdicts[VERDICT_KEYS[verdictIndex(summary.verdict, summary.score)]].label} — ${APP_NAME}`
      : `${t.title.result} — ${APP_NAME}`,
  );

  async function evaluate() {
    if (!transcript) return;
    setError('');
    const agent = createAgent(settings, profile.lang);
    try {
      const raw = await agent.reply(buildSummaryPrompt(profile), [
        { role: 'user', content: transcriptText(transcript) },
      ]);
      const result: SessionSummary = {
        ...parseEvaluation(raw),
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        role: profile.role,
        seniority: profile.seniority,
        company: profile.company,
        focus: profile.focus,
        lang: profile.lang,
      };
      addSummary(result);
      setSummary(result);
    } catch (err) {
      setError((err as Error).message || t.summary.evalFailed);
    } finally {
      agent.destroy();
    }
  }

  useEffect(() => {
    if (!existing && answered) evaluate();
  }, []);

  if (!summary) {
    const pendingQuestion = [...(transcript ?? [])].reverse().find((m) => m.role === 'assistant')?.content;

    if (!answered) {
      return (
        <main className="summary state" tabIndex={-1}>
          <h1 className="sr-only">{t.title.result}</h1>
          <img className="state-mascot" src="/favicon.svg" alt="" width={96} height={96} />
          <h2>{t.summary.emptyTitle}</h2>
          <p className="state-text">{t.summary.emptyText}</p>

          {pendingQuestion && (
            <figure className="pending-question">
              <figcaption>{t.summary.pendingQuestion}</figcaption>
              <blockquote lang={profile.lang}>{pendingQuestion}</blockquote>
            </figure>
          )}

          <StarGuide t={t} />

          <div className="summary-actions">
            <button className="primary" onClick={onRetry}>
              {t.summary.tryAgain}
            </button>
            <button className="secondary" onClick={onHome}>
              {t.common.goHome}
            </button>
          </div>
        </main>
      );
    }

    return (
      <main className="summary state" tabIndex={-1}>
        <h1 className="sr-only">{t.title.result}</h1>
        <img
          className={error ? 'state-mascot' : 'state-mascot thinking'}
          src="/favicon.svg"
          alt=""
          width={96}
          height={96}
        />
        {error ? (
          <>
            <h2>{t.summary.errorTitle}</h2>
            <p className="state-text error" role="alert">
              {error}
            </p>
            <p className="state-text">{t.summary.errorText}</p>
            <div className="summary-actions">
              <button className="primary" onClick={evaluate}>
                {t.common.retry}
              </button>
              <button className="secondary" onClick={onHome}>
                {t.common.goHome}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>
              {t.summary.evaluatingTitle} <span className="dots" />
            </h2>
            <p className="state-text">{t.summary.evaluatingText}</p>
            <StarGuide t={t} />
          </>
        )}
      </main>
    );
  }

  const index = verdictIndex(summary.verdict, summary.score);
  const verdict = t.summary.verdicts[VERDICT_KEYS[index]];
  const hasScore = summary.score > 0;
  const focusLabel = capitalize(t.options.focusLabels[summary.focus] ?? t.options.focusLabels.mixed);

  return (
    <main className="summary" tabIndex={-1}>
      <h1 className="sr-only">{t.title.result}</h1>
      <p className="summary-meta muted">
        {t.summary.meta(
          focusLabel,
          summary.company,
          `${summary.seniority} ${summary.role}`,
          new Date(summary.date).toLocaleDateString(t.locale),
        )}
      </p>

      {hasScore && (
        <section className={`verdict ${tone(index)}`}>
          <div className="verdict-head">
            <div>
              <p className="verdict-label">{t.summary.committee}</p>
              <h2>{verdict.label}</h2>
            </div>
            <p className="verdict-score">
              {summary.score}
              <span>/10</span>
            </p>
          </div>
          <ol className="verdict-scale" aria-label={t.summary.scaleLabel}>
            {VERDICT_KEYS.map((key, i) => (
              <li key={key} className={i === index ? 'current' : ''} aria-current={i === index}>
                {t.summary.verdicts[key].label}
              </li>
            ))}
          </ol>
          <p className="verdict-meaning">{verdict.meaning}</p>
        </section>
      )}

      {summary.headline && (
        <p className="headline" lang={summary.lang}>
          {summary.headline}
        </p>
      )}
      <p className="summary-body" lang={summary.lang}>
        {summary.summary}
      </p>

      {summary.dimensions && (
        <section>
          <h3>{t.summary.perCriterion}</h3>
          <ul className="dimensions">
            {summary.dimensions.map((d) => (
              <li key={d.key}>
                <div className="dimension-head">
                  <span>{t.summary.dimensions[d.key]}</span>
                  <span
                    className={`meter ${d.score <= 2 ? 'low' : d.score === 3 ? 'mid' : 'good'}`}
                    role="img"
                    aria-label={t.summary.outOfFive(d.score)}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <i key={n} className={n <= d.score ? 'on' : ''} />
                    ))}
                  </span>
                </div>
                <p lang={summary.lang}>{d.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="columns">
        {summary.strengths.length > 0 && (
          <section>
            <h3>{t.summary.worked}</h3>
            <ul lang={summary.lang}>
              {summary.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
        )}
        {summary.improvements.length > 0 && (
          <section>
            <h3>{t.summary.heldBack}</h3>
            <ul lang={summary.lang}>
              {summary.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {summary.nextStep && (
        <section className="next-step">
          <h3>{t.summary.nextTask}</h3>
          <p lang={summary.lang}>{summary.nextStep}</p>
        </section>
      )}

      {summary.improvements.length > 0 && <p className="hint">{t.summary.nextInterviewHint}</p>}

      <div className="summary-actions">
        <button className="primary" onClick={onRetry}>
          {t.summary.practiceAgain}
        </button>
        <button className="secondary" onClick={onHome}>
          {t.common.goHome}
        </button>
      </div>
    </main>
  );
}
