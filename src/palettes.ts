// Colour ambiences. Each palette is a list of RGB stops sampled cyclically;
// `samplefun` interpolates smoothly so colour shifts feel continuous (§2 Fluide).

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Palette {
  name: string;
  stops: Rgb[];
}

const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b });

export const PALETTES: Palette[] = [
  {
    name: 'Aurore',
    stops: [rgb(64, 224, 208), rgb(80, 120, 255), rgb(190, 90, 255), rgb(255, 110, 180)]
  },
  {
    name: 'Braise',
    stops: [rgb(255, 196, 90), rgb(255, 120, 60), rgb(230, 50, 90), rgb(150, 30, 120)]
  },
  {
    name: 'Néon',
    stops: [rgb(57, 255, 170), rgb(0, 200, 255), rgb(170, 0, 255), rgb(255, 0, 140)]
  }
];

/**
 * Sample a palette at a cyclic position `t` (any real number) with linear
 * interpolation between adjacent stops.
 */
export function samplePalette(palette: Palette, t: number): Rgb {
  const stops = palette.stops;
  const n = stops.length;
  const x = ((t % 1) + 1) % 1; // wrap into [0,1)
  const scaled = x * n;
  const i = Math.floor(scaled);
  const f = scaled - i;
  const a = stops[i % n];
  const b = stops[(i + 1) % n];
  return {
    r: a.r + (b.r - a.r) * f,
    g: a.g + (b.g - a.g) * f,
    b: a.b + (b.b - a.b) * f
  };
}
