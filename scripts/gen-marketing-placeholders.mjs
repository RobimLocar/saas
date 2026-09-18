// FLUXYRA-LANDING-EDITORIAL-PASS-03 — one-off generator for clearly-temporary
// media placeholders under public/marketing/. Flat neutral tone + a plain
// picture glyph + a caption naming the exact real asset expected — never a
// gradient/blob, never a fake screenshot. Not wired into the build; run once
// with `node scripts/gen-marketing-placeholders.mjs` to (re)generate.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "public", "marketing");
mkdirSync(OUT_DIR, { recursive: true });

const BG = "#F1EEF9"; // flat neutral, close to --secondary token — no gradient
const GLYPH = "#C9C2E0";
const INK = "#8B85A0";

function svg(w, h, label) {
  const iconSize = Math.min(w, h) * 0.16;
  const cx = w / 2;
  const cy = h / 2 - iconSize * 0.35;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  <g transform="translate(${cx - iconSize / 2} ${cy - iconSize / 2})">
    <rect x="0" y="0" width="${iconSize}" height="${iconSize}" rx="${iconSize * 0.14}" fill="none" stroke="${GLYPH}" stroke-width="${iconSize * 0.06}"/>
    <circle cx="${iconSize * 0.3}" cy="${iconSize * 0.32}" r="${iconSize * 0.09}" fill="${GLYPH}"/>
    <path d="M0 ${iconSize * 0.78} L${iconSize * 0.32} ${iconSize * 0.48} L${iconSize * 0.56} ${iconSize * 0.68} L${iconSize * 0.78} ${iconSize * 0.42} L${iconSize} ${iconSize * 0.7} L${iconSize} ${iconSize} L0 ${iconSize} Z" fill="${GLYPH}"/>
  </g>
  <text x="${cx}" y="${cy + iconSize * 0.95}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.max(14, w * 0.017)}" fill="${INK}" font-weight="600">${label}</text>
  <text x="${cx}" y="${cy + iconSize * 0.95 + Math.max(14, w * 0.017) * 1.6}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.max(11, w * 0.012)}" fill="${INK}" opacity="0.75">Placeholder — substituir por asset real</text>
</svg>`;
}

const assets = [
  ["hero-main.webp", 1600, 900, "hero-main.webp"],
  ["studio.webp", 1600, 1000, "studio.webp"],
  ["flows.webp", 1200, 900, "flows.webp"],
  ["ugc.webp", 960, 1200, "ugc.webp"],
  ["influencer.webp", 960, 1200, "influencer.webp"],
  ["image.webp", 1200, 900, "image.webp"],
  ["video.webp", 720, 1280, "video.webp"],
  ["audio.webp", 1600, 500, "audio.webp"],
  ["gallery-01.webp", 1000, 1000, "gallery-01.webp"],
  ["gallery-02.webp", 960, 1200, "gallery-02.webp"],
  ["gallery-03.webp", 1000, 1000, "gallery-03.webp"],
  ["gallery-04.webp", 960, 1200, "gallery-04.webp"],
  ["gallery-05.webp", 1000, 1000, "gallery-05.webp"],
  ["gallery-06.webp", 960, 1200, "gallery-06.webp"],
];

for (const [file, w, h, label] of assets) {
  const buf = Buffer.from(svg(w, h, label));
  await sharp(buf).webp({ quality: 82 }).toFile(path.join(OUT_DIR, file));
  console.log("wrote", file, `${w}x${h}`);
}
