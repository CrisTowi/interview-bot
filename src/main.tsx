import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// No StrictMode: its double-mounted effects would start every interview twice (and bill the user's key twice).
createRoot(document.getElementById('root')!).render(<App />);
