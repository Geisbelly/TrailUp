import assert from "node:assert/strict";
import test from "node:test";

import { describeLaneDiagram, parseLaneDiagram, renderLaneDiagramSvg } from "./laneDiagram";

// Arte ASCII real, copiada do markdown gerado em producao (aula de sockets):
// quadro emoldurado com titulo, duas raias e troca de mensagens entre elas.
const CICLO_TCP = [
  "+--------------------------------------------------------------+",
  "|                CICLO DE VIDA DA COMUNICAÇÃO TCP              |",
  "+--------------------------------------------------------------+",
  "| SERVIDOR                                            CLIENTE  |",
  "|                                                              |",
  "| socket() -> bind() -> listen()                               |",
  "|   |                                                          |",
  "| accept() <--- [ Aguarda Conexão (Thread Bloqueada) ] <--- socket()  |",
  "|   |                                    |                     |",
  "| [Novo Socket Criado] <===================> connect()          |",
  "|   |                                    |                     |",
  "| recv() <------------ [ Envia Solicitação ] <-------------- sendall()  |",
  "|   |                                    |                     |",
  "| sendall() -----------> [ Envia Resposta ] ---------------> recv()  |",
  "|   |                                    |                     |",
  "| close() <------------ [ Encerramento Gracioso ] ---------> close()  |",
  "+--------------------------------------------------------------+",
].join("\n");

test("reconhece o titulo do quadro e as duas raias", () => {
  const spec = parseLaneDiagram(CICLO_TCP);

  assert.ok(spec);
  assert.equal(spec!.title, "CICLO DE VIDA DA COMUNICAÇÃO TCP");
  assert.deepEqual(spec!.lanes, ["SERVIDOR", "CLIENTE"]);
});

test("passo sem seta de travessia fica na raia da esquerda (setas curtas nao contam)", () => {
  const spec = parseLaneDiagram(CICLO_TCP)!;

  assert.deepEqual(spec.steps[0], { left: "socket() -> bind() -> listen()" });
});

test("preserva os endpoints das duas pontas, que o parser de fluxo perdia", () => {
  const spec = parseLaneDiagram(CICLO_TCP)!;

  const travessias = spec.steps.filter((s) => s.right);
  assert.deepEqual(
    travessias.map((s) => [s.left, s.right]),
    [
      ["accept()", "socket()"],
      ["Novo Socket Criado", "connect()"],
      ["recv()", "sendall()"],
      ["sendall()", "recv()"],
      ["close()", "close()"],
    ],
  );
});

test("le a mensagem entre colchetes como a mensagem trocada", () => {
  const spec = parseLaneDiagram(CICLO_TCP)!;

  assert.equal(spec.steps[1].message, "Aguarda Conexão (Thread Bloqueada)");
  assert.equal(spec.steps[3].message, "Envia Solicitação");
});

test("le o sentido da seta: <--- puxa pra esquerda, ---> empurra pra direita, <===> vale nos dois", () => {
  const spec = parseLaneDiagram(CICLO_TCP)!;

  assert.equal(spec.steps[1].direction, "right-to-left");
  assert.equal(spec.steps[2].direction, "both");
  assert.equal(spec.steps[4].direction, "left-to-right");
});

test("linha com dois endpoints e nenhum colchete nao inventa mensagem", () => {
  const spec = parseLaneDiagram(CICLO_TCP)!;

  assert.equal(spec.steps[2].message, undefined);
  assert.equal(spec.steps[2].left, "Novo Socket Criado");
});

test("os '|' da moldura nao viram passo nem texto", () => {
  const spec = parseLaneDiagram(CICLO_TCP)!;

  for (const step of spec.steps) {
    assert.ok(!/^[|\s]*$/.test(step.left ?? "x"), `passo vazio: ${JSON.stringify(step)}`);
    assert.ok(!(step.left ?? "").includes("|") || (step.left ?? "").includes("->"));
    assert.ok(!(step.right ?? "").includes("|"));
    assert.ok(!(step.message ?? "").includes("|"));
  }
});

test("bloco sem cabecalho de duas raias nao e diagrama de raias", () => {
  const fluxoComum = "[ Aplicação ] ---> [ Buffer ] ---> [ Destino ]";
  assert.equal(parseLaneDiagram(fluxoComum), null);
});

test("quadro com cabecalho mas sem nenhuma travessia nao e diagrama de raias", () => {
  const semTravessia = [
    "+------------------------+",
    "| ANTES          DEPOIS  |",
    "| passo um               |",
    "| passo dois             |",
    "+------------------------+",
  ].join("\n");

  assert.equal(parseLaneDiagram(semTravessia), null);
});

test("tabela de texto comum (sem seta) nao virra diagrama de raias", () => {
  const tabela = ["| Porta   Protocolo |", "| 80      HTTP      |", "| 443     HTTPS     |"].join("\n");

  assert.equal(parseLaneDiagram(tabela), null);
});

test("describeLaneDiagram descreve quem fala com quem, em ordem", () => {
  const spec = parseLaneDiagram(CICLO_TCP)!;

  const descricao = describeLaneDiagram(spec);
  assert.match(descricao, /^Diagrama de sequência SERVIDOR \/ CLIENTE/);
  assert.match(descricao, /accept\(\) ← socket\(\) \(Aguarda Conexão \(Thread Bloqueada\)\)/);
  assert.match(descricao, /Novo Socket Criado ↔ connect\(\)/);
  assert.match(descricao, /sendall\(\) → recv\(\) \(Envia Resposta\)/);
});

test("renderLaneDiagramSvg desenha cabecalho, linhas de vida, endpoints e mensagens", () => {
  const spec = parseLaneDiagram(CICLO_TCP)!;
  const svg = renderLaneDiagramSvg(spec, { accentColor: "#17a398" });

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 760 \d+"/);
  assert.match(svg, />SERVIDOR</);
  assert.match(svg, />CLIENTE</);
  assert.match(svg, />accept\(\)</);
  assert.match(svg, />connect\(\)</);
  assert.match(svg, /Envia Resposta/);
  assert.match(svg, /CICLO DE VIDA DA COMUNICAÇÃO TCP/);
  // Duas linhas de vida verticais (uma por raia).
  assert.equal((svg.match(/stroke-opacity="0.4"/g) || []).length, 2);
});

test("renderLaneDiagramSvg escapa XML e nao vaza caractere cru", () => {
  const svg = renderLaneDiagramSvg({
    lanes: ["A & B", "C < D"],
    steps: [{ left: 'x > "y"', right: "z", direction: "left-to-right" }],
  });

  assert.match(svg, /A &amp; B/);
  assert.match(svg, /C &lt; D/);
  assert.match(svg, /x &gt; &quot;y&quot;/);
});

test("seta so pra esquerda nao ganha ponta na direita (e vice-versa)", () => {
  const paraEsquerda = renderLaneDiagramSvg({
    lanes: ["A", "B"],
    steps: [{ left: "a", right: "b", direction: "right-to-left" }],
  });
  const paraDireita = renderLaneDiagramSvg({
    lanes: ["A", "B"],
    steps: [{ left: "a", right: "b", direction: "left-to-right" }],
  });

  assert.ok(paraEsquerda.includes("marker-start"));
  assert.ok(!paraEsquerda.includes("marker-end"));
  assert.ok(paraDireita.includes("marker-end"));
  assert.ok(!paraDireita.includes("marker-start"));
});
