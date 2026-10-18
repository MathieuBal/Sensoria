/** Batched exponential fade with a one-level floor to avoid 8-bit ghost trails. */
export class CanvasFade {
  private elapsed = 0;
  reset(): void { this.elapsed = 0; }
  apply(ctx: CanvasRenderingContext2D, width: number, height: number, dt: number, rgb: readonly number[], tau = 14000): void {
    this.elapsed += dt;
    if (this.elapsed < 100) return;
    const alpha = 1 - Math.exp(-this.elapsed / tau); this.elapsed = 0;
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${rgb.join(',')},${alpha})`; ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = 'rgb(1,1,1)'; ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighten'; ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}
