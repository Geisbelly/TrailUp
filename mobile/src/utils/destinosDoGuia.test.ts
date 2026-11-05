import assert from "node:assert/strict";
import test from "node:test";

import { destinosParaBotoes, montarRespostaDoGuia } from "./destinosDoGuia";
import { TUTORIAIS_DO_GUIA, tutorialDisponivel } from "./tutoriaisDoGuia";

const ABERTO = { social: true, rank: true };
const FECHADO = { social: false, rank: false };

test("traduz o código em rótulo e rota", () => {
  assert.deepEqual(destinosParaBotoes(["perfil.loja"], ABERTO), [{ rotulo: "Loja", rota: "/(tabs)/perfil/loja" }]);
});

test("código desconhecido e lista ausente não viram botão", () => {
  assert.deepEqual(destinosParaBotoes(["perfil.inventado"], ABERTO), []);
  assert.deepEqual(destinosParaBotoes(undefined, ABERTO), []);
});

test("aba com cadeado não vira botão, porque o push passaria por cima do portão", () => {
  assert.deepEqual(destinosParaBotoes(["social", "ranking", "perfil"], FECHADO), [
    { rotulo: "Perfil", rota: "/(tabs)/perfil" },
  ]);
  assert.equal(destinosParaBotoes(["social", "ranking"], ABERTO).length, 2);
});

test("sem seções, vale o reply inteiro", () => {
  const r = montarRespostaDoGuia({ reply: "Oi", destinos: ["perfil.loja"] }, ABERTO);
  assert.equal(r.texto, "Oi");
  assert.deepEqual(r.secoes, []);
  assert.equal(r.botoes.length, 1);
});

test("com seções, o balão mostra a abertura e o botão não se repete embaixo", () => {
  const r = montarRespostaDoGuia(
    {
      reply: "Abertura\n\nLoja: Compre.\n\nMetas: Veja.",
      introducao: "Abertura",
      secoes: [
        { titulo: "Loja", texto: "Compre.", destino: "perfil.loja" },
        { titulo: "Metas", texto: "Veja.", destino: null },
      ],
      destinos: ["perfil.loja", "perfil.coleta"],
    },
    ABERTO,
  );
  assert.equal(r.texto, "Abertura");
  assert.equal(r.secoes[0].botao?.rotulo, "Loja");
  assert.equal(r.secoes[1].botao, null);
  assert.deepEqual(r.botoes.map((b) => b.rotulo), ["Coleta e acessos"]);
});

test("seção de aba com cadeado fica sem botão", () => {
  const r = montarRespostaDoGuia(
    { reply: "x", introducao: "x", secoes: [{ titulo: "Social", texto: "y", destino: "social" }] },
    FECHADO,
  );
  assert.equal(r.secoes[0].botao, null);
});

test("tutorial de aba com cadeado não é oferecido", () => {
  assert.equal(tutorialDisponivel("ver_ranking", FECHADO), null);
  assert.equal(tutorialDisponivel("ver_ranking", ABERTO)?.id, "ver_ranking");
  assert.equal(tutorialDisponivel("inventado", ABERTO), null);
  assert.equal(tutorialDisponivel(null, ABERTO), null);
});

test("nenhum tutorial sem cadeado passa por aba que pode estar fechada", () => {
  for (const t of TUTORIAIS_DO_GUIA.filter((item) => !item.portao)) {
    assert.ok(t.passos.every((p) => !p.route.includes("ranking") && !p.route.includes("social")), t.id);
  }
});
