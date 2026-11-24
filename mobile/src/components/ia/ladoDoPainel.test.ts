import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { baseDoPainelAberto, painelAoLadoDoBotao } from "./ladoDoPainel";

const PAINEL = readFileSync(join(process.cwd(), "src", "components", "ia", "IAMentorPanel.tsx"), "utf8");

test("na tela larga o painel vai para o lado do botão", () => {
  assert.equal(painelAoLadoDoBotao({ temAncora: false, larguraJanela: 1440, larguraPainel: 496 }), true);
});

test("no celular o painel segue ocupando a largura", () => {
  assert.equal(painelAoLadoDoBotao({ temAncora: false, larguraJanela: 390, larguraPainel: 374 }), false);
  // No limite: sem as margens dos dois lados e a do meio, não cabe ao lado.
  assert.equal(painelAoLadoDoBotao({ temAncora: false, larguraJanela: 540, larguraPainel: 496 }), false);
});

test("com âncora a posição vem de fora", () => {
  assert.equal(painelAoLadoDoBotao({ temAncora: true, larguraJanela: 1440, larguraPainel: 380 }), false);
});

test("o painel usa a regra para alinhar o contêiner e o cartão à direita", () => {
  assert.ok(PAINEL.includes("painelAoLadoDoBotao("), "o painel não consulta a regra");
  assert.ok(PAINEL.includes("styles.overlayOpenAoLadoDoBotao"), "o contêiner aberto não vai para a direita");
  assert.ok(PAINEL.includes("styles.cardAoLadoDoBotao"), "o cartão não vai para a direita");
  const estilo = /^ {2}cardAoLadoDoBotao: \{\n(.*?)^ {2}\},/ms.exec(PAINEL);
  assert.ok(estilo && estilo[1].includes('alignSelf: "flex-end"'), "cardAoLadoDoBotao precisa de alignSelf flex-end");
});

test("aberto na web larga, o painel desce até a margem do pé da janela", () => {
  assert.equal(baseDoPainelAberto({ web: true, aoLadoDoBotao: true, base: 148 }), 16);
});

test("no aparelho, no celular da web e com base já pequena, a base não muda", () => {
  assert.equal(baseDoPainelAberto({ web: false, aoLadoDoBotao: true, base: 148 }), 148);
  assert.equal(baseDoPainelAberto({ web: true, aoLadoDoBotao: false, base: 148 }), 148);
  assert.equal(baseDoPainelAberto({ web: true, aoLadoDoBotao: true, base: 8 }), 8);
});

test("o painel aberto usa a base nova e desce até a mensagem mais recente", () => {
  assert.ok(PAINEL.includes("baseDoPainelAberto("), "o painel não consulta a base do painel aberto");
  assert.ok(PAINEL.includes("isOpen && !ancora ? { bottom: baseAberta } : null"), "o contêiner aberto não usa a base nova");
  assert.ok(PAINEL.includes("onContentSizeChange={descerAoCrescer}"), "a lista não desce quando o conteúdo cresce");
});

test("depois do envio, a conversa mostra o \"respondendo\" até a resposta chegar ou falhar", () => {
  assert.ok(/\{sending \? \(\s*<View[^>]*>[\s\S]*?<IndicadorRespondendo/.test(PAINEL), "o indicador não depende de sending");
  // O finally desliga `sending` tanto no sucesso quanto no erro: o indicador some nos dois.
  assert.ok(/finally \{\s*setSending\(false\);/.test(PAINEL), "sending não volta a false no finally");
});
