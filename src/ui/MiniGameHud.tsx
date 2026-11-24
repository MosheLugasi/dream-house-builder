import { MINI_GAME_META, miniGameMeta, type MiniGameId } from '../game/minigames/meta';
import { needsVenue } from '../game/minigames/install';
import { miniGame } from '../game/minigames/registry';
import { formatScore, useMiniGame } from '../game/minigames/store';
import type { Engine } from '../render3d/Engine';
import { Modal } from './Dialogs';

const engine = (): Engine | undefined => (window as unknown as { __engine?: Engine }).__engine;
const MEDALS = ['', '🥉', '🥈', '🥇'];
const MEDAL_NAMES = ['', 'ארד', 'כסף', 'זהב'];

function play(id: MiniGameId): void {
  const e = engine();
  if (e) e.playMiniGame(id);
}

/** The "🎮 משחקים" menu: every neighborhood game with its record. */
export function MiniGamesMenu() {
  const open = useMiniGame((s) => s.menuOpen);
  const records = useMiniGame((s) => s.records);
  if (!open) return null;
  const close = () => useMiniGame.getState().set({ menuOpen: false });
  return (
    <Modal title="🎮 משחקי השכונה" onClose={close} className="mg-menu-modal">
      <p className="note">בחרו משחק – אם עוד אין לו מקום בשכונה, נבנה אותו בשבילכם (ואפשר לבטל עם Ctrl+Z).</p>
      <div className="mg-grid">
        {MINI_GAME_META.map((m) => {
          const def = miniGame(m.id);
          const r = records[m.id];
          const build = needsVenue(m.id);
          return (
            <article key={m.id} className="mg-card" style={{ ['--mg' as string]: m.color }}>
              <div className="mg-card-icon">{m.icon}</div>
              <h3>{m.name}</h3>
              <p>{m.tagline}</p>
              <div className="mg-card-rec">
                {r?.medal ? <span title={`מדליית ${MEDAL_NAMES[r.medal]}`}>{MEDALS[r.medal]}</span> : null}
                {r?.best != null ? <span>שיא: {formatScore(r.best, def.medals.unit)}</span> : <span className="muted">עוד לא שיחקתם</span>}
              </div>
              <button className="btn primary" onClick={() => play(m.id)}>
                {build ? '🏗️ לבנות ולשחק' : '▶ לשחק'}
              </button>
            </article>
          );
        })}
      </div>
    </Modal>
  );
}

/** "How to play" card shown when the player presses E at a game's start sign. */
function IntroCard({ id }: { id: MiniGameId }) {
  const m = miniGameMeta(id);
  const def = miniGame(id);
  const r = useMiniGame((s) => s.records[id]);
  const close = () => useMiniGame.getState().set({ intro: null });
  return (
    <div className="mg-card-float" style={{ ['--mg' as string]: m.color }}>
      <div className="mg-float-head">
        <span className="mg-float-icon">{m.icon}</span>
        <div>
          <h3>{m.name}</h3>
          <p>{m.tagline}</p>
        </div>
      </div>
      <ul className="mg-howto">
        {def.howTo.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="mg-medals">
        {(['gold', 'silver', 'bronze'] as const).map((k, i) => (
          <span key={k}>
            {MEDALS[3 - i]} {formatScore(def.medals[k], def.medals.unit)}
          </span>
        ))}
        {r?.best != null && <span className="mg-best">השיא שלך: {formatScore(r.best, def.medals.unit)}</span>}
      </div>
      <div className="row">
        <button className="btn primary" onClick={() => play(id)}>
          ▶ להתחיל
        </button>
        <button className="btn" onClick={close}>
          לא עכשיו
        </button>
      </div>
    </div>
  );
}

function ResultCard() {
  const result = useMiniGame((s) => s.result);
  if (!result) return null;
  const m = miniGameMeta(result.id);
  const def = miniGame(result.id);
  const close = () => useMiniGame.getState().set({ result: null });
  const failed = result.completed === false;
  return (
    <div className="mg-result-backdrop">
      <div className="mg-result" style={{ ['--mg' as string]: m.color }}>
        <div className="mg-result-medal">{failed ? '⏱️' : result.medal ? MEDALS[result.medal] : '🎉'}</div>
        <h2>
          {m.icon} {m.name}
        </h2>
        {!failed && result.medal > 0 && <div className="mg-result-sub">מדליית {MEDAL_NAMES[result.medal]}!</div>}
        <div className="mg-result-score">{formatScore(result.score, def.medals.unit)}</div>
        {result.record && <div className="mg-record">🏆 שיא חדש!</div>}
        {result.detail && <p className="mg-result-detail">{result.detail}</p>}
        {result.stats?.length ? (
          <dl className="mg-stats">
            {result.stats.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {!result.record && result.best != null && <p className="note">השיא שלך: {formatScore(result.best, def.medals.unit)}</p>}
        <div className="row">
          <button
            className="btn primary"
            onClick={() => {
              close();
              play(result.id);
            }}
          >
            🔁 עוד פעם
          </button>
          <button
            className="btn"
            onClick={() => {
              close();
              useMiniGame.getState().set({ menuOpen: true });
            }}
          >
            🎮 משחקים
          </button>
          <button className="btn" onClick={close}>
            לשכונה
          </button>
        </div>
      </div>
    </div>
  );
}

/** Everything a running round shows on screen. */
export function MiniGameHud() {
  const active = useMiniGame((s) => s.active);
  const hud = useMiniGame((s) => s.hud);
  const popups = useMiniGame((s) => s.popups);
  const banner = useMiniGame((s) => s.banner);
  const countdown = useMiniGame((s) => s.countdown);
  const nav = useMiniGame((s) => s.nav);
  const intro = useMiniGame((s) => s.intro);
  const m = active ? miniGameMeta(active) : null;
  return (
    <>
      {m && (
        <div className="mg-hud" style={{ ['--mg' as string]: m.color }}>
          <div className="mg-hud-title">
            <span>{m.icon}</span> {m.name}
            <button className="mg-quit" title="יציאה מהמשחק (Esc)" onClick={() => engine()?.games.stop()}>
              ✕
            </button>
          </div>
          <div className="mg-hud-main">
            {hud.timer != null && <div className="mg-timer">⏱ {formatScore(Math.max(0, hud.timer), 'seconds')}</div>}
            {hud.score != null && (
              <div className="mg-score">
                <strong>{typeof hud.score === 'number' ? Math.round(hud.score).toLocaleString('he-IL') : hud.score}</strong>
                {hud.scoreLabel && <small>{hud.scoreLabel}</small>}
              </div>
            )}
          </div>
          {hud.lines?.map((l) => (
            <div key={l} className="mg-line">
              {l}
            </div>
          ))}
          {hud.bar && (
            <div className="mg-bar">
              {hud.bar.label && <span>{hud.bar.label}</span>}
              <i>
                <b
                  style={{
                    width: `${Math.max(0, Math.min(1, hud.bar.value)) * 100}%`,
                    background: hud.bar.danger != null && hud.bar.value >= hud.bar.danger ? '#e0402f' : hud.bar.color ?? 'var(--mg)',
                  }}
                />
              </i>
            </div>
          )}
        </div>
      )}
      {m && hud.combo && <div className="mg-combo">{hud.combo}</div>}
      {m && nav && (
        <div className="mg-nav">
          <span className="mg-nav-arrow" style={{ transform: `rotate(${nav.angle}rad)` }}>
            ⬆
          </span>
          <span>
            {nav.label ? `${nav.label} · ` : ''}
            {nav.meters} מ'
          </span>
        </div>
      )}
      {m && hud.hint && <div className="mg-hint">{hud.hint}</div>}
      <div className="mg-popups">
        {popups.map((p) => (
          <div key={p.id} className="mg-popup" style={p.color ? { color: p.color } : undefined}>
            {p.text}
          </div>
        ))}
      </div>
      {banner && (
        <div key={banner.id} className="mg-banner">
          {banner.text}
        </div>
      )}
      {countdown && (
        <div key={countdown} className="mg-countdown">
          {countdown}
        </div>
      )}
      {intro && !active && <IntroCard id={intro} />}
      <ResultCard />
      <MiniGamesMenu />
    </>
  );
}

/** The 🎮 button (walk HUD and top bar). */
export function MiniGamesButton({ className = 'chip', compact = false }: { className?: string; compact?: boolean }) {
  return (
    <button className={className} onClick={() => useMiniGame.getState().set({ menuOpen: true })} title="משחקי השכונה">
      🎮{compact ? '' : ' משחקים'}
    </button>
  );
}
