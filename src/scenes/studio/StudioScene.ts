import * as T from 'three';
import type { Scene, SceneContext, PointerSample } from '../../core/types';

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
let sharedRenderer: T.WebGLRenderer | undefined;

/** One GPU context reused by all studio scenes. The original canvas keeps input. */
export abstract class StudioScene implements Scene {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly knobLabel: string;
  abstract readonly knobOptions: readonly string[];
  abstract readonly hint: { title: string; sub: string };
  readonly paletteCount = 3;
  readonly supportsAuto = false;
  readonly toolOptions?: readonly string[];
  selectedTool = 0;
  onToolChange?: (index: number) => void;
  onPaletteChange?: (index: number) => void;
  protected context!: SceneContext;
  protected world = new T.Scene();
  protected camera = new T.OrthographicCamera(-6, 6, 4.5, -4.5, .1, 60);
  protected renderer!: T.WebGLRenderer;
  protected width = 1;
  protected height = 1;
  protected level = 1;
  protected palette = 0;
  protected elapsed = 0;
  protected key!: T.DirectionalLight;
  private pixelRatio = 1;
  private budgetTime = 0;
  private lost = false;
  private readonly onLost = (e: Event): void => { e.preventDefault(); this.lost = true; this.status('Le rendu se rétablit…'); };
  private readonly onRestored = (): void => { this.lost = false; this.restore(); };

  mount(context: SceneContext): void {
    this.context = context;
    if (!sharedRenderer) {
      sharedRenderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      sharedRenderer.domElement.id = 'studio-stage';
      sharedRenderer.domElement.setAttribute('aria-hidden', 'true');
      document.body.appendChild(sharedRenderer.domElement);
      sharedRenderer.outputColorSpace = T.SRGBColorSpace;
      sharedRenderer.toneMapping = T.ACESFilmicToneMapping;
      sharedRenderer.shadowMap.type = T.PCFSoftShadowMap;
    }
    this.renderer = sharedRenderer;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.addEventListener('webglcontextlost', this.onLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onRestored);
    this.renderer.shadowMap.enabled = !context.settings.reducedEffects;
    this.renderer.toneMappingExposure = 1.25;
    this.world.background = new T.Color('#151a26');
    this.camera.position.set(0, 0, 15);
    this.world.add(new T.HemisphereLight(0xf2f5ff, 0x5b4642, 2.1));
    this.key = new T.DirectionalLight(0xffe6ca, 3.5);
    this.key.position.set(-3, 5, 8);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    Object.assign(this.key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .1, far: 30 });
    this.key.shadow.bias = -.001;
    this.key.shadow.normalBias = .025;
    this.world.add(this.key);
    this.build();
  }
  protected restore(): void { this.status(''); }
  protected abstract build(): void;
  abstract onInput(sample: PointerSample): void;
  protected abstract tick(dt: number): void;
  abstract reset(): void;
  resize(width: number, height: number, dpr: number): void {
    this.width = width; this.height = height;
    const aspect = width / height;
    const halfH = Math.max(4.5, 4.5 / aspect);
    this.camera.left = -halfH * aspect; this.camera.right = halfH * aspect;
    this.camera.top = halfH; this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    this.pixelRatio = Math.min(dpr, this.context.settings.reducedEffects ? 1 : 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width / dpr, height / dpr);
  }
  update(dt: number): void {
    if (this.lost) return;
    const seconds = Math.min(dt, 50) / 1000;
    this.elapsed += seconds;
    this.tick(seconds);
    this.budgetTime += dt;
    if (this.budgetTime > 1500) {
      this.budgetTime = 0;
      const target = Math.min(this.context.dpr, this.context.settings.reducedEffects ? 1 : 1.5) * Math.max(.65, this.context.perf.quality);
      if (Math.abs(target - this.pixelRatio) > .15) { this.pixelRatio = target; this.renderer.setPixelRatio(target); }
      this.renderer.shadowMap.enabled = !this.context.settings.reducedEffects;
    }
    this.renderer.render(this.world, this.camera);
  }
  protected point(s: PointerSample): T.Vector2 {
    return new T.Vector2(this.camera.left + s.x / this.width * (this.camera.right - this.camera.left), this.camera.top - s.y / this.height * (this.camera.top - this.camera.bottom));
  }
  protected backdrop(color = '#d7c5ad', z = -1): T.Mesh {
    const mesh = new T.Mesh(new T.PlaneGeometry(80, 80), new T.MeshStandardMaterial({ color, roughness: 1 }));
    mesh.position.z = z; mesh.receiveShadow = true; this.world.add(mesh); return mesh;
  }
  protected status(text: string): void { const el = document.getElementById('scene-status'); if (el) el.textContent = text; }
  setPalette(index: number): void { this.palette = clamp(index, 0, 2); }
  setSymmetry(index: number): void { this.level = clamp(index, 0, 2); }
  setTool(index: number): void { this.selectedTool = index; this.onToolChange?.(index); }
  setAuto(_on: boolean): void {}
  unmount(): void {
    this.status('');
    this.renderer?.domElement.removeEventListener('webglcontextlost', this.onLost);
    this.renderer?.domElement.removeEventListener('webglcontextrestored', this.onRestored);
    if (this.renderer) this.renderer.domElement.style.display = 'none';
    const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>();
    this.world.traverse(object => {
      const mesh = object as T.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value);
      }
      if (object instanceof T.Light && 'shadow' in object) (object as T.DirectionalLight).shadow?.dispose();
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    this.world.clear(); this.renderer?.renderLists.dispose();
  }
}
