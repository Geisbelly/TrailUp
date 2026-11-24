import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  TAMANHO_DO_NONCE,
  cifrar,
  corrigirNoAparelho,
  decifrar,
  enfileirar,
  falhaDeRede,
  gabaritoParaMostrar,
  lerFila,
  lerGabaritos,
  respostaDaAlternativa,
  respostaProvisoria,
} from "./gabaritoNoAparelho.core";
import { fatorDaRegra } from "./questaoNoBanco.core";

const MIGRATION = readFileSync(
  join(__dirname, "../../../api/alembic/versions/20261124_07_gabarito_das_objetivas_no_aparelho.py"),
  "utf8",
);

// Linhas como `questao_gabaritos_offline` devolveu no dev (turma 68, ensaio de 24/11).
const DO_BANCO = [
  { questao_id: 1427, atividade_id: 401, aceitas: ["Falso"] },
  { questao_id: 1428, atividade_id: 401, aceitas: ["1/2"] },
  { questao_id: 1500, atividade_id: 402, aceitas: ["B", "\\(a-b\\)"] },
];

describe("paridade com a migration 20261124_07", () => {
  // O banco aceita só as candidatas que ele mesmo montou. Se o app mandar outra coisa, o aparelho
  // não reconhece a resposta: nunca erra, só deixa de corrigir na hora.
  it("V/F manda o rótulo, como ARRAY['Verdadeiro', 'Falso']", () => {
    assert.match(MIGRATION, /ARRAY\['Verdadeiro', 'Falso'\]/);
    const alternativas = ["Verdadeiro", "Falso"];
    assert.equal(respostaDaAlternativa({ alternativas, indice: 0, rica: false, verdadeiroOuFalso: true }), "Verdadeiro");
    // V/F rico continua mandando o rótulo, nunca a letra.
    assert.equal(respostaDaAlternativa({ alternativas, indice: 1, rica: true, verdadeiroOuFalso: true }), "Falso");
  });

  it("múltipla manda o texto da alternativa, como r.alts ->> v_i", () => {
    assert.match(MIGRATION, /r\.alts ->> v_i/);
    assert.equal(
      respostaDaAlternativa({ alternativas: ["1/4", "1/2", "1"], indice: 1, rica: false, verdadeiroOuFalso: false }),
      "1/2",
    );
  });

  it("múltipla rica manda a letra, como chr(65 + v_i)", () => {
    assert.match(MIGRATION, /chr\(65 \+ v_i\)/);
    for (let i = 0; i < 5; i++) {
      assert.equal(
        respostaDaAlternativa({ alternativas: ["a", "b", "c", "d", "e"], indice: i, rica: true, verdadeiroOuFalso: false }),
        String.fromCharCode(65 + i),
      );
    }
  });

  it("sem escolha válida manda vazio, que o banco descarta (btrim(c) <> '')", () => {
    assert.match(MIGRATION, /btrim\(c\) <> ''/);
    assert.equal(respostaDaAlternativa({ alternativas: ["a"], indice: null, rica: false, verdadeiroOuFalso: false }), "");
    assert.equal(respostaDaAlternativa({ alternativas: ["a"], indice: 3, rica: false, verdadeiroOuFalso: false }), "");
  });

  it("a pontuação provisória usa os fatores de fn_questao_registrar_resposta", () => {
    const base = { correta: true, pensante: false, gabarito: null, fatorDaNovaTentativa: 0.7 };
    const casos = [
      { viuGabarito: true, respondeuDeNovo: false, novaTentativa: false, regra: "viu_gabarito" as const },
      { viuGabarito: false, respondeuDeNovo: true, novaTentativa: false, regra: "resposta_repetida" as const },
      { viuGabarito: false, respondeuDeNovo: false, novaTentativa: true, regra: "nova_tentativa" as const },
      { viuGabarito: false, respondeuDeNovo: false, novaTentativa: false, regra: "primeira" as const },
    ];
    for (const { regra, ...flags } of casos) {
      const r = respostaProvisoria({ ...base, ...flags });
      assert.equal(r.regra, regra);
      assert.equal(r.acertosPercentual, Math.round(100 * fatorDaRegra(regra, 0.7)));
    }
  });
});

describe("corrigirNoAparelho", () => {
  const gabaritos = lerGabaritos(DO_BANCO);

  it("corrige o que está no gabarito", () => {
    assert.equal(corrigirNoAparelho(gabaritos, 1427, "Falso"), true);
    assert.equal(corrigirNoAparelho(gabaritos, 1427, "Verdadeiro"), false);
    assert.equal(corrigirNoAparelho(gabaritos, 1428, "1/2"), true);
    assert.equal(corrigirNoAparelho(gabaritos, 1428, "1/4"), false);
    assert.equal(corrigirNoAparelho(gabaritos, 1500, "B"), true);
    assert.equal(corrigirNoAparelho(gabaritos, 1428, "  "), false);
  });

  it("questão fora do gabarito, ou sem gabarito, fica com o banco", () => {
    assert.equal(corrigirNoAparelho(gabaritos, 9999, "x"), null);
    assert.equal(corrigirNoAparelho(null, 1427, "Falso"), null);
  });

  it("lerGabaritos ignora linha torta", () => {
    assert.deepEqual(lerGabaritos([{ questao_id: "x", aceitas: [] }, { questao_id: 5, aceitas: "a" }, null]), {});
    assert.deepEqual(lerGabaritos("lixo"), {});
  });

  it("o gabarito mostrado é o texto, também na rica", () => {
    assert.equal(gabaritoParaMostrar(["B", "\\(a-b\\)"], ["\\(a+b\\)", "\\(a-b\\)"]), "\\(a-b\\)");
    assert.equal(gabaritoParaMostrar(["B"], ["x", "y"]), "y");
    assert.equal(gabaritoParaMostrar([], ["x"]), null);
  });
});

describe("respostaProvisoria", () => {
  it("no modo pensante só mostra o gabarito a quem acertou", () => {
    const errou = respostaProvisoria({
      correta: false, viuGabarito: false, respondeuDeNovo: false, novaTentativa: false,
      fatorDaNovaTentativa: 1, pensante: true, gabarito: "Falso",
    });
    assert.equal(errou.gabaritoLiberado, false);
    assert.equal(errou.respostaCorreta, null);
    assert.equal(errou.acertosPercentual, 0);
    const imediato = respostaProvisoria({
      correta: false, viuGabarito: false, respondeuDeNovo: false, novaTentativa: false,
      fatorDaNovaTentativa: 1, pensante: false, gabarito: "Falso",
    });
    assert.equal(imediato.respostaCorreta, "Falso");
  });
});

describe("cifra", () => {
  const chave = new Uint8Array(32).map((_, i) => i + 1);
  const nonce = new Uint8Array(TAMANHO_DO_NONCE).map((_, i) => 200 - i);
  const texto = JSON.stringify(DO_BANCO);

  it("ida e volta", () => {
    const blob = cifrar(chave, nonce, "trailup-gabarito|a|68", texto);
    assert.ok(!blob.includes("Falso"));
    assert.equal(decifrar(chave, "trailup-gabarito|a|68", blob), texto);
  });

  it("não abre com outro aluno, outra turma, outra chave ou blob alterado", () => {
    const blob = cifrar(chave, nonce, "trailup-gabarito|a|68", texto);
    assert.equal(decifrar(chave, "trailup-gabarito|b|68", blob), null);
    assert.equal(decifrar(chave, "trailup-gabarito|a|69", blob), null);
    assert.equal(decifrar(new Uint8Array(32), "trailup-gabarito|a|68", blob), null);
    const bytes = Buffer.from(blob, "base64");
    bytes[bytes.length - 1] ^= 1;
    assert.equal(decifrar(chave, "trailup-gabarito|a|68", bytes.toString("base64")), null);
    assert.equal(decifrar(chave, "trailup-gabarito|a|68", "curto"), null);
  });
});

describe("fila sem rede", () => {
  it("ordena por quando o aluno respondeu e não duplica o mesmo toque", () => {
    let fila = enfileirar([], { questaoId: 2, resposta: "b", tempoGastoSeg: 3, em: 20 });
    fila = enfileirar(fila, { questaoId: 1, resposta: "a", tempoGastoSeg: null, em: 10 });
    fila = enfileirar(fila, { questaoId: 1, resposta: "a", tempoGastoSeg: null, em: 10 });
    assert.deepEqual(fila.map((x) => x.questaoId), [1, 2]);
  });

  it("lerFila descarta o que não é resposta", () => {
    assert.deepEqual(lerFila(null), []);
    assert.deepEqual(
      lerFila([{ questaoId: "3", resposta: "x", em: 5, tempoGastoSeg: "2" }, { questaoId: 1 }, "x"]),
      [{ questaoId: 3, resposta: "x", tempoGastoSeg: 2, em: 5 }],
    );
  });
});

describe("falhaDeRede", () => {
  it("rede e tempo esgotado vão para a fila", () => {
    assert.equal(falhaDeRede({ code: "tempo_esgotado" }), true);
    assert.equal(falhaDeRede(new TypeError("Failed to fetch")), true);
    assert.equal(falhaDeRede({ message: "TypeError: Network request failed", code: "" }), true);
  });

  it("recusa do banco não vai: repetir não adianta", () => {
    assert.equal(falhaDeRede({ code: "P0001", message: "prazo_expirado" }), false);
    assert.equal(falhaDeRede({ code: "42501", message: "permission denied" }), false);
    assert.equal(falhaDeRede({ code: "PGRST202", message: "fetch" }), false);
    assert.equal(falhaDeRede({ status: 403, code: "x", message: "" }), false);
    assert.equal(falhaDeRede(null), false);
  });
});
