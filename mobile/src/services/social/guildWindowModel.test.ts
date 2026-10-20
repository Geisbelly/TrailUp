import test from "node:test";
import assert from "node:assert/strict";
import { dataHoraBrasilia, estadoDaJanela, formacaoAberta, mensagemDeErroDaGuilda, normalizeJanela, resumoDaJanela } from "./guildWindowModel";

const base = { classe_id: 65, configurada: true, tamanho_maximo: 4, agora: "2026-10-20T15:00:00Z" };

test("turma sem configuração: sempre aberta, tamanho 10", () => {
  const j = normalizeJanela({ classe_id: 65, configurada: false, tamanho_maximo: 10, formacao_inicio: null, formacao_fim: null, janela_aberta: true })!;
  assert.equal(estadoDaJanela(j), "sempre_aberta");
  assert.equal(resumoDaJanela(j).detalhe, "Guildas de até 10 pessoas. Sem prazo para fechar.");
  assert.equal(formacaoAberta(j), true);
});

test("aberta com prazo mostra o fim em Brasília", () => {
  const j = normalizeJanela({ ...base, formacao_inicio: null, formacao_fim: "2026-10-25T02:30:00Z", janela_aberta: true })!;
  assert.equal(estadoDaJanela(j), "aberta");
  // 02:30 UTC é 23:30 do dia anterior em Brasília.
  assert.equal(resumoDaJanela(j).detalhe, "Guildas de até 4 pessoas. Fecha em 24/10 às 23h30 (Brasília).");
});

test("agendada usa o relógio do banco e mostra início e fim", () => {
  const j = normalizeJanela({ ...base, formacao_inicio: "2026-10-21T11:00:00Z", formacao_fim: "2026-10-28T11:00:00Z", janela_aberta: false })!;
  assert.equal(estadoDaJanela(j), "agendada");
  assert.equal(resumoDaJanela(j).titulo, "Formação ainda não abriu");
  assert.equal(resumoDaJanela(j).detalhe, "Abre em 21/10 às 08h00 e fecha em 28/10 às 08h00 (Brasília).");
  assert.equal(formacaoAberta(j), false);
});

test("encerrada", () => {
  const j = normalizeJanela({ ...base, formacao_inicio: null, formacao_fim: "2026-10-20T12:00:00Z", janela_aberta: false })!;
  assert.equal(estadoDaJanela(j), "encerrada");
  assert.match(resumoDaJanela(j).detalhe, /^Fechou em 20\/10 às 09h00 \(Brasília\)\./);
});

test("o booleano do banco manda: aberta mesmo se o relógio do aparelho discordar", () => {
  const j = normalizeJanela({ ...base, agora: null, formacao_fim: "2000-01-01T00:00:00Z", janela_aberta: true })!;
  assert.equal(estadoDaJanela(j), "aberta");
});

test("resposta ausente vira nula e não bloqueia a tela", () => {
  assert.equal(normalizeJanela(null), null);
  assert.equal(formacaoAberta(null), true);
  assert.equal(dataHoraBrasilia("lixo"), "");
});

test("guilda_janela_fechada vira texto amigável, com as datas quando há janela", () => {
  const erro = { message: "guilda_janela_fechada" };
  assert.equal(mensagemDeErroDaGuilda(erro), "A formação de guildas está fechada nesta turma. Fale com o professor.");
  const j = normalizeJanela({ ...base, formacao_inicio: "2026-10-21T11:00:00Z", formacao_fim: null, janela_aberta: false })!;
  assert.equal(mensagemDeErroDaGuilda(erro, j), "Formação ainda não abriu. Abre em 21/10 às 08h00 (Brasília).");
});

test("outros erros de guilda", () => {
  assert.equal(mensagemDeErroDaGuilda({ message: "guilda_cheia" }), "Esta guilda já está completa.");
  assert.equal(mensagemDeErroDaGuilda({ message: "guilda_membro_existente" }), "Você já participa de uma guilda nesta turma.");
  assert.equal(mensagemDeErroDaGuilda(new Error("x")), "Não foi possível concluir a ação.");
});
