import * as T from 'three';
import type { PointerSample } from '../../core/types';
import { StudioScene, clamp } from './StudioScene';

export class ShadowScene extends StudioScene {
  readonly id = 'shadow-theatre'; readonly name = 'Théâtre d’ombres';
  readonly knobLabel = 'Lumière'; readonly knobOptions = ['Rasante', 'Douce', 'Haute'];
  override readonly toolOptions = ['Lumière', 'Objets'];
  readonly hint = { title: 'Dessine avec les ombres', sub: 'Déplace la lumière, ou saisis les objets.' };
  private objects: T.Mesh[] = [];
  private target = new T.Vector3(-3, 3.8, 6);
  private lamp!: T.Mesh;
  private activeId: number | null = null;
  private selected: T.Mesh | null = null;
  private raycaster = new T.Raycaster();
  protected build(): void {
    this.backdrop('#e2d5be', -1.4);
    // A directional light gives stable shadows without six cubemap shadow passes.
    const shapes = [new T.TorusGeometry(.7, .2, 16, 64), new T.IcosahedronGeometry(.75, 0), new T.BoxGeometry(.95, 1.35, .5)];
    shapes.forEach((geometry, i) => {
      const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial({ color: ['#bb7150', '#46747a', '#b6a066'][i], roughness: .48, metalness: .12 }));
      mesh.castShadow = true; mesh.receiveShadow = true; this.world.add(mesh); this.objects.push(mesh);
    });
    this.lamp = new T.Mesh(new T.SphereGeometry(.12, 16, 12), new T.MeshBasicMaterial({ color: '#fff5c9' }));
    this.world.add(this.lamp); this.key.intensity = 4;
    this.reset();
  }
  reset(): void {
    this.objects.forEach((mesh, i) => { mesh.position.set((i - 1) * 2.1, i === 1 ? 1 : -.7, .2 + i * .3); mesh.rotation.set(.2, .3, i * .3); });
    this.target.set(-3, 3.8, 6); this.selected = null; this.activeId = null;
    this.status('Déplace la lumière · observe les silhouettes se transformer');
  }
  override setPalette(index: number): void {
    super.setPalette(index); this.key.color.set(['#ffe2b3', '#c2dfff', '#ffd2e1'][this.palette]);
  }
  onInput(s: PointerSample): void {
    if (s.phase === 'start' && this.activeId === null) this.activeId = s.id;
    if (this.activeId !== s.id) return;
    if (s.phase === 'end') { this.selected = null; this.activeId = null; return; }
    const p = this.point(s);
    if (this.selectedTool === 0) { this.target.x = clamp(p.x, -5, 5); this.target.y = clamp(p.y, -5, 5); }
    else {
      if (s.phase === 'start') {
        this.raycaster.setFromCamera(new T.Vector2(s.x / this.width * 2 - 1, 1 - s.y / this.height * 2), this.camera);
        this.selected = (this.raycaster.intersectObjects(this.objects)[0]?.object as T.Mesh) ?? null;
      }
      if (this.selected) { this.selected.position.x = clamp(p.x, -3.8, 3.8); this.selected.position.y = clamp(p.y, -3.2, 3.2); this.selected.rotation.z += (s.x - s.px) * .002; }
    }
  }
  protected tick(dt: number): void {
    this.target.z = [3, 6, 10][this.level];
    this.key.position.lerp(this.target, 1 - Math.exp(-dt * 8));
    this.lamp.position.copy(this.key.position); this.lamp.position.z = 2;
    this.key.shadow.radius = this.level === 1 ? 4 : 1;
  }
}
