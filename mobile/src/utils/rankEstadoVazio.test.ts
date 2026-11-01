import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import tinycolor from "tinycolor2";

import { buildProfileShellPaletteFromAccent, resolveSystemVisualTheme } from "./profileShellPalette";
import {
  coresDoRankVazio,
  motivoSemRankDaTurma,
  ninguemPontuou,
  textoSemRank,
  type MotivoSemRank,
} from "./rankEstadoVazio";

const base = { quantidadeDeRanks: 0, carregando: false, erro: false, temTurma: true };

test("com ranks carregados não há estado vazio, nem durante uma recarga ou depois de um erro", () => {
  assert.equal(motivoSemRankDaTurma({ ...base, quantidadeDeRanks: 2, carregando: true }), null);
  assert.equal(motivoSemRankDaTurma({ ...base, quantidadeDeRanks: 1, erro: true }), null);
});

test("erro de carga não se passa por turma sem ranking", () => {
  assert.equal(motivoSemRankDaTurma({ ...base, erro: true }), "erro");
  assert.equal(motivoSemRankDaTurma(base), "sem_ranks");
  assert.equal(textoSemRank("erro").acao, "tentar");
  assert.equal(textoSemRank("sem_ranks").acao, "trilha");
});

test("carregando vem antes de erro e de turma", () => {
  assert.equal(motivoSemRankDaTurma({ ...base, carregando: true, erro: true, temTurma: false }), "carregando");
});

test("sem turma é um motivo próprio", () => {
  assert.equal(motivoSemRankDaTurma({ ...base, temTurma: false }), "sem_turma");
});

test("ninguém pontuou: lista vazia, tudo zero ou nulo", () => {
  assert.equal(ninguemPontuou([]), true);
  assert.equal(ninguemPontuou([{ pontuacao: 0 }, { pontuacao: null }, { pontuacao: 0 }]), true);
  assert.equal(ninguemPontuou([{ pontuacao: 0 }, { pontuacao: 3 }]), false);
  // Elo começa em rating positivo: turma de Elo sem partidas não é "ninguém pontuou".
  assert.equal(ninguemPontuou([{ pontuacao: 1000 }, { pontuacao: 1000 }]), false);
});

test("ninguém pontuou: a dica muda com o critério", () => {
  assert.match(textoSemRank("sem_pontuacao", "tempo").texto, /tempo de estudo/);
  assert.match(textoSemRank("sem_pontuacao", "acertos").texto, /acertos/);
  assert.match(textoSemRank("sem_pontuacao", null).texto, /atividades e missões/);
});

test("todo motivo tem título e explicação, e botão com rótulo quando há ação", () => {
  const motivos: MotivoSemRank[] = [
    "carregando", "erro", "sem_turma", "sem_ranks", "sem_pontuacao", "sem_posicao", "recorte_vazio", "nao_encontrado",
  ];
  for (const motivo of motivos) {
    const t = textoSemRank(motivo);
    assert.ok(t.titulo && t.texto && t.icone, motivo);
    assert.equal(Boolean(t.rotuloAcao), t.acao !== null, motivo);
  }
});

/**
 * O cartão é pintado pela paleta do perfil; os tons translúcidos (`textMuted`,
 * `accentMuted`) só têm contraste depois de compostos sobre o fundo. As cores-assinatura
 * são lidas da fonte, como em `notificacaoDetalheCores.test.ts`: `profileImages.ts` não
 * carrega no harness do node.
 */
const PERFIS = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"] as const;
const fonte = readFileSync(join(process.cwd(), "src", "constants", "profileImages.ts"), "utf8");
const blocoDeConfig = fonte.slice(fonte.indexOf("export const brainHexConfig"));

function paletaDe(perfil: string) {
  const achado = new RegExp(`${perfil}:\\s*\\{\\s*color:\\s*"([^"]+)"`).exec(blocoDeConfig);
  assert.ok(achado, `perfil ${perfil} sem cor-assinatura em brainHexConfig`);
  return buildProfileShellPaletteFromAccent(achado[1], resolveSystemVisualTheme(perfil));
}

function sobre(cor: string, fundo: string): string {
  const frente = tinycolor(cor).toRgb();
  const atras = tinycolor(fundo).toRgb();
  const a = frente.a;
  return tinycolor({
    r: frente.r * a + atras.r * (1 - a),
    g: frente.g * a + atras.g * (1 - a),
    b: frente.b * a + atras.b * (1 - a),
  }).toHexString();
}

function contraste(texto: string, fundo: string, base: string): number {
  const fundoOpaco = sobre(fundo, base);
  return tinycolor.readability(sobre(texto, fundoOpaco), fundoOpaco);
}

for (const perfil of PERFIS) {
  test(`cartão de rank vazio tem contraste legível: ${perfil}`, () => {
    const c = coresDoRankVazio(paletaDe(perfil));
    // [rótulo, texto, fundo, mínimo]. 7:1 é AAA de texto corrido; 4.5:1 é AAA de texto
    // grande/negrito e o mínimo de ícone e rótulo em caixa alta negrito.
    const pares: [string, string, string, number][] = [
      ["título", c.titulo, c.cartao, 7],
      ["explicação", c.texto, c.cartao, 7],
      ["ícone no selo", c.icone, c.seloFundo, 4.5],
      ["botão principal", c.botaoTexto, c.botaoFundo, 4.5],
      ["botão secundário", c.botaoSecundarioTexto, c.cartao, 7],
      ["botão secundário pressionado", c.botaoSecundarioTexto, c.pressionado, 7],
    ];
    for (const [rotulo, texto, fundo, minimo] of pares) {
      const razao = contraste(texto, fundo, c.cartao);
      assert.ok(razao >= minimo, `${perfil} (${rotulo}): ${razao.toFixed(2)}:1 < ${minimo}:1`);
    }
  });
}
