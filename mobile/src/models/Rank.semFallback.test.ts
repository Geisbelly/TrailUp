import assert from "node:assert/strict";
import test from "node:test";

// O ranking vem so' da view do banco. O app nao pode reconstruir a classificacao
// lendo `eventos_aluno` de outros alunos: a RLS fecha essa leitura, e o calculo
// local mostrava a turma inteira, sem o corte da view.

const tabelasLidas: string[] = [];
let viewRanksInfo: { data: unknown[] | null; error: unknown } = { data: [], error: null };
let viewPosicoes: { data: unknown[] | null; error: unknown } = { data: [], error: null };

function consulta(resultado: () => { data: unknown[] | null; error: unknown }) {
  const q: any = {
    select: () => q,
    eq: () => q,
    in: () => q,
    order: () => q,
    single: () => q,
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
      Promise.resolve(resultado()).then(ok, ko),
  };
  return q;
}

const supabaseStub = {
  from(tabela: string) {
    tabelasLidas.push(tabela);
    if (tabela === "vw_ranks_info_por_classe") return consulta(() => viewRanksInfo);
    if (tabela === "vw_rank_posicoes_por_classe") return consulta(() => viewPosicoes);
    // Qualquer outra tabela (eventos_aluno, classe_aluno, alunos, topicos...) e' calculo local.
    throw new Error(`leitura proibida: ${tabela}`);
  },
};

/* eslint-disable @typescript-eslint/no-require-imports */
(require.cache as Record<string, unknown>)[require.resolve("@/database/supabase")] = {
  exports: { supabase: supabaseStub },
};
const { ClasseRanking } = require("./Rank") as typeof import("./Rank");

const info = {
  rank_id: 5,
  classe_id: 54,
  nome_rank: "Pontuação",
  descricao: null,
  criterio: "pontuacao",
  icone: null,
};

function reinicia() {
  tabelasLidas.length = 0;
  viewRanksInfo = { data: [info], error: null };
  viewPosicoes = { data: [], error: null };
}

test("view vazia: ranking vazio, sem consultar eventos_aluno nem recalcular", async () => {
  reinicia();
  const classe = await ClasseRanking.loadAllByClasse(54);
  assert.equal(classe.ranks.length, 1);
  assert.deepEqual(classe.ranks[0].posicoes, []);
  assert.deepEqual([...new Set(tabelasLidas)].sort(), [
    "vw_rank_posicoes_por_classe",
    "vw_ranks_info_por_classe",
  ]);
});

test("erro da view de posicoes: rejeita, nao inventa ranking", async () => {
  reinicia();
  const erro = new Error("42501 permission denied");
  viewPosicoes = { data: null, error: erro };
  await assert.rejects(ClasseRanking.loadAllByClasse(54), erro);
  assert.ok(!tabelasLidas.includes("eventos_aluno"));
});

test("view com linhas: devolve as mesmas linhas, na ordem da view", async () => {
  reinicia();
  viewPosicoes = {
    data: [
      { rank_id: 5, classe_id: 54, posicao: 1, id_aluno: "a1", nome_aluno: "Ana", pontuacao: 90, percentual_do_lider: 100, medalha: "ouro" },
      { rank_id: 5, classe_id: 54, posicao: 2, id_aluno: "a2", nome_aluno: "Bia", pontuacao: 45, percentual_do_lider: 50, medalha: "prata" },
    ],
    error: null,
  };
  const classe = await ClasseRanking.loadAllByClasse(54);
  const linhas = classe.ranks[0].posicoes;
  assert.deepEqual(
    linhas.map((p) => [p.id_aluno, p.posicao, p.pontuacao, p.nome_aluno, p.medalha]),
    [["a1", 1, 90, "Ana", "ouro"], ["a2", 2, 45, "Bia", "prata"]],
  );
  assert.ok(!tabelasLidas.includes("eventos_aluno"));
});

test("getPosicaoDoAluno: progresso vem de percentual_do_lider da view", async () => {
  reinicia();
  viewPosicoes = {
    data: [
      { rank_id: 5, classe_id: 54, posicao: 2, id_aluno: "a2", nome_aluno: "Bia", pontuacao: 45, percentual_do_lider: 42, medalha: "prata" },
    ],
    error: null,
  };
  // posicoes vazio: a posicao do aluno nao esta' carregada e e' buscada na view
  const { RankDaClasse } = require("./Rank") as typeof import("./Rank");
  const rank = new RankDaClasse(info as never);
  const posicao = await rank.getPosicaoDoAluno("a2");
  assert.ok(posicao);
  assert.equal(posicao.progresso, 42);
  assert.equal(posicao.posicao, 2);
});
