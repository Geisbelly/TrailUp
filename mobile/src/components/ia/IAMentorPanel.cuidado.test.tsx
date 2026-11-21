import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

// O Guia liga o modo de cuidado (spec 2026-11-20, seção 2). O painel tem dependências demais para
// montar aqui; a decisão é a função pura `ligarCuidadoSeOGuiaPediu`, ligada ao core de verdade
// do modo de cuidado, e o teste confere que o painel a chama com a resposta e o `ligarPeloGuia`.

/* eslint-disable @typescript-eslint/no-require-imports */
const { ligarCuidadoSeOGuiaPediu } = require("./modoCuidadoDoGuia") as typeof import("./modoCuidadoDoGuia");
const { criarModoDeCuidado } =
  require("@/context/modoDeCuidado.core") as typeof import("@/context/modoDeCuidado.core");

const T0 = Date.parse("2026-11-20T12:00:00Z");

function montarModo() {
  const registros: unknown[] = [];
  const modo = criarModoDeCuidado({
    registrar: async (params) => {
      registros.push(params);
      return { ok: false, motivo: "falha" };
    },
    lerAtivo: async () => null,
    responder: async () => true,
    agora: () => T0,
  });
  return { modo, registros };
}

const respostaBase = { reply: "Parece um momento difícil. Vamos respirar juntos?", scope: "modulo" as const };

test("resposta do Guia com modo_cuidado liga o modo; sem o campo, nada muda", () => {
  const { modo, registros } = montarModo();
  const ligou = ligarCuidadoSeOGuiaPediu(
    { ...respostaBase, modo_cuidado: { nivel: "risco", expira_em: "2026-11-20T14:00:00Z" } },
    modo.ligarPeloGuia
  );
  assert.equal(ligou, true);
  assert.equal(modo.estado().ativo, true);
  assert.equal(modo.estado().origem, "aluno_disse");
  assert.equal(modo.estado().expiraEm, Date.parse("2026-11-20T14:00:00Z"));
  // O aparelho não grava o que o aluno disse: quem grava é a API.
  assert.deepEqual(registros, []);

  // API antiga (sem o campo), nulo, ou valor que não se entende: nada muda.
  for (const resposta of [
    respostaBase,
    { ...respostaBase, modo_cuidado: null },
    { ...respostaBase, modo_cuidado: { nivel: "nenhum", expira_em: null } },
    { ...respostaBase, modo_cuidado: "risco" },
    null,
    undefined,
  ]) {
    const outro = montarModo();
    assert.equal(ligarCuidadoSeOGuiaPediu(resposta, outro.modo.ligarPeloGuia), false);
    assert.equal(outro.modo.estado().ativo, false);
  }
});

test("sem consentimento (expira_em nulo) o alívio vale no aparelho, com a duração local", () => {
  const { modo } = montarModo();
  assert.equal(ligarCuidadoSeOGuiaPediu({ ...respostaBase, modo_cuidado: { nivel: "crise", expira_em: null } }, modo.ligarPeloGuia), true);
  assert.equal(modo.estado().ativo, true);
  assert.equal(modo.estado().expiraEm, T0 + 120 * 60_000);
});

test("falha ao ligar não derruba a resposta do Guia", () => {
  const ligou = ligarCuidadoSeOGuiaPediu({ ...respostaBase, modo_cuidado: { nivel: "desconforto", expira_em: null } }, () => {
    throw new Error("quebrou");
  });
  assert.equal(ligou, false);
});

test("o painel chama o modo de cuidado com a resposta, antes de desenhar o texto", () => {
  const fonte = readFileSync(resolve(__dirname, "IAMentorPanel.tsx"), "utf8");
  assert.match(fonte, /const \{ ligarPeloGuia \} = useModoDeCuidado\(\);/);
  const chamada = fonte.indexOf("ligarCuidadoSeOGuiaPediu(response, ligarPeloGuia)");
  const vazio = fonte.indexOf('throw new Error("mentor_reply_empty")');
  assert.ok(chamada > 0, "o painel não liga o modo de cuidado");
  assert.ok(chamada < vazio, "resposta sem texto não pode impedir o alívio");
});
