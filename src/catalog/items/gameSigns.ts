import * as THREE from 'three';
import { MINI_GAME_META, type MiniGameMeta } from '../../game/minigames/meta';
import { D, INK, Kit, LINE_THIN, M, sym } from '../kit';
import type { FurnitureDef } from '../types';

/**
 * One start sign per mini-game: a lit board on two posts with the game's icon and name. Standing
 * next to it in walk mode offers "▶ לשחק" (action `minigame`, variant = game id).
 */
const W = 1.7;
const H = 2.5;
const BOARD_H = 1.1;
const BOARD_Y = H - BOARD_H - 0.08;

const faces = new Map<string, THREE.Material>();
function faceMaterial(m: MiniGameMeta): THREE.Material {
  let mat = faces.get(m.id);
  if (mat) return mat;
  if (typeof document === 'undefined') {
    mat = M.paint(m.color);
  } else {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 320;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 320);
    grad.addColorStop(0, m.color);
    grad.addColorStop(1, '#1d1f24');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 320);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 9; i++) g.fillRect(i * 64 - 20, 0, 18, 320);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '120px system-ui, "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    g.fillText(m.icon, 256, 112);
    g.direction = 'rtl';
    g.fillStyle = '#ffffff';
    g.font = '700 58px system-ui, Arial, sans-serif';
    g.fillText(m.name, 256, 232);
    g.font = '500 30px system-ui, Arial, sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText('E – לשחק', 256, 288);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.35 });
  }
  faces.set(m.id, mat);
  return mat;
}

function sign(m: MiniGameMeta): FurnitureDef {
  return {
    id: `game-sign-${m.id}`,
    name: `שלט משחק – ${m.name}`,
    category: 'street',
    group: 'משחקי השכונה',
    tags: ['משחק', 'שלט', m.name],
    size: { w: W, d: 0.3, h: H },
    resize: false,
    colors: [{ key: 'frame', label: 'מסגרת', default: '#2b2d31' }],
    actions: [{ kind: 'minigame', variant: m.id, label: `${m.icon} לשחק · ${m.name}` }],
    build: ({ colors: c }) => {
      const k = new Kit();
      const frame = M.metal(c.frame, 0.45, 0.6);
      for (const x of [-W / 2 + 0.15, W / 2 - 0.15]) k.box(0.08, H, 0.08, frame, x, 0, 0);
      k.box(W, BOARD_H + 0.08, 0.1, frame, 0, BOARD_Y - 0.04, -0.01);
      k.box(W - 0.1, BOARD_H - 0.02, 0.012, faceMaterial(m), 0, BOARD_Y + 0.01, 0.046);
      // a little roof keeps the rain off and catches the light
      k.box(W, 0.05, 0.3, M.paint(m.color), 0, H - 0.05, 0);
      k.box(0.3, 0.06, 0.3, M.paint('#3a3d42'), -W / 2 + 0.15, 0, 0);
      k.box(0.3, 0.06, 0.3, M.paint('#3a3d42'), W / 2 - 0.15, 0, 0);
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        D.box(ctx, -W / 2, -0.15, W / 2, 0.15, 0.02, m.color, INK, LINE_THIN);
        D.line(ctx, -W / 2 + 0.1, 0.06, W / 2 - 0.1, 0.06, c.frame, 0.03);
      }),
  };
}

export const GAME_SIGNS: FurnitureDef[] = MINI_GAME_META.map(sign);
