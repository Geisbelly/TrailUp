import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fatorDaRegra, lerGabaritoRevelado, lerRespostaCorrigida, questaoDoBanco } from "./questaoNoBanco.core";

describe("lerRespostaCorrigida", () => {
  it("lê o retorno de questao_responder", () => {
    assert.deepEqual(
      lerRespostaCorrigida({
        correta: false,
        acertos_percentual: 0,
        regra: "primeira",
        tentativa: 1,
        erros: 1,
        gabarito_liberado: true,
        resposta_correta: "1/2",
      }),
      {
        correta: false,
        acertosPercentual: 0,
        regra: "primeira",
        tentativa: 1,
        erros: 1,
        gabaritoLiberado: true,
        respostaCorreta: "1/2",
      },
    );
  });

  it("sem liberação, não guarda o gabarito mesmo que venha", () => {
    const r = lerRespostaCorrigida({ correta: false, gabarito_liberado: false, resposta_correta: "x" });
    assert.equal(r.respostaCorreta, null);
  });

  it("forma estranha vira resposta errada, sem pontos", () => {
    assert.deepEqual(lerRespostaCorrigida(null), {
      correta: false,
      acertosPercentual: 0,
      regra: "primeira",
      tentativa: null,
      erros: 0,
      gabaritoLiberado: false,
      respostaCorreta: null,
    });
    const r = lerRespostaCorrigida({ correta: "true", acertos_percentual: 140, regra: "inventada" });
    assert.equal(r.correta, false);
    assert.equal(r.acertosPercentual, 100);
    assert.equal(r.regra, "primeira");
  });

  it("o retorno de antes da migration (sem percentual) vale 100/0", () => {
    assert.equal(lerRespostaCorrigida({ correta: true, tentativa: 1, erros: 0 }).acertosPercentual, 100);
    assert.equal(lerRespostaCorrigida({ correta: false, tentativa: 1, erros: 1 }).acertosPercentual, 0);
  });

  it("aceita o percentual em texto (numeric do Postgres)", () => {
    assert.equal(lerRespostaCorrigida({ acertos_percentual: "45" }).acertosPercentual, 45);
  });
});

describe("lerGabaritoRevelado", () => {
  it("dissertativa não traz a resposta esperada", () => {
    assert.deepEqual(lerGabaritoRevelado({ correta: true, erros: 0, gabarito_liberado: false, resposta_correta: null }), {
      correta: true,
      erros: 0,
      gabaritoLiberado: false,
      respostaCorreta: null,
    });
  });

  it("objetiva traz o gabarito", () => {
    assert.equal(lerGabaritoRevelado({ gabarito_liberado: true, resposta_correta: "Falso" }).respostaCorreta, "Falso");
  });
});

describe("fatorDaRegra", () => {
  it("repete os fatores de QuestionActivity e da migration", () => {
    assert.equal(fatorDaRegra("primeira", 0.5), 1);
    assert.equal(fatorDaRegra("viu_gabarito", 0.5), 0.2);
    assert.equal(fatorDaRegra("resposta_repetida", 0.5), 0.5);
    assert.equal(fatorDaRegra("nova_tentativa", 0.7), 0.7);
  });
});

describe("questaoDoBanco", () => {
  it("só a questão com id positivo e que não é personalizada local", () => {
    assert.equal(questaoDoBanco(900, false), true);
    assert.equal(questaoDoBanco("900", false), true);
    assert.equal(questaoDoBanco(900, true), false);
    assert.equal(questaoDoBanco(-12, false), false);
    assert.equal(questaoDoBanco(undefined, false), false);
  });
});
