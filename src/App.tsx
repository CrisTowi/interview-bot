import { useCallback, useState } from 'react';
import { SettingsMenu } from './components/SettingsMenu';
import { Home } from './screens/Home';
import { Interview } from './screens/Interview';
import { Summary } from './screens/Summary';
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

  return (
    <div className="app">
      <header className="topbar">
        {screen.name === 'interview' ? (
          <span className="brand">interview-bot</span>
        ) : (
          <button className="brand" onClick={home}>
            interview-bot
          </button>
        )}
        {screen.name !== 'interview' && (
          <SettingsMenu open={menuOpen} onToggle={() => setMenuOpen((o) => !o)} onClose={closeMenu} />
        )}
      </header>

      {screen.name === 'home' && (
        <Home
          onStart={() => setScreen({ name: 'interview' })}
          onOpenSettings={() => setMenuOpen(true)}
          onViewSummary={(existing) => setScreen({ name: 'summary', existing })}
        />
      )}
      {screen.name === 'interview' && <Interview onEnd={(transcript) => setScreen({ name: 'summary', transcript })} />}
      {screen.name === 'summary' && <Summary transcript={screen.transcript} existing={screen.existing} onHome={home} />}
    </div>
  );
}
