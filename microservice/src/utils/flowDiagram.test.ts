import assert from "node:assert/strict";
import test from "node:test";

import {
  describeFlow,
  ensureContrast,
  parseAsciiFlow,
  renderFlowDiagramSvg,
  replaceAsciiFlowsWithDiagrams,
} from "./flowDiagram";

// Os tres blocos abaixo sao arte ASCII real, copiada do markdown gerado em
// producao (aula de sockets) - sao os casos que precisam virar diagrama.
const FLUXO_LINEAR_COM_ETAPAS = `
[ Aplicação ] ---> [ Send Buffer (SO) ] === (Segmentos TCP) ===> [ Recv Buffer (SO) ] ---> [ Aplicação Destino ]
                            |
                   [ Método close() ]
                            |
        1. Executa Flush dos dados restantes
        2. Transmite segmento FIN
        3. Aguarda confirmação ACK do remoto
`;

const FLUXO_COM_DESDOBRAMENTO = `
[ Cliente remoto ] --- (Solicitação SYN) ---> [ ServerSocket (Escutando na Porta 80) ]
                            |
                        accept()
                            |
              v----------------v----------------
              [ Cria NOVO Socket Dedicado (ex: Socket-A) ]
              [ Mantém ServerSocket livre na Porta 80   ]
`;

const FLUXO_COM_FAN_IN = `
[ Cliente A ] -- (Datagrama A1) --\\
[ Cliente B ] -- (Datagrama B1) ---> [ Buffer Único UDP (FIFO) ] ---> [ Aplicação Servidora ]
[ Cliente C ] -- (Datagrama C1) --/
`;

test("le um fluxo linear: uma etapa por caixa, na ordem", () => {
  const spec = parseAsciiFlow(FLUXO_LINEAR_COM_ETAPAS);

  assert.ok(spec);
  assert.deepEqual(
    spec!.stages.map((s) => s.nodes.map((n) => n.label)),
    [["Aplicação"], ["Send Buffer (SO)"], ["Recv Buffer (SO)"], ["Aplicação Destino"]],
  );
});

test("rotulo entre parenteses vira rotulo da seta da etapa certa, nao de outra", () => {
  const spec = parseAsciiFlow(FLUXO_LINEAR_COM_ETAPAS);

  // "(Segmentos TCP)" esta entre a 2a e a 3a caixa - e o rotulo da seta que
  // ENTRA na 3a etapa.
  assert.equal(spec!.stages[1].edgeLabel, undefined);
  assert.equal(spec!.stages[2].edgeLabel, "Segmentos TCP");
});

test("parenteses DENTRO da caixa nao e confundido com rotulo de seta", () => {
  const spec = parseAsciiFlow("[ Send Buffer (SO) ] ---> [ Destino ]");

  assert.deepEqual(spec!.stages[0].nodes, [{ label: "Send Buffer (SO)" }]);
  assert.equal(spec!.stages[0].edgeLabel, undefined);
  assert.equal(spec!.stages[1].edgeLabel, undefined);
});

test("linhas numeradas viram painel de etapas, sem o numero repetido no texto", () => {
  const spec = parseAsciiFlow(FLUXO_LINEAR_COM_ETAPAS);

  assert.deepEqual(spec!.notes, [
    "Executa Flush dos dados restantes",
    "Transmite segmento FIN",
    "Aguarda confirmação ACK do remoto",
  ]);
});

test("caixa pendurada sem seta vira desdobramento, nao etapa do fluxo principal", () => {
  const spec = parseAsciiFlow(FLUXO_LINEAR_COM_ETAPAS);

  assert.deepEqual(spec!.branch?.nodes, [{ label: "Método close()" }]);
});

test("desdobramento com varias caixas e rotulo de transicao ('accept()')", () => {
  const spec = parseAsciiFlow(FLUXO_COM_DESDOBRAMENTO);

  assert.deepEqual(
    spec!.stages.map((s) => s.nodes.map((n) => n.label)),
    [["Cliente remoto"], ["ServerSocket (Escutando na Porta 80)"]],
  );
  assert.equal(spec!.stages[1].edgeLabel, "Solicitação SYN");
  assert.equal(spec!.branch?.label, "accept()");
  assert.deepEqual(spec!.branch?.nodes, [
    { label: "Cria NOVO Socket Dedicado (ex: Socket-A)" },
    { label: "Mantém ServerSocket livre na Porta 80" },
  ]);
});

test("fan-in: origens em linhas separadas entram na PRIMEIRA etapa, na ordem do texto", () => {
  const spec = parseAsciiFlow(FLUXO_COM_FAN_IN);

  assert.deepEqual(
    spec!.stages.map((s) => s.nodes.map((n) => n.label)),
    [
      ["Cliente A", "Cliente B", "Cliente C"],
      ["Buffer Único UDP (FIFO)"],
      ["Aplicação Servidora"],
    ],
  );
});

test("linha de cola visual (|, v----v) nao gera etapa nem nota", () => {
  const spec = parseAsciiFlow(FLUXO_COM_DESDOBRAMENTO);

  assert.ok(!spec!.notes.some((n) => /^[|v\-]+$/.test(n)));
  assert.equal(spec!.notes.length, 0);
});

test("bloco sem pelo menos duas caixas nao e tratado como fluxo", () => {
  assert.equal(parseAsciiFlow("apenas um texto qualquer"), null);
  assert.equal(parseAsciiFlow("[ Só uma caixa ]"), null);
  assert.equal(parseAsciiFlow(""), null);
});

test("describeFlow resume o fluxo em uma linha (texto alternativo da imagem)", () => {
  const spec = parseAsciiFlow(FLUXO_COM_FAN_IN)!;

  assert.equal(
    describeFlow(spec),
    "Diagrama de fluxo: Cliente A / Cliente B / Cliente C → Buffer Único UDP (FIFO) → Aplicação Servidora",
  );
});

test("renderFlowDiagramSvg desenha caixa, seta e texto de cada etapa", () => {
  const spec = parseAsciiFlow(FLUXO_COM_FAN_IN)!;
  const svg = renderFlowDiagramSvg(spec);

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 760 \d+"/);
  assert.match(svg, /<marker id="seta"/);
  assert.match(svg, /Buffer Único UDP \(FIFO\)/);
  assert.match(svg, /Aplicação Servidora/);
  // 5 caixas (3 origens + 2 etapas)
  assert.equal((svg.match(/<rect [^>]*rx="10"/g) || []).length, 5);
});

test("renderFlowDiagramSvg escapa caracteres especiais do XML", () => {
  const svg = renderFlowDiagramSvg({
    stages: [{ nodes: [{ label: "a < b & c" }] }, { nodes: [{ label: 'd > "e"' }] }],
    notes: [],
  });

  assert.match(svg, /a &lt; b &amp; c/);
  assert.match(svg, /d &gt; &quot;e&quot;/);
  assert.ok(!svg.includes("a < b & c"));
});

test("ensureContrast eleva a luminosidade da cor do perfil ate o contraste minimo", () => {
  // Roxo do Mastermind sobre o fundo escuro do diagrama: escuro demais cru.
  const ajustado = ensureContrast("#5b3fd9", "#161a27", 3);

  assert.notEqual(ajustado.toLowerCase(), "#5b3fd9");
  // Continua roxo (matiz preservado), so mais claro - nao virou cinza/branco.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(ajustado.slice(i, i + 2), 16));
  assert.ok(b > r && r > g, `esperava um roxo mais claro, veio ${ajustado}`);
});

test("ensureContrast nao mexe em cor que ja passa no contraste pedido", () => {
  assert.equal(ensureContrast("#f4623a", "#161a27", 3), "#f4623a");
});

test("replaceAsciiFlowsWithDiagrams troca o bloco ASCII por uma imagem SVG embutida", () => {
  const markdown = `## Encerramento\n\nTexto antes.\n\n\`\`\`\n${FLUXO_COM_FAN_IN.trim()}\n\`\`\`\n\nTexto depois.`;

  const resultado = replaceAsciiFlowsWithDiagrams(markdown);

  assert.ok(!resultado.includes("```"));
  assert.match(resultado, /!\[Diagrama de fluxo: Cliente A[^\]]*\]\(data:image\/svg\+xml,%3Csvg[^)]+\)/);
  // Nenhum parentese cru na URI: um ")" ali fecharia o link do markdown no meio
  // do SVG (rotulo com parentese, ex.: "Buffer Unico UDP (FIFO)").
  const uri = resultado.slice(resultado.indexOf("data:image/svg+xml,"), resultado.lastIndexOf(")"));
  assert.ok(!uri.includes("("), "parentese cru na data URI");
  assert.ok(!uri.includes(")"), "parentese cru na data URI");
  assert.match(resultado, /Texto antes\./);
  assert.match(resultado, /Texto depois\./);
});

test("replaceAsciiFlowsWithDiagrams NAO toca em bloco de codigo de verdade", () => {
  const markdown = "```python\nfila = [1, 2, 3]\nprint(fila[0])\n```";

  assert.equal(replaceAsciiFlowsWithDiagrams(markdown), markdown);
});

test("replaceAsciiFlowsWithDiagrams deixa intacto bloco sem cara de fluxo", () => {
  const markdown = "```\nsaida do terminal, sem caixa nenhuma\n```";

  assert.equal(replaceAsciiFlowsWithDiagrams(markdown), markdown);
});

test("replaceAsciiFlowsWithDiagrams converte todos os blocos de fluxo do documento", () => {
  const markdown =
    `\`\`\`\n${FLUXO_COM_FAN_IN.trim()}\n\`\`\`\n\ntexto\n\n\`\`\`\n${FLUXO_COM_DESDOBRAMENTO.trim()}\n\`\`\``;

  const resultado = replaceAsciiFlowsWithDiagrams(markdown);

  assert.equal((resultado.match(/data:image\/svg\+xml,%3Csvg/g) || []).length, 2);
});

test("a data URI decodifica de volta pro SVG original (e assim que o mobile le)", () => {
  const markdown = `\`\`\`
${FLUXO_COM_FAN_IN.trim()}
\`\`\``;
  const resultado = replaceAsciiFlowsWithDiagrams(markdown);
  const uri = resultado.slice(resultado.indexOf("data:image/svg+xml,"), resultado.lastIndexOf(")"));

  const svg = decodeURIComponent(uri.replace("data:image/svg+xml,", ""));

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /Buffer Único UDP \(FIFO\)/);
});

test("replaceAsciiFlowsWithDiagrams usa a cor do perfil no diagrama", () => {
  const markdown = `\`\`\`\n${FLUXO_COM_FAN_IN.trim()}\n\`\`\``;

  const comCor = replaceAsciiFlowsWithDiagrams(markdown, { accentColor: "#f4623a" });
  const semCor = replaceAsciiFlowsWithDiagrams(markdown);

  assert.notEqual(comCor, semCor);
  const svg = decodeURIComponent(comCor.split("data:image/svg+xml,")[1].replace(/\)$/, ""));
  assert.match(svg, /#f4623a/i);
});

test("markdown sem bloco nenhum passa sem alteracao", () => {
  assert.equal(replaceAsciiFlowsWithDiagrams("## Título\n\nSó texto."), "## Título\n\nSó texto.");
  assert.equal(replaceAsciiFlowsWithDiagrams(""), "");
});

test("caixa tem teto de largura e fica centralizada (fluxograma, nao pilha de barras)", () => {
  const svg = renderFlowDiagramSvg({
    stages: [{ nodes: [{ label: "Aplicação" }] }, { nodes: [{ label: "Destino" }] }],
    notes: [],
  });

  const caixas = [...svg.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"[^>]*rx="10"/g)];
  assert.equal(caixas.length, 2);
  for (const [, x, largura] of caixas) {
    assert.ok(Number(largura) <= 340, `largura ${largura} passou do teto`);
    // Centralizada: sobra a mesma margem dos dois lados dentro dos 760 do viewBox.
    assert.ok(Math.abs(Number(x) + Number(largura) / 2 - 380) < 0.5, `caixa fora do eixo: x=${x}`);
  }
});
