import { useEffect, useState } from 'react';
import { createAgent } from '../engines/agent';
import { buildSummaryPrompt, focusTitle, parseEvaluation, transcriptText } from '../lib/prompts';
import { APP_NAME, useDocumentTitle } from '../lib/title';
import { useApp } from '../store';
import type { ChatMessage, Dimension, SessionSummary } from '../types';

interface Props {
  /** Show a saved summary... */
  existing?: SessionSummary;
  /** ...or evaluate a just-finished interview. */
  transcript?: ChatMessage[];
  onHome: () => void;
  onRetry: () => void;
}

/** The hiring-committee scale, worst to best, so the verdict can be shown in context. */
const VERDICTS = [
  { key: 'no hire', label: 'No contratar', meaning: 'Con esta entrevista, el comité no avanzaría con tu candidatura.' },
  { key: 'lean no hire', label: 'Probablemente no', meaning: 'Hubo señales buenas, pero no las suficientes para pasar de ronda.' },
  { key: 'lean hire', label: 'Probablemente sí', meaning: 'Pasarías de ronda, aunque con dudas que el comité querría despejar.' },
  { key: 'hire', label: 'Contratar', meaning: 'Una entrevista sólida: el comité avanzaría contigo.' },
  { key: 'strong hire', label: 'Contratar sin dudas', meaning: 'Destacaste: estarías entre los mejores candidatos de la ronda.' },
];

const DIMENSION_LABELS: Record<Dimension, string> = {
  structure: 'Estructura STAR',
  specificity: 'Ejemplos concretos',
  ownership: 'Lo que hiciste tú',
  impact: 'Impacto medible',
  scope: 'Alcance para tu nivel',
  communication: 'Comunicación',
};

function verdictIndex(verdict: string, score: number): number {
  const i = VERDICTS.findIndex((v) => v.key === verdict.trim().toLowerCase());
  if (i >= 0) return i;
  // Unknown or missing verdict: place it on the scale from the score.
  return score <= 3 ? 0 : score <= 5 ? 1 : score <= 6 ? 2 : score <= 8 ? 3 : 4;
}

const tone = (index: number) => (index <= 1 ? 'low' : index === 2 ? 'mid' : 'good');

export function Summary({ existing, transcript, onHome, onRetry }: Props) {
  const { profile, settings, addSummary } = useApp();
  const [summary, setSummary] = useState<SessionSummary | undefined>(existing);
  const [error, setError] = useState('');
  const answered = transcript?.some((m) => m.role === 'user' && !m.hidden) ?? false;
  useDocumentTitle(
    summary?.score
      ? `Resultado: ${VERDICTS[verdictIndex(summary.verdict, summary.score)].label} — ${APP_NAME}`
      : `Resultado — ${APP_NAME}`,
  );

  async function evaluate() {
    if (!transcript) return;
    setError('');
    const agent = createAgent(settings, profile.lang);
    try {
      const raw = await agent.reply(buildSummaryPrompt(profile), [{ role: 'user', content: transcriptText(transcript) }]);
      const result: SessionSummary = {
        ...parseEvaluation(raw),
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        role: profile.role,
        seniority: profile.seniority,
        company: profile.company,
        focus: profile.focus,
      };
      addSummary(result);
      setSummary(result);
    } catch (err) {
      setError((err as Error).message || 'No se pudo generar el resumen.');
    } finally {
      agent.destroy();
    }
  }

  useEffect(() => {
    if (!existing && answered) evaluate();
  }, []);

  if (!summary) {
    return (
      <main className="summary">
        <section className="waiting">
          {!answered ? (
            <p>La entrevista terminó antes de que respondieras. No hay nada que evaluar.</p>
          ) : error ? (
            <>
              <p className="error">{error}</p>
              <button className="primary" onClick={evaluate}>
                Reintentar
              </button>
            </>
          ) : (
            <p>
              <span className="dots" /> El comité está revisando tu entrevista…
            </p>
          )}
          <button className="link" onClick={onHome}>
            Volver al inicio
          </button>
        </section>
      </main>
    );
  }

  const index = verdictIndex(summary.verdict, summary.score);
  const verdict = VERDICTS[index];
  const hasScore = summary.score > 0;

  return (
    <main className="summary">
      <p className="summary-meta muted">
        {focusTitle(summary.focus)} en {summary.company}, {summary.seniority} {summary.role},{' '}
        {new Date(summary.date).toLocaleDateString()}
      </p>

      {hasScore && (
        <section className={`verdict ${tone(index)}`}>
          <div className="verdict-head">
            <div>
              <p className="verdict-label">Veredicto del comité</p>
              <h2>{verdict.label}</h2>
            </div>
            <p className="verdict-score">
              {summary.score}
              <span>/10</span>
            </p>
          </div>
          <ol className="verdict-scale" aria-label="Escala de veredictos">
            {VERDICTS.map((v, i) => (
              <li key={v.key} className={i === index ? 'current' : ''} aria-current={i === index}>
                {v.label}
              </li>
            ))}
          </ol>
          <p className="verdict-meaning">{verdict.meaning}</p>
        </section>
      )}

      {summary.headline && <p className="headline">{summary.headline}</p>}
      <p className="summary-body">{summary.summary}</p>

      {summary.dimensions && (
        <section>
          <h3>Cómo te fue en cada criterio</h3>
          <ul className="dimensions">
            {summary.dimensions.map((d) => (
              <li key={d.key}>
                <div className="dimension-head">
                  <span>{DIMENSION_LABELS[d.key]}</span>
                  <span className={`meter ${d.score <= 2 ? 'low' : d.score === 3 ? 'mid' : 'good'}`} aria-label={`${d.score} de 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <i key={n} className={n <= d.score ? 'on' : ''} />
                    ))}
                  </span>
                </div>
                <p>{d.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="columns">
        {summary.strengths.length > 0 && (
          <section>
            <h3>Lo que funcionó</h3>
            <ul>
              {summary.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
        )}
        {summary.improvements.length > 0 && (
          <section>
            <h3>Lo que te frenó</h3>
            <ul>
              {summary.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {summary.nextStep && (
        <section className="next-step">
          <h3>Tu tarea para la próxima</h3>
          <p>{summary.nextStep}</p>
        </section>
      )}

      {summary.improvements.length > 0 && (
        <p className="hint">Tu próxima entrevista insistirá en los puntos que te frenaron.</p>
      )}

      <div className="summary-actions">
        <button className="primary" onClick={onRetry}>
          Practicar otra vez
        </button>
        <button className="secondary" onClick={onHome}>
          Volver al inicio
        </button>
      </div>
    </main>
  );
}
