import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { audio } from '../audio';
import { CHALLENGES, report, useProgress } from '../game/progress';
import type { Engine } from '../render3d/Engine';
import type { CharacterLook } from '../render3d/characterTypes';
import { useStore } from '../store/store';
import { Icon } from './icons';

const engine = (): Engine | undefined => (window as unknown as { __engine?: Engine }).__engine;

// The character creator is a separate chunk (it brings its own little 3D preview).
type CreatorProps = { look: CharacterLook; onChange(look: CharacterLook): void; onClose(): void };
const creatorModules = import.meta.glob<{ CharacterCreator: ComponentType<CreatorProps> }>('./CharacterCreator.tsx');
const loadCreator = creatorModules['./CharacterCreator.tsx'];
const Creator = loadCreator ? lazy(() => loadCreator().then((m) => ({ default: m.CharacterCreator }))) : null;

/** "Challenge completed" toast and short floating messages. */
export function Toasts() {
  const toast = useProgress((s) => s.toast);
  const flash = useProgress((s) => s.flash);
  const dismiss = useProgress((s) => s.dismissToast);
  const setFlash = useProgress((s) => s.setFlash);
  useEffect(() => {
    if (!toast) return;
    audio.play('success');
    const t = setTimeout(dismiss, 4500);
    return () => clearTimeout(t);
  }, [toast, dismiss]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 2200);
    return () => clearTimeout(t);
  }, [flash, setFlash]);
  return (
    <>
      {flash && <div className="flash-message">{flash}</div>}
      {toast && (
        <div className="challenge-toast" role="status" onClick={dismiss}>
          <span className="sticker">{toast.icon}</span>
          <span>
            <small>אתגר הושלם!</small>
            <strong>{toast.title}</strong>
          </span>
        </div>
      )}
    </>
  );
}

export function ChallengesDialog({ onClose }: { onClose: () => void }) {
  const done = useProgress((s) => s.done);
  const counters = useProgress((s) => s.counters);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide-modal" role="dialog" aria-label="אתגרים">
        <header>
          <h2>
            אלבום המדבקות · {done.length}/{CHALLENGES.length}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="סגירה">
            <Icon name="close" />
          </button>
        </header>
        <p className="note">אין שעון ואין ניקוד – אלו רק רעיונות למה אפשר לעשות. כל אתגר שמשלימים מוסיף מדבקה לאלבום.</p>
        {(['build', 'play'] as const).map((group) => (
          <section key={group}>
            <h4>{group === 'build' ? 'בונים ומעצבים' : 'מטיילים ומשחקים'}</h4>
            <div className="sticker-grid">
              {CHALLENGES.filter((c) => c.group === group).map((c) => {
                const got = done.includes(c.id);
                const value = Math.min(c.goal, Math.floor(counters[c.event] ?? 0));
                return (
                  <div key={c.id} className={`sticker-card ${got ? 'done' : ''}`}>
                    <span className="sticker">{got ? c.icon : '?'}</span>
                    <strong>{c.title}</strong>
                    <small>{c.hint}</small>
                    {!got && c.goal > 1 && (
                      <span className="bar">
                        <i style={{ width: `${(value / c.goal) * 100}%` }} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Opens the character creator and stores the result. */
export function AvatarDialog({ onClose }: { onClose: () => void }) {
  const look = useProgress((s) => s.look);
  const setLook = useProgress((s) => s.setLook);
  const [changed, setChanged] = useState(false);
  if (!Creator) return null;
  return (
    <Suspense fallback={null}>
      <Creator
        look={look}
        onChange={(next) => {
          setLook(next);
          setChanged(true);
        }}
        onClose={() => {
          if (changed) report('avatar-changed');
          onClose();
        }}
      />
    </Suspense>
  );
}
export const hasAvatarCreator = !!Creator;

/** Buttons and read-outs on top of the 3D view while walking around. */
export function WalkHud({ onAvatar }: { onAvatar: () => void }) {
  const projectId = useStore((s) => s.project.id);
  const sleeping = useStore((s) => s.sleeping);
  const found = useProgress((s) => s.stars[projectId]?.length ?? 0);
  const [info, setInfo] = useState({ total: 0, speed: -1 });
  const [muted, setMuted] = useState(audio.muted);
  const [shutter, setShutter] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      const e = engine();
      if (!e) return;
      const speed = e.walk.driving ? Math.abs(e.walk.vehicleSpeed) * 3.6 : -1;
      const total = e.starCount().total;
      setInfo((prev) => (prev.total === total && Math.round(prev.speed) === Math.round(speed) ? prev : { total, speed }));
    }, 250);
    return () => clearInterval(t);
  }, []);

  const photo = () => {
    const e = engine();
    if (!e) return;
    const url = e.capture();
    const a = document.createElement('a');
    a.href = url;
    a.download = `בונים-חלום-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    audio.play('camera');
    report('photo-taken');
    setShutter(true);
    setTimeout(() => setShutter(false), 350);
  };

  return (
    <>
      <div className="walk-tools">
        {info.total > 0 && (
          <span className="chip star-count" title="כוכבים שנאספו בשכונה הזאת">
            ⭐ {Math.min(found, info.total)}/{info.total}
          </span>
        )}
        <button className="chip" onClick={photo} title="צילום תמונה">
          📷 צילום
        </button>
        {hasAvatarCreator && (
          <button className="chip" onClick={onAvatar} title="עיצוב הדמות">
            👤 הדמות שלי
          </button>
        )}
        <button
          className="chip"
          title={muted ? 'הפעלת הצליל' : 'השתקה'}
          onClick={() => {
            audio.unlock();
            audio.muted = !audio.muted;
            setMuted(audio.muted);
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
      {info.speed >= 0 && (
        <div className="speedometer">
          <strong>{Math.round(info.speed)}</strong>
          <small>קמ"ש</small>
        </div>
      )}
      <div className={`sleep-fade ${sleeping ? 'on' : ''}`}>{sleeping && <span>לילה טוב… 😴</span>}</div>
      {shutter && <div className="shutter" />}
    </>
  );
}
