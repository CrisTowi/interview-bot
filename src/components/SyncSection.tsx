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
import { useT } from '../i18n';
import { useApp } from '../store';

/** How API keys stand on this device, which decides what (if anything) we ask for. */
type KeyState = 'off' | 'synced' | 'needs-unlock' | 'needs-update';

function HowItWorks() {
  const t = useT();
  return (
    <details className="how">
      <summary>{t.sync.howTitle}</summary>
      <ul>
        {t.sync.how.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </details>
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

/** Where synced data stands on this device: drives both the overview row and this section. */
export function useSyncOverview() {
  const nostr = useApp((s) => s.nostr);
  const cloudKey = useApp((s) => s.settings.cloud.apiKey);
  const ttsKey = useApp((s) => s.settings.premiumTts.apiKey);
  const { status, vaultLocked } = useSync();
  const t = useT();
  const [localFingerprint, setLocalFingerprint] = useState<string | null>(null);

  useEffect(() => {
    fingerprint({ cloud: cloudKey, tts: ttsKey }).then(setLocalFingerprint);
  }, [cloudKey, ttsKey]);

  let keyState: KeyState;
  if (!nostr.syncKeys) keyState = 'off';
  else if (!vaultLocked) keyState = 'synced';
  else if (!cloudKey && !ttsKey) keyState = 'needs-unlock';
  else keyState = localFingerprint && localFingerprint === nostr.keysFingerprint ? 'synced' : 'needs-update';

  let summary: { text: string; tone: string };
  if (nostr.mode === 'none') summary = { text: t.sync.summaryOff, tone: '' };
  else if (status === 'error') summary = { text: t.sync.summaryError, tone: 'warn' };
  else if (status !== 'synced') summary = { text: t.sync.summarySyncing, tone: '' };
  else
    summary = {
      synced: { text: t.sync.summarySynced, tone: 'ok' },
      off: { text: t.sync.summaryKeysLocal, tone: 'ok' },
      'needs-unlock': { text: t.sync.summaryNeedsUnlock, tone: 'warn' },
      'needs-update': { text: t.sync.summaryNeedsUpdate, tone: 'warn' },
    }[keyState];

  return { keyState, summary, needsAttention: summary.tone === 'warn' };
}

export function SyncSection() {
  const nostr = useApp((s) => s.nostr);
  const { status, error } = useSync();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [nsec, setNsec] = useState('');
  const [showNsec, setShowNsec] = useState(false);
  const [creatingPassword, setCreatingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const { keyState, summary } = useSyncOverview();

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
        <p className="sync-summary">
          <span className={`dot ${summary.tone}`} />
          {summary.text}
        </p>
        <p className="sync-lead">{t.sync.lead}</p>
        <HowItWorks />
        {hasExtension() && (
          <button className="secondary" disabled={busy} onClick={() => run(connectExtension)}>
            {t.sync.connectExtension}
          </button>
        )}
        <button className="secondary" disabled={busy} onClick={() => run(createLocalIdentity)}>
          {t.sync.createKey}
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
              aria-label={t.sync.haveKey}
              value={nsec}
              onChange={(e) => setNsec(e.target.value)}
            />
            <button className="secondary" disabled={busy || !nsec.trim()}>
              {t.sync.enter}
            </button>
          </form>
        ) : (
          <button className="link" onClick={() => setImporting(true)}>
            {t.sync.haveKey}
          </button>
        )}
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
      </div>
    );
  }

  const keyDetail = t.sync.keyDetail[keyState];

  function forgotPassword() {
    disableKeySync();
    setCreatingPassword(true);
    setMessage('');
  }

  function submitNewPassword(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmation) return setMessage(t.sync.passwordsMismatch);
    run(() => {
      enableKeySync(password);
      setCreatingPassword(false);
    });
  }

  const nsecValue = showNsec ? exportNsec() : null;

  return (
    <div className="menu-group">
      <p className="sync-summary">
        <span className={`dot ${summary.tone}`} />
        {summary.text}
      </p>
      {status === 'error' && (
        <p className="error">
          {error}{' '}
          <button className="link" onClick={() => startSync()}>
            {t.common.retry}
          </button>
        </p>
      )}

      <ul className="sync-list" aria-label={t.sync.whatSyncs}>
        <SyncedItem on>{t.sync.itemProfile}</SyncedItem>
        <SyncedItem on>{t.sync.itemHistory}</SyncedItem>
        <SyncedItem on={keyState === 'synced'} detail={keyDetail}>
          {t.sync.itemKeys}
        </SyncedItem>
      </ul>

      {keyState === 'off' &&
        (creatingPassword ? (
          <form className="key-box" onSubmit={submitNewPassword}>
            <p>{t.sync.keyBoxIntro}</p>
            <input
              type="password"
              autoComplete="new-password"
              placeholder={t.sync.newPassword}
              aria-label={t.sync.newPassword}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder={t.sync.repeatPassword}
              aria-label={t.sync.repeatPassword}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
            <div className="row">
              <button className="secondary" disabled={password.length < 8 || !confirmation}>
                {t.sync.syncMyKeys}
              </button>
              <button type="button" className="link" onClick={() => setCreatingPassword(false)}>
                {t.common.cancel}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="hint">{t.sync.repasteElsewhere}</p>
            <button className="link" onClick={() => setCreatingPassword(true)}>
              {t.sync.alsoSyncKeys}
            </button>
          </>
        ))}

      {keyState === 'synced' && (
        <button className="link" onClick={() => disableKeySync()}>
          {t.sync.stopSyncKeys}
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
          <p>{keyState === 'needs-unlock' ? t.sync.needsUnlockText : t.sync.needsUpdateText}</p>
          <div className="row">
            <input
              type="password"
              autoComplete="current-password"
              placeholder={t.sync.currentPassword}
              aria-label={t.sync.currentPassword}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="secondary" disabled={busy || !password}>
              {keyState === 'needs-unlock' ? t.sync.use : t.sync.update}
            </button>
          </div>
          <button type="button" className="link" onClick={forgotPassword}>
            {t.sync.forgot}
          </button>
          {keyState === 'needs-unlock' && <p className="hint">{t.sync.pasteFirst}</p>}
        </form>
      )}

      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}

      <div className="account">
        <p className="hint">
          {t.sync.yourKey} <code>{shortNpub(nostr.pubkey)}</code>
          {nostr.mode === 'extension' ? t.sync.fromExtension : t.sync.inBrowser}
        </p>
        {nostr.mode === 'local' &&
          (nsecValue ? (
            <>
              <code className="secret">{nsecValue}</code>
              <p className="hint">{t.sync.nsecWarning}</p>
            </>
          ) : (
            <button className="link" onClick={() => setShowNsec(true)}>
              {t.sync.showNsec}
            </button>
          ))}
        <button
          className="link muted-link"
          onClick={() => {
            const warning = nostr.mode === 'local' ? t.sync.confirmStopLocal : t.sync.confirmStopExtension;
            if (confirm(warning)) disconnect();
          }}
        >
          {t.sync.stopDevice}
        </button>
      </div>
    </div>
  );
}
