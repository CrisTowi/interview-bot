import { useRef, useState } from 'react';
import { createAgent } from '../engines/agent';
import { buildCvSummaryPrompt, extractText } from '../lib/cv';
import { useT } from '../i18n';
import { useApp } from '../store';
import { Dropdown } from './Dropdown';
import { focusOnMount, useEngineReady } from './ui';

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
  const t = useT();
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
      setStep(t.profile.reading);
      const text = await readText();
      setStep(t.profile.preparing);
      const briefing = (await agent.reply(buildCvSummaryPrompt(profile.lang), [{ role: 'user', content: text }]))
        .replace(/\*\*/g, '')
        .trim();
      setProfile({ cvSummary: briefing, cvSource: { name: source, date: new Date().toISOString() } });
      setMode('choose');
      setReplacing(false);
      setPasted('');
    } catch (err) {
      setError((err as Error).message || t.profile.readFailed);
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

      <div className="profile-head">
        <span className="menu-label">{t.profile.title}</span>
        {hasBriefing && profile.cvSource && (
          <span className="profile-source">
            {profile.cvSource.name}, {new Date(profile.cvSource.date).toLocaleDateString(t.locale)}
          </span>
        )}
      </div>

      {step ? (
        <p className="profile-step" role="status">
          <span className="dots" /> {step}
        </p>
      ) : hasBriefing ? (
        <>
          {editing ? (
            <textarea
              className="briefing-editor"
              rows={9}
              aria-label={t.profile.title}
              value={profile.cvSummary}
              onChange={(e) => setProfile({ cvSummary: e.target.value })}
            />
          ) : (
            <Briefing text={profile.cvSummary} />
          )}
          <div className="profile-actions">
            <button className="link" onClick={() => setEditing(!editing)}>
              {editing ? t.profile.done : t.profile.fix}
            </button>
            <button className="link" onClick={() => setReplacing(true)}>
              {t.profile.replace}
            </button>
            <button
              className="link muted-link"
              onClick={() => confirm(t.profile.confirmRemove) && setProfile({ cvSummary: '', cvSource: undefined })}
            >
              {t.profile.remove}
            </button>
          </div>
          <p className="hint">{t.profile.usedHint}</p>
        </>
      ) : (
        <>
          <p className="profile-lead">{t.profile.lead}</p>

          {!ready ? (
            <p className="hint">
              {t.profile.needEngine}{' '}
              <button className="link" onClick={onOpenSettings}>
                {t.profile.openSettings}
              </button>
            </p>
          ) : mode === 'choose' ? (
            <div className="profile-options">
              <button className="option" onClick={() => fileInput.current?.click()}>
                <strong>{t.profile.uploadCv}</strong>
                <span>{t.profile.uploadCvSub}</span>
              </button>
              <button className="option" onClick={() => setMode('linkedin')}>
                <strong>{t.profile.useLinkedin}</strong>
                <span>{t.profile.useLinkedinSub}</span>
              </button>
              <button className="option" onClick={() => setMode('paste')}>
                <strong>{t.profile.pasteText}</strong>
                <span>{t.profile.pasteTextSub}</span>
              </button>
            </div>
          ) : mode === 'linkedin' ? (
            <div className="profile-panel">
              <ol className="linkedin-steps">
                {t.profile.linkedinSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="row">
                <button className="primary" onClick={() => fileInput.current?.click()}>
                  {t.profile.uploadLinkedin}
                </button>
                <button className="link" onClick={() => setMode('choose')}>
                  {t.common.back}
                </button>
              </div>
              <p className="hint">{t.profile.linkedinWhy}</p>
            </div>
          ) : (
            <div className="profile-panel">
              <textarea
                rows={6}
                ref={focusOnMount}
                aria-label={t.profile.pasteText}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={t.profile.pastePlaceholder}
              />
              <div className="row">
                <button
                  className="primary"
                  disabled={pasted.trim().length < 80}
                  onClick={() => summarize(t.profile.pastedSource, async () => pasted.trim())}
                >
                  {t.profile.prepare}
                </button>
                <button className="link" onClick={() => setMode('choose')}>
                  {t.common.back}
                </button>
              </div>
            </div>
          )}

          {replacing && (
            <button className="link" onClick={() => setReplacing(false)}>
              {t.profile.keepCurrent}
            </button>
          )}
          <p className="hint">{t.profile.privacy}</p>
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <details className="profile-notes">
        <summary>{t.profile.notes}</summary>
        <textarea
          rows={3}
          aria-label={t.profile.notes}
          value={profile.background}
          onChange={(e) => setProfile({ background: e.target.value })}
          placeholder={t.profile.notesPlaceholder}
        />
        <input
          value={profile.salary}
          onChange={(e) => setProfile({ salary: e.target.value })}
          placeholder={t.profile.salary}
          aria-label={t.profile.salaryLabel}
        />
      </details>
    </section>
  );
}

/** "Perfil" in the top bar: a dot shows at a glance whether the interviewer is using your CV. */
export function ProfileMenu({
  open,
  onToggle,
  onClose,
  onOpenSettings,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const hasBriefing = useApp((s) => !!s.profile.cvSummary.trim());
  const t = useT();
  return (
    <Dropdown
      label={
        <>
          {hasBriefing && <span className="dot ok" aria-label={t.topbar.usingCv} />}
          {t.topbar.profile}
        </>
      }
      title={t.profile.title}
      open={open}
      onToggle={onToggle}
      onClose={onClose}
    >
      <ProfileCard onOpenSettings={onOpenSettings} />
    </Dropdown>
  );
}
