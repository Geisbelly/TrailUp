import { describe, it, expect } from "vitest";
import { markdownUrlTransform } from "./markdownUrlTransform";

describe("markdownUrlTransform", () => {
  it("libera imagem embutida em data URI no src (imagem de pptx e diagrama SVG)", () => {
    const png = "data:image/png;base64,QUJD";
    const svg = "data:image/svg+xml,%3Csvg%3E%3C/svg%3E";

    expect(markdownUrlTransform(png, "src", null)).toBe(png);
    expect(markdownUrlTransform(svg, "src", null)).toBe(svg);
  });

  it("libera os demais formatos que o pipeline produz", () => {
    for (const mime of ["jpeg", "webp", "gif", "bmp"]) {
      const url = `data:image/${mime};base64,QUJD`;
      expect(markdownUrlTransform(url, "src", null)).toBe(url);
    }
  });

  it("nao libera data URI que nao e imagem, nem no src", () => {
    expect(markdownUrlTransform("data:text/html,<script>alert(1)</script>", "src", null)).toBe("");
    expect(markdownUrlTransform("data:application/pdf;base64,QUJD", "src", null)).toBe("");
  });

  it("nao libera data URI de imagem fora do src (href de link seria porta de XSS)", () => {
    expect(markdownUrlTransform("data:image/svg+xml,%3Csvg%3E", "href", null)).toBe("");
  });

  it("bloqueia javascript: como o padrao do react-markdown ja bloqueia", () => {
    expect(markdownUrlTransform("javascript:alert(1)", "href", null)).toBe("");
    expect(markdownUrlTransform("javascript:alert(1)", "src", null)).toBe("");
  });

  it("mantem http/https e caminho relativo funcionando", () => {
    expect(markdownUrlTransform("https://x.test/a.png", "src", null)).toBe("https://x.test/a.png");
    expect(markdownUrlTransform("http://x.test/a.png", "src", null)).toBe("http://x.test/a.png");
    expect(markdownUrlTransform("/imagens/a.png", "src", null)).toBe("/imagens/a.png");
    expect(markdownUrlTransform("mailto:a@b.test", "href", null)).toBe("mailto:a@b.test");
  });
});
