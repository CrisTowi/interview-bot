import { useCallback, useEffect, useRef, useState } from 'react';
import { LangSwitch } from './components/LangSwitch';
import { ProfileMenu } from './components/ProfileCard';
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
  const [menu, setMenu] = useState<'profile' | 'settings' | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const toggle = (name: 'profile' | 'settings') => () => setMenu((m) => (m === name ? null : name));
  const home = () => setScreen({ name: 'home' });

  // On every screen change after the first, move focus to the new screen (its <main>), so keyboard and
  // screen-reader users aren't left on a button that no longer exists.
  const firstScreen = useRef(true);
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    document.querySelector<HTMLElement>('main')?.focus();
  }, [screen]);

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
            <span className="brand-name">{APP_NAME}</span>
          </button>
          <div className="topbar-actions">
            <ProfileMenu
              open={menu === 'profile'}
              onToggle={toggle('profile')}
              onClose={closeMenu}
              onOpenSettings={() => setMenu('settings')}
            />
            <SettingsMenu open={menu === 'settings'} onToggle={toggle('settings')} onClose={closeMenu} />
            {/* Last, so changing language (and label widths) never moves it under the pointer. */}
            <LangSwitch />
          </div>
        </header>
      )}

      {screen.name === 'home' && (
        <Home
          onStart={() => setScreen({ name: 'interview' })}
          onOpenSettings={() => setMenu('settings')}
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
