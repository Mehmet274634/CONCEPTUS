import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import pngToIco from 'png-to-ico';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'build');

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tag = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])), 0);
  return Buffer.concat([len, tag, data, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function roundedBoxSdf(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return out + inside - r;
}

function blend(dst, r, g, b, a) {
  const sa = Math.max(0, Math.min(1, a));
  const da = dst[3];
  const outA = sa + da * (1 - sa);
  if (outA <= 0) return;
  dst[0] = (r * sa + dst[0] * da * (1 - sa)) / outA;
  dst[1] = (g * sa + dst[1] * da * (1 - sa)) / outA;
  dst[2] = (b * sa + dst[2] * da * (1 - sa)) / outA;
  dst[3] = outA;
}

/**
 * High-contrast flagship CONCEPTUS icon:
 * Radiant Electric Indigo -> Vivid Cyan diagonal glass squircle tile
 * with ultra-crisp PURE WHITE geometric C-orbit + Master core + orbital spark.
 * Engineered to POP unmistakably at 24x24px on dark Windows 11 & light macOS taskbars.
 */
function renderConceptusIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - half) / half;
      const ny = (y + 0.5 - half) / half;

      // Full-bleed Apple squircle (fills taskbar slot cleanly like Claude / Antigravity)
      const sdf = roundedBoxSdf(nx, ny, 0.94, 0.94, 0.40);
      const mask = 1 - smoothstep(-0.008, 0.008, sdf);
      if (mask <= 0.001) continue;

      // Vivid signature gradient: Electric Violet-Indigo (#5B4BFF) -> Royal Iris (#6E5BFF) -> Luminous Cyan (#06C8E8)
      const t = Math.max(0, Math.min(1, (nx * 0.65 + ny * 0.65 + 1.0) / 2.0));
      let bgR, bgG, bgB;
      if (t < 0.55) {
        const k = t / 0.55;
        bgR = 92 + k * (86 - 92);
        bgG = 66 + k * (102 - 66);
        bgB = 255;
      } else {
        const k = (t - 0.55) / 0.45;
        bgR = 86 + k * (6 - 86);
        bgG = 102 + k * (212 - 102);
        bgB = 255 + k * (232 - 255);
      }

      const col = [bgR, bgG, bgB, mask];

      // Subtle glossy top-left light bloom for Liquid Glass depth
      const topGloss = Math.exp(-((nx + 0.45) ** 2 + (ny + 0.58) ** 2) * 1.9) * 0.34;
      blend(col, 255, 255, 255, topGloss * mask);

      // Subtle deeper bottom-left contrast shadow for 3D crispness
      const depthShade = Math.exp(-((nx + 0.55) ** 2 + (ny - 0.65) ** 2) * 2.2) * 0.25;
      blend(col, 20, 14, 72, depthShade * mask);

      // Smooth luminous top glass bevel highlight
      const rimDist = Math.abs(sdf + 0.022);
      const rimAlpha =
        (1 - smoothstep(0.0, 0.018, rimDist)) *
        (0.16 + (1 - smoothstep(-0.8, 0.6, ny)) * 0.34);
      blend(col, 255, 255, 255, rimAlpha * mask);

      // Geometric Emblem (scaled bold for crystal clarity at 16px-32px!)
      const cx = -0.04;
      const cy = 0.0;
      const dx = nx - cx;
      const dy = ny - cy;
      const r = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      // Soft dark drop shadow beneath emblem so white mark pops even harder
      const sdx = nx - cx;
      const sdy = ny - (cy + 0.045);
      const sr = Math.hypot(sdx, sdy);
      const sAngle = Math.atan2(sdy, sdx);
      const sRing = (1 - smoothstep(0.095, 0.145, Math.abs(sr - 0.47))) * smoothstep(0.46, 0.72, Math.abs(sAngle));
      const sCore = 1 - smoothstep(0.16, 0.22, sr);
      blend(col, 16, 14, 58, Math.max(sRing, sCore) * 0.28 * mask);

      // Bold Pure-White Geometric "C" Arc with crisp rounded end-caps
      const ringRadius = 0.47;
      const strokeHalf = 0.112;
      const openAngle = 0.68; // ~39 deg opening on right
      let arcDist;
      if (Math.abs(angle) >= openAngle) {
        arcDist = Math.abs(r - ringRadius) - strokeHalf;
      } else {
        const capTopX = Math.cos(-openAngle) * ringRadius;
        const capTopY = Math.sin(-openAngle) * ringRadius;
        const capBotX = Math.cos(openAngle) * ringRadius;
        const capBotY = Math.sin(openAngle) * ringRadius;
        const dTop = Math.hypot(dx - capTopX, dy - capTopY) - strokeHalf;
        const dBot = Math.hypot(dx - capBotX, dy - capBotY) - strokeHalf;
        arcDist = Math.min(dTop, dBot);
      }
      const cAlpha = 1 - smoothstep(-0.012, 0.012, arcDist);
      blend(col, 255, 255, 255, cAlpha * mask);

      // Bold Pure-White Center Master Orb
      const coreAlpha = 1 - smoothstep(0.168, 0.186, r);
      blend(col, 255, 255, 255, coreAlpha * mask);

      // Signature Luminous Accent Spark Orb sitting cleanly in the C opening (right)
      const sparkDist = Math.hypot(nx - 0.50, ny - 0.0);
      const sparkAlpha = 1 - smoothstep(0.105, 0.122, sparkDist);
      blend(col, 255, 255, 255, sparkAlpha * mask);

      const idx = (y * size + x) * 4;
      buf[idx] = Math.round(Math.max(0, Math.min(255, col[0])));
      buf[idx + 1] = Math.round(Math.max(0, Math.min(255, col[1])));
      buf[idx + 2] = Math.round(Math.max(0, Math.min(255, col[2])));
      buf[idx + 3] = Math.round(Math.max(0, Math.min(255, col[3] * 255)));
    }
  }

  return encodePng(size, size, buf);
}

async function main() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const png512 = renderConceptusIcon(512);
  const pngPath = path.join(BUILD_DIR, 'icon.png');
  fs.writeFileSync(pngPath, png512);

  // Save crisp favicon into public/ and website/
  const publicDir = path.join(ROOT, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  const png128 = renderConceptusIcon(128);
  fs.writeFileSync(path.join(publicDir, 'icon.png'), png128);

  const websiteDir = path.join(ROOT, 'website');
  if (fs.existsSync(websiteDir)) {
    fs.writeFileSync(path.join(websiteDir, 'icon.png'), png128);
  }

  const icoBuf = await pngToIco(pngPath);
  const icoPath = path.join(BUILD_DIR, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuf);

  console.log('FLAGSHIP_ICON_OK:', { pngPath, icoPath, icoBytes: icoBuf.length });
}

main().catch((err) => {
  console.error('ICON_GEN_FAILED:', err);
  process.exit(1);
});
