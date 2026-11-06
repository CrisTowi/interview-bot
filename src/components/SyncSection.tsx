import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  connectExtension,
  createLocalIdentity,
  disableKeySync,
  disconnect,
  enableKeySync,
  exportNsec,
  importNsec,
  shortNpub,
  startSync,
  unlockKeys,
  updateSyncedKeys,
  useSync,
} from '../sync/nostrSync';
import { hasExtension } from '../sync/signer';
import { fingerprint } from '../sync/vault';
import { useApp } from '../store';
import { ChevronIcon } from './icons';

/** How API keys stand on this device, which decides what (if anything) we ask for. */
type KeyState = 'off' | 'synced' | 'needs-unlock' | 'needs-update';

function HowItWorks() {
  return (
    <details className="how">
      <summary>¿Cómo funciona?</summary>
      <ul>
        <li>
          Usas una <strong>clave de Nostr</strong>: hace de usuario y contraseña a la vez, sin registrarte en ningún
          sitio.
        </li>
        <li>
          Tus datos se cifran en tu navegador antes de salir. Los servidores que los guardan solo ven texto ilegible.
        </li>
        <li>Para continuar en otro dispositivo, entra ahí con la misma clave.</li>
      </ul>
    </details>
  );
}

/** Always-visible header: one line saying how your data stands; click to see details. */
function SyncHeader({
  text,
  tone,
  expanded,
  onToggle,
}: {
  text: string;
  tone: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="sync-toggle" aria-expanded={expanded} onClick={onToggle}>
      <span className="sync-toggle-top">
        <span className="menu-label">Sincronización</span>
        <ChevronIcon />
      </span>
      <span className="sync-summary">
        <span className={`dot ${tone}`} />
        {text}
      </span>
    </button>
  );
}

function SyncedItem({ on, children, detail }: { on: boolean; children: ReactNode; detail?: string }) {
  return (
    <li className={on ? 'on' : ''}>
      <span className="sync-mark" aria-hidden="true">
        {on ? '✓' : '–'}
      </span>
      <span>{children}</span>
      {detail && <span className="sync-detail">{detail}</span>}
    </li>
  );
}

export function SyncSection() {
  const nostr = useApp((s) => s.nostr);
  const cloudKey = useApp((s) => s.settings.cloud.apiKey);
  const ttsKey = useApp((s) => s.settings.premiumTts.apiKey);
  const { status, error, vaultLocked } = useSync();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [nsec, setNsec] = useState('');
  const [showNsec, setShowNsec] = useState(false);
  const [creatingPassword, setCreatingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localFingerprint, setLocalFingerprint] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fingerprint({ cloud: cloudKey, tts: ttsKey }).then(setLocalFingerprint);
  }, [cloudKey, ttsKey]);

  const hasLocalKeys = !!(cloudKey || ttsKey);
  let keyState: KeyState;
  if (!nostr.syncKeys) keyState = 'off';
  else if (!vaultLocked) keyState = 'synced';
  else if (!hasLocalKeys) keyState = 'needs-unlock';
  else keyState = localFingerprint && localFingerprint === nostr.keysFingerprint ? 'synced' : 'needs-update';

  // Open by itself when something needs the user; otherwise stay a one-line summary.
  const needsAttention =
    nostr.mode !== 'none' && (status === 'error' || keyState === 'needs-unlock' || keyState === 'needs-update');
  useEffect(() => {
    if (needsAttention) setExpanded(true);
  }, [needsAttention]);

  let summary: { text: string; tone: string };
  if (nostr.mode === 'none') summary = { text: 'Desactivada: tus datos solo están en este navegador', tone: '' };
  else if (status === 'error') summary = { text: 'No se pudo sincronizar', tone: 'warn' };
  else if (status !== 'synced') summary = { text: 'Sincronizando tus datos…', tone: '' };
  else
    summary = {
      synced: { text: 'Perfil, historial y API keys al día', tone: 'ok' },
      off: { text: 'Perfil e historial al día; las API keys solo están en este navegador', tone: 'ok' },
      'needs-unlock': { text: 'Perfil e historial al día; falta tu contraseña para traer las API keys', tone: 'warn' },
      'needs-update': { text: 'Perfil e historial al día; tus API keys cambiaron y falta actualizarlas', tone: 'warn' },
    }[keyState];
  const header = (
    <SyncHeader text={summary.text} tone={summary.tone} expanded={expanded} onToggle={() => setExpanded(!expanded)} />
  );

  async function run(action: () => unknown) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      setNsec('');
      setPassword('');
      setConfirmation('');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (nostr.mode === 'none') {
    return (
      <div className="menu-group">
        {header}
        {expanded && (
          <>
            <p className="sync-lead">
              Usa tu perfil y tu historial de entrevistas en cualquier dispositivo, sin registrarte en ningún servidor.
            </p>
            <HowItWorks />
            {hasExtension() && (
              <button className="secondary" disabled={busy} onClick={() => run(connectExtension)}>
                Conectar con mi extensión (nos2x, Alby…)
              </button>
            )}
            <button className="secondary" disabled={busy} onClick={() => run(createLocalIdentity)}>
              Crear mi clave
            </button>
            {importing ? (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => importNsec(nsec));
                }}
              >
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="nsec1…"
                  value={nsec}
                  onChange={(e) => setNsec(e.target.value)}
                />
                <button className="secondary" disabled={busy || !nsec.trim()}>
                  Entrar
                </button>
              </form>
            ) : (
              <button className="link" onClick={() => setImporting(true)}>
                Ya tengo una clave (nsec)
              </button>
            )}
            {message && <p className="error">{message}</p>}
          </>
        )}
      </div>
    );
  }

  const keyDetail = {
    off: 'Solo en este navegador',
    synced: 'Con tu contraseña',
    'needs-unlock': 'Falta tu contraseña',
    'needs-update': 'Sin actualizar',
  }[keyState];

  function forgotPassword() {
    disableKeySync();
    setCreatingPassword(true);
    setMessage('');
  }

  function submitNewPassword(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmation) return setMessage('Las contraseñas no coinciden.');
    run(() => {
      enableKeySync(password);
      setCreatingPassword(false);
    });
  }

  const nsecValue = showNsec ? exportNsec() : null;

  return (
    <div className="menu-group">
      {header}
      {expanded && (
        <>
          {status === 'error' && (
            <p className="error">
              {error}{' '}
              <button className="link" onClick={() => startSync()}>
                Reintentar
              </button>
            </p>
          )}

          <ul className="sync-list" aria-label="Qué se sincroniza">
            <SyncedItem on>Perfil y preferencias</SyncedItem>
            <SyncedItem on>Historial de entrevistas</SyncedItem>
            <SyncedItem on={keyState === 'synced'} detail={keyDetail}>
              API keys
            </SyncedItem>
          </ul>

          {keyState === 'off' &&
            (creatingPassword ? (
              <form className="key-box" onSubmit={submitNewPassword}>
                <p>
                  Tus API keys se protegen con una <strong>contraseña extra</strong> que solo tú conoces: aunque alguien
                  obtuviera tu clave de Nostr, no podría leerlas. No la guardamos en ningún sitio.
                </p>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Contraseña para tus keys (mín. 8)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repítela"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
                <div className="row">
                  <button className="secondary" disabled={password.length < 8 || !confirmation}>
                    Sincronizar mis keys
                  </button>
                  <button type="button" className="link" onClick={() => setCreatingPassword(false)}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="hint">En otro dispositivo tendrás que volver a pegarlas.</p>
                <button className="link" onClick={() => setCreatingPassword(true)}>
                  Sincronizar también mis API keys
                </button>
              </>
            ))}

          {keyState === 'synced' && (
            <button className="link" onClick={() => disableKeySync()}>
              Dejar de sincronizar mis API keys
            </button>
          )}

          {(keyState === 'needs-unlock' || keyState === 'needs-update') && (
            <form
              className="key-box"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => (keyState === 'needs-unlock' ? unlockKeys(password) : updateSyncedKeys(password)));
              }}
            >
              <p>
                {keyState === 'needs-unlock'
                  ? 'Tienes API keys guardadas desde otro dispositivo. Escribe la contraseña de tus keys para usarlas aquí.'
                  : 'Cambiaste tus API keys en este navegador. Escribe la contraseña de tus keys para actualizar la copia de tus otros dispositivos.'}
              </p>
              <div className="row">
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Contraseña de tus keys"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button className="secondary" disabled={busy || !password}>
                  {keyState === 'needs-unlock' ? 'Usar' : 'Actualizar'}
                </button>
              </div>
              <button type="button" className="link" onClick={forgotPassword}>
                ¿La olvidaste? Crea una nueva
              </button>
              {keyState === 'needs-unlock' && (
                <p className="hint">Si creas una nueva, primero pega tus API keys arriba, en Motor de IA.</p>
              )}
            </form>
          )}

          {message && <p className="error">{message}</p>}

          <div className="account">
            <p className="hint">
              Tu clave Nostr <code>{shortNpub(nostr.pubkey)}</code>
              {nostr.mode === 'extension' ? ', desde tu extensión.' : ', guardada en este navegador.'}
            </p>
            {nostr.mode === 'local' &&
              (nsecValue ? (
                <>
                  <code className="secret">{nsecValue}</code>
                  <p className="hint">
                    Esta es tu clave: guárdala en tu gestor de contraseñas y úsala para entrar en otro dispositivo.
                    Quien la tenga puede ver tu historial.
                  </p>
                </>
              ) : (
                <button className="link" onClick={() => setShowNsec(true)}>
                  Ver mi clave para entrar en otro dispositivo
                </button>
              ))}
            <button
              className="link muted-link"
              onClick={() => {
                const warning =
                  nostr.mode === 'local'
                    ? '¿Dejar de sincronizar este dispositivo? Si no guardaste tu clave, no podrás recuperar tus datos sincronizados. Lo guardado en este navegador se mantiene.'
                    : '¿Dejar de sincronizar este dispositivo? Lo guardado en este navegador se mantiene.';
                if (confirm(warning)) disconnect();
              }}
            >
              Dejar de sincronizar este dispositivo
            </button>
          </div>
        </>
      )}
    </div>
  );
}
