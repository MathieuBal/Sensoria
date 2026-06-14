// Dependency-free PNG icon generator for the Sensoria PWA.
// Renders a small additive kaleidoscope glow into raw RGBA and encodes a PNG
// by hand (IHDR / IDAT / IEND) so we don't pull in a native image dependency.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public');
mkdirSync(OUT, { recursive: true });

const BG = [11, 13, 20];
const STOPS = [
  [64, 224, 208],
  [80, 120, 255],
  [190, 90, 255],
  [255, 110, 180]
];

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function render(size) {
  const data = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;

  // Light positions: two symmetric rings of coloured points (a mini mosaic).
  const lights = [];
  const sectors = 6;
  for (let ring = 0; ring < 2; ring++) {
    const radius = size * (ring === 0 ? 0.16 : 0.3);
    for (let k = 0; k < sectors; k++) {
      const a = (k / sectors) * Math.PI * 2 + ring * 0.5;
      const color = STOPS[(k + ring) % STOPS.length];
      lights.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, color });
    }
  }
  const sigma = size * 0.12;
  const twoSigma2 = 2 * sigma * sigma;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = BG[0];
      let g = BG[1];
      let b = BG[2];
      for (const l of lights) {
        const dx = x - l.x;
        const dy = y - l.y;
        const f = Math.exp(-(dx * dx + dy * dy) / twoSigma2);
        r += l.color[0] * f;
        g += l.color[1] * f;
        b += l.color[2] * f;
      }
      // Round the corners so the icon reads well unmasked.
      const margin = size * 0.06;
      const inside =
        x > margin && x < size - margin && y > margin && y < size - margin;
      const i = (y * size + x) * 4;
      data[i] = clamp(r);
      data[i + 1] = clamp(g);
      data[i + 2] = clamp(b);
      data[i + 3] = inside ? 255 : 255; // full square; maskable handles cropping
    }
  }
  return data;
}

// --- minimal PNG encoder ----------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, body])), 0);
  return Buffer.concat([len, typeBuf, body, crcBuf]);
}

function encodePng(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // 10,11,12 = compression/filter/interlace = 0

  // Add the per-scanline filter byte (0 = none).
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

for (const size of [192, 512]) {
  const png = encodePng(render(size), size);
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
