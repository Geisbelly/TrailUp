import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveImagesForMedia,
  extractAttachmentsFromMarkdown,
  insertImagesIntoMarkdown,
  selectAttachmentsForMarkdown,
} from "./markdownImages";

const MARKDOWN_SOCKETS = [
  "## Taxonomia de Portas de Rede",
  "",
  "Portas identificam serviços; a porta 80 responde HTTP.",
  "",
  "## Abstração de Sockets",
  "",
  "O socket é o ponto final da comunicação entre processos.",
  "",
  "## Encerramento Gracioso",
  "",
  "O close() faz o flush dos buffers e transmite o segmento FIN.",
].join("\n");

test("coloca cada imagem na secao do MESMO assunto (nao no rodizio antigo)", () => {
  const images = [
    {
      url: "https://x.test/portas.png",
      sourceText: "Taxonomia de Portas: a porta 80 e a porta 443 identificam serviços",
    },
    {
      url: "https://x.test/socket.png",
      sourceText: "Abstração de Sockets: o socket é o ponto final da comunicação",
    },
  ];

  const result = insertImagesIntoMarkdown(MARKDOWN_SOCKETS, images);

  assert.match(
    result,
    /## Taxonomia de Portas de Rede\n\n!\[Imagem de referência\]\(https:\/\/x\.test\/portas\.png\)/,
  );
  assert.match(
    result,
    /## Abstração de Sockets\n\n!\[Imagem de referência\]\(https:\/\/x\.test\/socket\.png\)/,
  );
});

test("a mesma imagem NUNCA aparece duas vezes no documento", () => {
  // Uma imagem so, tres secoes: no rodizio antigo ela caia nas tres.
  const images = [
    { url: "https://x.test/socket.png", sourceText: "Abstração de Sockets: ponto final" },
  ];

  const result = insertImagesIntoMarkdown(MARKDOWN_SOCKETS, images);

  const ocorrencias = result.match(/https:\/\/x\.test\/socket\.png/g) ?? [];
  assert.equal(ocorrencias.length, 1);
});

test("secao sem afinidade com imagem nenhuma fica sem imagem", () => {
  const images = [
    { url: "https://x.test/socket.png", sourceText: "Abstração de Sockets: ponto final" },
  ];

  const result = insertImagesIntoMarkdown(MARKDOWN_SOCKETS, images);

  const encerramento = result.slice(result.indexOf("## Encerramento Gracioso"));
  assert.ok(!encerramento.includes("!["), "encerramento nao devia receber a imagem de sockets");
});

test("sem imagens disponiveis: retorna o markdown sem alteracao", () => {
  const markdown = "## Única Seção\n\nTexto.";
  assert.equal(insertImagesIntoMarkdown(markdown, []), markdown);
});

test("markdown sem nenhum heading de nivel 2: anexa as imagens no final em vez de descarta-las", () => {
  const markdown = "Texto solto, sem headings.\n\nMais texto.";
  const images = [{ url: "https://x.test/a.png" }, { url: "https://x.test/b.png" }];

  const result = insertImagesIntoMarkdown(markdown, images);

  assert.match(result, /Texto solto, sem headings\.\n\nMais texto\./);
  assert.match(result, /!\[Imagem de referência\]\(https:\/\/x\.test\/a\.png\)/);
  assert.match(result, /!\[Imagem de referência\]\(https:\/\/x\.test\/b\.png\)/);
});

test("mais imagens do professor do que headings: as que sobram do round-robin sao anexadas no final, nenhuma e descartada", () => {
  const markdown = "## Única Seção\n\nTexto.";
  const images = [
    { url: "https://x.test/a.png" },
    { url: "https://x.test/b.png" },
    { url: "https://x.test/c.png" },
  ];

  const result = insertImagesIntoMarkdown(markdown, images);

  // 1a imagem entra logo apos a unica secao (round-robin normal)
  assert.match(result, /## Única Seção\n\n!\[Imagem de referência\]\(https:\/\/x\.test\/a\.png\)/);
  // as que sobraram (b, c) nao tinham heading pra ir - vao pro final, nao somem
  assert.match(result, /!\[Imagem de referência\]\(https:\/\/x\.test\/b\.png\)/);
  assert.match(result, /!\[Imagem de referência\]\(https:\/\/x\.test\/c\.png\)/);
});

test("preserva o conteudo original integralmente, so adiciona as linhas de imagem", () => {
  const markdown = "## Seção\n\nParágrafo importante que não pode sumir.";
  const images = [{ url: "https://x.test/a.png" }];

  const result = insertImagesIntoMarkdown(markdown, images);

  assert.match(result, /Parágrafo importante que não pode sumir\./);
});

test("deriveImagesForMedia: imagem do professor sempre vence quando existe", () => {
  const attachments = [{ url: "https://x.test/professor.png" }];
  const generated = { DNS: "data:image/png;base64,AAA" };

  assert.deepEqual(deriveImagesForMedia(attachments, generated), attachments);
});

test("deriveImagesForMedia: sem imagem do professor, cai pras imagens geradas por IA", () => {
  const generated = { DNS: "data:image/png;base64,AAA", Cache: "data:image/jpeg;base64,BBB" };

  assert.deepEqual(deriveImagesForMedia([], generated), [
    { url: "data:image/png;base64,AAA" },
    { url: "data:image/jpeg;base64,BBB" },
  ]);
});

test("deriveImagesForMedia: sem professor e sem gerada, retorna array vazio", () => {
  assert.deepEqual(deriveImagesForMedia([], undefined), []);
  assert.deepEqual(deriveImagesForMedia([], null), []);
  assert.deepEqual(deriveImagesForMedia([], {}), []);
});

test("selectAttachmentsForMarkdown devolve so as imagens que aparecem naquela fatia", () => {
  const a = { url: "https://x.test/a.png", data: "AAA", mimeType: "image/png", name: "a.png" };
  const b = { url: "https://x.test/b.png", data: "BBB", mimeType: "image/png", name: "b.png" };
  const c = { url: "https://x.test/c.png", data: "CCC", mimeType: "image/png", name: "c.png" };

  const parte = "## Seção 2\n\n![Imagem de referência](https://x.test/b.png)\n\nTexto.";

  const selecionadas = selectAttachmentsForMarkdown(parte, [a, b, c]);

  assert.deepEqual(selecionadas, [b]);
});

test("selectAttachmentsForMarkdown preserva a ordem original da lista, nao a de aparicao", () => {
  const a = { url: "https://x.test/a.png", data: "AAA", mimeType: "image/png" };
  const b = { url: "https://x.test/b.png", data: "BBB", mimeType: "image/png" };

  const parte = "![Imagem de referência](https://x.test/b.png)\n\n![Imagem de referência](https://x.test/a.png)";

  assert.deepEqual(selectAttachmentsForMarkdown(parte, [a, b]), [a, b]);
});

test("selectAttachmentsForMarkdown funciona com data URI (imagem extraida de pptx/docx)", () => {
  const embutida = {
    url: "data:image/png;base64,QUJD",
    data: "QUJD",
    mimeType: "image/png",
    name: "ppt/media/image1.png",
  };
  const avulsa = { url: "https://x.test/avulsa.png", data: "ZZZ", mimeType: "image/png" };

  const parte = "## Seção\n\n![Imagem de referência](data:image/png;base64,QUJD)";

  assert.deepEqual(selectAttachmentsForMarkdown(parte, [embutida, avulsa]), [embutida]);
});

test("selectAttachmentsForMarkdown devolve vazio quando a fatia nao tem nenhuma imagem", () => {
  const a = { url: "https://x.test/a.png", data: "AAA", mimeType: "image/png" };
  assert.deepEqual(selectAttachmentsForMarkdown("## Seção sem imagem\n\nTexto.", [a]), []);
});

test("selectAttachmentsForMarkdown ignora attachment sem url (nada a casar no markdown)", () => {
  const semUrl = { data: "AAA", mimeType: "image/png" } as { url?: string; data: string; mimeType: string };
  assert.deepEqual(selectAttachmentsForMarkdown("![x](https://x.test/a.png)", [semUrl]), []);
});

test("extractAttachmentsFromMarkdown recupera imagens embutidas (data URI) do markdown persistido", () => {
  const markdown =
    "## Seção 1\n\n![Imagem de referência](data:image/png;base64,QUJD)\n\nTexto.\n\n" +
    "## Seção 2\n\n![Imagem de referência](data:image/jpeg;base64,WFla)\n\nMais texto.";

  const attachments = extractAttachmentsFromMarkdown(markdown);

  assert.deepEqual(attachments, [
    { data: "QUJD", mimeType: "image/png", name: "markdown-imagem-1", url: "data:image/png;base64,QUJD" },
    { data: "WFla", mimeType: "image/jpeg", name: "markdown-imagem-2", url: "data:image/jpeg;base64,WFla" },
  ]);
});

test("extractAttachmentsFromMarkdown nao repete a mesma imagem quando ela aparece em varias secoes", () => {
  const markdown =
    "## A\n\n![Imagem de referência](data:image/png;base64,QUJD)\n\n## B\n\n![Imagem de referência](data:image/png;base64,QUJD)";

  assert.equal(extractAttachmentsFromMarkdown(markdown).length, 1);
});

test("extractAttachmentsFromMarkdown ignora imagem por URL (precisaria de download, que este caminho nao faz)", () => {
  const markdown = "## A\n\n![Imagem de referência](https://x.test/foto.png)";
  assert.deepEqual(extractAttachmentsFromMarkdown(markdown), []);
});

test("extractAttachmentsFromMarkdown ignora data URI que nao e imagem", () => {
  const markdown = "## A\n\n![nao imagem](data:application/pdf;base64,QUJD)";
  assert.deepEqual(extractAttachmentsFromMarkdown(markdown), []);
});

test("extractAttachmentsFromMarkdown com markdown vazio ou sem imagem devolve vazio", () => {
  assert.deepEqual(extractAttachmentsFromMarkdown(""), []);
  assert.deepEqual(extractAttachmentsFromMarkdown("## Só texto\n\nSem imagem."), []);
});

test("extractAttachmentsFromMarkdown ignora SVG (diagrama gerado nao e imagem do professor)", () => {
  const markdown =
    "## A\n\n![Diagrama de fluxo: X → Y](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)\n\n" +
    "![Imagem de referência](data:image/png;base64,QUJD)";

  const attachments = extractAttachmentsFromMarkdown(markdown);

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].mimeType, "image/png");
});
