import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { useStore } from './store/store';
import { useProgress } from './game/progress';
import { useWalk } from './store/walk';
import { audio } from './audio';
import { sound } from './audio/sound';
import './ui/styles.css';

// handy for debugging and automated checks
(window as unknown as { __store?: typeof useStore }).__store = useStore;
(window as unknown as { __progress?: typeof useProgress }).__progress = useProgress;
(window as unknown as { __walk?: typeof useWalk }).__walk = useWalk;

// browsers only allow sound after a user gesture: wake both engines on the first one
const unlockAudio = (): void => {
  audio.unlock();
  sound.unlock();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
