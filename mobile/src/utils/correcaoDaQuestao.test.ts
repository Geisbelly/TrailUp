import assert from "node:assert/strict";
import test from "node:test";

import {
  ERROS_PARA_REVELAR,
  deveRevelarGabarito,
  servidorCorrige,
  vereditoDaRevisao,
  vereditoLocal,
} from "./correcaoDaQuestao";

test("questao do professor vai para o servidor", () => {
  assert.equal(servidorCorrige({ questaoId: 1061 }), true);
  assert.equal(servidorCorrige({ questaoId: "1062" }), true);
  assert.equal(servidorCorrige({ questaoId: 1063, personalizada: false }), true);
});

test("questao personalizada nunca vai, nem com id real", () => {
  // O id real existe -- `_enriquecer_questao` preserva o da semente --, entao a
  // RPC acharia a linha e corrigiria contra o gabarito do professor. Como a
  // versao personalizada reescreve e reordena as alternativas, a letra "A" do
  // aluno nao e a "A" do professor: o veredito sairia errado com cara de certo.
  assert.equal(servidorCorrige({ questaoId: 1061, personalizada: true }), false);
  assert.equal(servidorCorrige({ questaoId: -1876543, personalizada: true }), false);
});

test("id inventado pelo cliente e sempre negativo, e fica na tela", () => {
  // `stableNegativeId` devolve `-Math.max(1, Math.abs(hash))`: negativo, nunca
  // zero. Sem a guarda a RPC responderia `questao_inexistente` e a tela
  // abortaria a resposta.
  assert.equal(servidorCorrige({ questaoId: -1876543 }), false);
  assert.equal(servidorCorrige({ questaoId: -1 }), false);
});

test("id ausente ou sem sentido nao vira chamada de rede", () => {
  for (const valor of [null, undefined, 0, "", "abc", NaN, 12.5, {}, []]) {
    assert.equal(
      servidorCorrige({ questaoId: valor }),
      false,
      `deveria ser local: ${String(valor)}`
    );
  }
});

test("revisao usa o veredito GRAVADO, nunca uma nova correcao", () => {
  let recorrigiu = false;
  const acertouLocalmente = () => {
    recorrigiu = true;
    return false; // o que `checkResposta` devolve com gabarito nulo
  };

  assert.equal(
    vereditoDaRevisao({ corretaGravada: true, podeCorrigirLocalmente: true, acertouLocalmente }),
    "certo"
  );
  assert.equal(recorrigiu, false, "nao pode recorrigir quando ha veredito gravado");

  assert.equal(
    vereditoDaRevisao({ corretaGravada: false, podeCorrigirLocalmente: true, acertouLocalmente }),
    "errado"
  );
});

test("sem veredito gravado e sem gabarito local, nao inventa status", () => {
  // O caso que marcava TUDO como errado ao reabrir atividade concluida.
  assert.equal(
    vereditoDaRevisao({
      corretaGravada: null,
      podeCorrigirLocalmente: false,
      acertouLocalmente: () => false,
    }),
    null
  );
  assert.equal(
    vereditoDaRevisao({
      corretaGravada: undefined,
      podeCorrigirLocalmente: false,
      acertouLocalmente: () => false,
    }),
    null
  );
});

test("personalizada sem veredito gravado ainda corrige localmente", () => {
  assert.equal(
    vereditoDaRevisao({
      corretaGravada: null,
      podeCorrigirLocalmente: true,
      acertouLocalmente: () => true,
    }),
    "certo"
  );
});

test("sem gabarito a tela NAO reprova: devolve null", () => {
  // Medido: 0 das 55 linhas de conteudo_personalizado tem resposta_correta em
  // plano/materiais/ai_patch. No unico caminho que corrige na tela o gabarito
  // nunca existe -- e reprovar nesse caso e' o "sempre da erro" literal.
  assert.equal(
    vereditoLocal({ temGabarito: false, acertouLocalmente: () => true }),
    null
  );
  assert.equal(
    vereditoLocal({ temGabarito: false, acertouLocalmente: () => false }),
    null
  );
});

test("com gabarito a tela decide normalmente", () => {
  assert.equal(
    vereditoLocal({ temGabarito: true, acertouLocalmente: () => true }),
    "certo"
  );
  assert.equal(
    vereditoLocal({ temGabarito: true, acertouLocalmente: () => false }),
    "errado"
  );
});

test("sem gabarito nem chega a corrigir", () => {
  // Chamar o corretor sem ter contra o que comparar e' trabalho a toa, e em
  // fill_blank ele percorre a lista de respostas aceitas.
  let chamou = false;
  vereditoLocal({
    temGabarito: false,
    acertouLocalmente: () => {
      chamou = true;
      return false;
    },
  });
  assert.equal(chamou, false);
});

test("o gabarito aparece ao acertar, ou no SEGUNDO erro", () => {
  assert.equal(deveRevelarGabarito({ errosNaQuestao: 0, acertou: true }), true);
  assert.equal(deveRevelarGabarito({ errosNaQuestao: 1, acertou: false }), false);
  assert.equal(deveRevelarGabarito({ errosNaQuestao: 2, acertou: false }), true);
  assert.equal(deveRevelarGabarito({ errosNaQuestao: 9, acertou: false }), true);
  assert.equal(ERROS_PARA_REVELAR, 2);
});

test("acertar libera mesmo com zero erro anterior", () => {
  // Quem acertou ja produziu a resposta: esconde-la seria esconder o que ele
  // acabou de escrever.
  assert.equal(deveRevelarGabarito({ errosNaQuestao: 0, acertou: true }), true);
});

test("contagem invalida nao libera por acidente", () => {
  assert.equal(
    deveRevelarGabarito({ errosNaQuestao: NaN as unknown as number, acertou: false }),
    false
  );
  assert.equal(
    deveRevelarGabarito({ errosNaQuestao: -1, acertou: false }),
    false
  );
});
