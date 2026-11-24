import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { HdriEnvironment } from './render/HdriEnvironment';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const DEG = Math.PI / 180;

interface Palette {
  zenith: THREE.Color;
  horizon: THREE.Color;
  ground: THREE.Color;
  fog: THREE.Color;
}
const pal = (zenith: string, horizon: string, ground: string, fog: string): Palette => ({
  zenith: new THREE.Color(zenith),
  horizon: new THREE.Color(horizon),
  ground: new THREE.Color(ground),
  fog: new THREE.Color(fog),
});
// linear-ish working colors of the image-based light for three moments of the day
const DAY = pal('#bcc8e2', '#f8f5ef', '#b5ac9a', '#cfdde8');
const DUSK = pal('#7f86b8', '#ffb07a', '#7a6455', '#e2b79a');
const NIGHT = pal('#0b0f1f', '#1a2036', '#0a0a0e', '#0a0f1c');

/**
 * Sky, sun / moon and ambient light for a time of day.
 * Plan north is -Z: the sun rises in the east (+X), stands in the south (+Z) at noon and sets in the west.
 */
export class Atmosphere {
  readonly sun = new THREE.DirectionalLight('#fff1dc', 3.1);
  /** unit vector pointing from the scene TO the main light (sun by day, moon by night) */
  readonly lightDir = new THREE.Vector3(0, 1, 0);
  /** 0 = full day … 1 = full night */
  night = 0;
  /** 0 = sun below the horizon … 1 = sun high: how much daylight comes in through a window */
  daylight = 1;
  /** tone-mapping exposure for this time of day (the renderer may adapt it further, e.g. indoors) */
  exposure = 0.82;
  /** average colour of the sky dome (linear, for light coming in through windows) */
  readonly skyColor = new THREE.Color();
  hours = -1;
  private sky = new Sky();
  private hemi = new THREE.HemisphereLight('#fff9f0', '#b3a78f', 0.35);
  private stars: THREE.Points;
  private moon: THREE.Sprite;
  private sunDir = new THREE.Vector3();
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envUniforms = {
    sunDir: { value: new THREE.Vector3() },
    zenith: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    ground: { value: new THREE.Color() },
    glow: { value: 1 },
  };
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envHours = -99;
  private envCooldown = 0;
  private fog: THREE.Fog;
  /** photographed skies for the image-based light (once loaded; see render/HdriEnvironment.ts) */
  readonly hdri: HdriEnvironment;
  /**
   * Light the scene with the photographed skies (loaded on first use) instead of the procedural
   * gradient dome. Off: see render/HdriEnvironment.ts.
   */
  useHdri = false;
  private envFromHdri = false;
  /** how much of the photographed skies' own colour is kept (the rest follows the procedural palette) */
  hdriOwnColor = 0.35;
  private skyIrr = new THREE.Color();
  /** day / dusk / night shares of the current time */
  private moment: [number, number, number] = [1, 0, 0];

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
  ) {
    this.sky.scale.setScalar(1000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 3;
    u.rayleigh.value = 0.9;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.85;
    u.cloudCoverage.value = 0.38;
    u.cloudDensity.value = 0.45;
    scene.add(this.sky);

    // stars
    const n = 1800;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < n; i++) {
      const y = rnd() * 0.98 + 0.02;
      const r = Math.sqrt(1 - y * y);
      const a = rnd() * Math.PI * 2;
      pos.set([Math.cos(a) * r * 880, y * 880, Math.sin(a) * r * 880], i * 3);
      const b = 0.45 + rnd() * rnd() * 1.6;
      const warm = rnd();
      col.set([b * (0.9 + warm * 0.1), b * 0.92, b * (1.0 - warm * 0.15)], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -5;
    scene.add(this.stars);

    // moon
    const mc = document.createElement('canvas');
    mc.width = mc.height = 128;
    const m2 = mc.getContext('2d')!;
    const halo = m2.createRadialGradient(64, 64, 20, 64, 64, 64);
    halo.addColorStop(0, 'rgba(235,240,255,1)');
    halo.addColorStop(0.42, 'rgba(225,232,255,1)');
    halo.addColorStop(0.5, 'rgba(160,180,230,0.28)');
    halo.addColorStop(1, 'rgba(120,150,220,0)');
    m2.fillStyle = halo;
    m2.fillRect(0, 0, 128, 128);
    m2.fillStyle = 'rgba(150,160,190,0.35)';
    for (const [x, y, r] of [[52, 54, 7], [74, 70, 9], [66, 46, 4], [56, 78, 5]]) {
      m2.beginPath();
      m2.arc(x, y, r, 0, Math.PI * 2);
      m2.fill();
    }
    this.moon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), transparent: true, opacity: 0, depthWrite: false, fog: false, color: new THREE.Color(2.2, 2.2, 2.4) }),
    );
    this.moon.scale.setScalar(110);
    this.moon.renderOrder = -4;
    scene.add(this.moon);

    // lights
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun, this.sun.target, this.hemi);

    // image based lighting: a soft gradient dome, re-rendered when the time changes
    this.pmrem = new THREE.PMREMGenerator(renderer);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(50, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: this.envUniforms,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec3 vDir; uniform vec3 sunDir; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform float glow;
          void main(){
            vec3 d = normalize(vDir);
            vec3 col = d.y > 0.0 ? mix(horizon, zenith, pow(d.y, 0.55)) : mix(horizon * 0.75, ground, pow(-d.y, 0.35));
            float s = max(dot(d, sunDir), 0.0);
            col += vec3(1.0, 0.9, 0.74) * (pow(s, 90.0) * 5.0 + pow(s, 6.0) * 0.3) * glow;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    this.envScene.add(dome);
    this.hdri = new HdriEnvironment(renderer);
    this.hdri.onReady = () => {
      this.envHours = -99;
      this.envCooldown = 0;
    };
    this.fog = new THREE.Fog('#cfdde8', 160, 620);
    scene.fog = this.fog;
    scene.environmentIntensity = 0.75;
  }

  /** Sun direction for an hour of the day (0…24). */
  static sunDirection(hours: number, out = new THREE.Vector3()): THREE.Vector3 {
    const elev = 62 * DEG * Math.sin((Math.PI * (hours - 6)) / 12);
    const az = ((12 - hours) / 6) * 90 * DEG; // from south (+Z) towards east (+X)
    return out.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)).normalize();
  }

  setTime(hours: number): void {
    hours = ((hours % 24) + 24) % 24;
    if (Math.abs(hours - this.hours) < 1e-4) return;
    this.hours = hours;
    Atmosphere.sunDirection(hours, this.sunDir);
    const elev = Math.asin(this.sunDir.y) / DEG;
    const day = smooth(0, 18, elev);
    const night = smooth(3, -7, elev);
    const dusk = Math.max(0, 1 - day - night);
    this.night = night;
    this.moment = [day, dusk, night];

    // sky dome
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    (this.stars.material as THREE.PointsMaterial).opacity = night * 0.95;
    this.stars.visible = night > 0.01;
    this.moon.material.opacity = night;
    this.moon.visible = night > 0.01;

    // main light: the sun, handing over to the moon after dusk
    const sunI = 3.1 * smooth(-1.5, 10, elev);
    const moonI = 0.34 * night;
    if (sunI >= moonI) {
      this.lightDir.copy(this.sunDir);
      this.sun.color.set('#ff8f4d').lerp(new THREE.Color('#fff1dc'), smooth(0, 22, elev));
      this.sun.intensity = sunI;
    } else {
      this.lightDir.set(-this.sunDir.x * 0.6, Math.max(0.45, -this.sunDir.y), -this.sunDir.z * 0.6 - 0.35).normalize();
      this.sun.color.set('#8fa8e8');
      this.sun.intensity = moonI;
    }
    this.moon.position.copy(this.lightDir).multiplyScalar(850);

    this.hemi.intensity = 0.35 * day + 0.2 * dusk + 0.07 * night;
    this.hemi.color.set('#fff9f0').lerp(new THREE.Color('#7f8fc8'), night);
    this.hemi.groundColor.set('#b3a78f').lerp(new THREE.Color('#1c1d28'), night);

    const mix = (k: keyof Palette, target: THREE.Color) =>
      target.setRGB(
        DAY[k].r * day + DUSK[k].r * dusk + NIGHT[k].r * night,
        DAY[k].g * day + DUSK[k].g * dusk + NIGHT[k].g * night,
        DAY[k].b * day + DUSK[k].b * dusk + NIGHT[k].b * night,
      );
    mix('zenith', this.envUniforms.zenith.value);
    mix('horizon', this.envUniforms.horizon.value);
    mix('ground', this.envUniforms.ground.value);
    mix('fog', this.fog.color);
    this.envUniforms.sunDir.value.copy(this.lightDir);
    this.envUniforms.glow.value = day + dusk * 0.8 + night * 0.05;
    // (tuned for the Neutral tone curve, which keeps the darks of the night brighter than ACES did)
    // (a little more at night since the lamps no longer blow their fixtures into a bloom haze that
    // brightened the whole frame)
    this.exposure = 0.82 + 0.1 * dusk + 0.2 * night;
    this.renderer.toneMappingExposure = this.exposure;
    this.daylight = smooth(-4, 30, elev);
    const z = this.envUniforms.zenith.value;
    const h = this.envUniforms.horizon.value;
    this.skyColor.setRGB((z.r + h.r * 2) / 3, (z.g + h.g * 2) / 3, (z.b + h.b * 2) / 3);
    // clouds catch less light at night
    this.sky.material.uniforms.cloudDensity.value = 0.45 - 0.2 * night;
  }

  /** Call every frame. */
  update(dt: number, camera: THREE.Camera): void {
    this.sky.material.uniforms.time.value += dt;
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.moon.position.copy(camera.position).addScaledVector(this.lightDir, 850);
    // the environment map is costly to re-render: follow the clock in steps
    this.envCooldown -= dt;
    // (small steps: with the clock running, a big step was a visible jump of the ambient light)
    if (Math.abs(this.hours - this.envHours) > 0.04 && this.envCooldown <= 0) {
      this.envHours = this.hours;
      this.envCooldown = 0.6;
      if (this.useHdri) this.hdri.load();
      const eq = this.useHdri ? this.hdriTexture() : null;
      if (eq) {
        // (the same pre-filtered target is refilled each time)
        const reuse = this.envFromHdri ? this.envTarget : null;
        const next = this.pmrem.fromEquirectangular(eq, reuse as THREE.WebGLCubeRenderTarget | null);
        if (next !== this.envTarget) this.envTarget?.dispose();
        this.envTarget = next;
        this.envFromHdri = true;
      } else {
        const next = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
        this.envTarget?.dispose();
        this.envTarget = next;
        this.envFromHdri = false;
      }
      this.scene.environment = this.envTarget.texture;
    }
  }

  /** The blended photographed sky for now (null while not loaded). */
  private hdriTexture(): THREE.Texture | null {
    const z = this.envUniforms.zenith.value;
    const h = this.envUniforms.horizon.value;
    // cosine-weighted mean of the procedural dome's upper half (see its shader)
    const irr = this.skyIrr.setRGB(0, 0, 0);
    let wsum = 0;
    for (let k = 0; k < 16; k++) {
      const y = (k + 0.5) / 16;
      const t = Math.pow(y, 0.55);
      irr.r += (h.r + (z.r - h.r) * t) * y;
      irr.g += (h.g + (z.g - h.g) * t) * y;
      irr.b += (h.b + (z.b - h.b) * t) * y;
      wsum += y;
    }
    irr.multiplyScalar(1 / wsum);
    return this.hdri.render({
      weights: this.moment,
      skyIrradiance: irr,
      ownColor: this.hdriOwnColor,
      sunDir: this.envUniforms.sunDir.value,
      glow: this.envUniforms.glow.value,
      ground: this.envUniforms.ground.value,
    });
  }

  /** Re-render the environment now (e.g. after switching between photographed and procedural). */
  refreshEnvironment(): void {
    this.envHours = -99;
    this.envCooldown = 0;
  }

  dispose(): void {
    this.hdri.dispose();
    this.envTarget?.dispose();
    this.pmrem.dispose();
  }
}
