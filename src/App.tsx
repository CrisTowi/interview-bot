import { useCallback, useEffect, useState } from 'react';
import { SettingsMenu } from './components/SettingsMenu';
import { Home } from './screens/Home';
import { Interview } from './screens/Interview';
import { Summary } from './screens/Summary';
import { APP_NAME } from './lib/title';
import { startSync } from './sync/nostrSync';
import type { ChatMessage, SessionSummary } from './types';

type Screen =
  | { name: 'home' }
  | { name: 'interview' }
  | { name: 'summary'; transcript?: ChatMessage[]; existing?: SessionSummary };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const home = () => setScreen({ name: 'home' });

  // Pull the encrypted copy from Nostr relays (if an identity is connected) and keep it in sync.
  useEffect(() => {
    startSync();
  }, []);

  return (
    <div className={screen.name === 'interview' ? 'app in-call' : 'app'}>
      {/* The call takes the whole screen, like a real video call. */}
      {screen.name !== 'interview' && (
        <header className="topbar">
          <button className="brand" onClick={home}>
            <img src="/favicon.svg" alt="" width={30} height={30} />
            {APP_NAME}
          </button>
          <SettingsMenu open={menuOpen} onToggle={() => setMenuOpen((o) => !o)} onClose={closeMenu} />
        </header>
      )}

      {screen.name === 'home' && (
        <Home
          onStart={() => setScreen({ name: 'interview' })}
          onOpenSettings={() => setMenuOpen(true)}
          onViewSummary={(existing) => setScreen({ name: 'summary', existing })}
        />
      )}
      {screen.name === 'interview' && <Interview onEnd={(transcript) => setScreen({ name: 'summary', transcript })} />}
      {screen.name === 'summary' && (
        <Summary
          transcript={screen.transcript}
          existing={screen.existing}
          onHome={home}
          onRetry={() => setScreen({ name: 'interview' })}
        />
      )}
    </div>
  );
}
