// scripts/guardian-recolor/recolor.mjs
import sharp from "sharp";

const [, , inputPath, outputPath, hueMinArg, hueMaxArg, satMinArg, targetHueArg, targetSatArg, targetLightnessArg] = process.argv;
if (!inputPath || !outputPath || !hueMinArg || !hueMaxArg || !satMinArg || !targetHueArg) {
  console.error(
    "uso: node recolor.mjs <in> <out> <hueMin> <hueMax> <satMin0-1> <targetHue> [targetSat0-1] [targetLightness0-1]"
  );
  process.exit(1);
}

const hueMin = Number(hueMinArg);
const hueMax = Number(hueMaxArg);
const satMin = Number(satMinArg);
const targetHue = Number(targetHueArg);
const targetSat = targetSatArg !== undefined ? Number(targetSatArg) : null;
const targetLightness = targetLightnessArg !== undefined ? Number(targetLightnessArg) : null;
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

// Só pixels essencialmente opacos são recoloridos. Pixels de antialiasing/
// borda (alpha baixo/parcial) ficam de fora: em alpha baixo a RGB armazenada
// é irrelevante visualmente no original, mas um hue-shift para uma cor
// saturada os torna visíveis como ruído/vazamento ao longo do contorno.
const ALPHA_THRESHOLD = 250;

// Perto de preto (ou de branco) puro, o hue e a saturação calculados via HSL
// ficam numericamente instáveis: uma diferença de 1-2 em R/G/B entre canais
// muito próximos de 0 (ou de 255) já basta para o hue "pular" para qualquer
// valor e a saturação parecer alta, mesmo sendo apenas ruído de compressão/
// contorno preto do cel-shading. Sem esse piso, esses pixels de contorno
// caem "por sorte" dentro da faixa de hue alvo e viram ruído sarapintado
// (specks vermelhos/laranja) espalhado pelo tecido. Preto/branco de contorno
// deve ficar de fora do recolor de qualquer forma.
const MIN_LIGHTNESS_FOR_MATCH = 0.04;
const MAX_LIGHTNESS_FOR_MATCH = 0.96;

// targetLightness NÃO deve sobrescrever a luminosidade de cada pixel para um
// valor fixo — isso achataria todo o sombreamento (dobras, luz e sombra) da
// peça num único bloco de cor sólida (o bug do commit anterior: manto virou
// blob laranja chapado, sem volume). Em vez disso, calculamos o quanto a
// luminosidade MÉDIA da região que bate no hue/sat precisa se mover para
// chegar em targetLightness, e aplicamos esse mesmo deslocamento (delta) a
// cada pixel, preservando a variação relativa (sombra continua mais escura
// que luz, só o tom médio muda).
let lightnessDelta = 0;
if (targetLightness !== null) {
  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const a = data[i + 3];
    if (a < ALPHA_THRESHOLD) continue;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (s < satMin) continue;
    if (l < MIN_LIGHTNESS_FOR_MATCH || l > MAX_LIGHTNESS_FOR_MATCH) continue;
    const weight = featherWeight(h);
    if (weight <= 0) continue;
    weightedSum += l * weight;
    weightTotal += weight;
  }
  if (weightTotal > 0) {
    const meanLightness = weightedSum / weightTotal;
    lightnessDelta = targetLightness - meanLightness;
  }
}

for (let i = 0; i < data.length; i += info.channels) {
  const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
  if (a < ALPHA_THRESHOLD) continue;
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < satMin) continue;
  if (l < MIN_LIGHTNESS_FOR_MATCH || l > MAX_LIGHTNESS_FOR_MATCH) continue;
  const weight = featherWeight(h);
  if (weight <= 0) continue;

  const delta = ((targetHue - h + 540) % 360) - 180; // in [-180, 180)
  const newHue = h + delta * weight;
  const newSat = targetSat !== null ? s + (targetSat - s) * weight : s;
  let newLightness = l;
  if (targetLightness !== null) {
    newLightness = l + lightnessDelta * weight;
    newLightness = Math.min(1, Math.max(0, newLightness));
  }
  const [nr, ng, nb] = hslToRgb(newHue, newSat, newLightness);
  data[i] = nr;
  data[i + 1] = ng;
  data[i + 2] = nb;
}

// WebP lossy (o padrão do sharp, quality:80) usa subsampling de crominância
// 4:2:0 + blocos tipo-DCT; isso introduz ringing/vazamento de cor nas bordas
// de alto contraste — e o recolor CRIA bordas de alto contraste que não
// existiam antes (ex.: contorno quase-preto ao lado de tecido agora
// laranja/coral muito saturado, onde antes era um roxo escuro e pouco
// saturado — baixo contraste). Isso aparecia como ruído sarapintado
// (specks) mesmo em pixels que o loop acima explicitamente pulou (o buffer
// bruto ficava correto; o dano entrava só na hora de comprimir). `lossless`
// elimina o artefato por completo, mas infla o arquivo ~10x (testado:
// ~1.2MB vs ~130-400KB dos outros guardiões, e este webp vai para o bundle
// do frontend). quality:95 reduz o ringing o suficiente para ficar
// imperceptível a olho nu (validado visualmente em zoom) mantendo o
// arquivo numa faixa de tamanho comparável aos demais assets.
await sharp(data, { raw: info })
  .webp({ quality: 95, alphaQuality: 100 })
  .toFile(outputPath);
console.log(`recolorido: ${outputPath}`);
