import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Character } from '../render3d/Character';
import {
  ACCESSORY_COLORS,
  ACCESSORY_OPTIONS,
  BODY_OPTIONS,
  BOTTOM_COLORS,
  BOTTOM_STYLE_OPTIONS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLE_OPTIONS,
  SHOE_COLORS,
  SKIN_TONES,
  TOP_COLORS,
  TOP_STYLE_OPTIONS,
  randomLook,
  type CharacterLook,
  type Option,
} from '../render3d/characterTypes';
import { accentFor } from '../render3d/character/materials';
import { specOf } from '../render3d/character/spec';
import './character-creator.css';

interface PreviewApi {
  setLook(look: CharacterLook): void;
  setWalking(on: boolean): void;
  setCloseUp(on: boolean): void;
  cheer(): void;
  dispose(): void;
}

/** A small self-contained 3D stage: the character on a soft-shadowed disc, slowly turning; drag to rotate. */
function createPreview(canvas: HTMLCanvasElement, look: CharacterLook): PreviewApi {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.6;

  const key = new THREE.DirectionalLight('#fff3e2', 2.4);
  key.position.set(-2.2, 4.2, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1.4;
  key.shadow.camera.right = 1.4;
  key.shadow.camera.top = 2.4;
  key.shadow.camera.bottom = -0.6;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 12;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 4;
  const rim = new THREE.DirectionalLight('#cfe4ff', 1.3);
  rim.position.set(2.5, 3, -3.5);
  scene.add(key, rim, new THREE.HemisphereLight('#fffaf2', '#c9bfae', 0.45));

  // the floor: a soft disc that only shows the shadow, over a gentle gradient
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f1ebe0', roughness: 0.95 }));
  disc.receiveShadow = true;
  scene.add(disc);

  const turntable = new THREE.Group();
  scene.add(turntable);
  const character = new Character(look);
  turntable.add(character.root);

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  let height = specOf(look.body).H;
  let closeUp = false;
  let walking = false;
  let zoom = 0; // 0 body … 1 face (eased)
  let yaw = 0.45;
  let spin = 0.35; // rad/s, eased back in after a drag
  let dragging = false;
  let lastX = 0;
  let idleFor = 0;
  let speed = 0;

  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
    idleFor = 0;
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  resize();

  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    idleFor += dt;
    // slow turn, paused while dragging and for a moment afterwards
    const wantSpin = dragging || idleFor < 1.6 ? 0 : walking ? 0.22 : 0.35;
    spin += (wantSpin - spin) * Math.min(1, dt * 3);
    yaw += spin * dt;
    turntable.rotation.y = yaw;
    speed += ((walking ? 1.5 : 0) - speed) * Math.min(1, dt * 4);
    character.update(dt, speed);
    // frame the whole body, or the head and shoulders
    zoom += ((closeUp ? 1 : 0) - zoom) * Math.min(1, dt * 5);
    const fov = THREE.MathUtils.degToRad(camera.fov / 2);
    const bodyView = { y: height * 0.52, span: height * 1.16 };
    const faceView = { y: height * 0.9, span: height * 0.34 };
    const y = THREE.MathUtils.lerp(bodyView.y, faceView.y, zoom);
    const span = THREE.MathUtils.lerp(bodyView.span, faceView.span, zoom);
    const dist = Math.max(span / 2 / Math.tan(fov), (span * 0.62) / 2 / (Math.tan(fov) * camera.aspect));
    camera.position.set(0, y + dist * 0.07, dist);
    camera.lookAt(0, y, 0);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    setLook(next) {
      character.setLook(next);
      height = character.stats.height;
    },
    setWalking(on) {
      walking = on;
    },
    setCloseUp(on) {
      closeUp = on;
    },
    cheer() {
      character.gesture('cheer');
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      character.dispose();
      disc.geometry.dispose();
      (disc.material as THREE.Material).dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}

function Pills<T extends string>({ options, value, onPick, disabled }: { options: Option<T>[]; value: T; onPick(id: T): void; disabled?: boolean }) {
  return (
    <div className="pills">
      {options.map((o) => (
        <button key={o.id} type="button" className={o.id === value ? 'active' : ''} disabled={disabled} aria-pressed={o.id === value} onClick={() => onPick(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Swatches({ colors, value, onPick, label, round }: { colors: string[]; value: string; onPick(c: string): void; label: string; round?: boolean }) {
  const custom = !colors.some((c) => c.toLowerCase() === value.toLowerCase());
  return (
    <div className={`palette cc-palette${round ? ' round' : ''}`} role="group" aria-label={label}>
      {colors.map((c) => (
        <button key={c} type="button" className={c.toLowerCase() === value.toLowerCase() ? 'active' : ''} style={{ background: c }} aria-label={`${label} ${c}`} onClick={() => onPick(c)} />
      ))}
      <label className={`custom-color${custom ? ' active' : ''}`} style={custom ? { background: value, borderStyle: 'solid' } : undefined} title="צבע אחר">
        {custom ? '' : '+'}
        <input type="color" value={value} onChange={(e) => onPick(e.target.value)} aria-label={`${label} – צבע אחר`} />
      </label>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="cc-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

/**
 * The avatar dialog: a live 3D preview next to all the appearance choices.
 * Every change is reported immediately through `onChange` (the caller stores it).
 */
export function CharacterCreator(props: { look: CharacterLook; onChange(look: CharacterLook): void; onClose(): void }) {
  const { look, onChange, onClose } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<PreviewApi | null>(null);
  const [walking, setWalking] = useState(false);
  const [closeUp, setCloseUp] = useState(false);
  const [noGl, setNoGl] = useState(false);
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      previewRef.current = createPreview(canvas, lookRef.current);
    } catch {
      setNoGl(true);
    }
    return () => {
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, []);
  useEffect(() => {
    previewRef.current?.setLook(look);
  }, [look]);
  useEffect(() => {
    previewRef.current?.setWalking(walking);
  }, [walking]);
  useEffect(() => {
    previewRef.current?.setCloseUp(closeUp);
  }, [closeUp]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (patch: Partial<CharacterLook>) => onChange({ ...look, ...patch });
  const dress = look.topStyle === 'dress';
  const hasAccent = look.accessory === 'cap' || look.accessory === 'backpack' || look.accessory === 'bow';
  const surprise = () => {
    onChange(randomLook());
    previewRef.current?.cheer();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal cc-modal" role="dialog" aria-label="הדמות שלי" dir="rtl">
        <header>
          <h2>הדמות שלי</h2>
          <button className="icon-btn" onClick={onClose} aria-label="סגירה">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="cc-body">
          <div className="cc-stage">
            <canvas ref={canvasRef} className="cc-canvas" aria-label="תצוגה מקדימה של הדמות – גררו כדי לסובב" />
            {noGl && <p className="note cc-nogl">אי אפשר להציג תצוגה תלת־ממדית בדפדפן הזה.</p>}
            <div className="cc-stage-tools pills">
              <button type="button" className={walking ? 'active' : ''} aria-pressed={walking} onClick={() => setWalking((w) => !w)}>
                הליכה
              </button>
              <button type="button" className={closeUp ? 'active' : ''} aria-pressed={closeUp} onClick={() => setCloseUp((c) => !c)}>
                תקריב
              </button>
            </div>
            <span className="cc-hint">גררו כדי לסובב</span>
          </div>
          <div className="cc-controls">
            <Section title="מי אני?">
              <Pills options={BODY_OPTIONS} value={look.body} onPick={(body) => set({ body })} />
            </Section>
            <Section title="גוון עור">
              <Swatches colors={SKIN_TONES} value={look.skin} onPick={(skin) => set({ skin })} label="גוון עור" round />
            </Section>
            <Section title="תסרוקת">
              <Pills options={HAIR_STYLE_OPTIONS} value={look.hairStyle} onPick={(hairStyle) => set({ hairStyle })} />
              <Swatches colors={HAIR_COLORS} value={look.hair} onPick={(hair) => set({ hair })} label="צבע שיער" />
            </Section>
            <Section title="עיניים">
              <Swatches colors={EYE_COLORS} value={look.eyes ?? EYE_COLORS[0]} onPick={(eyes) => set({ eyes })} label="צבע עיניים" round />
            </Section>
            <Section title="בגד עליון">
              <Pills options={TOP_STYLE_OPTIONS} value={look.topStyle} onPick={(topStyle) => set({ topStyle })} />
              <Swatches colors={TOP_COLORS} value={look.top} onPick={(top) => set({ top })} label="צבע הבגד העליון" />
            </Section>
            <Section title="בגד תחתון">
              <Pills options={BOTTOM_STYLE_OPTIONS} value={look.bottomStyle} onPick={(bottomStyle) => set({ bottomStyle })} disabled={dress} />
              {dress ? <p className="note cc-note">שמלה באה בלי בגד תחתון.</p> : <Swatches colors={BOTTOM_COLORS} value={look.bottom} onPick={(bottom) => set({ bottom })} label="צבע הבגד התחתון" />}
            </Section>
            <Section title="נעליים">
              <Swatches colors={SHOE_COLORS} value={look.shoes} onPick={(shoes) => set({ shoes })} label="צבע נעליים" />
            </Section>
            <Section title="אביזר">
              <Pills options={ACCESSORY_OPTIONS} value={look.accessory} onPick={(accessory) => set({ accessory })} />
              {hasAccent && <Swatches colors={ACCESSORY_COLORS} value={look.accessoryColor ?? accentFor(look)} onPick={(accessoryColor) => set({ accessoryColor })} label="צבע האביזר" />}
            </Section>
          </div>
        </div>
        <footer className="cc-footer row">
          <button type="button" className="btn" onClick={surprise}>
            ✨ הפתעה!
          </button>
          <button type="button" className="btn primary" onClick={onClose}>
            סיום
          </button>
        </footer>
      </div>
    </div>
  );
}
