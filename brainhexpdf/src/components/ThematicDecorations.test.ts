import assert from 'node:assert/strict';
import test from 'node:test';

import { generateMedievalSvgDivider } from './ThematicDecorations';

const PROFILES = ['achiever', 'seeker', 'survivor', 'daredevil', 'mastermind', 'conqueror', 'socializer'];

test('generateMedievalSvgDivider isola o ornamento num SVG proprio (w-auto), imune ao esmagamento das linhas esticadas', () => {
  for (const profile of PROFILES) {
    const svg = generateMedievalSvgDivider(profile);
    // 3 SVGs: linha esquerda (esticavel, none), ornamento (proprio viewport,
    // sem preserveAspectRatio - default xMidYMid meet preserva a forma),
    // linha direita (esticavel, none).
    const svgTags = [...svg.matchAll(/<svg[^>]*>/g)];
    assert.equal(svgTags.length, 3, `perfil ${profile} deveria ter exatamente 3 <svg>`);

    const [left, ornament, right] = svgTags.map((m) => m[0]);
    assert.match(left, /preserveAspectRatio="none"/, `linha esquerda do perfil ${profile} deveria esticar livre (none)`);
    assert.match(right, /preserveAspectRatio="none"/, `linha direita do perfil ${profile} deveria esticar livre (none)`);
    assert.doesNotMatch(ornament, /preserveAspectRatio="none"/, `ornamento do perfil ${profile} NAO pode usar none (perderia a proporcao)`);
    assert.match(ornament, /class="[^"]*\bw-auto\b/, `ornamento do perfil ${profile} precisa de w-auto pra calcular a largura pela propria proporcao`);
  }
});

test('generateMedievalSvgDivider: viewBox dos 3 SVGs cobre 0-600 sem sobreposicao nem buraco', () => {
  for (const profile of PROFILES) {
    const svg = generateMedievalSvgDivider(profile);
    const viewBoxes = [...svg.matchAll(/viewBox="(\d+) 0 (\d+) 40"/g)].map((m) => ({
      start: Number(m[1]),
      width: Number(m[2]),
    }));
    assert.equal(viewBoxes.length, 3, `perfil ${profile} deveria ter 3 viewBox`);

    const [left, ornament, right] = viewBoxes;
    assert.equal(left.start, 0, `perfil ${profile}: viewBox esquerdo deveria comecar em 0`);
    assert.equal(left.start + left.width, ornament.start, `perfil ${profile}: viewBox do ornamento deveria comecar onde o esquerdo termina`);
    assert.equal(ornament.start + ornament.width, right.start, `perfil ${profile}: viewBox direito deveria comecar onde o ornamento termina`);
    assert.equal(right.start + right.width, 600, `perfil ${profile}: viewBox direito deveria terminar em 600`);
  }
});

test('perfil desconhecido cai no divisor padrao (Socializer) sem lancar erro', () => {
  const svg = generateMedievalSvgDivider('perfil-inexistente');
  assert.match(svg, /class="[^"]*\bw-auto\b/);
});
