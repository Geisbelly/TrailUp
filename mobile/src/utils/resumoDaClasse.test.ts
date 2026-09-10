import assert from "node:assert/strict";
import test from "node:test";

import { lerCampo, mapearResumoDaClasse } from "./resumoDaClasse";

// A linha como `vw_aluno_classe_resumo` a devolve de verdade, medida em
// producao (classe 32): camelCase, e `numeric` como STRING.
const LINHA_CAMEL = {
  aluno_id: "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
  classe_id: 32,
  materia_nome: "Sistemas Distribuídos",
  materia_descricao: null,
  professor_nome: null,
  professor_descricao: null,
  notaMedia: null,
  tempoMedioPorAtividade: "0.24",
  acertosPercentual: "15",
  porcentagemConcluida: "75.00",
  ultimaAtividade: null,
  tempoGastoMin: "2.17",
  isComplete: false,
  atividadesConcluidas: [],
  recomendacaoTrilha: null,
  modoOperacao: null,
  insights: null,
  perfisDetectados: null,
};

test("o percentual do banco chega ao app", () => {
  // Era ISSO que faltava: `mapResumoRow` lia `row.porcentagemconcluida` e a view
  // expoe `porcentagemConcluida`. O campo vinha `undefined` -> null, e a trilha
  // e as metricas caiam cada uma na sua formula local.
  const resumo = mapearResumoDaClasse(LINHA_CAMEL);
  assert.equal(resumo?.porcentagemConcluida, 75);
});

test("numeric do Postgres vira numero, nao string", () => {
  // O PostgREST devolve `numeric` como string. Sem converter,
  // `porcentagemConcluida` seria "75.00" e `Math.min(100, "75.00")` ainda
  // funcionaria por coercao -- mas `>= 100` em string comparia texto.
  const resumo = mapearResumoDaClasse(LINHA_CAMEL);
  assert.equal(typeof resumo?.porcentagemConcluida, "number");
  assert.equal(resumo?.tempoGastoMin, 2.17);
  assert.equal(resumo?.acertosPercentual, 15);
});

test("as onze colunas que nao chegavam agora chegam", () => {
  const resumo = mapearResumoDaClasse(LINHA_CAMEL);

  assert.equal(resumo?.tempoMedioPorAtividade, 0.24);
  assert.equal(resumo?.tempoGastoMin, 2.17);
  assert.equal(resumo?.acertosPercentual, 15);
  assert.equal(resumo?.porcentagemConcluida, 75);
  assert.equal(resumo?.isComplete, false);
  assert.deepEqual(resumo?.atividadesConcluidas, []);
});

test("o dialeto minusculo tambem e lido", () => {
  // O CLAUDE.md registra que `classe_aluno` existe em dois dialetos, e
  // `trailup_recalcular_classe_aluno` descobre qual esta presente antes de
  // gravar. Ler so um seria trocar um ambiente quebrado pelo outro.
  const resumo = mapearResumoDaClasse({
    aluno_id: "a",
    classe_id: 7,
    porcentagemconcluida: "42.5",
    tempogastomin: "9",
    iscomplete: true,
  });

  assert.equal(resumo?.porcentagemConcluida, 42.5);
  assert.equal(resumo?.tempoGastoMin, 9);
  assert.equal(resumo?.isComplete, true);
});

test("camelCase vence quando as duas grafias existem", () => {
  const resumo = mapearResumoDaClasse({
    aluno_id: "a",
    classe_id: 1,
    porcentagemConcluida: "80",
    porcentagemconcluida: "10",
  });
  assert.equal(resumo?.porcentagemConcluida, 80);
});

test("nulo de verdade continua nulo, e nao vira busca pela outra grafia", () => {
  // `notaMedia` vem `null` do banco. Tratar null como "tenta a outra grafia"
  // esconderia dado ausente atras de uma busca que nunca acha nada.
  assert.equal(lerCampo({ notaMedia: null, notamedia: 9 }, "notaMedia"), null);
  assert.equal(mapearResumoDaClasse(LINHA_CAMEL)?.notaMedia, null);
});

test("campo ausente nas duas grafias e undefined", () => {
  assert.equal(lerCampo({}, "porcentagemConcluida"), undefined);
  assert.equal(mapearResumoDaClasse({ aluno_id: "a", classe_id: 1 })?.porcentagemConcluida, null);
});

test("valor nao numerico nao contamina o percentual", () => {
  const resumo = mapearResumoDaClasse({
    aluno_id: "a",
    classe_id: 1,
    porcentagemConcluida: "nao e numero",
  });
  assert.equal(resumo?.porcentagemConcluida, null);
});

test("linha nula devolve nulo", () => {
  assert.equal(mapearResumoDaClasse(null), null);
  assert.equal(lerCampo(null, "porcentagemConcluida"), undefined);
});
