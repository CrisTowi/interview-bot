import { InlinePicker, type PickerOption } from '../components/InlinePicker';
import { ProfileCard } from '../components/ProfileCard';
import { ScoreBadge, useEngineReady } from '../components/ui';
import { FOCUS_LABELS, focusTitle } from '../lib/prompts';
import { APP_NAME, useDocumentTitle } from '../lib/title';
import { useApp } from '../store';
import type { Company, Focus, SessionSummary, Seniority } from '../types';

const SENIORITY: PickerOption<Seniority>[] = [
  { value: 'Junior', label: 'Junior', hint: '0 a 2 años de experiencia' },
  { value: 'Mid', label: 'Mid', hint: '2 a 5 años, trabajas con autonomía' },
  { value: 'Senior', label: 'Senior', hint: '5+ años, lideras proyectos' },
  { value: 'Staff', label: 'Staff', hint: 'Influyes en varios equipos' },
];
const COMPANIES: PickerOption<Company>[] = [
  { value: 'Amazon', label: 'Amazon', hint: 'Leadership Principles y mucho detalle' },
  { value: 'Google', label: 'Google', hint: 'Googleyness, colaboración y ambigüedad' },
  { value: 'Meta', label: 'Meta', hint: 'Impacto, ritmo y conflictos' },
  { value: 'Startup', label: 'una startup', hint: 'Ownership y pragmatismo' },
];
const FOCUS_HINTS: Record<Focus, string> = {
  mixed: 'Un poco de todo, como una ronda real',
  leadership: 'Influir sin autoridad, mentorear, decidir',
  conflict: 'Desacuerdos con pares, jefes o stakeholders',
  failure: 'Errores, feedback duro y qué cambiaste',
  impact: 'Tus logros más grandes y cómo los mediste',
  ambiguity: 'Decidir con información incompleta',
};
const FOCUSES: PickerOption<Focus>[] = (Object.keys(FOCUS_LABELS) as Focus[]).map((v) => ({
  value: v,
  label: FOCUS_LABELS[v],
  hint: FOCUS_HINTS[v],
}));
const PROVIDER_LABELS = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', openrouter: 'OpenRouter' };

interface Props {
  onStart: () => void;
  onOpenSettings: () => void;
  onViewSummary: (summary: SessionSummary) => void;
}

export function Home({ onStart, onOpenSettings, onViewSummary }: Props) {
  const { profile, setProfile, settings, history } = useApp();
  const { ready, localStatus } = useEngineReady();
  const checking = settings.llm === 'local' && localStatus === 'checking';
  useDocumentTitle(`${APP_NAME} — Practica entrevistas behavioral`);

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
        <InlinePicker label="Nivel" value={profile.seniority} options={SENIORITY} onChange={(seniority) => setProfile({ seniority })} />{' '}
        para{' '}
        <input
          className="inline-input"
          aria-label="Puesto"
          value={profile.role}
          onChange={(e) => setProfile({ role: e.target.value })}
          placeholder="tu puesto"
        />{' '}
        al estilo de{' '}
        <InlinePicker label="Empresa" value={profile.company} options={COMPANIES} onChange={(company) => setProfile({ company })} />
        , sobre{' '}
        <InlinePicker label="Enfoque" value={profile.focus} options={FOCUSES} onChange={(focus) => setProfile({ focus })} />.
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

      <ProfileCard onOpenSettings={onOpenSettings} />

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
