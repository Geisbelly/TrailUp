import assert from "node:assert/strict";
import test from "node:test";

import { replaceAsciiDiagramsWithSvg } from "./asciiDiagram";

const FLUXO_COM_FAN_IN = [
  "[ Cliente A ] -- (Datagrama A1) --\\",
  "[ Cliente B ] -- (Datagrama B1) ---> [ Buffer Único UDP (FIFO) ] ---> [ Aplicação Servidora ]",
  "[ Cliente C ] -- (Datagrama C1) --/",
].join("\n");

const FLUXO_COM_DESDOBRAMENTO = [
  "[ Cliente remoto ] --- (Solicitação SYN) ---> [ ServerSocket (Escutando na Porta 80) ]",
  "                            |",
  "                        accept()",
  "                            |",
  "              [ Cria NOVO Socket Dedicado (ex: Socket-A) ]",
].join("\n");

const QUADRO_DE_RAIAS = [
  "+------------------------------------------+",
  "|        CICLO DE VIDA DA CONEXÃO TCP      |",
  "+------------------------------------------+",
  "| SERVIDOR                       CLIENTE  |",
  "| accept() <--- [ Aguarda SYN ] <--- socket()  |",
  "| close() <--- [ Encerramento ] ---> close()   |",
  "+------------------------------------------+",
].join("\n");

// Quadro emoldurado que NAO e diagrama de raias (sem cabecalho de dois lados):
// e o caso que nao pode cair no parser de fluxo, senao as bordas "|" viram
// caixas e notas falsas e sai um diagrama errado.
const QUADRO_SEM_RAIAS = [
  "+--------------------------------+",
  "| TABELA DE PORTAS               |",
  "| [ HTTP ] 80                    |",
  "| [ HTTPS ] 443                  |",
  "+--------------------------------+",
].join("\n");

function cerca(corpo: string, linguagem = ""): string {
  return "```" + linguagem + "\n" + corpo + "\n```";
}

function uriDoResultado(resultado: string): string {
  return resultado.slice(resultado.indexOf("data:image/svg+xml,"), resultado.lastIndexOf(")"));
}

test("troca o bloco de fluxo ASCII por uma imagem SVG embutida", () => {
  const markdown = `## Encerramento\n\nTexto antes.\n\n${cerca(FLUXO_COM_FAN_IN)}\n\nTexto depois.`;

  const resultado = replaceAsciiDiagramsWithSvg(markdown);

  assert.ok(!resultado.includes("```"));
  assert.match(resultado, /!\[Diagrama de fluxo: Cliente A[^\]]*\]\(data:image\/svg\+xml,%3Csvg[^)]+\)/);
  assert.match(resultado, /Texto antes\./);
  assert.match(resultado, /Texto depois\./);
});

test("nenhum parentese cru na data URI (um ')' fecharia o link no meio do SVG)", () => {
  const resultado = replaceAsciiDiagramsWithSvg(cerca(FLUXO_COM_FAN_IN));

  const uri = uriDoResultado(resultado);
  assert.ok(!uri.includes("("), "parentese cru na data URI");
  assert.ok(!uri.includes(")"), "parentese cru na data URI");
});

test("a data URI decodifica de volta pro SVG original (e assim que o mobile le)", () => {
  const resultado = replaceAsciiDiagramsWithSvg(cerca(FLUXO_COM_FAN_IN));

  const svg = decodeURIComponent(uriDoResultado(resultado).replace("data:image/svg+xml,", ""));

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /Buffer Único UDP \(FIFO\)/);
});

test("quadro de duas raias vira diagrama de sequencia, nao diagrama de fluxo", () => {
  const resultado = replaceAsciiDiagramsWithSvg(cerca(QUADRO_DE_RAIAS));

  assert.match(resultado, /!\[Diagrama de sequência SERVIDOR \/ CLIENTE/);
  const svg = decodeURIComponent(uriDoResultado(resultado).replace("data:image/svg+xml,", ""));
  // Os endpoints das duas pontas sobrevivem - era exatamente o que o parser de
  // fluxo perdia neste formato.
  assert.match(svg, />accept\(\)</);
  assert.match(svg, />socket\(\)</);
  assert.match(svg, /CICLO DE VIDA DA CONEXÃO TCP/);
});

test("quadro emoldurado que nao e de raias fica intacto (nao vira diagrama errado)", () => {
  const markdown = cerca(QUADRO_SEM_RAIAS);

  assert.equal(replaceAsciiDiagramsWithSvg(markdown), markdown);
});

test("NAO toca em bloco de codigo de verdade", () => {
  const markdown = cerca("fila = [1, 2, 3]\nprint(fila[0])", "python");

  assert.equal(replaceAsciiDiagramsWithSvg(markdown), markdown);
});

test("deixa intacto bloco sem cara de diagrama", () => {
  const markdown = cerca("saida do terminal, sem caixa nenhuma");

  assert.equal(replaceAsciiDiagramsWithSvg(markdown), markdown);
});

test("converte todos os blocos de diagrama do documento, de tipos diferentes", () => {
  const markdown = [
    cerca(FLUXO_COM_FAN_IN),
    "texto entre eles",
    cerca(QUADRO_DE_RAIAS),
    "mais texto",
    cerca(FLUXO_COM_DESDOBRAMENTO),
  ].join("\n\n");

  const resultado = replaceAsciiDiagramsWithSvg(markdown);

  assert.equal((resultado.match(/data:image\/svg\+xml,%3Csvg/g) || []).length, 3);
  assert.equal((resultado.match(/Diagrama de sequência/g) || []).length, 1);
  assert.equal((resultado.match(/Diagrama de fluxo/g) || []).length, 2);
});

test("usa a cor do perfil no diagrama", () => {
  const comCor = replaceAsciiDiagramsWithSvg(cerca(FLUXO_COM_FAN_IN), { accentColor: "#f4623a" });
  const semCor = replaceAsciiDiagramsWithSvg(cerca(FLUXO_COM_FAN_IN));

  assert.notEqual(comCor, semCor);
  const svg = decodeURIComponent(uriDoResultado(comCor).replace("data:image/svg+xml,", ""));
  assert.match(svg, /#f4623a/i);
});

test("markdown sem bloco nenhum passa sem alteracao", () => {
  assert.equal(replaceAsciiDiagramsWithSvg("## Título\n\nSó texto."), "## Título\n\nSó texto.");
  assert.equal(replaceAsciiDiagramsWithSvg(""), "");
});

test("o SVG declara largura e altura em unidades proprias (o <img> precisa da proporcao intrinseca)", () => {
  for (const bloco of [FLUXO_COM_FAN_IN, QUADRO_DE_RAIAS]) {
    const resultado = replaceAsciiDiagramsWithSvg(cerca(bloco));
    const svg = decodeURIComponent(uriDoResultado(resultado).replace("data:image/svg+xml,", ""));

    // Com width="100%" e sem height, o navegador nao tem como derivar a
    // proporcao e chuta um tamanho padrao (300x150) - o diagrama sai deformado.
    const match = svg.match(/^<svg[^>]*viewBox="0 0 (\d+) (\d+)"[^>]*width="(\d+)" height="(\d+)"/);
    assert.ok(match, `svg sem width/height explicitos: ${svg.slice(0, 160)}`);
    assert.equal(match![3], match![1]);
    assert.equal(match![4], match![2]);
  }
});
