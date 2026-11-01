import assert from 'node:assert/strict';
import test from 'node:test';
import tinycolor from 'tinycolor2';
import { BOSS_SHIELD_COLOR, paletaDoBossNoPerfil } from './bossPerfilPalette';
import { buildProfileShellPaletteFromAccent } from './profileShellPalette';

const assinaturas = {
  seeker: '#17a398', survivor: '#4e5a66', daredevil: '#d7263d', mastermind: '#5b3fd9',
  conqueror: '#1e4fd6', socializer: '#f4623a', achiever: '#c9a227',
};

for (const [perfil, cor] of Object.entries(assinaturas)) {
  test(`painel de batalha do ${perfil} usa a paleta do perfil com contraste AAA`, () => {
    const paleta = paletaDoBossNoPerfil(buildProfileShellPaletteFromAccent(cor));
    // Título, cronômetro e dano são texto em accent sobre o fundo do painel.
    assert.ok(tinycolor.readability(paleta.accentColor, paleta.secondaryColor) >= 4.5, perfil);
    assert.ok(tinycolor.readability(paleta.textColor, paleta.secondaryColor) >= 7, perfil);

    // Só a luminosidade sobe: matiz e saturação da assinatura ficam (misturar com branco
    // desaturaria o accent).
    const original = tinycolor(cor).toHsl();
    const accent = tinycolor(paleta.accentColor).toHsl();
    const distancia = Math.abs(accent.h - original.h);
    assert.ok(Math.min(distancia, 360 - distancia) < 4, `${perfil}: matiz ${accent.h} ≠ ${original.h}`);
    assert.ok(Math.abs(accent.s - original.s) < 0.03, `${perfil}: saturação ${accent.s} ≠ ${original.s}`);
    assert.ok(accent.l >= original.l - 0.01, perfil);

    assert.equal(paleta.hpColor, paleta.accentColor);
    assert.equal(paleta.shieldColor, BOSS_SHIELD_COLOR);
    // O painel concatena alfa em hex (`${cor}66`): as cores têm de vir em #rrggbb.
    for (const valor of Object.values(paleta)) assert.match(valor, /^#[0-9a-f]{6}$/);
  });
}

test('a paleta laranja fixa do boss padrão não aparece em nenhum perfil', () => {
  for (const cor of Object.values(assinaturas)) {
    const paleta = paletaDoBossNoPerfil(buildProfileShellPaletteFromAccent(cor));
    assert.notEqual(paleta.primaryColor, '#f97316');
    assert.notEqual(paleta.secondaryColor, '#26162b');
  }
});
