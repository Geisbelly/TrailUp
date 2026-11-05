import assert from "node:assert/strict";
import test from "node:test";

import {
  continuaConsultando,
  faseDoDiagnostico,
  intervaloDaConsulta,
  lerPerguntas,
  respostasParaEnviar,
  textoDoNivel,
  AVISO_DO_CARTAO,
  type LinhaDoDiagnostico,
} from "./diagnosticoModel";

const PERGUNTAS = [
  { id: 0, enunciado: "Onde ocorre a fotossíntese?", opcoes: ["cloroplasto", "núcleo", "ribossomo"] },
  { id: 1, enunciado: "O que a planta absorve?", opcoes: ["luz", "sombra"] },
];
const linha = (status: LinhaDoDiagnostico["status"], extra: Partial<LinhaDoDiagnostico> = {}): LinhaDoDiagnostico => ({
  id: "d1",
  status,
  perguntas: PERGUNTAS,
  nivel: null,
  ...extra,
});

test("lerPerguntas descarta o que veio quebrado em vez de derrubar a tela", () => {
  assert.deepEqual(lerPerguntas(PERGUNTAS), PERGUNTAS);
  assert.deepEqual(lerPerguntas(null), []);
  assert.deepEqual(lerPerguntas("texto"), []);
  assert.deepEqual(lerPerguntas([{ enunciado: 7, opcoes: ["a", "b"] }, { enunciado: "ok?", opcoes: ["só uma"] }, null]), []);
  // Opção que não é texto ou é vazia sai; sobrando menos de duas, a pergunta sai.
  assert.deepEqual(lerPerguntas([{ id: 3, enunciado: "ok?", opcoes: ["a", 9, "  ", "b"] }]), [
    { id: 3, enunciado: "ok?", opcoes: ["a", "b"] },
  ]);
  // Sem id numérico, vale a posição.
  assert.equal(lerPerguntas([{ enunciado: "ok?", opcoes: ["a", "b"] }])[0].id, 0);
});

test("a fase: só pendente e pronto ocupam a tela; o resto segue o tópico sem aviso", () => {
  assert.equal(faseDoDiagnostico({ status: "pendente", id: "d1" }, null), "preparando");
  assert.equal(faseDoDiagnostico(null, linha("pendente")), "preparando");
  assert.equal(faseDoDiagnostico(null, linha("pronto")), "pronto");
  assert.equal(faseDoDiagnostico(null, linha("respondido", { nivel: "inicial" })), "respondido");
  for (const status of ["sem_ia", "dispensado"] as const) assert.equal(faseDoDiagnostico(null, linha(status)), "nada");
  // `retido` (turma do estudo) e `ja_iniciado` não criam linha: nada na tela.
  assert.equal(faseDoDiagnostico({ status: "retido" }, null), "nada");
  assert.equal(faseDoDiagnostico({ status: "ja_iniciado" }, null), "nada");
  assert.equal(faseDoDiagnostico(null, null), "nada");
});

test("pronto sem pergunta legível não mostra cartão vazio", () => {
  assert.equal(faseDoDiagnostico(null, linha("pronto", { perguntas: [] })), "nada");
  assert.equal(faseDoDiagnostico(null, linha("pronto", { perguntas: null })), "nada");
});

test("só consulta de novo enquanto a IA escreve, e o intervalo cresce até um teto", () => {
  assert.equal(continuaConsultando("pendente"), true);
  for (const status of ["pronto", "respondido", "sem_ia", "dispensado", null, undefined] as const) {
    assert.equal(continuaConsultando(status), false);
  }
  assert.deepEqual([1, 2, 3, 5, 6, 40].map(intervaloDaConsulta), [4000, 8000, 12000, 20000, 20000, 20000]);
  assert.equal(intervaloDaConsulta(0), 4000);
});

test("as respostas vão na ordem das perguntas, e o que o aluno pulou vai como null", () => {
  assert.deepEqual(respostasParaEnviar([1, undefined, 0], 3), [1, null, 0]);
  assert.deepEqual(respostasParaEnviar([], 2), [null, null]);
  assert.deepEqual(respostasParaEnviar([2], 3), [2, null, null]);
  // Sobra além do total é descartada; índice inválido vira pulada.
  assert.deepEqual(respostasParaEnviar([0, 1, 2, 3], 2), [0, 1]);
  assert.deepEqual(respostasParaEnviar([-1, 1.5, Number.NaN], 3), [null, null, null]);
});

test("o resultado descreve o ponto de partida: sem nota, sem acertos, sem promessa", () => {
  for (const nivel of ["inicial", "intermediario", "avancado", null] as const) {
    const texto = textoDoNivel(nivel);
    assert.ok(texto.length > 0);
    assert.doesNotMatch(texto, /\d|nota|ponto|acert|errou|pontua/i);
    // O app ainda não adapta o tópico pelo nível: o texto não pode prometer que adapta.
    assert.doesNotMatch(texto, /vamos (reforçar|pular|direto)|vá direto|vai pular/i);
  }
  assert.notEqual(textoDoNivel("avancado"), textoDoNivel("inicial"));
});

test("o aviso do cartão diz que é opcional e que não vale nota", () => {
  assert.match(AVISO_DO_CARTAO, /não vale nota/i);
  assert.match(AVISO_DO_CARTAO, /pode pular/);
});
