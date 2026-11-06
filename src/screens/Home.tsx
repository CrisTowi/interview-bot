import { ScoreBadge, Select, useEngineReady } from '../components/ui';
import { FOCUS_LABELS, focusTitle } from '../lib/prompts';
import { useApp } from '../store';
import type { Company, Focus, SessionSummary, Seniority } from '../types';

const SENIORITY = (['Junior', 'Mid', 'Senior', 'Staff'] as const).map((v) => ({ value: v as Seniority, label: v }));
const COMPANIES = (['Amazon', 'Google', 'Meta', 'Startup'] as const).map((v) => ({
  value: v as Company,
  label: v === 'Startup' ? 'una startup' : v,
}));
const FOCUSES = (Object.keys(FOCUS_LABELS) as Focus[]).map((v) => ({ value: v, label: FOCUS_LABELS[v] }));
const PROVIDER_LABELS = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini' };

interface Props {
  onStart: () => void;
  onOpenSettings: () => void;
  onViewSummary: (summary: SessionSummary) => void;
}

export function Home({ onStart, onOpenSettings, onViewSummary }: Props) {
  const { profile, setProfile, settings, history } = useApp();
  const { ready, localStatus } = useEngineReady();
  const checking = settings.llm === 'local' && localStatus === 'checking';

  let status: string;
  if (settings.llm === 'cloud') {
    status = ready ? `Usando ${PROVIDER_LABELS[settings.cloud.provider]}` : 'Falta tu API key';
  } else if (localStatus === 'checking') {
    status = 'Comprobando Chrome AI';
  } else if (localStatus === 'unavailable') {
    status = 'Chrome AI no está disponible en este navegador';
  } else {
    status = 'Usando Chrome AI en tu equipo';
  }

  return (
    <main className="home">
      <p className="sentence">
        Practica una entrevista behavioral de nivel{' '}
        <Select inline label="Nivel" value={profile.seniority} options={SENIORITY} onChange={(seniority) => setProfile({ seniority })} />{' '}
        para{' '}
        <input
          className="inline-input"
          aria-label="Puesto"
          value={profile.role}
          onChange={(e) => setProfile({ role: e.target.value })}
          placeholder="tu puesto"
        />{' '}
        al estilo de{' '}
        <Select inline label="Empresa" value={profile.company} options={COMPANIES} onChange={(company) => setProfile({ company })} />
        , sobre{' '}
        <Select inline label="Enfoque" value={profile.focus} options={FOCUSES} onChange={(focus) => setProfile({ focus })} />.
      </p>

      <div className="start">
        <button
          className="primary big"
          disabled={!profile.role.trim() || checking}
          onClick={ready ? onStart : onOpenSettings}
        >
          {ready || checking ? 'Empezar entrevista' : 'Elegir motor de IA'}
        </button>
        <p className="status">
          <span className={`dot ${ready ? 'ok' : checking ? '' : 'warn'}`} />
          {status}.{' '}
          <button className="link" onClick={onOpenSettings}>
            Cambiar
          </button>
        </p>
      </div>

      <details className="context">
        <summary>Cuéntale al entrevistador sobre ti</summary>
        <textarea
          rows={3}
          value={profile.background}
          onChange={(e) => setProfile({ background: e.target.value })}
          placeholder="Ej.: 6 años en fintech, lidero un equipo de 4, migré nuestro monolito a microservicios."
        />
        <input
          value={profile.salary}
          onChange={(e) => setProfile({ salary: e.target.value })}
          placeholder="Expectativa salarial (opcional)"
          aria-label="Expectativa salarial"
        />
      </details>

      {history.length > 0 && (
        <section className="history">
          <h2>Sesiones anteriores</h2>
          <ul>
            {history.slice(0, 8).map((s) => (
              <li key={s.id}>
                <button className="history-item" onClick={() => onViewSummary(s)}>
                  <span className="history-main">
                    {focusTitle(s.focus)}, {s.company}
                    <small>
                      {s.seniority} {s.role}, {new Date(s.date).toLocaleDateString()}
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
