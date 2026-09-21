import assert from "node:assert/strict";
import test from "node:test";

import {
  alternarSelecao,
  formatoDeRelacao,
  itensDaLista,
  ligarPar,
  listasDaAssociacao,
  moverItem,
  respostaCompleta,
  respostaParaOServidor,
} from "./formatosDeQuestao";

test("os quatro formatos antigos nao viram formato de relacao", () => {
  for (const tipo of ["multipla", "verdadeiro_falso", "fill_blank", "dissertativa"]) {
    assert.equal(formatoDeRelacao(tipo), null, tipo);
  }
  assert.equal(formatoDeRelacao(null), null);
  assert.equal(formatoDeRelacao(""), null);
});

test("o formato e reconhecido com acento, caixa e apelido", () => {
  assert.equal(formatoDeRelacao("associacao"), "associacao");
  assert.equal(formatoDeRelacao("ASSOCIAÇÃO"), "associacao");
  assert.equal(formatoDeRelacao("ligar_termos"), "associacao");
  assert.equal(formatoDeRelacao("Ordenação"), "ordenacao");
  assert.equal(formatoDeRelacao("multipla_resposta"), "multipla_resposta");
});

test("as listas da associacao chegam SOLTAS, sem pareamento", () => {
  // O par mora em `questao_gabarito`. Se algum dia vier par aqui, e vazamento.
  const alts = {
    termos: ["Stub", "Skeleton"],
    definicoes: ["Lado do servidor", "Lado do cliente"],
  };
  assert.deepEqual(listasDaAssociacao(alts), alts);
  assert.deepEqual(listasDaAssociacao(null), { termos: [], definicoes: [] });
  assert.deepEqual(listasDaAssociacao(["a", "b"]), { termos: [], definicoes: [] });
});

test("ligar par mantem 1:1 nos DOIS lados", () => {
  let pares: Array<[string, string]> = [];
  pares = ligarPar(pares, "Stub", "Cliente");
  pares = ligarPar(pares, "Skeleton", "Servidor");
  assert.deepEqual(pares, [
    ["Stub", "Cliente"],
    ["Skeleton", "Servidor"],
  ]);

  // Reusar a MESMA definicao noutro termo desfaz o vinculo antigo dela.
  pares = ligarPar(pares, "Marshalling", "Cliente");
  assert.deepEqual(pares, [
    ["Skeleton", "Servidor"],
    ["Marshalling", "Cliente"],
  ]);

  // Trocar a definicao de um termo ja ligado nao duplica o termo.
  pares = ligarPar(pares, "Skeleton", "Empacotar");
  assert.deepEqual(pares, [
    ["Marshalling", "Cliente"],
    ["Skeleton", "Empacotar"],
  ]);

  // Tocar no mesmo par de novo desliga.
  pares = ligarPar(pares, "Skeleton", "Empacotar");
  assert.deepEqual(pares, [["Marshalling", "Cliente"]]);
});

test("mover item respeita as bordas em vez de embaralhar", () => {
  const itens = ["a", "b", "c"];
  assert.deepEqual(moverItem(itens, 0, 1), ["b", "a", "c"]);
  assert.deepEqual(moverItem(itens, 2, -1), ["a", "c", "b"]);
  // Fora da lista: devolve intacto, nao estoura nem rotaciona.
  assert.deepEqual(moverItem(itens, 0, -1), itens);
  assert.deepEqual(moverItem(itens, 2, 1), itens);
  assert.deepEqual(moverItem(itens, -1, 1), itens);
});

test("alternar selecao preserva a ordem de marcacao", () => {
  let sel: string[] = [];
  sel = alternarSelecao(sel, "b");
  sel = alternarSelecao(sel, "a");
  assert.deepEqual(sel, ["b", "a"]);
  sel = alternarSelecao(sel, "b");
  assert.deepEqual(sel, ["a"]);
});

test("multipla_resposta NAO exige o total -- isso entregaria a contagem", () => {
  // Exigir que o aluno marque exatamente tantas quantas o gabarito tem contaria
  // a ele quantas sao certas, que e metade da resposta.
  assert.equal(
    respostaCompleta({ formato: "multipla_resposta", totalDeItens: 4, escolhidos: 1 }),
    true
  );
  assert.equal(
    respostaCompleta({ formato: "multipla_resposta", totalDeItens: 4, escolhidos: 0 }),
    false
  );
});

test("associacao e ordenacao so confirmam completas", () => {
  // O banco reprova conjunto de tamanho diferente. Deixar confirmar incompleto
  // gastaria uma tentativa do aluno num erro que a tela sabia prever.
  assert.equal(
    respostaCompleta({ formato: "associacao", totalDeItens: 3, escolhidos: 2 }),
    false
  );
  assert.equal(
    respostaCompleta({ formato: "associacao", totalDeItens: 3, escolhidos: 3 }),
    true
  );
  assert.equal(
    respostaCompleta({ formato: "ordenacao", totalDeItens: 4, escolhidos: 4 }),
    true
  );
  assert.equal(
    respostaCompleta({ formato: "ordenacao", totalDeItens: 0, escolhidos: 0 }),
    false
  );
});

test("a resposta viaja como JSON, inclusive com o separador no texto", () => {
  // O motivo de nao usar barra: uma opcao legitima pode conter barra.
  const escolha: string[] = ["TCP/IP | camada", "UDP"];
  const json = respostaParaOServidor("multipla_resposta", escolha);
  assert.deepEqual(JSON.parse(json), escolha);

  const pares: Array<[string, string]> = [["Stub", "Lado do cliente"]];
  assert.deepEqual(JSON.parse(respostaParaOServidor("associacao", pares)), pares);
});

test("itens da lista descartam vazio sem quebrar a ordem", () => {
  assert.deepEqual(itensDaLista(["a", "", "  ", "b"]), ["a", "b"]);
  assert.deepEqual(itensDaLista(null), []);
  assert.deepEqual(itensDaLista({ termos: [] }), []);
});
