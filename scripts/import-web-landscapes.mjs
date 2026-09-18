import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(process.argv[2] || `${process.env.HOME}/Downloads/Design`);
const output = fileURLToPath(new URL('../frontend/src/assets/design/', import.meta.url));
const scenes = {
  'journey-dawn': '20_19_04 (7)',
  'journey-forest': '20_19_04 (1)',
  'journey-lanterns': '20_19_04 (4)',
  'guide-world-seeker': '20_15_33 (3)',
  'guide-world-survivor': '20_19_24 (8)',
  'guide-world-daredevil': '20_19_24 (5)',
  'guide-world-mastermind': '20_19_04 (3)',
  'guide-world-conqueror': '20_19_24 (10)',
  'guide-world-socializer': '20_19_24 (3)',
  'guide-world-achiever': '20_19_24 (4)',
};

mkdirSync(output, { recursive: true });
for (const [name, time] of Object.entries(scenes)) {
  execFileSync('magick', ['-limit', 'thread', '1',
    join(source, 'Cenarios', `ChatGPT Image 15 de set. de 2026, ${time}.png`),
    '-resize', '1600x900>', '-strip', '-quality', '86', join(output, `${name}.webp`)]);
  console.log(`${name}.webp`);
}
