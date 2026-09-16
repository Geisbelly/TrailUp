import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import tinycolor from 'tinycolor2';
import { Design } from '../styles/design';
import { achievementArtKey } from '../utils/achievementArtwork';

test('every bundled design reference is a valid, bounded PNG or WebP asset', () => {
  const source = readFileSync(join(process.cwd(), 'src/constants/designAssets.ts'), 'utf8');
  const references = [...source.matchAll(/require\('(@\/assets\/design\/[^']+)'\)/g)];
  assert.equal(references.length, 70, 'profile families, arenas, public art and nineteen contextual objects');
  const hashes = new Set<string>();
  for (const [, reference] of references) {
    const data = readFileSync(join(process.cwd(), 'src', reference.slice(2)));
    hashes.add(createHash('sha256').update(data).digest('hex'));
    assert.ok(data.length < 300_000, `${reference} exceeds the mobile asset budget`);
    if (reference.endsWith('.png')) {
      assert.equal(data.subarray(1, 4).toString(), 'PNG', reference);
      const width = data.readUInt32BE(16);
      const height = data.readUInt32BE(20);
      const maxHeight = reference.includes('/totem-') ? 384 : 256;
      assert.ok(width > 0 && width <= 256 && height > 0 && height <= maxHeight, reference);
      if (reference.includes('/frame-')) {
        assert.equal(width, 256, 'frames share a fixed square canvas');
        assert.equal(height, 256);
        assert.equal(data[25], 6, 'frames preserve RGBA transparency');
      }
    } else {
      assert.equal(data.subarray(0, 4).toString(), 'RIFF', reference);
      assert.equal(data.subarray(8, 12).toString(), 'WEBP', reference);
    }
  }
  assert.equal(hashes.size, 70, 'different visual roles must use distinct artwork');
});

test('all trail layouts share a full background instead of a header-only image', () => {
  const header = readFileSync(join(process.cwd(), 'src/components/trilhas/common/GameHeader.tsx'), 'utf8');
  const trail = readFileSync(join(process.cwd(), 'src/components/trilhas/TrilhaBase.tsx'), 'utf8');
  assert.match(trail, /source=\{getProfileArtwork\(perfil, ['"]trail['"]\)\}/);
  assert.ok(trail.includes('StyleSheet.absoluteFill'));
  assert.equal(header.includes('s.scenery'), false, 'the header must not consume the scenery as a cropped strip');
  assert.ok(trail.includes('<GameHeader'));
  for (const component of ['TrilhaMapaHeroStable', 'TrilhaArvoreSimple', 'TrilhaLinearList']) {
    assert.ok(trail.includes(`<${component}`));
  }
  for (const component of ['ArvoreView', 'ListaSimplesView']) {
    const source = readFileSync(join(process.cwd(), `src/components/trilhas/${component}.tsx`), 'utf8');
    assert.equal(source.includes('<HallBackground'), false, `${component} must not hide the scenery with an opaque reading background`);
  }
});

test('ranking entry does not use a decorative profile totem', () => {
  const ranking = readFileSync(join(process.cwd(), 'src/app/(tabs)/ranking/index.tsx'), 'utf8');
  assert.equal(ranking.includes('profileTotems'), false);
});

test('common achievements each receive artwork related to their actual criterion', () => {
  const kinds = ['simples', 'tempo', 'dias', 'acertos', 'tempo_total', 'exploracao'];
  assert.equal(new Set(kinds.map(achievementArtKey)).size, kinds.length);
  assert.equal(achievementArtKey('brainhex_mastermind_analista'), 'book');
  assert.equal(achievementArtKey('brainhex_socializer_amizade'), 'community');
  assert.equal(achievementArtKey(undefined), 'gold');
});

test('reading text and controls retain AA contrast on all purple surfaces', () => {
  for (const background of [Design.ink, Design.surface, Design.elevated]) {
    for (const foreground of [Design.text, Design.muted, Design.gold, Design.primary]) {
      assert.ok(tinycolor.readability(background, foreground) >= 4.5, `${foreground} on ${background}`);
    }
  }
  assert.ok(tinycolor.readability(Design.gold, Design.ink) >= 4.5);
});
