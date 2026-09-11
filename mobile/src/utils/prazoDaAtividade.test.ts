import assert from "node:assert/strict";
import test from "node:test";

import {
  formatarPrazoCurto,
  prazoMereceDestaque,
  situacaoDoPrazo,
} from "./prazoDaAtividade";

/** Fim do dia local, que é como o console grava o prazo. */
function fimDoDia(ano: number, mes: number, dia: number): string {
  return new Date(ano, mes - 1, dia, 23, 59, 59, 999).toISOString();
}

const AGORA = new Date(2026, 8, 11, 14, 30, 0); // 11/09/2026, 14h30 local

test("sem prazo não mostra nada", () => {
  for (const vazio of [null, undefined, ""]) {
    const s = situacaoDoPrazo(vazio, AGORA);
    assert.equal(s.estado, "sem-prazo");
    assert.equal(s.rotulo, null);
    assert.equal(s.dias, null);
  }
});

test("data ilegível não vira atrasado", () => {
  // Acusar o aluno por um defeito de dado é pior que não mostrar prazo.
  const s = situacaoDoPrazo("não é data", AGORA);
  assert.equal(s.estado, "sem-prazo");
});

test("prazo de hoje é hoje, mesmo faltando poucas horas", () => {
  const s = situacaoDoPrazo(fimDoDia(2026, 9, 11), AGORA);
  assert.equal(s.estado, "hoje");
  assert.equal(s.dias, 0);
  assert.equal(s.rotulo, "Entrega hoje");
});

test("prazo de amanhã não aparece como 0 dias", () => {
  // A conta é em dias de CALENDÁRIO. Dividir a diferença por 24h daria 0 para
  // algo que vence em 33 horas, e o aluno leria "0 dias" como "é hoje".
  const s = situacaoDoPrazo(fimDoDia(2026, 9, 12), AGORA);
  assert.equal(s.estado, "amanha");
  assert.equal(s.dias, 1);
  assert.equal(s.rotulo, "Entrega amanhã");
});

test("prazo futuro conta os dias", () => {
  const s = situacaoDoPrazo(fimDoDia(2026, 9, 16), AGORA);
  assert.equal(s.estado, "futuro");
  assert.equal(s.dias, 5);
  assert.equal(s.rotulo, "Faltam 5 dias");
});

test("prazo de ontem está atrasado, e diz desde quando", () => {
  const s = situacaoDoPrazo(fimDoDia(2026, 9, 10), AGORA);
  assert.equal(s.estado, "atrasado");
  assert.equal(s.dias, -1);
  assert.equal(s.rotulo, "Atrasado desde ontem");
});

test("atraso de vários dias aparece no plural", () => {
  const s = situacaoDoPrazo(fimDoDia(2026, 9, 4), AGORA);
  assert.equal(s.estado, "atrasado");
  assert.equal(s.rotulo, "Atrasado há 7 dias");
});

test("a hora do dia não muda o estado", () => {
  // Um prazo de hoje é hoje de manhã, de tarde e às 23h59: a conta normaliza
  // as duas pontas para o começo do dia local.
  const prazo = fimDoDia(2026, 9, 11);
  for (const hora of [0, 8, 14, 23]) {
    const s = situacaoDoPrazo(prazo, new Date(2026, 8, 11, hora, 0, 0));
    assert.equal(s.estado, "hoje", `hora ${hora}`);
  }
});

test("virar a meia-noite move de hoje para atrasado", () => {
  const prazo = fimDoDia(2026, 9, 11);
  assert.equal(situacaoDoPrazo(prazo, new Date(2026, 8, 11, 23, 59, 0)).estado, "hoje");
  assert.equal(
    situacaoDoPrazo(prazo, new Date(2026, 8, 12, 0, 1, 0)).estado,
    "atrasado",
  );
});

test("o destaque cobre hoje, amanhã e atrasado -- e só eles", () => {
  const destaque = (iso: string) => prazoMereceDestaque(situacaoDoPrazo(iso, AGORA));

  assert.equal(destaque(fimDoDia(2026, 9, 10)), true, "atrasado");
  assert.equal(destaque(fimDoDia(2026, 9, 11)), true, "hoje");
  assert.equal(destaque(fimDoDia(2026, 9, 12)), true, "amanhã");
  assert.equal(destaque(fimDoDia(2026, 9, 20)), false, "futuro distante");
  assert.equal(prazoMereceDestaque(situacaoDoPrazo(null, AGORA)), false, "sem prazo");
});

test("a data curta omite o ano quando é o ano corrente", () => {
  assert.equal(formatarPrazoCurto(fimDoDia(2026, 9, 20), AGORA), "20/09");
});

test("a data curta mostra o ano quando ele é outro", () => {
  // Omitir enganaria: "05/01" parecendo daqui a poucos dias quando falta um ano.
  assert.equal(formatarPrazoCurto(fimDoDia(2027, 1, 5), AGORA), "05/01/2027");
});

test("a data curta some quando não há prazo", () => {
  assert.equal(formatarPrazoCurto(null, AGORA), null);
  assert.equal(formatarPrazoCurto("qualquer coisa", AGORA), null);
});
