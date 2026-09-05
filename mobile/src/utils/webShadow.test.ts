import assert from "node:assert/strict";
import test from "node:test";

import { boxShadowFromRN, textShadowFromRN } from "./webShadow";

test("boxShadowFromRN combina shadowOpacity no alpha da cor", () => {
  const css = boxShadowFromRN({
    color: "#000",
    offset: { width: 0, height: 4 },
    opacity: 0.18,
    radius: 8,
  });

  assert.equal(css, "0px 4px 8px rgba(0, 0, 0, 0.18)");
});

test("boxShadowFromRN aceita cor ja em rgba/nomeada sem duplicar alpha", () => {
  const css = boxShadowFromRN({ color: "rgba(255, 0, 0, 0.5)", opacity: 0.5 });

  // setAlpha substitui o alpha existente, nao multiplica -- shadowOpacity do
  // RN e sempre o alpha final, nunca um multiplicador sobre um alpha previo.
  assert.equal(css, "0px 0px 0px rgba(255, 0, 0, 0.5)");
});

test("boxShadowFromRN usa os defaults do RN quando nada e passado", () => {
  // RN: shadowOffset {0,0}, shadowRadius 0, shadowOpacity 0 (sombra invisivel
  // ate alguem setar opacity) -- mas aqui o default de opacity e 1 porque um
  // shadowColor sem shadowOpacity ao lado normalmente vem de um site que ja
  // fixa shadowOpacity em outro objeto do array de estilo. Alpha 1 sai como
  // rgb() (sem canal alpha) -- e assim que tinycolor serializa opaco.
  const css = boxShadowFromRN();

  assert.equal(css, "0px 0px 0px rgb(0, 0, 0)");
});

test("textShadowFromRN repassa a cor sem mexer no alpha", () => {
  const css = textShadowFromRN({
    color: "rgba(0,0,0,0.7)",
    offset: { width: 0, height: 1 },
    radius: 4,
  });

  assert.equal(css, "0px 1px 4px rgba(0,0,0,0.7)");
});
