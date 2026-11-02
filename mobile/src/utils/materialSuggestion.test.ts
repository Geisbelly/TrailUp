import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";
import {
  blocoInicialSugerido,
  destaquesDaSugestao,
  formatoInicialDaSugestao,
  formatoSugeridoDoBloco,
  motivoAlunoDoFormato,
  motivosDoFormato,
  ordenarBlocosPorSugestao,
  ordenarPorSugestao,
  type SugestaoMaterial,
} from "./materialSuggestion";

function bloco(tipo: ContentBlock["tipo"], id: string = tipo): ContentBlock {
  return { id, tipo } as ContentBlock;
}

function sugestao(formatos: string[], formatoInicial?: string): SugestaoMaterial {
  return {
    formato_inicial: formatoInicial ?? formatos[0] ?? null,
    ordem: formatos.map((formato, indice) => ({ formato, posicao: indice + 1 })),
    versao: 1,
    origem: "inicial",
  };
}

const tipos = (blocks: ContentBlock[]) => blocks.map((block) => block.tipo);

// --- mapa de formato ------------------------------------------------------

test("tipos do app viram os mesmos formatos que a API usa", () => {
  assert.equal(formatoSugeridoDoBloco(bloco("texto")), "markdown");
  assert.equal(formatoSugeridoDoBloco(bloco("apresentacao-slides")), "apresentacao");
  assert.equal(formatoSugeridoDoBloco(bloco("documento")), "pdf");
});

test("tipo que a sugestao nao ordena nao tem formato", () => {
  assert.equal(formatoSugeridoDoBloco(bloco("video")), null);
  assert.equal(formatoSugeridoDoBloco(bloco("imagem")), null);
  assert.equal(formatoSugeridoDoBloco(null), null);
});

// --- reordenacao ----------------------------------------------------------

test("reordena os blocos sugeriveis conforme a ordem aconselhada", () => {
  const blocks = [bloco("markdown"), bloco("audio"), bloco("cards")];

  const resultado = ordenarBlocosPorSugestao(blocks, sugestao(["audio", "cards", "markdown"]));

  assert.deepEqual(tipos(resultado), ["audio", "cards", "markdown"]);
});

test("bloco fora da sugestao nao sai do lugar", () => {
  // A sugestao opina sobre qual formato ler primeiro, nao sobre a sequencia
  // pedagogica: mover o video poderia jogar um fechamento pro meio.
  const blocks = [bloco("markdown"), bloco("video"), bloco("audio")];

  const resultado = ordenarBlocosPorSugestao(blocks, sugestao(["audio", "markdown"]));

  assert.deepEqual(tipos(resultado), ["audio", "video", "markdown"]);
});

test("formato ausente da sugestao permanece parado", () => {
  const blocks = [bloco("cards"), bloco("markdown"), bloco("audio")];

  const resultado = ordenarBlocosPorSugestao(blocks, sugestao(["audio", "markdown"]));

  // cards nao foi sugerido: fica na primeira posicao; audio e markdown trocam
  // apenas entre as posicoes 2 e 3.
  assert.deepEqual(tipos(resultado), ["cards", "audio", "markdown"]);
});

test("empate mantem a ordem original", () => {
  // Sem estabilidade, dois formatos de mesmo peso ficariam pulando de lugar a
  // cada renderizacao.
  const blocks = [bloco("markdown", "md-1"), bloco("texto", "md-2")];
  const empate: SugestaoMaterial = {
    ordem: [
      { formato: "markdown", posicao: 1 },
      { formato: "markdown", posicao: 1 },
    ],
  };

  const resultado = ordenarBlocosPorSugestao(blocks, empate);

  assert.deepEqual(
    resultado.map((block) => block.id),
    ["md-1", "md-2"]
  );
});

test("sem sugestao os blocos ficam como vieram", () => {
  const blocks = [bloco("markdown"), bloco("audio")];

  assert.deepEqual(tipos(ordenarBlocosPorSugestao(blocks, null)), ["markdown", "audio"]);
  assert.deepEqual(tipos(ordenarBlocosPorSugestao(blocks, { ordem: [] })), [
    "markdown",
    "audio",
  ]);
});

test("um unico bloco sugerivel nao dispara reordenacao", () => {
  const blocks = [bloco("video"), bloco("markdown")];

  assert.deepEqual(tipos(ordenarBlocosPorSugestao(blocks, sugestao(["markdown", "audio"]))), [
    "video",
    "markdown",
  ]);
});

test("nao muta a lista recebida", () => {
  const blocks = [bloco("markdown"), bloco("audio")];

  ordenarBlocosPorSugestao(blocks, sugestao(["audio", "markdown"]));

  assert.deepEqual(tipos(blocks), ["markdown", "audio"]);
});

test("lista vazia nao quebra", () => {
  assert.deepEqual(ordenarBlocosPorSugestao([], sugestao(["audio"])), []);
  assert.deepEqual(ordenarBlocosPorSugestao(null, sugestao(["audio"])), []);
});

test("payload antigo sem posicao usa a ordem do array", () => {
  const blocks = [bloco("markdown"), bloco("audio")];
  const antigo: SugestaoMaterial = {
    ordem: [{ formato: "audio" }, { formato: "markdown" }],
  };

  assert.deepEqual(tipos(ordenarBlocosPorSugestao(blocks, antigo)), ["audio", "markdown"]);
});

// --- destaque e explicacao ------------------------------------------------

test("acha o bloco aconselhado para comecar", () => {
  const blocks = [bloco("markdown"), bloco("audio")];

  const inicial = blocoInicialSugerido(blocks, sugestao(["audio", "markdown"], "audio"));

  assert.equal(inicial?.tipo, "audio");
});

test("formato aconselhado ausente nao destaca outro no lugar", () => {
  // Destacar "o que sobrou" transformaria a sugestao em ruido.
  const blocks = [bloco("markdown")];

  assert.equal(blocoInicialSugerido(blocks, sugestao(["audio"], "audio")), null);
});

test("motivos internos do formato continuam acessiveis (nao sao texto para o aluno)", () => {
  const comMotivos: SugestaoMaterial = {
    formato_inicial: "audio",
    ordem: [{ formato: "audio", posicao: 1, motivos: ["narrativa em diálogo"] }],
  };

  assert.deepEqual(motivosDoFormato(comMotivos, "audio"), ["narrativa em diálogo"]);
  assert.deepEqual(motivosDoFormato(comMotivos, "markdown"), []);
  assert.deepEqual(motivosDoFormato(null, "audio"), []);
});

test("motivo para o aluno vem de motivo_aluno, nunca de motivos", () => {
  const comMotivo: SugestaoMaterial = {
    formato_inicial: "apresentacao",
    ordem: [
      {
        formato: "apresentacao",
        posicao: 1,
        motivos: ["imagens=3"],
        motivo_aluno: "Este conteúdo depende de imagens: comece pela apresentação.",
      },
      { formato: "markdown", posicao: 2, motivos: ["nota interna"] },
    ],
  };

  assert.equal(
    motivoAlunoDoFormato(comMotivo, "apresentacao"),
    "Este conteúdo depende de imagens: comece pela apresentação."
  );
  assert.equal(motivoAlunoDoFormato(comMotivo, "markdown"), null);
  assert.equal(motivoAlunoDoFormato(null, "markdown"), null);
});

test("sem formato_inicial, comeca pelo primeiro da ordem", () => {
  assert.equal(
    formatoInicialDaSugestao({ ordem: [{ formato: "audio", posicao: 2 }, { formato: "cards", posicao: 1 }] }),
    "cards"
  );
  assert.equal(formatoInicialDaSugestao(sugestao(["markdown"], "audio")), "audio");
  assert.equal(formatoInicialDaSugestao(null), null);
});

// --- grupos (passos de conteudos diferentes) ------------------------------

type Passo = { id: string; formato: string | null; grupo: string };
const passo = (id: string, formato: string | null, grupo: string): Passo => ({ id, formato, grupo });
const opcoesDoPasso = {
  formatoDe: (item: Passo) => item.formato,
  grupoDe: (item: Passo) => item.grupo,
};

test("so troca de lugar dentro do mesmo grupo", () => {
  const passos = [
    passo("a-texto", "markdown", "A"),
    passo("a-audio", "audio", "A"),
    passo("a-quiz", null, "A"),
    passo("b-texto", "markdown", "B"),
    passo("b-audio", "audio", "B"),
  ];

  const resultado = ordenarPorSugestao(passos, sugestao(["audio", "markdown"]), opcoesDoPasso);

  assert.deepEqual(
    resultado.map((item) => item.id),
    ["a-audio", "a-texto", "a-quiz", "b-audio", "b-texto"]
  );
});

test("destaque: o primeiro do formato inicial em cada grupo", () => {
  const passos = [
    passo("a-audio-1", "audio", "A"),
    passo("a-audio-2", "audio", "A"),
    passo("b-texto", "markdown", "B"),
  ];

  const destaques = destaquesDaSugestao(passos, sugestao(["audio", "markdown"]), {
    ...opcoesDoPasso,
    chaveDe: (item) => item.id,
  });

  assert.deepEqual([...destaques.keys()], ["a-audio-1"]);
  assert.deepEqual(destaques.get("a-audio-1"), { formato: "audio", motivo: null });
  assert.equal(destaquesDaSugestao(passos, null, { ...opcoesDoPasso, chaveDe: (item) => item.id }).size, 0);
});
