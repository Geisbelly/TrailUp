import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBagItem, validateBagDraft } from "./bagModel";

test("normaliza card gerado como somente leitura", () => {
  const item = normalizeBagItem({ id: "card:4", source_id: 4, origem: "plataforma", tipo: "card", editavel: false });
  assert.equal(item.editable, false);
  assert.equal(item.origin, "plataforma");
});

test("valida campos específicos por tipo", () => {
  assert.equal(validateBagDraft({ type: "resumo", title: "Resumo", content: "Texto" }), null);
  assert.match(validateBagDraft({ type: "card", title: "Card", front: "Pergunta" }) ?? "", /verso/i);
});
