/**
 * Exports the current composition as a PNG (§5.1 / §6.1 CaptureManager).
 * Video loop capture is intentionally out of scope for the prototype (§9).
 */
export class CaptureManager {
  constructor(private readonly canvas: HTMLCanvasElement) {}

  savePng(name = 'sensoria'): void {
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `${name}-${stamp}.png`;
      a.click();
      // Revoke on the next tick so the download has time to start.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }
}
