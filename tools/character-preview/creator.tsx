/**
 * Test page for the character creator dialog: /tools/character-preview/creator.html
 *   ?walk=1  ?close=1  ?seed=3 (start from a random look)  ?body=man …
 * `window.__done` is set once the preview has rendered a few frames; `window.__look` is the current look.
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/src/ui/styles.css';
import { CharacterCreator } from '/src/ui/CharacterCreator.tsx';
import { DEFAULT_LOOK, randomLook, type CharacterLook } from '/src/render3d/characterTypes.ts';

const q = new URLSearchParams(location.search);

function App() {
  const [look, setLook] = useState<CharacterLook>(() => {
    const base = q.get('seed') ? randomLook(Number(q.get('seed'))) : { ...DEFAULT_LOOK };
    for (const [k, v] of q) if (k in base) (base as unknown as Record<string, string>)[k] = v;
    return base;
  });
  const [open, setOpen] = useState(true);
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__look = look;
  }, [look]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.get('walk')) (document.querySelector('.cc-stage-tools button') as HTMLButtonElement | null)?.click();
      if (q.get('close')) (document.querySelectorAll('.cc-stage-tools button')[1] as HTMLButtonElement | null)?.click();
      setTimeout(() => ((window as unknown as Record<string, unknown>).__done = true), 1800);
    }, 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ padding: 24 }}>
      <button className="btn" style={{ flex: 'none' }} onClick={() => setOpen(true)}>
        לפתוח את עיצוב הדמות
      </button>
      {open && <CharacterCreator look={look} onChange={setLook} onClose={() => setOpen(false)} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
