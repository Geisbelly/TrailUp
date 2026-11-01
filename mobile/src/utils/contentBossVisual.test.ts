import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import tinycolor from 'tinycolor2';
import { bossVisuals } from '../constants/bossVisuals';
import type { BrainHexProfile } from '../constants/brainHexProfiles';
import { BOSSES_DO_PERFIL, bossDoPerfil, resolveBossVisualId, resolveContentBossVisual } from './contentBossVisual';

const topics = [
  { id: 1, conteudos: [{ id: 10, metadata: { boss_visual: 'boss-01' } }, { id: 11, metadata: { boss_visual: 'boss-31' } }] },
  { id: 2, conteudos: [{ id: 12, metadata: { boss_visual: null } }] },
];
test('selects the visual of each content independently', () => {
  assert.equal(resolveContentBossVisual(topics, 1, 'content:10'), 'boss-01');
  assert.equal(resolveContentBossVisual(topics, 1, 'content:11'), 'boss-31');
});
test('legacy topic encounters can resolve the enemy content id', () => {
  assert.equal(resolveContentBossVisual(topics, 1, null, 11), 'boss-31');
  assert.equal(resolveContentBossVisual(topics, 1, 'content:10', 11), 'boss-01');
});
test('automatic, missing and unrelated content keep the existing visual', () => {
  assert.equal(resolveContentBossVisual(topics, 2, 'content:12'), null);
  assert.equal(resolveContentBossVisual(topics, 2, 'content:10'), null);
  assert.equal(resolveContentBossVisual(topics, 1, 'question:10'), null);
  assert.equal(resolveContentBossVisual([], 1, 'content:10'), null);
});
test('rejects unknown catalog entries and malformed metadata', () => {
  for (const metadata of [null, 'boss-01', { boss_visual: 'boss-32' }, { boss_visual: 'constructor' }, { boss_visual: 1 }]) {
    assert.equal(resolveContentBossVisual([{ id: 1, conteudos: [{ id: 10, metadata }] }], 1, 'content:10'), null);
  }
});

// Cor-assinatura oficial, lida da fonte (não de um espelho): se ela mudar, o teste do matiz
// abaixo acusa os bosses que deixaram de combinar.
const assinatura = Object.fromEntries(
  [...readFileSync(join(process.cwd(), '..', 'microservice/src/constants/brainHex.ts'), 'utf8')
    .matchAll(/^ {2}(\w+): \{[^}]*?color: "(#[0-9a-f]{6})"/gim)]
    .map(([, perfil, cor]) => [perfil, cor]),
) as Record<BrainHexProfile, string>;
const perfis = Object.keys(BOSSES_DO_PERFIL) as BrainHexProfile[];

test('os 7 perfis têm bosses próprios, todos do catálogo e sem repetir entre perfis', () => {
  assert.deepEqual([...perfis].sort(), Object.keys(assinatura).sort());
  const todos = perfis.flatMap((perfil) => BOSSES_DO_PERFIL[perfil]);
  assert.equal(new Set(todos).size, todos.length);
  for (const id of todos) assert.ok(id in bossVisuals, `${id} não está no catálogo`);
  for (const perfil of perfis) assert.ok(BOSSES_DO_PERFIL[perfil].length >= 3, perfil);
});

// Decodificador mínimo de PNG 8-bit RGBA sem entrelaçamento — o formato dos 31 bosses.
function lerPng(caminho: string) {
  const data = readFileSync(caminho);
  const largura = data.readUInt32BE(16);
  const altura = data.readUInt32BE(20);
  assert.equal(data[24], 8, `${caminho}: profundidade`);
  assert.equal(data[25], 6, `${caminho}: RGBA`);
  assert.equal(data[28], 0, `${caminho}: entrelaçado`);
  const idat: Buffer[] = [];
  for (let pos = 8; pos < data.length;) {
    const tamanho = data.readUInt32BE(pos);
    if (data.toString('latin1', pos + 4, pos + 8) === 'IDAT') idat.push(data.subarray(pos + 8, pos + 8 + tamanho));
    pos += tamanho + 12;
  }
  const bruto = inflateSync(Buffer.concat(idat));
  const linha = largura * 4;
  const px = Buffer.alloc(linha * altura);
  for (let y = 0; y < altura; y += 1) {
    const filtro = bruto[y * (linha + 1)];
    const origem = y * (linha + 1) + 1;
    const destino = y * linha;
    for (let x = 0; x < linha; x += 1) {
      const a = x >= 4 ? px[destino + x - 4] : 0;
      const b = y > 0 ? px[destino - linha + x] : 0;
      const c = x >= 4 && y > 0 ? px[destino - linha + x - 4] : 0;
      let previsto = 0;
      if (filtro === 1) previsto = a;
      else if (filtro === 2) previsto = b;
      else if (filtro === 3) previsto = (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        previsto = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[destino + x] = (bruto[origem + x] + previsto) & 0xff;
    }
  }
  return { largura, altura, px };
}

/** Matiz dominante (média circular ponderada pelo croma) e croma médio da parte opaca. */
function corDominante(id: string) {
  const { largura, altura, px } = lerPng(join(process.cwd(), 'src/assets/bosses', `${id}.png`));
  let sx = 0; let sy = 0; let soma = 0; let n = 0;
  for (let y = 0; y < altura; y += 6) {
    for (let x = 0; x < largura; x += 6) {
      const i = (y * largura + x) * 4;
      if (px[i + 3] < 128) continue;
      const max = Math.max(px[i], px[i + 1], px[i + 2]) / 255;
      const min = Math.min(px[i], px[i + 1], px[i + 2]) / 255;
      const croma = max - min;
      const { h } = tinycolor({ r: px[i], g: px[i + 1], b: px[i + 2] }).toHsl();
      sx += croma * Math.cos((h * Math.PI) / 180);
      sy += croma * Math.sin((h * Math.PI) / 180);
      soma += croma; n += 1;
    }
  }
  return { matiz: ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360, croma: soma / n };
}

const distanciaDeMatiz = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

for (const perfil of perfis) {
  test(`os bosses do ${perfil} têm a cor dominante da assinatura do perfil`, () => {
    const alvo = tinycolor(assinatura[perfil]).toHsl();
    for (const id of BOSSES_DO_PERFIL[perfil]) {
      const { matiz, croma } = corDominante(id);
      const distancia = distanciaDeMatiz(matiz, alvo.h);
      // Assinatura quase sem cor (o ardósia do Survivor): vale também um boss dessaturado.
      const dessaturadoComoOPerfil = alvo.s < 0.25 && croma < 0.2;
      assert.ok(
        distancia <= 25 || dessaturadoComoOPerfil,
        `${id}: matiz ${matiz.toFixed(0)}° (croma ${croma.toFixed(2)}) longe de ${assinatura[perfil]} (${alvo.h.toFixed(0)}°)`,
      );
    }
  });
}

test('a escolha explícita do professor vence, mesmo fora da paleta do perfil', () => {
  // boss-01 é a fênix vermelha; o aluno Conqueror é azul.
  assert.equal(resolveBossVisualId(topics, 'conqueror', 1, 'content:10'), 'boss-01');
  assert.equal(resolveBossVisualId(topics, 'seeker', 1, null, 11), 'boss-31');
});

test('no Automático o boss sai da paleta do perfil e é estável por conteúdo', () => {
  for (const perfil of perfis) {
    const id = resolveBossVisualId(topics, perfil, 2, 'content:12');
    assert.ok(BOSSES_DO_PERFIL[perfil].includes(id), `${perfil}: ${id}`);
    assert.equal(resolveBossVisualId(topics, perfil, 2, 'content:12'), id);
    // Confronto antigo, sem itemKey, resolve pelo contentId do inimigo: mesmo boss.
    assert.equal(resolveBossVisualId(topics, perfil, 2, null, 12), id);
  }
});

test('conteúdos diferentes variam o boss dentro da paleta do perfil', () => {
  for (const perfil of perfis) {
    const vistos = new Set(Array.from({ length: 40 }, (_, i) => resolveBossVisualId([], perfil, 1, `content:${i + 1}`)));
    assert.ok(vistos.size > 1, perfil);
    for (const id of vistos) assert.ok(BOSSES_DO_PERFIL[perfil].includes(id));
  }
});

test('sem conteúdo (confronto do módulo) ainda há boss do perfil, nunca a fênix fixa', () => {
  const id = resolveBossVisualId([], 'conqueror', 7, null, null);
  assert.ok(BOSSES_DO_PERFIL.conqueror.includes(id));
  assert.equal(bossDoPerfil('conqueror', 'topic:7:'), id);
});
