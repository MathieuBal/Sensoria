import type { SettingsStore } from '../core/SettingsStore';
import type { Scene } from '../core/types';
import type { CaptureManager } from '../core/CaptureManager';
import { PALETTES } from '../palettes';

/**
 * Binds the floating glass panel to whichever tableau is active. The palette
 * set is shared across scenes; the secondary "knob" (symmetry / density / fog…)
 * is rebuilt from each scene's own labels on {@link bind}.
 */
export class Controls {
  private scene: Scene | null = null;
  private hintDismissed = false;

  constructor(
    private readonly settings: SettingsStore,
    private readonly capture: CaptureManager
  ) {
    this.buildPalettes();
    this.wirePanelToggle();
    this.wireSwitches();
    this.wireActions();
  }

  /** Attach the panel to a freshly mounted scene. */
  bind(scene: Scene): void {
    this.scene = scene;
    scene.onPaletteChange = (i) => this.reflectPalette(i);
    this.$('scene-title').textContent = scene.name;
    this.buildKnob(scene);
    this.syncFromSettings();
    this.hintDismissed = false;
  }

  /** Reflect a palette change initiated by the scene (e.g. double-tap). */
  reflectPalette(index: number): void {
    this.settings.set('palette', index);
    this.markPressed('palettes', index);
  }

  /** Fade the first-run hint once the user has interacted. */
  dismissHint(): void {
    if (this.hintDismissed) return;
    this.hintDismissed = true;
    document.getElementById('hint')?.classList.add('is-hidden');
  }

  showHint(): void {
    this.hintDismissed = false;
    document.getElementById('hint')?.classList.remove('is-hidden');
  }

  private $(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  }

  private buildPalettes(): void {
    const palettes = this.$('palettes');
    palettes.innerHTML = '';
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
  }

  private buildKnob(scene: Scene): void {
    this.$('knob-label').textContent = scene.knobLabel;
    const knob = this.$('symmetry');
    knob.innerHTML = '';
    scene.knobOptions.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', () => this.selectKnob(i));
      knob.appendChild(btn);
    });
  }

  private wirePanelToggle(): void {
    const panel = this.$('panel');
    const toggle = () => {
      panel.hidden = !panel.hidden;
    };
    this.$('menu-toggle').addEventListener('click', toggle);
    this.$('panel-close').addEventListener('click', () => (panel.hidden = true));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.scene) toggle();
    });
  }

  private wireSwitches(): void {
    const auto = this.$('auto') as HTMLInputElement;
    auto.addEventListener('change', () => {
      this.settings.set('auto', auto.checked);
      this.scene?.setAuto(auto.checked);
    });
    const reduced = this.$('reduced') as HTMLInputElement;
    reduced.addEventListener('change', () => {
      this.settings.set('reducedEffects', reduced.checked);
    });
  }

  private wireActions(): void {
    this.$('reset').addEventListener('click', () => this.scene?.reset());
    this.$('capture').addEventListener('click', () =>
      this.capture.savePng(this.scene?.id ?? 'sensoria')
    );
    this.$('fullscreen').addEventListener('click', () => this.toggleFullscreen());
  }

  private selectPalette(i: number): void {
    this.settings.set('palette', i);
    this.scene?.setPalette(i);
    this.markPressed('palettes', i);
  }

  private selectKnob(i: number): void {
    this.settings.set('symmetry', i);
    this.scene?.setSymmetry(i);
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
    const knobMax = this.$('symmetry').children.length;
    this.markPressed('palettes', s.palette);
    this.markPressed('symmetry', Math.min(s.symmetry, knobMax - 1));
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
