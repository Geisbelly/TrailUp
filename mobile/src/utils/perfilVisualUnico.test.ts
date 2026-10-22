import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";

import { PERFIL_PADRAO, perfilVisualDoAluno } from "./brainHex";

/**
 * "Qual é o perfil deste aluno?" tem de ter UMA resposta.
 *
 * Tinha duas, com defaults diferentes: a trilha usava
 * `resolveActiveBrainHexProfile(..., 'seeker')` e tudo que pintava usava
 * `usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome`, cujo default acaba em mastermind —
 * mais `'conqueror'` e `''` em outras cópias. Enquanto `perfis` não chegava do banco (é uma
 * consulta separada, posterior à sessão), o aluno via o cabeçalho e o guardião da trilha em
 * VERDE de seeker por cima de um corpo ROXO de mastermind. Com aluno sem `aluno_perfil`, a
 * divergência é permanente.
 */

const HIDRATANDO = { perfilAtivo: null, perfis: [] };

test("aluno ainda hidratando cai no padrao do sistema, nao num segundo padrao", () => {
  // Este e' o estado em que a tela nasce: `SessionProvider` comeca com `perfis: []` e
  // `perfilAtivo: null`, e so' depois a consulta de perfis responde.
  assert.equal(perfilVisualDoAluno(HIDRATANDO), PERFIL_PADRAO);
  assert.equal(perfilVisualDoAluno(null), PERFIL_PADRAO);
  assert.equal(perfilVisualDoAluno(undefined), PERFIL_PADRAO);
  assert.equal(perfilVisualDoAluno({}), PERFIL_PADRAO);
});

test("o padrao do sistema e o mesmo de getBrainHexConfig", () => {
  // `profileImages.ts` nao carrega no harness (require de PNG), entao o contrato e' lido da
  // fonte. Se os dois padroes se separarem de novo, a tela volta a ter duas cores.
  const fonte = readFileSync(join(process.cwd(), "src", "constants", "profileImages.ts"), "utf8");
  assert.ok(
    fonte.includes(`brainHexConfig[normalized ?? "${PERFIL_PADRAO}"]`),
    `getBrainHexConfig nao cai mais em "${PERFIL_PADRAO}" — os dois padroes se separaram`
  );
});

test("a escolha do aluno manda quando continua representativa", () => {
  const aluno = {
    perfilAtivo: "socializer",
    perfis: [
      { nome: "seeker", afinidade: 42 },
      { nome: "socializer", afinidade: 35 },
    ],
  };
  assert.equal(perfilVisualDoAluno(aluno), "socializer");
});

test("escolha que deixou de ser representativa volta ao dominante", () => {
  // A afinidade muda com a telemetria: uma escolha valida ontem pode nao ser hoje. Esta e' a
  // regra do produto, e era justamente o que o atalho `perfis?.[0]?.nome` nao fazia.
  const aluno = {
    perfilAtivo: "seeker",
    perfis: [
      { nome: "mastermind", afinidade: 55 },
      { nome: "achiever", afinidade: 30 },
      { nome: "seeker", afinidade: 2 },
    ],
  };
  assert.equal(perfilVisualDoAluno(aluno), "mastermind");
});

test("aluno sem nenhuma linha de perfil nao fica entre dois perfis", () => {
  // Caso real em producao: um aluno com zero linhas em `aluno_perfil`. Antes a trilha dizia
  // seeker e a paleta dizia mastermind, e nada reconciliava.
  const semPerfil = { perfilAtivo: null, perfis: [] };
  assert.equal(perfilVisualDoAluno(semPerfil), PERFIL_PADRAO);
});

/** Varredura de fonte: a expressao crua nao pode voltar. */
function telas(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return telas(caminho);
    return [".ts", ".tsx"].includes(extname(nome)) && !nome.includes(".test.") ? [caminho] : [];
  });
}

test("ninguem volta a resolver o perfil na mao", () => {
  const culpados: string[] = [];
  for (const caminho of telas(join(process.cwd(), "src"))) {
    const texto = readFileSync(caminho, "utf8");
    if (texto.includes("perfilAtivo ?? usuario?.perfis")) {
      culpados.push(relative(process.cwd(), caminho).split("\\").join("/"));
    }
  }
  assert.deepEqual(
    culpados,
    [],
    "expressao crua de volta — use perfilVisualDoAluno:\n  " + culpados.join("\n  ")
  );
});
