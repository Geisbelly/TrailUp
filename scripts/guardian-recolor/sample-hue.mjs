// scripts/guardian-recolor/sample-hue.mjs
import sharp from "sharp";

const [, , inputPath] = process.argv;
if (!inputPath) {
  console.error("uso: node sample-hue.mjs <caminho-da-imagem>");
  process.exit(1);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const buckets = new Array(36).fill(0);
let sampled = 0;

for (let i = 0; i < data.length; i += info.channels) {
  const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
  if (a < 200) continue;
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 0.25 || l < 0.15 || l > 0.70) continue;
  buckets[Math.floor(h / 10) % 36] += 1;
  sampled += 1;
}

console.log(`pixels amostrados (figurino provavel): ${sampled}`);
buckets
  .map((count, idx) => ({ range: `${idx * 10}-${idx * 10 + 10}`, count }))
  .filter((b) => b.count > 0)
  .sort((a, b) => b.count - a.count)
  .slice(0, 8)
  .forEach((b) => console.log(`hue ${b.range}: ${b.count} px`));
