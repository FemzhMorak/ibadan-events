// Generates the app's PWA icons as flat, solid-color PNGs using pngjs
// (pure JS, no native deps / no internet required). The mark is a simple
// map-pin glyph, matching the app's "discover events near you" concept.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
const BG = { r: 0x0d, g: 0x0d, b: 0x0d }; // near-black, matches the app background
const FG = { r: 0x22, g: 0xc5, b: 0x5e }; // signature green accent

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

// Point-in-pin test: a circle sitting on top of a triangular tip, classic
// map-marker silhouette, drawn via simple analytic shape math (no canvas).
function isPinPixel(nx, ny) {
  // nx, ny normalized 0..1 within the icon's content box (not full canvas)
  const cx = 0.5;
  const cy = 0.36;
  const r = 0.26;

  const dCircle = dist(nx, ny, cx, cy);
  if (dCircle <= r) return true;

  // Triangular tip below the circle, tapering to a point.
  if (ny > cy && ny < 0.86) {
    const t = (ny - cy) / (0.86 - cy); // 0 at circle center line, 1 at tip
    const halfWidth = r * (1 - t) * 0.98;
    if (Math.abs(nx - cx) <= halfWidth) return true;
  }
  return false;
}

function isHolecircle(nx, ny) {
  const cx = 0.5;
  const cy = 0.36;
  const r = 0.1;
  return dist(nx, ny, cx, cy) <= r;
}

function drawIcon(size, { maskable = false } = {}) {
  const png = new PNG({ width: size, height: size });

  // Safe-zone padding: maskable icons need generous padding so the glyph
  // survives OS-applied circular/rounded masks; regular icons get a light
  // corner radius via padding-free full-bleed background instead.
  const pad = maskable ? size * 0.22 : size * 0.12;
  const contentSize = size - pad * 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;

      let r = BG.r, g = BG.g, b = BG.b, a = 255;

      const inContentX = x >= pad && x < size - pad;
      const inContentY = y >= pad && y < size - pad;
      if (inContentX && inContentY) {
        const nx = (x - pad) / contentSize;
        const ny = (y - pad) / contentSize;
        if (isPinPixel(nx, ny) && !isHolecircle(nx, ny)) {
          r = FG.r; g = FG.g; b = FG.b;
        }
      }

      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return png;
}

function writePng(png, filename) {
  const filePath = path.join(OUT_DIR, filename);
  png.pack().pipe(fs.createWriteStream(filePath));
  console.log(`Generated ${filePath}`);
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

writePng(drawIcon(192), 'icon-192.png');
writePng(drawIcon(512), 'icon-512.png');
writePng(drawIcon(512, { maskable: true }), 'icon-maskable-512.png');
writePng(drawIcon(180), 'apple-touch-icon.png');
writePng(drawIcon(32), 'favicon-32.png');
