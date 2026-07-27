// scripts/guardian-recolor/recolor.mjs
import sharp from "sharp";

const [, , inputPath, outputPath, hueMinArg, hueMaxArg, satMinArg, targetHueArg, targetSatArg] = process.argv;
if (!inputPath || !outputPath || !hueMinArg || !hueMaxArg || !satMinArg || !targetHueArg) {
  console.error(
    "uso: node recolor.mjs <in> <out> <hueMin> <hueMax> <satMin0-1> <targetHue> [targetSat0-1]"
  );
  process.exit(1);
}

const hueMin = Number(hueMinArg);
const hueMax = Number(hueMaxArg);
const satMin = Number(satMinArg);
const targetHue = Number(targetHueArg);
const targetSat = targetSatArg !== undefined ? Number(targetSatArg) : null;
const FEATHER_DEG = 5;

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

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function hueInRange(h) {
  if (hueMin <= hueMax) return h >= hueMin && h <= hueMax;
  return h >= hueMin || h <= hueMax; // faixa que cruza 0/360
}

function featherWeight(h) {
  if (hueInRange(h)) return 1;
  const distToMin = Math.min(Math.abs(h - hueMin), 360 - Math.abs(h - hueMin));
  const distToMax = Math.min(Math.abs(h - hueMax), 360 - Math.abs(h - hueMax));
  const dist = Math.min(distToMin, distToMax);
  if (dist > FEATHER_DEG) return 0;
  return 1 - dist / FEATHER_DEG;
}

const image = sharp(inputPath).ensureAlpha();
const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += info.channels) {
  const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
  if (a < 5) continue;
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < satMin) continue;
  const weight = featherWeight(h);
  if (weight <= 0) continue;

  const newHue = h + (targetHue - h) * weight;
  const newSat = targetSat !== null ? s + (targetSat - s) * weight : s;
  const [nr, ng, nb] = hslToRgb(newHue, newSat, l);
  data[i] = nr;
  data[i + 1] = ng;
  data[i + 2] = nb;
}

await sharp(data, { raw: info }).toFile(outputPath);
console.log(`recolorido: ${outputPath}`);
