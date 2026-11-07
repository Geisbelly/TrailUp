import assert from "node:assert/strict";
import test from "node:test";

import {
  actionsForBagItem,
  bagTypeFilterOptions,
  bagMaterialFormat,
  isBagClassReady,
  materialDraft,
  normalizeBagItem,
  normalizeBagContentId,
  shouldShowBagTypeFilters,
  validateBagDraft,
} from "./bagModel";

test("Bag só pode carregar quando a turma atual está resolvida", () => {
  assert.equal(isBagClassReady(32), true);
  assert.equal(isBagClassReady(null), false);
  assert.equal(isBagClassReady(undefined), false);
  assert.equal(isBagClassReady(0), false);
});

test("filtros de tipo não tratam compra como card ou anotação", () => {
  assert.deepEqual(bagTypeFilterOptions(null), ["resumo", "anotacao", "card", "material"]);
  assert.deepEqual(bagTypeFilterOptions("loja"), []);
  assert.equal(shouldShowBagTypeFilters(null), true);
  assert.equal(shouldShowBagTypeFilters("loja"), false);
});

test("normaliza card gerado como somente leitura", () => {
  const item = normalizeBagItem({ id: "card:4", source_id: 4, origem: "plataforma", tipo: "card", editavel: false });
  assert.equal(item.editable, false);
  assert.equal(item.origin, "plataforma");
});

test("valida campos específicos por tipo", () => {
  assert.equal(validateBagDraft({ type: "resumo", title: "Resumo", content: "Texto" }), null);
  assert.match(validateBagDraft({ type: "card", title: "Card", front: "Pergunta" }) ?? "", /verso/i);
});

test("normaliza item comprado na loja como posse somente leitura", () => {
  const item = normalizeBagItem({
    id: "loja:9",
    source_id: 9,
    origem: "loja",
    tipo: "loja",
    titulo: "Segunda chance",
    conteudo: "Refaça a atividade.",
  });

  assert.equal(item.origin, "loja");
  assert.equal(item.type, "loja");
  assert.equal(item.editable, false);
});

test("preserva os dados da posse da loja e não oferece ação de card", () => {
  const item = normalizeBagItem({
    id: "loja:9",
    source_id: 9,
    origem: "loja",
    tipo: "loja",
    metadata: {
      item_codigo: "segunda_chance",
      efeito: "segunda_chance",
      preco_pago: 25,
      status: "ativa",
    },
  });

  assert.equal(item.metadata.efeito, "segunda_chance");
  assert.equal(item.metadata.preco_pago, 25);
  assert.deepEqual(actionsForBagItem(item), []);
});

test("não envia ID sintético de conteúdo personalizado para a Bag", () => {
  assert.equal(normalizeBagContentId(-3746), null);
  assert.equal(normalizeBagContentId("-3746"), null);
  assert.equal(normalizeBagContentId(null), null);
  assert.equal(normalizeBagContentId(174), 174);
});

test("material salvo é atalho: formato e bloco no metadata, sem URL", () => {
  const draft = materialDraft({ formato: "audio", bloco: "audio-1", titulo: "  Áudio do Guardião ", classId: 3, topicId: 9, contentId: -4 });
  assert.equal(draft.type, "material");
  assert.equal(draft.title, "Áudio do Guardião");
  assert.equal(draft.contentId, null, "id negativo é de bloco personalizado, não de conteúdo");
  assert.deepEqual(draft.metadata, { formato: "audio", bloco: "audio-1" });
  assert.equal(validateBagDraft(draft), null);
  assert.match(validateBagDraft({ ...draft, topicId: null }) ?? "", /tópico/i);
  assert.match(validateBagDraft({ ...draft, metadata: { formato: "gif" } }) ?? "", /formato/i);
});

test("material da Bag abre no tópico e só sai da Bag", () => {
  const item = normalizeBagItem({ id: "item:7", source_id: 7, origem: "aluno", tipo: "material", topico_id: 9, metadata: { formato: "apresentacao", bloco: "deck" } });
  assert.equal(item.type, "material");
  assert.equal(bagMaterialFormat(item), "apresentacao");
  assert.deepEqual(actionsForBagItem(item), ["abrir", "excluir"]);
});
