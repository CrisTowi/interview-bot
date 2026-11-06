import { useEffect, useState } from 'react';
import { ScoreBadge } from '../components/ui';
import { createAgent } from '../engines/agent';
import { buildSummaryPrompt, parseEvaluation, transcriptText, focusTitle } from '../lib/prompts';
import { useApp } from '../store';
import type { ChatMessage, SessionSummary } from '../types';

interface Props {
  /** Show a saved summary... */
  existing?: SessionSummary;
  /** ...or evaluate a just-finished interview. */
  transcript?: ChatMessage[];
  onHome: () => void;
}

export function Summary({ existing, transcript, onHome }: Props) {
  const { profile, settings, addSummary } = useApp();
  const [summary, setSummary] = useState<SessionSummary | undefined>(existing);
  const [error, setError] = useState('');
  const answered = transcript?.some((m) => m.role === 'user' && !m.hidden) ?? false;

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
              <span className="dots" /> Evaluando tu desempeño…
            </p>
          )}
          <button className="link" onClick={onHome}>
            Volver al inicio
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="summary">
      <section>
        <div className="summary-head">
          <div>
            <h2>{summary.verdict || 'Resultado'}</h2>
            <p className="muted">
              {focusTitle(summary.focus)} en {summary.company}, {summary.seniority} {summary.role},{' '}
              {new Date(summary.date).toLocaleDateString()}
            </p>
          </div>
          <ScoreBadge score={summary.score} />
        </div>
        <p className="summary-body">{summary.summary}</p>
        {summary.strengths.length > 0 && (
          <>
            <h3>Fortalezas</h3>
            <ul>
              {summary.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        )}
        {summary.improvements.length > 0 && (
          <>
            <h3>A mejorar</h3>
            <ul>
              {summary.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <p className="hint">Tu próxima entrevista insistirá en estos puntos.</p>
          </>
        )}
        <button className="primary" onClick={onHome}>
          Volver al inicio
        </button>
      </section>
    </main>
  );
}
