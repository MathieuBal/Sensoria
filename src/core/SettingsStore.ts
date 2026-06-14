import type { SceneSettings } from './types';

type Listener = (settings: SceneSettings) => void;

const STORAGE_KEY = 'sensoria.settings.v1';

const DEFAULTS: SceneSettings = {
  palette: 0,
  symmetry: 1,
  auto: false,
  reducedEffects: false
};

/**
 * Persistent, observable settings shared by the whole socle.
 * Mirrors the §6.1 SettingsStore: palettes, intensity, accessibility, and
 * local persistence so the last state is restored on reload.
 */
export class SettingsStore {
  private state: SceneSettings;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.state = { ...DEFAULTS, ...this.load() };
    // Honour the OS "reduce motion" preference on first run.
    if (
      !this.hasStored() &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      this.state.reducedEffects = true;
    }
  }

  get(): Readonly<SceneSettings> {
    return this.state;
  }

  set<K extends keyof SceneSettings>(key: K, value: SceneSettings[K]): void {
    if (this.state[key] === value) return;
    this.state = { ...this.state, [key]: value };
    this.persist();
    for (const l of this.listeners) l(this.state);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private hasStored(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  private load(): Partial<SceneSettings> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Partial<SceneSettings>) : {};
    } catch {
      return {};
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* storage may be unavailable (private mode) — degrade silently */
    }
  }
}
