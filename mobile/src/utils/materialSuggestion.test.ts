import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";
import {
  blocoInicialSugerido,
  formatoSugeridoDoBloco,
  motivosDoFormato,
  ordenarBlocosPorSugestao,
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

test("motivos do formato chegam para exibir ao aluno", () => {
  const comMotivos: SugestaoMaterial = {
    formato_inicial: "audio",
    ordem: [{ formato: "audio", posicao: 1, motivos: ["narrativa em diálogo"] }],
  };

  assert.deepEqual(motivosDoFormato(comMotivos, "audio"), ["narrativa em diálogo"]);
  assert.deepEqual(motivosDoFormato(comMotivos, "markdown"), []);
  assert.deepEqual(motivosDoFormato(null, "audio"), []);
});
