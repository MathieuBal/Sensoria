// Shared contracts for the Sensoria socle (common foundation).
// Every tableau is a Scene plugged onto the same input, render and settings core.

export type InputPhase = 'start' | 'move' | 'end';

/**
 * A normalised pointer event, unified across mouse, pen and touch.
 * Coordinates are in **device pixels** (already multiplied by devicePixelRatio)
 * so scenes can draw directly onto the backing canvas.
 */
export interface PointerSample {
  id: number;
  phase: InputPhase;
  /** Current position (device px). */
  x: number;
  y: number;
  /** Previous position (device px). Equal to x/y on `start`. */
  px: number;
  py: number;
  /** Velocity in device px per millisecond. */
  vx: number;
  vy: number;
  /** Scalar speed in device px per millisecond. */
  speed: number;
  /** Time since the previous sample for this pointer (ms). */
  dt: number;
  /** 0..1 pen/touch pressure (defaults to 0.5 when unsupported). */
  pressure: number;
  /** True for synthetic samples produced by auto / demo mode. */
  synthetic: boolean;
}

/** Drawing surface and environment handed to a scene on mount. */
export interface SceneContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Backing-store size in device pixels. */
  width: number;
  height: number;
  dpr: number;
  settings: SceneSettings;
  perf: { quality: number };
}

/** Settings shared by every tableau; individual scenes interpret them freely. */
export interface SceneSettings {
  /** Index into the scene's palette list. */
  palette: number;
  /** Scene-defined intensity level (here: kaleidoscope symmetry step). */
  symmetry: number;
  /** Let the tableau live on its own without input. */
  auto: boolean;
  /** Reduce motion / glow for performance or accessibility. */
  reducedEffects: boolean;
}

/**
 * A single interactive tableau. The socle owns the lifecycle and only ever
 * talks to a scene through this interface, so scenes stay interchangeable.
 */
export interface Scene {
  readonly id: string;
  readonly name: string;
  /** Number of selectable palettes this scene exposes. */
  readonly paletteCount: number;
  /** Ordered symmetry / intensity levels this scene exposes. */
  readonly symmetryLevels: number;

  mount(context: SceneContext): void;
  resize(width: number, height: number, dpr: number): void;
  /** Advance simulation by `dt` ms and render the current frame. */
  update(dt: number, timeMs: number): void;
  /** Receive a unified pointer sample. */
  onInput(sample: PointerSample): void;
  setPalette(index: number): void;
  setSymmetry(level: number): void;
  setAuto(on: boolean): void;
  /** Trigger an animated return to a calm/empty state. */
  reset(): void;
  unmount(): void;
}
