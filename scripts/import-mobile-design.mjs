import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only the selected production assets are imported; the original library stays outside the repo.
const source = resolve(process.argv[2] || `${process.env.HOME}/Downloads/Design`);
const assets = fileURLToPath(new URL('../mobile/src/assets/', import.meta.url));
const variations = readdirSync(join(source, 'Personagens')).find(
  (name) => name.normalize('NFD').startsWith('Variac'),
);
if (!variations) throw new Error('Missing character variations directory');

const profiles = {
  seeker: ['5f86bf68-049b-492f-9379-98f4fb569149.png', '17_10_55 (2)', '12_35_55 (1)', '20_15_33 (2)'],
  survivor: ['ChatGPT Image 11 de set. de 2026, 15_43_06.png', '17_10_55 (5)', '12_35_55 (2)', '20_19_23 (1)'],
  daredevil: ['03a9aee8-eccf-4771-b3a2-10ea6377c947.png', '17_10_56 (6)', '12_35_56 (3)', '20_19_24 (5)'],
  mastermind: ['5d408457-4f07-4da2-be51-196e71116afc.png', '17_10_55 (3)', '12_35_57 (4)', '20_19_04 (6)'],
  conqueror: ['1385ea91-dbfe-40fc-b64b-8191783b3b41.png', '17_10_55 (4)', '12_36_00 (7)', '20_19_24 (10)'],
  socializer: ['62573e95-087a-4dd8-87de-a8d6bf7a0b33.png', '17_10_56 (7)', '12_36_01 (9)', '20_19_24 (3)'],
  achiever: ['179cda4c-378a-4f3e-bd69-80288724c6c2.png', '17_10_54 (1)', '12_35_58 (6)', '20_19_24 (4)'],
};

// Journey terrain is separate from the identity panoramas used in profile banners.
const maps = {
  seeker: '20_13_22 (6)',
  survivor: '20_13_15 (6)',
  daredevil: '20_13_22 (7)',
  mastermind: '20_13_15 (10)',
  conqueror: '20_13_22 (9)',
  socializer: '20_13_09 (9)',
  achiever: '20_11_39 (6)',
};

const ornaments = {
  seeker: ['20_09_46 (6)', '19_22_41 (1)', '20_11_39 (8)'],
  survivor: ['20_09_46 (9)', '19_22_41 (2)', '20_11_46 (10)'],
  daredevil: ['20_09_46 (1)', '19_22_41 (3)', '20_11_46 (3)'],
  mastermind: ['20_09_46 (4)', '19_22_41 (4)', '20_11_46 (6)'],
  conqueror: ['20_09_46 (3)', '19_22_42 (7)', '20_11_46 (4)'],
  socializer: ['20_11_14 (8)', '19_22_42 (5)', '20_13_04 (4)'],
  achiever: ['20_09_46 (5)', '19_22_42 (6)', '20_11_46 (5)'],
};

const arenas = {
  seeker: '20_20_31 (6)', survivor: '20_20_33 (7)', daredevil: '20_20_29 (5)',
  mastermind: '20_20_36 (9)', conqueror: '20_20_34 (8)',
  socializer: '20_20_25 (3)', achiever: '20_20_27 (4)',
};

function importImage(input, output, size) {
  const target = join(assets, output);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp.${target.split('.').at(-1)}`;
  execFileSync('magick', [join(source, input), '-resize', `${size}>`, '-strip', '-quality', '86', temporary]);
  renameSync(temporary, target);
  console.log(output);
}

for (const [profile, [body, portrait, emblem, world]] of Object.entries(profiles)) {
  const guardian = profile === 'socializer' ? 'socializer-duo' : profile;
  importImage(`Personagens/${body}`, `guardioes/${guardian}.png`, '640x900');
  importImage(`Personagens/${variations}/Foto perfil/ChatGPT Image 13 de set. de 2026, ${portrait}.png`, `guardioes/rosto/${guardian}.png`, '256x256');
  importImage(`Emblemas, Conquistas e Outros/ChatGPT Image 11 de set. de 2026, ${emblem}.png`, `design/emblem-${profile}.png`, '256x256');
  importImage(`Cenarios/ChatGPT Image 15 de set. de 2026, ${world}.png`, `design/world-${profile}.webp`, '1200x1400');
  importImage(`Cenarios/ChatGPT Image 15 de set. de 2026, ${maps[profile]}.png`, `design/map-${profile}.webp`, '1200x1400');
}
for (const [profile, [frame, totem, trail]] of Object.entries(ornaments)) {
  const target = join(assets, `design/frame-${profile}.png`);
  execFileSync('magick', [join(source, `Molduras/ChatGPT Image 15 de set. de 2026, ${frame}.png`),
    '-trim', '+repage', '-resize', '256x256', '-gravity', 'center', '-background', 'none',
    '-extent', '256x256', '-strip', '-define', 'png:color-type=6', target]);
  importImage(`Totens/ChatGPT Image 13 de set. de 2026, ${totem}.png`, `design/totem-${profile}.png`, '256x384');
  importImage(`Cenarios/ChatGPT Image 15 de set. de 2026, ${trail}.png`, `design/trail-${profile}.webp`, '1200x1400');
}
for (const [profile, time] of Object.entries(arenas)) {
  importImage(`Cenarios/ChatGPT Image 15 de set. de 2026, ${time}.png`, `design/arena-${profile}.webp`, '1200x1400');
}
importImage('Cenarios/ChatGPT Image 15 de set. de 2026, 20_11_39 (1).png', 'design/entry-world.webp', '1200x1400');
importImage('Logo/ChatGPT Image 11 de set. de 2026, 13_38_57.png', 'design/trailup-star.png', '256x256');

const objects = {
  trophy: '15 de set. de 2026, 20_41_23 (3)',
  gold: '13 de set. de 2026, 22_49_42 (1)',
  silver: '13 de set. de 2026, 22_49_39 (6)',
  bronze: '13 de set. de 2026, 22_49_39 (7)',
  bag: '13 de set. de 2026, 22_49_40 (9)',
  chest: '13 de set. de 2026, 22_49_44 (6)',
  bell: '13 de set. de 2026, 22_49_37 (4)',
  deadline: '13 de set. de 2026, 22_49_08 (3)',
  hint: '13 de set. de 2026, 22_48_40 (7)',
  book: '13 de set. de 2026, 22_49_07 (1)',
  retry: '13 de set. de 2026, 22_49_17 (6)',
  community: '13 de set. de 2026, 22_49_47 (9)',
  coin: '13 de set. de 2026, 22_49_27 (2)',
  compass: '13 de set. de 2026, 22_49_27 (1)',
  calendar: '13 de set. de 2026, 22_48_24 (1)',
  bolt: '13 de set. de 2026, 22_48_26 (4)',
  completion: '13 de set. de 2026, 22_48_39 (6)',
  map: '13 de set. de 2026, 22_49_09 (4)',
  steps: '13 de set. de 2026, 22_48_30 (8)',
};
for (const [name, filename] of Object.entries(objects)) {
  execFileSync('magick', [join(source, `Emblemas, Conquistas e Outros/ChatGPT Image ${filename}.png`),
    '-trim', '+repage', '-resize', '256x256', '-gravity', 'center', '-background', 'none',
    '-extent', '256x256', '-strip', '-define', 'png:color-type=6', join(assets, `design/object-${name}.png`)]);
}
