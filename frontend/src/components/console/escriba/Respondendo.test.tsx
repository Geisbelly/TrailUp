import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { textoDoRespondendo } from "./conversa";
import Respondendo from "./Respondendo";

const ESCRIBA = readFileSync(resolve(__dirname, "Escriba.tsx"), "utf8");

describe("Lumi está respondendo", () => {
  it("é região viva educada, com o texto para o leitor de tela e os pontos escondidos", () => {
    const html = renderToStaticMarkup(<Respondendo demorando={false} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Lumi está respondendo…");
    // Os três pontos ficam num bloco escondido do leitor de tela.
    expect(html.match(/animate-bounce/g)).toHaveLength(3);
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>(<span[^>]*animate-bounce[^>]*><\/span>){3}<\/span>/);
  });

  it("com Reduzir movimento os pontos ficam parados", () => {
    const html = renderToStaticMarkup(<Respondendo demorando={false} />);
    expect(html.match(/motion-reduce:animate-none/g)).toHaveLength(3);
  });

  it("na demora avisa que o servidor pode estar acordando", () => {
    expect(textoDoRespondendo(true)).toContain("o servidor pode estar acordando");
    expect(renderToStaticMarkup(<Respondendo demorando />)).toContain("isso leva até um minuto");
  });

  it("aparece só enquanto a pergunta está no ar, e o finally do envio o tira no sucesso e no erro", () => {
    expect(ESCRIBA).toContain("{pensando && <Respondendo demorando={demorando} />}");
    expect(ESCRIBA).toMatch(/finally \{\s*setPensando\(false\);/);
  });
});
