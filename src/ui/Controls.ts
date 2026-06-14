import type { SettingsStore } from '../core/SettingsStore';
import type { Scene } from '../core/types';
import type { CaptureManager } from '../core/CaptureManager';
import { PALETTES } from '../palettes';

const SYMMETRY_LABELS = ['Doux', 'Riche', 'Dense'];

/**
 * Binds the floating glass panel to the socle. Keeps DOM concerns out of the
 * scene/engine so the rendering pipeline stays UI-agnostic.
 */
export class Controls {
  private hintDismissed = false;

  constructor(
    private readonly settings: SettingsStore,
    private readonly scene: Scene,
    private readonly capture: CaptureManager
  ) {
    this.buildSegments();
    this.wirePanelToggle();
    this.wireSwitches();
    this.wireActions();
    this.syncFromSettings();
  }

  /** Fade the first-run hint once the user has interacted. */
  dismissHint(): void {
    if (this.hintDismissed) return;
    this.hintDismissed = true;
    document.getElementById('hint')?.classList.add('is-hidden');
  }

  private $(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  }

  private buildSegments(): void {
    // Palettes — each button previews its colour stops.
    const palettes = this.$('palettes');
    PALETTES.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = p.name;
      btn.setAttribute('aria-label', p.name);
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      const stops = p.stops.map((s) => `rgb(${s.r},${s.g},${s.b})`).join(',');
      swatch.style.background = `linear-gradient(90deg, ${stops})`;
      const label = document.createElement('span');
      label.textContent = p.name;
      btn.append(swatch, label);
      btn.addEventListener('click', () => this.selectPalette(i));
      palettes.appendChild(btn);
    });

    // Symmetry levels.
    const symmetry = this.$('symmetry');
    SYMMETRY_LABELS.slice(0, this.scene.symmetryLevels).forEach((label, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', () => this.selectSymmetry(i));
      symmetry.appendChild(btn);
    });
  }

  private wirePanelToggle(): void {
    const panel = this.$('panel');
    const open = () => {
      panel.hidden = false;
    };
    const close = () => {
      panel.hidden = true;
    };
    this.$('menu-toggle').addEventListener('click', () => {
      panel.hidden ? open() : close();
    });
    this.$('panel-close').addEventListener('click', close);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') panel.hidden ? open() : close();
    });
  }

  private wireSwitches(): void {
    const auto = this.$('auto') as HTMLInputElement;
    auto.addEventListener('change', () => {
      this.settings.set('auto', auto.checked);
      this.scene.setAuto(auto.checked);
    });

    const reduced = this.$('reduced') as HTMLInputElement;
    reduced.addEventListener('change', () => {
      this.settings.set('reducedEffects', reduced.checked);
    });
  }

  private wireActions(): void {
    this.$('reset').addEventListener('click', () => this.scene.reset());
    this.$('capture').addEventListener('click', () => this.capture.savePng('mosaique'));
    this.$('fullscreen').addEventListener('click', () => this.toggleFullscreen());
  }

  private selectPalette(i: number): void {
    this.settings.set('palette', i);
    this.scene.setPalette(i);
    this.markPressed('palettes', i);
  }

  private selectSymmetry(i: number): void {
    this.settings.set('symmetry', i);
    this.scene.setSymmetry(i);
    this.markPressed('symmetry', i);
  }

  private markPressed(groupId: string, index: number): void {
    const group = this.$(groupId);
    Array.from(group.children).forEach((c, i) =>
      c.setAttribute('aria-pressed', String(i === index))
    );
  }

  private syncFromSettings(): void {
    const s = this.settings.get();
    this.markPressed('palettes', s.palette);
    this.markPressed('symmetry', s.symmetry);
    (this.$('auto') as HTMLInputElement).checked = s.auto;
    (this.$('reduced') as HTMLInputElement).checked = s.reducedEffects;
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* fullscreen may be blocked (e.g. iOS Safari) — non-fatal */
    }
  }
}
