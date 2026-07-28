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
