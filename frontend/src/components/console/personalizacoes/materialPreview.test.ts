import { describe, expect, it } from "vitest";
import {
  appendMaterialCacheVersion,
  materialCacheVersion,
  resolveDocumentPreviewMode,
  versionedMaterialUrl,
} from "./materialPreview";

describe("resolveDocumentPreviewMode", () => {
  it("abre apresentacao PDF diretamente quando o MIME informa application/pdf", () => {
    expect(resolveDocumentPreviewMode(
      {
        arquivo_url: "https://cdn.example/material",
        mime_type: "application/pdf",
      },
      "apresentacao",
    )).toBe("pdf");
  });

  it("infere PDF pela extensao da URL ou do storage_path", () => {
    expect(resolveDocumentPreviewMode(
      { arquivo_url: "https://cdn.example/material.PDF?download=1" },
      "apresentacao",
    )).toBe("pdf");

    expect(resolveDocumentPreviewMode(
      {
        arquivo_url: "https://cdn.example/public/material",
        storage_path: "brainhex/seeker/apresentacao/material-123.pdf",
      },
      "apresentacao",
    )).toBe("pdf");
  });

  it("mantem Office Viewer para arquivos PowerPoint legados", () => {
    expect(resolveDocumentPreviewMode(
      {
        arquivo_url: "https://cdn.example/material",
        mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
      "apresentacao",
    )).toBe("office");

    expect(resolveDocumentPreviewMode(
      { arquivo_url: "https://cdn.example/material.pptx?download=1" },
      "apresentacao",
    )).toBe("office");
  });

  it("abre deck HTML do BrainHexPDF direto no iframe, sem passar pelo Office Viewer", () => {
    expect(resolveDocumentPreviewMode(
      { arquivo_url: "https://cdn.example/apresentacao/material-1.html?trailup_v=abc" },
      "apresentacao",
    )).toBe("html");

    expect(resolveDocumentPreviewMode(
      {
        arquivo_url: "https://cdn.example/public/material",
        storage_path: "brainhex/seeker/apresentacao/material-123.html",
      },
      "apresentacao",
    )).toBe("html");
  });

  it("usa html como fallback de apresentacao sem MIME/extensao reconhecida (motor atual do BrainHexPDF)", () => {
    // O motor de apresentacao atual (html-direct/BrainHexPDF) nao sempre
    // informa mime_type, e a URL as vezes carrega so query params - sem
    // extensao/MIME reconhecidos, o fallback tinha que ser Office Viewer
    // (motor legado), quebrando o preview de todo deck HTML atual. Agora
    // o fallback de "apresentacao" reflete o motor vigente.
    expect(resolveDocumentPreviewMode(
      { arquivo_url: "https://cdn.example/apresentacao/material-1?trailup_v=abc" },
      "apresentacao",
    )).toBe("html");
  });

  it("preserva fallback pdf pra materiais do tipo PDF isolado, sem MIME/extensao reconhecida", () => {
    expect(resolveDocumentPreviewMode(
      { arquivo_url: "https://cdn.example/material-sem-extensao" },
      "pdf",
    )).toBe("pdf");
  });
});

describe("cache busting de materiais", () => {
  it("combina generation_key e updated_at do material", () => {
    expect(materialCacheVersion({
      metadata: {
        generation_key: "ciclo-1:hash-1",
        updated_at: "2026-07-28T10:20:30Z",
      },
    })).toBe("ciclo-1:hash-1|2026-07-28T10:20:30Z");
  });

  it("usa updated_at da personalizacao como fallback", () => {
    expect(materialCacheVersion(
      { arquivo_url: "https://cdn.example/material.pdf" },
      "2026-07-28T11:00:00Z",
    )).toBe("2026-07-28T11:00:00Z");
  });

  it("preserva query e fragmento ao acrescentar a versao", () => {
    expect(appendMaterialCacheVersion(
      "https://cdn.example/material.pdf?download=1#page=2",
      "ciclo:hash|2026-07-28T10:20:30Z",
    )).toBe(
      "https://cdn.example/material.pdf?download=1&trailup_v=ciclo%3Ahash%7C2026-07-28T10%3A20%3A30Z#page=2",
    );
  });

  it("substitui uma versao anterior sem duplicar o parametro", () => {
    expect(appendMaterialCacheVersion(
      "https://cdn.example/material.pdf?trailup_v=antiga&download=1",
      "nova",
    )).toBe(
      "https://cdn.example/material.pdf?trailup_v=nova&download=1",
    );
  });

  it("nao altera URLs blob/data nem URLs sem metadado de versao", () => {
    expect(appendMaterialCacheVersion("blob:https://trailup.app/id", "v1"))
      .toBe("blob:https://trailup.app/id");
    expect(versionedMaterialUrl(
      "https://cdn.example/material.pdf?download=1",
      { arquivo_url: "https://cdn.example/material.pdf" },
    )).toBe("https://cdn.example/material.pdf?download=1");
  });
});
