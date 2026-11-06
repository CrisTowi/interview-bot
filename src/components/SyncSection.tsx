import { useState } from 'react';
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
  useSync,
} from '../sync/nostrSync';
import { hasExtension } from '../sync/signer';
import { useApp } from '../store';

const STATUS_TEXT = {
  off: 'Desconectado',
  connecting: 'Conectando…',
  syncing: 'Sincronizando…',
  synced: 'Sincronizado',
  error: 'Error',
};

export function SyncSection() {
  const nostr = useApp((s) => s.nostr);
  const { status, error, vaultLocked } = useSync();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [nsec, setNsec] = useState('');
  const [showNsec, setShowNsec] = useState(false);
  const [wantKeys, setWantKeys] = useState(false);
  const [passphrase, setPassphrase] = useState('');

  async function run(action: () => unknown) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      setNsec('');
      setPassphrase('');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (nostr.mode === 'none') {
    return (
      <div className="menu-group">
        <span className="menu-label">Sincronizar entre dispositivos</span>
        <p className="hint">
          Tu perfil e historial se cifran en este navegador (NIP-44) y se guardan en relays de Nostr. Solo tú puedes leerlos.
        </p>
        {hasExtension() && (
          <button className="secondary" disabled={busy} onClick={() => run(connectExtension)}>
            Conectar con mi extensión Nostr
          </button>
        )}
        <button className="secondary" disabled={busy} onClick={() => run(createLocalIdentity)}>
          Crear identidad nueva
        </button>
        {importing ? (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => importNsec(nsec));
            }}
          >
            <input type="password" autoComplete="off" placeholder="nsec1…" value={nsec} onChange={(e) => setNsec(e.target.value)} />
            <button className="secondary" disabled={busy || !nsec.trim()}>
              Usar
            </button>
          </form>
        ) : (
          <button className="link" onClick={() => setImporting(true)}>
            Ya tengo una clave privada (nsec)
          </button>
        )}
        {message && <p className="error">{message}</p>}
      </div>
    );
  }

  const nsecValue = showNsec ? exportNsec() : null;

  return (
    <div className="menu-group">
      <span className="menu-label">Sincronizar entre dispositivos</span>
      <p className="sync-status">
        <span className={`dot ${status === 'synced' ? 'ok' : status === 'error' ? 'warn' : ''}`} />
        <span>
          {STATUS_TEXT[status]}
          {status === 'error' && error ? `: ${error}` : ''}
        </span>
        {status === 'error' && (
          <button className="link" onClick={() => startSync()}>
            Reintentar
          </button>
        )}
      </p>
      <p className="hint">
        {nostr.mode === 'extension' ? 'Con tu extensión' : 'Clave guardada en este navegador'}: <code>{shortNpub(nostr.pubkey)}</code>
      </p>

      {nostr.mode === 'local' &&
        (nsecValue ? (
          <>
            <code className="secret">{nsecValue}</code>
            <p className="hint">
              Guárdala en tu gestor de contraseñas. Pégala en otro dispositivo para recuperar tus datos. Quien la tenga puede leerlos.
            </p>
          </>
        ) : (
          <button className="link" onClick={() => setShowNsec(true)}>
            Mostrar mi clave privada para usarla en otro dispositivo
          </button>
        ))}

      <label className="check">
        <input
          type="checkbox"
          checked={nostr.syncKeys || wantKeys}
          onChange={(e) => {
            if (e.target.checked) return setWantKeys(true);
            setWantKeys(false);
            if (nostr.syncKeys) disableKeySync();
          }}
        />
        Sincronizar también mis API keys
      </label>

      {wantKeys && !nostr.syncKeys && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => {
              enableKeySync(passphrase);
              setWantKeys(false);
            });
          }}
        >
          <div className="row">
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Frase de paso (mín. 8 caracteres)"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <button className="secondary" disabled={passphrase.length < 8}>
              Activar
            </button>
          </div>
          <p className="hint">
            Las keys se cifran otra vez con esta frase, así que tu clave de Nostr sola no basta para leerlas. La frase no se guarda;
            si la olvidas, solo tendrás que volver a pegar tus keys.
          </p>
        </form>
      )}

      {nostr.syncKeys && vaultLocked && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => unlockKeys(passphrase));
          }}
        >
          <div className="row">
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Frase de paso"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <button className="secondary" disabled={busy || !passphrase}>
              Desbloquear
            </button>
          </div>
          <p className="hint">Escribe tu frase para leer o actualizar las keys sincronizadas en este navegador.</p>
        </form>
      )}

      {message && <p className="error">{message}</p>}

      <button
        className="link"
        onClick={() => {
          const warning =
            nostr.mode === 'local'
              ? '¿Desconectar? Si no guardaste tu clave privada, perderás el acceso a tus datos sincronizados. Lo guardado en este navegador se mantiene.'
              : '¿Desconectar? Lo guardado en este navegador se mantiene.';
          if (confirm(warning)) disconnect();
        }}
      >
        Desconectar
      </button>
    </div>
  );
}
