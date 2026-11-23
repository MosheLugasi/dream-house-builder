import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { useStore } from './store/store';
import { useProgress } from './game/progress';
import './ui/styles.css';

// handy for debugging and automated checks
(window as unknown as { __store?: typeof useStore }).__store = useStore;
(window as unknown as { __progress?: typeof useProgress }).__progress = useProgress;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
