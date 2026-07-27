// scripts/guardian-recolor/daredevil-mask.mjs
//
// Recolore SOMENTE a saia/manto do Daredevil (fogo laranja -> escarlate
// #D7263D, hue ~350deg), preservando cabelo e efeito de chama, que
// compartilham a mesma faixa de matiz+saturacao ("fogo laranja") mas
// ocupam regioes espaciais diferentes da pose (cabelo em cima, chama na
// mao direita, saia da cintura pra baixo). Ver Task 15 do plano
// docs/superpowers/plans/2026-07-26-paleta-brainhex-psicologia-cores.md.
//
// Estrategia: recorta uma caixa retangular (sharp().extract) que contem
// SOMENTE a saia/manto (com folga pra fundo transparente, sem cortar
// pixels opacos do cabelo/chama), roda a logica de hue-shift do
// recolor.mjs so dentro do recorte, e recompoe (sharp().composite) sobre
// a imagem original na mesma posicao. Pixels fora da caixa ficam
// bit-a-bit identicos ao original.
import sharp from "sharp";

// Uso 1 (retangulo unico, compatibilidade com chamadas anteriores):
//   node daredevil-mask.mjs <in> <out> <left> <top> <width> <height> <hueMin> <hueMax> <satMin0-1> <targetHue>
// Uso 2 (multiplos retangulos, necessario pro Daredevil: a saia precisa de
// mais de uma caixa pra contornar as botas, cujo trim bronze tem
// matiz+saturacao quase identicos ao tecido da saia — nao da pra separar so
// por cor, e uma unica caixa retangular sempre inclui ou corta uma das duas):
//   node daredevil-mask.mjs <in> <out> --boxes '[{"left":.,"top":.,"width":.,"height":.},...]' <hueMin> <hueMax> <satMin0-1> <targetHue>
const [, , inputPath, outputPath, ...rest] = process.argv;

if (!inputPath || !outputPath) {
  console.error(
    "uso: node daredevil-mask.mjs <in> <out> <left> <top> <width> <height> <hueMin> <hueMax> <satMin0-1> <targetHue>\n" +
    "  ou: node daredevil-mask.mjs <in> <out> --boxes '<json array>' <hueMin> <hueMax> <satMin0-1> <targetHue>"
  );
  process.exit(1);
}

let boxes;
let tail;
if (rest[0] === "--boxes") {
  boxes = JSON.parse(rest[1]);
  tail = rest.slice(2);
} else {
  boxes = [{ left: Number(rest[0]), top: Number(rest[1]), width: Number(rest[2]), height: Number(rest[3]) }];
  tail = rest.slice(4);
}
const [hueMinArg, hueMaxArg, satMinArg, targetHueArg] = tail;

const hueMin = Number(hueMinArg);
const hueMax = Number(hueMaxArg);
const satMin = Number(satMinArg);
const targetHue = Number(targetHueArg);
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
  return h >= hueMin || h <= hueMax;
}

function featherWeight(h) {
  if (hueInRange(h)) return 1;
  const distToMin = Math.min(Math.abs(h - hueMin), 360 - Math.abs(h - hueMin));
  const distToMax = Math.min(Math.abs(h - hueMax), 360 - Math.abs(h - hueMax));
  const dist = Math.min(distToMin, distToMax);
  if (dist > FEATHER_DEG) return 0;
  return 1 - dist / FEATHER_DEG;
}

const ALPHA_THRESHOLD = 250;
const MIN_LIGHTNESS_FOR_MATCH = 0.04;
const MAX_LIGHTNESS_FOR_MATCH = 0.96;

const compositeOps = [];
for (const box of boxes) {
  const cropBuf = await sharp(inputPath).ensureAlpha().extract(box).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = cropBuf;

  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < ALPHA_THRESHOLD) continue;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < satMin) continue;
    if (l < MIN_LIGHTNESS_FOR_MATCH || l > MAX_LIGHTNESS_FOR_MATCH) continue;
    const weight = featherWeight(h);
    if (weight <= 0) continue;

    const delta = ((targetHue - h + 540) % 360) - 180;
    const newHue = h + delta * weight;
    const [nr, ng, nb] = hslToRgb(newHue, s, l);
    data[i] = nr;
    data[i + 1] = ng;
    data[i + 2] = nb;
  }

  const recoloredCrop = await sharp(data, { raw: info }).png().toBuffer();
  compositeOps.push({ input: recoloredCrop, left: box.left, top: box.top });
}

const isPng = /\.png$/i.test(outputPath);
const pipeline = sharp(inputPath).ensureAlpha().composite(compositeOps);

if (isPng) {
  pipeline.png({ compressionLevel: 9 });
} else {
  pipeline.webp({ quality: 95, alphaQuality: 100 });
}
await pipeline.toFile(outputPath);
console.log(`recolorido (${boxes.length} caixa(s) ${JSON.stringify(boxes)}): ${outputPath}`);
