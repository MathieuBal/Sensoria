import * as T from 'three';
import type { PointerSample } from '../../core/types';
import { StudioScene, clamp } from './StudioScene';
interface Weight { mesh: T.Mesh<T.SphereGeometry, T.MeshStandardMaterial>; cord: T.Mesh; arm: T.Group; x: number; mass: number; }
/** A hierarchical kinetic sculpture with damped torque and editable lever arms. */
export class BalanceScene extends StudioScene {
  readonly id = 'balance'; readonly name = 'Équilibre suspendu';
  readonly knobLabel = 'Mouvement'; readonly knobOptions = ['Amorti', 'Souple', 'Libre'];
  readonly hint = { title: 'Cherche l’équilibre', sub: 'Attrape une forme, déplace-la et relâche.' };
  private root = new T.Group();
  private arms: T.Group[] = [];
  private weights: Weight[] = [];
  private angles = [0, 0, 0]; private velocities = [0, 0, 0];
  private picked: Weight | null = null; private activeId: number | null = null;
  private grabOffset = 0;
  protected build(): void {
    this.backdrop('#c0b5a7', -1.8);
    const metal = new T.MeshStandardMaterial({ color: '#b79f74', metalness: .65, roughness: .32 });
    const bar = (length: number): T.Mesh => { const m = new T.Mesh(new T.CylinderGeometry(.025, .025, length, 12), metal); m.rotation.z = Math.PI / 2; m.castShadow = true; return m; };
    this.root.position.y = 2.6; this.world.add(this.root); this.root.add(bar(4.4));
    const top = new T.Mesh(new T.CylinderGeometry(.018, .018, 4, 8), metal); top.position.y = 4.6; this.world.add(top);
    for (let i = 0; i < 2; i++) {
      const arm = new T.Group(); arm.position.set(i ? 2.1 : -2.1, -1.5, i ? .35 : 0); this.root.add(arm); this.arms.push(arm); arm.add(bar(2.9));
      const string = new T.Mesh(new T.CylinderGeometry(.012, .012, 1.5, 8), metal); string.position.set(arm.position.x, -.75, arm.position.z); this.root.add(string);
      for (let side = 0; side < 2; side++) {
        const mesh = new T.Mesh(new T.SphereGeometry(.45, 28, 18), new T.MeshStandardMaterial({ color: ['#b96549', '#d5ad5e', '#6b8984', '#344e66'][i * 2 + side], roughness: .65, metalness: .08 }));
        mesh.scale.set(1, 1.25, .3); mesh.castShadow = true; arm.add(mesh);
        const cord = new T.Mesh(new T.CylinderGeometry(.01, .01, 1.2, 8), metal); arm.add(cord);
        this.weights.push({ mesh, cord, arm, x: side ? 1.3 : -1.3, mass: 1 });
      }
    }
    this.reset();
  }
  reset(): void {
    this.angles = [.08, -.2, .12]; this.velocities = [0, 0, 0]; this.picked = null; this.activeId = null;
    this.weights.forEach((w, i) => { w.mesh.material.emissive.set(0); w.mass = 1; w.x = i % 2 ? 1.3 : -1.3; });
    this.status('Attrape une forme et glisse · relâche pour laisser le mobile danser');
  }
  override setPalette(index: number): void {
    super.setPalette(index);
    const colors = [['#b96549', '#d5ad5e', '#6b8984', '#344e66'], ['#b69ac3', '#d9b2b2', '#769ab1', '#c9c5a8'], ['#d87336', '#a64539', '#e0ba7d', '#6d8160']];
    this.weights.forEach((w, i) => w.mesh.material.color.set(colors[this.palette][i]));
  }
  onInput(s: PointerSample): void {
    if (s.phase === 'start' && this.activeId === null) {
      this.activeId = s.id;
      // Generous screen-space targets include the area just around each weight.
      this.world.updateMatrixWorld(true);
      let nearest = 36 * this.context.dpr;
      this.picked = null;
      for (const weight of this.weights) {
        const world = weight.mesh.getWorldPosition(new T.Vector3());
        const screen = world.clone().project(this.camera);
        const distance = Math.hypot((screen.x + 1) * this.width / 2 - s.x, (1 - screen.y) * this.height / 2 - s.y);
        if (distance < nearest) { nearest = distance; this.picked = weight; }
      }
      if (this.picked) {
        const p = this.point(s), z = this.picked.mesh.getWorldPosition(new T.Vector3()).z;
        this.grabOffset = this.picked.x - this.picked.arm.worldToLocal(new T.Vector3(p.x, p.y, z)).x;
        this.picked.mesh.material.emissive.set('#3b2920');
      } else this.velocities[0] += clamp(s.x / this.width - .5, -.4, .4);

    }
    if (s.id !== this.activeId) return;
    if (s.phase === 'end') { this.picked?.mesh.material.emissive.set(0); this.activeId = null; this.picked = null; return; }
    if (this.picked) {
      const p = this.point(s), local = this.picked.arm.worldToLocal(new T.Vector3(p.x, p.y, this.picked.mesh.getWorldPosition(new T.Vector3()).z));
      this.picked.x = clamp(local.x + this.grabOffset, -1.45, 1.45);
    }
  }
  protected tick(dt: number): void {
    // Small fixed substeps avoid explosive springs after a dropped frame.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps;
    for (let step = 0; step < steps; step++) {
      const leftMass = this.weights[0].mass + this.weights[1].mass, rightMass = this.weights[2].mass + this.weights[3].mass;
      const targets = [clamp((leftMass - rightMass) * .32 - this.weights.reduce((sum, w) => sum + w.x * w.mass, 0) * .08, -.65, .65), ...this.arms.map((_, i) => {
        const a = this.weights[i * 2], b = this.weights[i * 2 + 1]; return clamp(-(a.mass * a.x + b.mass * b.x) * .32, -.85, .85);
      })];
      for (let i = 0; i < 3; i++) {
        const damping = this.context.settings.reducedEffects ? 6 : [5.5, 2.2, .7][this.level];
        this.velocities[i] += ((targets[i] - this.angles[i]) * 9 - this.velocities[i] * damping) * h;
        this.angles[i] += this.velocities[i] * h;
      }
    }
    this.root.rotation.z = this.angles[0];
    this.arms.forEach((arm, i) => { arm.rotation.z = this.angles[i + 1] - this.angles[0] * .65; });
    this.weights.forEach(w => {
      const size = Math.cbrt(w.mass);
      w.mesh.scale.set(size, size * 1.25, size * .3); w.mesh.position.set(w.x, -1.55, 0);
      w.cord.position.set(w.x, -.65, 0);
    });
  }
}
