import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  casasDaGrade,
  celulaAnterior,
  estaCompleta,
  juntarComDesafios,
  lerDesafioPublico,
  lerResultadoDoDesafio,
  letraDigitada,
  montarDesafios,
  palavraDaCelula,
  proximaCelula,
  respostaDaGrade,
  retornoDoConferir,
  rotuloDaCelula,
  type DesafioCruzadinhaPublico,
  type LinhaDeDesafio,
} from "./desafio.core";
import { LIMITE_DE_MISSOES, type MissaoDoAluno } from "./missaoModel";

/*
 *   0 1 2 3 4
 * 0 B A N C O     1h = BANCO, 1v = BOLA, 2v = ORA
 * 1 O . . . R
 * 2 L . . . A
 * 3 A
 */
const GRADE: DesafioCruzadinhaPublico = {
  tipo: "cruzadinha",
  linhas: 4,
  colunas: 5,
  palavras: [
    { numero: 1, direcao: "h", linha: 0, coluna: 0, tamanho: 5, pista: "Onde se guarda dinheiro" },
    { numero: 1, direcao: "v", linha: 0, coluna: 0, tamanho: 4, pista: "Redonda no futebol" },
    { numero: 2, direcao: "v", linha: 0, coluna: 4, tamanho: 3, pista: "Reza curta" },
  ],
};
const [P1H, P1V, P2V] = GRADE.palavras;

const CHEIA: Record<string, string> = {
  "0,0": "B", "0,1": "A", "0,2": "N", "0,3": "C", "0,4": "O",
  "1,0": "O", "2,0": "L", "3,0": "A",
  "1,4": "R", "2,4": "A",
};

describe("cruzadinha no aparelho", () => {
  it("palavraDaCelula escolhe a horizontal e o segundo toque troca para a vertical", () => {
    const noInicio = (palavra: typeof P1H) => ({ palavra, linha: 0, coluna: 0 });
    assert.deepEqual(palavraDaCelula(GRADE, 0, 0, null), P1H);
    assert.deepEqual(palavraDaCelula(GRADE, 0, 0, noInicio(P1H)), P1V);
    // O terceiro volta à horizontal.
    assert.deepEqual(palavraDaCelula(GRADE, 0, 0, noInicio(P1V)), P1H);
    // Célula de uma palavra só: é ela, mesmo com a outra selecionada.
    assert.deepEqual(palavraDaCelula(GRADE, 2, 0, noInicio(P1H)), P1V);
    assert.deepEqual(palavraDaCelula(GRADE, 2, 0, { palavra: P1V, linha: 2, coluna: 0 }), P1V);
    // Outra casa da palavra que está sendo escrita, mesmo cruzada: continua nela (corrigir a
    // letra não pode trocar de palavra). Só o toque na casa do cursor troca.
    assert.deepEqual(palavraDaCelula(GRADE, 0, 4, noInicio(P1H)), P1H);
    assert.deepEqual(palavraDaCelula(GRADE, 0, 4, { palavra: P1H, linha: 0, coluna: 4 }), P2V);
    // Casa vazia da grade não é palavra.
    assert.equal(palavraDaCelula(GRADE, 1, 1, noInicio(P1H)), null);
  });

  it("proximaCelula pula célula preenchida e para no fim da palavra", () => {
    const parcial = { "0,0": "B", "0,1": "A", "0,2": "N" };
    assert.deepEqual(proximaCelula(P1H, parcial, { linha: 0, coluna: 0 }), { linha: 0, coluna: 3 });
    // Tudo preenchido daqui em diante: o cursor para na última casa, não pula para outra palavra.
    assert.deepEqual(proximaCelula(P1H, CHEIA, { linha: 0, coluna: 1 }), { linha: 0, coluna: 4 });
    assert.deepEqual(proximaCelula(P1H, parcial, { linha: 0, coluna: 4 }), { linha: 0, coluna: 4 });
    // Na vertical anda pela linha.
    assert.deepEqual(proximaCelula(P1V, { "0,0": "B" }, { linha: 0, coluna: 0 }), { linha: 1, coluna: 0 });
  });

  it('respostaDaGrade monta {"1h": …} a partir das células', () => {
    assert.deepEqual(respostaDaGrade(GRADE, CHEIA), { palavras: { "1h": "BANCO", "1v": "BOLA", "2v": "ORA" } });
    // A casa compartilhada vale para as duas palavras; a vazia não vira letra.
    assert.deepEqual(respostaDaGrade(GRADE, { "0,0": "B", "0,4": "O" }), {
      palavras: { "1h": "BO", "1v": "B", "2v": "O" },
    });
  });

  it("estaCompleta é falso com célula vazia", () => {
    assert.equal(estaCompleta(GRADE, CHEIA), true);
    const { "2,4": _, ...semUma } = CHEIA;
    assert.equal(estaCompleta(GRADE, semUma), false);
    assert.equal(estaCompleta(GRADE, { ...CHEIA, "2,4": " " }), false);
    assert.equal(estaCompleta(GRADE, {}), false);
  });

  it("estaCompleta é falso sem palavra nenhuma", () => {
    // `every` de lista vazia é true: uma grade sem palavra não pode liberar o "Conferir".
    assert.equal(estaCompleta({ ...GRADE, palavras: [] }, CHEIA), false);
  });

  it("celulaAnterior volta uma casa e para no começo da palavra", () => {
    assert.deepEqual(celulaAnterior(P1H, { linha: 0, coluna: 3 }), { linha: 0, coluna: 2 });
    assert.deepEqual(celulaAnterior(P1V, { linha: 2, coluna: 0 }), { linha: 1, coluna: 0 });
    assert.deepEqual(celulaAnterior(P1H, { linha: 0, coluna: 0 }), { linha: 0, coluna: 0 });
  });

  it("letraDigitada fica com a última letra, em maiúscula, e ignora o resto", () => {
    assert.equal(letraDigitada("a"), "A");
    // Escrever por cima da letra que já estava: o campo recebe as duas, vale a nova.
    assert.equal(letraDigitada("Bc"), "C");
    // A grade não tem acento, mas a RPC normaliza: o "ç" digitado vale "Ç" e o banco aceita.
    assert.equal(letraDigitada("ç"), "Ç");
    assert.equal(letraDigitada("7"), "7");
    assert.equal(letraDigitada(" "), "");
    assert.equal(letraDigitada("-"), "");
    assert.equal(letraDigitada(""), "");
  });

  it("casasDaGrade marca as casas de palavra e o número no começo de cada uma", () => {
    const casas = casasDaGrade(GRADE);
    assert.equal(casas.size, 10);
    assert.equal(casas.get("0,0")?.numero, 1);
    assert.equal(casas.get("0,4")?.numero, 2);
    assert.equal(casas.get("0,2")?.numero, null);
    assert.equal(casas.has("1,1"), false);
    assert.deepEqual(casas.get("0,0")?.palavras.map((p) => `${p.numero}${p.direcao}`), ["1h", "1v"]);
  });

  it("rotuloDaCelula diz linha, coluna e palavra, contando de 1", () => {
    assert.equal(rotuloDaCelula(GRADE, 2, 0), "linha 3, coluna 1, palavra 1 vertical");
    assert.equal(rotuloDaCelula(GRADE, 0, 2), "linha 1, coluna 3, palavra 1 horizontal");
    assert.equal(rotuloDaCelula(GRADE, 0, 4), "linha 1, coluna 5, palavra 1 horizontal e palavra 2 vertical");
  });
});

describe("retornoDoConferir", () => {
  it("acertou pela primeira vez: resolvido, com prêmio", () => {
    assert.deepEqual(retornoDoConferir({ acertou: true, ja_concluida: false, palavras_certas: null, palavras_total: null }), {
      resolvido: true,
      premio: true,
      texto: "Desafio resolvido",
      detalhe: null,
      indisponivel: false,
    });
  });

  it("já estava resolvido: só leitura, sem prêmio de novo", () => {
    for (const acertou of [true, false]) {
      const r = retornoDoConferir({ acertou, ja_concluida: true, palavras_certas: 1, palavras_total: 4 });
      assert.equal(r.resolvido, true);
      assert.equal(r.premio, false);
      assert.equal(r.texto, "Desafio resolvido");
    }
  });

  it("errou: o texto fixo e, na cruzadinha, quantas palavras estão certas (nunca quais)", () => {
    assert.deepEqual(retornoDoConferir({ acertou: false, ja_concluida: false, palavras_certas: null, palavras_total: null }), {
      resolvido: false,
      premio: false,
      texto: "Ainda não. Tente de novo.",
      detalhe: null,
      indisponivel: false,
    });
    assert.equal(
      retornoDoConferir({ acertou: false, ja_concluida: false, palavras_certas: 3, palavras_total: 6 }).detalhe,
      "3 de 6 palavras certas",
    );
  });

  it("limite, rede e outro erro: a mensagem de cada um, sem resolver nem premiar", () => {
    const textos = {
      limite: "Muitas tentativas seguidas. Tente de novo daqui a pouco.",
      rede: "Sem conexão. Sua resposta continua aqui.",
      outro: "Não deu para conferir agora. Tente de novo.",
    } as const;
    for (const erro of ["limite", "rede", "outro"] as const) {
      assert.deepEqual(retornoDoConferir({ erro }), {
        resolvido: false,
        premio: false,
        texto: textos[erro],
        detalhe: null,
        indisponivel: false,
      });
    }
  });

  it("sem acesso ao desafio: mensagem terminal, e o Conferir não volta (tentar de novo não adianta)", () => {
    assert.deepEqual(retornoDoConferir({ erro: "indisponivel" }), {
      resolvido: false,
      premio: false,
      texto: "Este desafio não está mais disponível para você.",
      detalhe: null,
      indisponivel: true,
    });
  });
});

describe("lerDesafioPublico", () => {
  it("remonta o desafio campo a campo e nunca deixa passar a resposta", () => {
    assert.deepEqual(
      lerDesafioPublico({ tipo: "logica", enunciado: "Quanto é 2+2?", formato: "multipla", alternativas: ["3", "4"], resposta: "4" }),
      { tipo: "logica", enunciado: "Quanto é 2+2?", formato: "multipla", alternativas: ["3", "4"] },
    );
    assert.deepEqual(lerDesafioPublico({ tipo: "logica", enunciado: "Diga 4", formato: "curta", aceitas: ["4"] }), {
      tipo: "logica",
      enunciado: "Diga 4",
      formato: "curta",
    });
    const comPalavra = { ...GRADE, palavras: GRADE.palavras.map((p) => ({ ...p, palavra: "X" })) };
    assert.deepEqual(lerDesafioPublico(comPalavra), GRADE);
  });

  it("forma que o app não sabe desenhar é null", () => {
    assert.equal(lerDesafioPublico(null), null);
    assert.equal(lerDesafioPublico({ tipo: "sudoku" }), null);
    assert.equal(lerDesafioPublico({ tipo: "logica", enunciado: "", formato: "curta" }), null);
    assert.equal(lerDesafioPublico({ tipo: "logica", enunciado: "x", formato: "multipla", alternativas: ["só uma"] }), null);
    assert.equal(lerDesafioPublico({ ...GRADE, palavras: [{ ...P1H, direcao: "d" }] }), null);
    // Palavra que sai da grade: desenhar a casa fora da grade quebraria a tela.
    assert.equal(lerDesafioPublico({ ...GRADE, colunas: 4 }), null);
  });
});

describe("lerResultadoDoDesafio", () => {
  it("só os quatro campos da RPC, sem nada além", () => {
    assert.deepEqual(
      lerResultadoDoDesafio({ acertou: false, ja_concluida: false, palavras_certas: 2, palavras_total: 3, gabarito: { "1h": "BANCO" } }),
      { acertou: false, ja_concluida: false, palavras_certas: 2, palavras_total: 3 },
    );
    assert.deepEqual(lerResultadoDoDesafio({ acertou: true, ja_concluida: true, palavras_certas: null, palavras_total: null }), {
      acertou: true,
      ja_concluida: true,
      palavras_certas: null,
      palavras_total: null,
    });
    assert.deepEqual(lerResultadoDoDesafio("ok"), { erro: "outro" });
  });
});

const LOGICA = { tipo: "logica", enunciado: "Quanto é 2+2?", formato: "curta" };

const linha = (over: Partial<LinhaDeDesafio> & { id: number }): LinhaDeDesafio => ({
  titulo: `d${over.id}`,
  descricao: "",
  criterio: { metrica: "desafio" },
  perfil_alvo: "mastermind",
  dia: null,
  slot: null,
  origem: "ia",
  escopo: "aluno",
  janela_inicio: null,
  janela_fim: null,
  desafio: LOGICA,
  conteudo_id: 50,
  desafio_grupo: "grupo-a",
  ...over,
});

const comum = (id: number): MissaoDoAluno => ({
  id,
  titulo: `m${id}`,
  descricao: "",
  progresso: 0,
  status: "pendente",
  criterioRotulo: "",
  metrica: "minutos_no_dia",
  atividadeId: null,
  pedeAtividade: false,
  origem: "professor",
  escopo: "aluno",
  prazo: null,
  dia: null,
  slot: null,
});

describe("desafios na lista de missões", () => {
  it("um desafio por grupo e nunca mais do que as missões comuns cabem no limite", () => {
    const linhas = [
      linha({ id: 1, perfil_alvo: "mastermind" }),
      linha({ id: 2, perfil_alvo: "achiever" }),
      linha({ id: 3, perfil_alvo: "seeker", desafio_grupo: "grupo-b", desafio: GRADE }),
    ];
    // O 1º representativo do aluno é achiever: do grupo A, vale a linha dele.
    const desafios = montarDesafios(linhas, [], ["achiever", "mastermind", "seeker"]);
    assert.deepEqual(desafios.map((d) => [d.id, d.desafioGrupo]), [[2, "grupo-a"], [3, "grupo-b"]]);

    // As comuns já vêm cortadas no limite da consulta delas; os desafios vêm à parte e entram
    // depois, sem tirar nenhuma comum da lista.
    const comuns = Array.from({ length: LIMITE_DE_MISSOES }, (_, i) => comum(100 + i));
    const juntas = juntarComDesafios(comuns, desafios);
    assert.equal(juntas.length, LIMITE_DE_MISSOES + 2);
    assert.deepEqual(juntas.slice(0, LIMITE_DE_MISSOES).map((m) => m.id), comuns.map((m) => m.id));
    // Linha repetida (banco antigo sem o filtro `desafio IS NULL`) não aparece duas vezes.
    assert.equal(juntarComDesafios([comum(2)], desafios).length, 2);
  });

  it("resolvido por qualquer linha do grupo, o grupo aparece resolvido", () => {
    const linhas = [linha({ id: 1, perfil_alvo: "mastermind" }), linha({ id: 2, perfil_alvo: "achiever" })];
    const [d] = montarDesafios(linhas, [{ missao_id: 1, status: "concluida", progresso: 100 }], ["achiever", "mastermind"]);
    assert.equal(d.id, 1);
    assert.equal(d.status, "concluida");
  });

  it("desafio com forma inválida ou fora da janela fica de fora", () => {
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    const linhas = [
      linha({ id: 1, desafio: { tipo: "sudoku" } }),
      linha({ id: 2, desafio_grupo: "grupo-b", janela_fim: ontem }),
      linha({ id: 3, desafio_grupo: null }),
      linha({ id: 4, desafio_grupo: "grupo-c" }),
      linha({ id: 5, desafio_grupo: "grupo-d", conteudo_id: null }),
    ];
    const desafios = montarDesafios(linhas, [], ["mastermind"]);
    assert.deepEqual(desafios.map((d) => d.id), [4]);
    assert.deepEqual(desafios[0].desafio, LOGICA);
    assert.equal(desafios[0].conteudoId, 50);
  });
});
