import assert from "node:assert/strict";
import test from "node:test";

import { formatarXp, lerFaixaXp, progressoDaFaixa, rpcIndisponivel, textosDaFaixa } from "./faixaXp.core";

const MEIO = {
  classe_id: 54,
  xp: "165",
  nivel: 3,
  titulo: "Trilha aberta",
  total_niveis: 10,
  xp_minimo: 150,
  proximo_minimo: 250,
  proximo_titulo: "Ritmo de trilha",
  xp_na_faixa: "15",
  tamanho_faixa: 100,
  xp_para_proxima: "85",
};

const ULTIMA = {
  ...MEIO,
  xp: 2000,
  nivel: 10,
  titulo: "Lenda da trilha",
  xp_minimo: 1700,
  proximo_minimo: null,
  proximo_titulo: null,
  xp_na_faixa: 300,
  tamanho_faixa: null,
  xp_para_proxima: null,
};

test("lê a linha da RPC, com numeric vindo como texto", () => {
  const f = lerFaixaXp(MEIO);
  assert.deepEqual(f, {
    classeId: 54,
    xp: 165,
    nivel: 3,
    titulo: "Trilha aberta",
    totalNiveis: 10,
    xpMinimo: 150,
    proximoMinimo: 250,
    proximoTitulo: "Ritmo de trilha",
    xpNaFaixa: 15,
    tamanhoFaixa: 100,
    xpParaProxima: 85,
  });
});

test("linha incompleta ou vazia não vira faixa", () => {
  assert.equal(lerFaixaXp(null), null);
  assert.equal(lerFaixaXp({}), null);
  assert.equal(lerFaixaXp({ ...MEIO, titulo: "  " }), null);
  assert.equal(lerFaixaXp({ ...MEIO, nivel: null }), null);
});

test("barra: fração da faixa atual; a última aparece cheia", () => {
  assert.equal(progressoDaFaixa(lerFaixaXp(MEIO)!), 0.15);
  assert.equal(progressoDaFaixa(lerFaixaXp({ ...MEIO, xp_na_faixa: 0 })!), 0);
  assert.equal(progressoDaFaixa(lerFaixaXp(ULTIMA)!), 1);
});

test("textos: nível, XP e quanto falta para a próxima pelo nome", () => {
  const t = textosDaFaixa(lerFaixaXp(MEIO)!);
  assert.equal(t.nivel, "Nível 3 de 10");
  assert.equal(t.xp, "165 XP");
  assert.equal(t.proxima, "Faltam 85 XP para Ritmo de trilha");
  assert.equal(t.acessivel, "Trilha aberta, Nível 3 de 10, 165 XP. Faltam 85 XP para Ritmo de trilha.");
});

test("textos da última faixa não prometem próxima", () => {
  const t = textosDaFaixa(lerFaixaXp(ULTIMA)!);
  assert.equal(t.xp, "2.000 XP");
  assert.equal(t.proxima, "Você chegou à última faixa da trilha");
});

test("XP fracionado: o que falta arredonda para cima, o que tem para baixo", () => {
  const t = textosDaFaixa(lerFaixaXp({ ...MEIO, xp: 249.5, xp_na_faixa: 99.5, xp_para_proxima: 0.5 })!);
  assert.equal(t.xp, "249 XP");
  assert.equal(t.proxima, "Faltam 1 XP para Ritmo de trilha");
});

test("formatarXp usa ponto de milhar e nunca negativo", () => {
  assert.equal(formatarXp(1300), "1.300");
  assert.equal(formatarXp(1234567), "1.234.567");
  assert.equal(formatarXp(-5), "0");
});

test("RPC ausente é reconhecida pelo código", () => {
  assert.equal(rpcIndisponivel({ code: "PGRST202" }), true);
  assert.equal(rpcIndisponivel({ code: "42883" }), true);
  assert.equal(rpcIndisponivel({ code: "42501" }), false);
  assert.equal(rpcIndisponivel(null), false);
});
