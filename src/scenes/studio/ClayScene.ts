import * as T from 'three';
import type { PointerSample } from '../../core/types';
import { StudioScene, clamp } from './StudioScene';

/** Persistent height-field sculpture, lit as a real deformable 3D surface. */
export class ClayScene extends StudioScene {
  readonly id = 'clay'; readonly name = 'Argile vivante';
  readonly knobLabel = 'Outil'; readonly knobOptions = ['Fin', 'Rond', 'Large'];
  override readonly toolOptions = ['Creuser', 'Élever', 'Lisser'];
  readonly hint = { title: 'Façonne la matière', sub: 'Choisis ton outil puis glisse sur l’argile.' };
  private mesh!: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  private brush!: T.Mesh;
  private readonly n = 100;
  private heights = new Float32Array(101 * 101);
  private snapshot = new Float32Array(101 * 101);
  private pointer: T.Vector2 | null = null;
  private activeId: number | null = null;
  private pressure = .5;
  private dirty = false;
  protected build(): void {
    this.backdrop('#b6a18c', -.6);
    const geo = new T.PlaneGeometry(6.8, 6.8, this.n, this.n);
    // Map the square grid to a disk: continuous rim, no clipped square corners.
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const u = positions.getX(i) / 3.4, v = positions.getY(i) / 3.4;
      positions.setXY(i, 3.3 * u * Math.sqrt(1 - v * v / 2), 3.3 * v * Math.sqrt(1 - u * u / 2));
    }
    this.mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color: '#bd7657', roughness: .91, metalness: 0 }));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.world.add(this.mesh);
    const plinth = new T.Mesh(new T.CylinderGeometry(3.7, 3.8, .22, 80), new T.MeshStandardMaterial({ color: '#51473f', roughness: .85 }));
    plinth.rotation.x = Math.PI / 2; plinth.position.z = -.5; plinth.receiveShadow = true; plinth.castShadow = true; this.world.add(plinth);
    this.brush = new T.Mesh(new T.RingGeometry(.97, 1, 64), new T.MeshBasicMaterial({ color: '#ffdfb9', transparent: true, opacity: .5, depthTest: false }));
    this.brush.visible = false; this.brush.renderOrder = 2; this.world.add(this.brush);
    this.reset();
  }
  reset(): void {
    const pos = this.mesh.geometry.attributes.position;
    for (let i = 0; i < this.heights.length; i++) {
      const x = pos.getX(i), y = pos.getY(i), r = Math.hypot(x, y);
      this.heights[i] = .18 + .16 * Math.exp(-r * r / 6) + .003 * Math.sin(x * 14) * Math.sin(y * 12);
    }
    this.dirty = true;
    this.status('Creuse, élève ou lisse · les empreintes restent dans la matière');
  }
  override setPalette(index: number): void {
    super.setPalette(index); this.mesh.material.color.set(['#be7959', '#819c98', '#d7c4a5'][this.palette]);
  }
  onInput(s: PointerSample): void {
    if (s.phase === 'start' && this.activeId === null) this.activeId = s.id;
    if (s.id !== this.activeId) return;
    if (s.phase === 'end') { this.pointer = null; this.activeId = null; this.brush.visible = false; return; }
    const next = this.point(s);
    if (this.pointer && s.phase === 'move') {
      const steps = Math.min(24, Math.ceil(this.pointer.distanceTo(next) / .12));
      for (let i = 1; i <= steps; i++) this.sculpt(this.pointer.clone().lerp(next, i / steps), .012);
    }
    this.pointer = next; this.pressure = s.pressure;
  }
  private sculpt(p: T.Vector2, dt: number): void {
    const radius = [.26, .48, .8][this.level];
    const pos = this.mesh.geometry.attributes.position;
    if (this.selectedTool === 2) this.snapshot.set(this.heights);
    for (let i = 0; i < this.heights.length; i++) {
      const x = pos.getX(i), y = pos.getY(i), distance = Math.hypot(x - p.x, y - p.y);
      if (distance > radius || Math.hypot(x, y) > 3.2) continue;
      const weight = Math.pow(1 - distance * distance / (radius * radius), 2);
      if (this.selectedTool === 2) {
        if (i > this.n + 1 && i < this.heights.length - this.n - 2) {
          const average = (this.snapshot[i - 1] + this.snapshot[i + 1] + this.snapshot[i - this.n - 1] + this.snapshot[i + this.n + 1]) / 4;
          this.heights[i] += (average - this.heights[i]) * Math.min(1, dt * 30) * weight;
        }
      } else this.heights[i] = clamp(this.heights[i] + (this.selectedTool ? 1 : -1) * dt * 1.8 * weight * (.5 + this.pressure), -.25, 1.25);
    }
    this.dirty = true;
  }
  protected tick(dt: number): void {
    if (this.pointer) {
      this.sculpt(this.pointer, dt); this.brush.visible = true;
      this.brush.position.set(this.pointer.x, this.pointer.y, 1.5);
      this.brush.scale.setScalar([.26, .48, .8][this.level]);
    }
    if (!this.dirty) return;
    const pos = this.mesh.geometry.attributes.position;
    for (let i = 0; i < this.heights.length; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      const edge = clamp((3.3 - r) / .35, 0, 1);
      const blend = edge * edge * (3 - 2 * edge);
      pos.setZ(i, -.35 + (this.heights[i] + .35) * blend);
    }
    pos.needsUpdate = true; this.mesh.geometry.computeVertexNormals(); this.dirty = false;
  }
}
