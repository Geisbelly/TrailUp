import assert from "node:assert/strict";
import test from "node:test";

import {
  assignImagesToSections,
  buildRelationGraph,
  tokenize,
  type RelatableImage,
  type RelatableSection,
} from "./imageTextGraph";

// Cenario tirado do material real (aula de sockets): tres secoes, duas imagens
// que vieram de slides sobre assuntos especificos.
const SECOES: RelatableSection[] = [
  { title: "Taxonomia de Portas de Rede", body: "Portas identificam serviços; a porta 80 responde HTTP." },
  { title: "Abstração de Sockets", body: "O socket é o ponto final da comunicação entre processos." },
  { title: "Encerramento Gracioso", body: "O close() faz o flush dos buffers e transmite o segmento FIN." },
];

const IMAGENS: RelatableImage[] = [
  {
    url: "data:image/png;base64,PORTAS",
    name: "ppt/media/image2.png",
    sourceText: "Taxonomia de Portas: a porta 80 e a porta 443 identificam serviços",
    sourceOrder: 2,
  },
  {
    url: "data:image/png;base64,SOCKET",
    name: "ppt/media/image7.png",
    sourceText: "Abstração de Sockets: o socket é o ponto final da comunicação",
    sourceOrder: 7,
  },
];

test("tokenize remove acento, caixa, palavra vazia e numero solto", () => {
  assert.deepEqual(tokenize("A Abstração de Sockets, com 80 exemplos!"), ["abstracao", "sockets"]);
});

test("tokenize aguenta entrada vazia/ausente", () => {
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
});

test("liga cada imagem a secao do MESMO assunto, nao a primeira da lista", () => {
  const { bySection } = assignImagesToSections(IMAGENS, SECOES);

  assert.deepEqual(bySection.get(0), [0], "secao de portas devia receber a imagem de portas");
  assert.deepEqual(bySection.get(1), [1], "secao de sockets devia receber a imagem de sockets");
});

test("secao sem afinidade nenhuma fica SEM imagem (nao herda a primeira)", () => {
  const { bySection } = assignImagesToSections(IMAGENS, SECOES, { positionalFallback: false });

  assert.equal(bySection.has(2), false, "encerramento nao tem relacao com portas nem sockets");
});

test("uma imagem nunca e usada duas vezes, mesmo com mais secoes que imagens", () => {
  const umaImagem = [IMAGENS[1]];
  const { bySection } = assignImagesToSections(umaImagem, SECOES, { positionalFallback: false });

  const colocacoes = [...bySection.values()].flat();
  assert.deepEqual(colocacoes, [0], "a unica imagem entra uma vez so");
  assert.equal(new Set(colocacoes).size, colocacoes.length);
});

test("a aresta escolhida diz quais termos a sustentam (decisao auditavel)", () => {
  const { edges } = assignImagesToSections(IMAGENS, SECOES);

  const arestaSocket = edges.find((e) => e.imageIndex === 1)!;
  assert.equal(arestaSocket.sectionIndex, 1);
  assert.ok(arestaSocket.sharedTerms.includes("sockets") || arestaSocket.sharedTerms.includes("socket"));
});

test("termo generico repetido em todas as secoes vale menos que termo raro", () => {
  const secoes: RelatableSection[] = [
    { title: "Rede A", body: "rede rede rede sockets" },
    { title: "Rede B", body: "rede rede rede datagrama" },
  ];
  const imagem: RelatableImage = { url: "u", sourceText: "rede datagrama" };

  const arestas = buildRelationGraph([imagem], secoes);
  const melhor = arestas[0];

  // "datagrama" so existe na secao 1; "rede" existe nas duas. A aresta mais
  // forte tem que ser com a secao 1, apesar de "rede" aparecer mais.
  assert.equal(melhor.sectionIndex, 1);
});

test("imagem sem sinal nenhum e distribuida por posicao, sem repetir", () => {
  const semSinal: RelatableImage[] = [
    { url: "a", name: "IMG_1234.png", sourceOrder: 1 },
    { url: "b", name: "IMG_5678.png", sourceOrder: 2 },
  ];

  const { bySection, unmatched } = assignImagesToSections(semSinal, SECOES);

  assert.deepEqual(bySection.get(0), [0]);
  assert.deepEqual(bySection.get(1), [1]);
  assert.equal(bySection.has(2), false, "acabaram as imagens: a 3a secao fica sem");
  assert.deepEqual(unmatched, []);
});

test("mais imagens que secoes: as que sobram voltam como unmatched (nao somem)", () => {
  const muitas: RelatableImage[] = [
    { url: "a", sourceOrder: 1 },
    { url: "b", sourceOrder: 2 },
    { url: "c", sourceOrder: 3 },
    { url: "d", sourceOrder: 4 },
  ];

  const { bySection, unmatched } = assignImagesToSections(muitas, SECOES);

  assert.equal([...bySection.values()].flat().length, 3);
  assert.equal(unmatched.length, 1);
});

test("maxPerSection permite mais de uma imagem na mesma secao quando pedido", () => {
  const duasDeSockets: RelatableImage[] = [
    { url: "a", sourceText: "socket ponto final da comunicação" },
    { url: "b", sourceText: "socket comunicação entre processos" },
  ];
  const soUmaSecao = [SECOES[1]];

  const { bySection } = assignImagesToSections(duasDeSockets, soUmaSecao, {
    maxPerSection: 2,
    positionalFallback: false,
  });

  assert.deepEqual(bySection.get(0), [0, 1]);
});

test("minScore alto derruba relacao fraca (nada e colocado por acaso)", () => {
  const fraca: RelatableImage[] = [{ url: "a", sourceText: "comunicação" }];

  const { bySection, unmatched } = assignImagesToSections(fraca, SECOES, {
    minScore: 99,
    positionalFallback: false,
  });

  assert.equal(bySection.size, 0);
  assert.deepEqual(unmatched, [0]);
});

test("sem imagens ou sem secoes nao quebra", () => {
  assert.equal(assignImagesToSections([], SECOES).bySection.size, 0);
  assert.deepEqual(assignImagesToSections(IMAGENS, []).unmatched, [0, 1]);
  assert.deepEqual(buildRelationGraph([], []), []);
});

test("o grafo vem ordenado da relacao mais forte pra mais fraca", () => {
  const arestas = buildRelationGraph(IMAGENS, SECOES);

  for (let i = 1; i < arestas.length; i += 1) {
    assert.ok(arestas[i - 1].score >= arestas[i].score);
  }
});
