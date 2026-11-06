import { useRef, useState } from 'react';
import { createAgent } from '../engines/agent';
import { buildCvSummaryPrompt, extractText } from '../lib/cv';
import { useApp } from '../store';
import { ChevronIcon } from './icons';
import { useEngineReady } from './ui';

type Mode = 'choose' | 'linkedin' | 'paste';

/** Shows "Label: text" lines of the briefing with the label emphasized. */
function Briefing({ text }: { text: string }) {
  return (
    <div className="briefing">
      {text
        .split('\n')
        .filter(Boolean)
        .map((line, i) => {
          const at = line.indexOf(':');
          return at > 0 && at < 40 ? (
            <p key={i}>
              <strong>{line.slice(0, at)}</strong>
              {line.slice(at + 1)}
            </p>
          ) : (
            <p key={i}>{line}</p>
          );
        })}
    </div>
  );
}

/**
 * The candidate's background for the interviewer: a briefing distilled from their CV or LinkedIn PDF,
 * plus free-form notes. Only the briefing is kept (and synced), never the original file.
 */
export function ProfileCard({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { profile, settings, setProfile } = useApp();
  const { ready } = useEngineReady();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('choose');
  const [replacing, setReplacing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pasted, setPasted] = useState('');
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  async function summarize(source: string, readText: () => Promise<string>) {
    setError('');
    const agent = createAgent(settings, profile.lang);
    try {
      setStep('Leyendo tu perfil…');
      const text = await readText();
      setStep('Preparando tu ficha para el entrevistador…');
      const briefing = (await agent.reply(buildCvSummaryPrompt(profile.lang), [{ role: 'user', content: text }]))
        .replace(/\*\*/g, '')
        .trim();
      setProfile({ cvSummary: briefing, cvSource: { name: source, date: new Date().toISOString() } });
      setMode('choose');
      setReplacing(false);
      setPasted('');
    } catch (err) {
      setError((err as Error).message || 'No pudimos leer tu perfil.');
    } finally {
      agent.destroy();
      setStep('');
    }
  }

  function onFile(file: File | undefined) {
    if (file) summarize(file.name, () => extractText(file));
    if (fileInput.current) fileInput.current.value = '';
  }

  const hasBriefing = !!profile.cvSummary.trim() && !replacing;

  return (
    <section className="profile-card">
      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <button type="button" className="sync-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="sync-toggle-top">
          <span className="menu-label">Tu perfil</span>
          <ChevronIcon />
        </span>
        <span className="sync-summary">
          <span className={`dot ${hasBriefing ? 'ok' : ''}`} />
          {step
            ? step
            : hasBriefing
              ? `Usando tu perfil${profile.cvSource ? ` de ${profile.cvSource.name}` : ''}`
              : 'Comparte tu CV o LinkedIn para preguntas sobre tu experiencia real'}
        </span>
      </button>

      {open && (
        <>
          {step ? (
            <p className="profile-step">
              <span className="dots" /> {step}
            </p>
          ) : hasBriefing ? (
            <>
              {editing ? (
                <textarea
                  className="briefing-editor"
                  rows={9}
                  value={profile.cvSummary}
                  onChange={(e) => setProfile({ cvSummary: e.target.value })}
                />
              ) : (
                <Briefing text={profile.cvSummary} />
              )}
              <div className="profile-actions">
                <button className="link" onClick={() => setEditing(!editing)}>
                  {editing ? 'Listo' : 'Corregir'}
                </button>
                <button className="link" onClick={() => setReplacing(true)}>
                  Reemplazar
                </button>
                <button
                  className="link muted-link"
                  onClick={() =>
                    confirm('¿Quitar tu perfil? El entrevistador ya no lo usará.') &&
                    setProfile({ cvSummary: '', cvSource: undefined })
                  }
                >
                  Quitar
                </button>
              </div>
              <p className="hint">
                El entrevistador preguntará por tus experiencias reales. Solo guardamos esta ficha, no tu archivo.
              </p>
            </>
          ) : (
            <>
              <p className="profile-lead">
                Comparte tu CV o tu perfil de LinkedIn y el entrevistador te preguntará por tus proyectos y roles
                reales, no por situaciones genéricas.
              </p>

              {!ready ? (
                <p className="hint">
                  Primero elige un motor de IA para leer tu perfil.{' '}
                  <button className="link" onClick={onOpenSettings}>
                    Abrir Ajustes
                  </button>
                </p>
              ) : mode === 'choose' ? (
                <div className="profile-options">
                  <button className="option" onClick={() => fileInput.current?.click()}>
                    <strong>Subir mi CV</strong>
                    <span>PDF o texto</span>
                  </button>
                  <button className="option" onClick={() => setMode('linkedin')}>
                    <strong>Usar mi LinkedIn</strong>
                    <span>Con el PDF de tu perfil</span>
                  </button>
                  <button className="option" onClick={() => setMode('paste')}>
                    <strong>Pegar texto</strong>
                    <span>Tu resumen o experiencia</span>
                  </button>
                </div>
              ) : mode === 'linkedin' ? (
                <div className="profile-panel">
                  <ol className="linkedin-steps">
                    <li>Abre tu perfil de LinkedIn en una computadora.</li>
                    <li>
                      Pulsa <strong>Más</strong> (o <strong>Recursos</strong>) y luego <strong>Guardar en PDF</strong>.
                    </li>
                    <li>Sube aquí el PDF que se descargó.</li>
                  </ol>
                  <div className="row">
                    <button className="primary" onClick={() => fileInput.current?.click()}>
                      Subir el PDF de LinkedIn
                    </button>
                    <button className="link" onClick={() => setMode('choose')}>
                      Volver
                    </button>
                  </div>
                  <p className="hint">LinkedIn no permite leer perfiles desde su enlace, por eso usamos el PDF.</p>
                </div>
              ) : (
                <div className="profile-panel">
                  <textarea
                    rows={6}
                    autoFocus
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    placeholder="Pega tu experiencia: roles, proyectos, logros…"
                  />
                  <div className="row">
                    <button
                      className="primary"
                      disabled={pasted.trim().length < 80}
                      onClick={() => summarize('texto pegado', async () => pasted.trim())}
                    >
                      Preparar mi ficha
                    </button>
                    <button className="link" onClick={() => setMode('choose')}>
                      Volver
                    </button>
                  </div>
                </div>
              )}

              {replacing && (
                <button className="link" onClick={() => setReplacing(false)}>
                  Mantener mi ficha actual
                </button>
              )}
              <p className="hint">
                Tu archivo se lee en tu navegador y nunca se sube. Su texto se envía al motor de IA que elegiste para
                resumirlo.
              </p>
            </>
          )}

          {error && <p className="error">{error}</p>}

          <details className="profile-notes">
            <summary>Notas para el entrevistador</summary>
            <textarea
              rows={3}
              value={profile.background}
              onChange={(e) => setProfile({ background: e.target.value })}
              placeholder="Ej.: busco mi primer rol de Staff; quiero practicar historias de conflicto con producto."
            />
            <input
              value={profile.salary}
              onChange={(e) => setProfile({ salary: e.target.value })}
              placeholder="Expectativa salarial (opcional)"
              aria-label="Expectativa salarial"
            />
          </details>
        </>
      )}
    </section>
  );
}
