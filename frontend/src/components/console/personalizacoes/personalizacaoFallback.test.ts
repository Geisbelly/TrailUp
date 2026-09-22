import { describe, expect, it } from "vitest";
import { buildDesignTokensForProfile, hydrateMateriaisPublicUrls, resolvePublicStorageUrl } from "./personalizacaoFallback";

// Valores conferidos rodando `_build_design_tokens` (api/app/api/v1/personalizacao.py)
// diretamente em Python para os 7 perfis BrainHex. Qualquer divergencia aqui
// significa que o fallback do console vai mostrar uma cor diferente da API.
const GOLDEN_DESIGN_TOKENS: Record<string, ReturnType<typeof buildDesignTokensForProfile>> = {
  seeker: {
    cores: {
      background: "#0b1a25",
      surface: "#132a3b",
      surface_elevated: "#183545",
      primary: "#1ab5a9",
      primary_glow: "rgba(26, 181, 169, 0.30)",
      border: "rgba(26, 181, 169, 0.40)",
      text_primary: "#f2f7fa",
      text_muted: "rgba(242, 247, 250, 0.80)",
      success: "#34d399",
      warning: "#fbbf24",
      info: "#60a5fa",
      locked: "#5a676b",
    },
    sombra_primary: "rgba(26, 181, 169, 0.30)",
  },
  survivor: {
    cores: {
      background: "#0e1522",
      surface: "#192336",
      surface_elevated: "#202b3e",
      primary: "#8997a5",
      primary_glow: "rgba(137, 151, 165, 0.30)",
      border: "rgba(137, 151, 165, 0.40)",
      text_primary: "#f2f7fa",
      text_muted: "rgba(242, 247, 250, 0.80)",
      success: "#34d399",
      warning: "#fbbf24",
      info: "#60a5fa",
      locked: "#5a676b",
    },
    sombra_primary: "rgba(137, 151, 165, 0.30)",
  },
  daredevil: {
    cores: {
      background: "#161220",
      surface: "#271e32",
      surface_elevated: "#332339",
      primary: "#e56a7a",
      primary_glow: "rgba(229, 106, 122, 0.30)",
      border: "rgba(229, 106, 122, 0.40)",
      text_primary: "#f2f7fa",
      text_muted: "rgba(242, 247, 250, 0.80)",
      success: "#34d399",
      warning: "#fbbf24",
      info: "#60a5fa",
      locked: "#5a676b",
    },
    sombra_primary: "rgba(229, 106, 122, 0.30)",
  },
  mastermind: {
    cores: {
      background: "#0f1429",
      surface: "#1a2042",
      surface_elevated: "#21274f",
      primary: "#9583e6",
      primary_glow: "rgba(149, 131, 230, 0.30)",
      border: "rgba(149, 131, 230, 0.40)",
      text_primary: "#f2f7fa",
      text_muted: "rgba(242, 247, 250, 0.80)",
      success: "#34d399",
      warning: "#fbbf24",
      info: "#60a5fa",
      locked: "#5a676b",
    },
    sombra_primary: "rgba(149, 131, 230, 0.30)",
  },
  conqueror: {
    cores: {
      background: "#0b1529",
      surface: "#142242",
      surface_elevated: "#19294e",
      primary: "#6f90eb",
      primary_glow: "rgba(111, 144, 235, 0.30)",
      border: "rgba(111, 144, 235, 0.40)",
      text_primary: "#f2f7fa",
      text_muted: "rgba(242, 247, 250, 0.80)",
      success: "#34d399",
      warning: "#fbbf24",
      info: "#60a5fa",
      locked: "#5a676b",
    },
    sombra_primary: "rgba(111, 144, 235, 0.30)",
  },
  socializer: {
    cores: {
      background: "#181620",
      surface: "#2a2432",
      surface_elevated: "#372c38",
      primary: "#f5714d",
      primary_glow: "rgba(245, 113, 77, 0.30)",
      border: "rgba(245, 113, 77, 0.40)",
      text_primary: "#f2f7fa",
      text_muted: "rgba(242, 247, 250, 0.80)",
      success: "#34d399",
      warning: "#fbbf24",
      info: "#60a5fa",
      locked: "#5a676b",
    },
    sombra_primary: "rgba(245, 113, 77, 0.30)",
  },
  achiever: {
    cores: {
      background: "#151a1e",
      surface: "#252a30",
      surface_elevated: "#313536",
      primary: "#c9a227",
      primary_glow: "rgba(201, 162, 39, 0.30)",
      border: "rgba(201, 162, 39, 0.40)",
      text_primary: "#f2f7fa",
      text_muted: "rgba(242, 247, 250, 0.80)",
      success: "#34d399",
      warning: "#fbbf24",
      info: "#60a5fa",
      locked: "#5a676b",
    },
    sombra_primary: "rgba(201, 162, 39, 0.30)",
  },
};

describe("buildDesignTokensForProfile", () => {
  for (const [profile, expected] of Object.entries(GOLDEN_DESIGN_TOKENS)) {
    it(`bate com a saida do Python para ${profile}`, () => {
      expect(buildDesignTokensForProfile(profile)).toEqual(expected);
    });
  }

  it("perfil desconhecido cai para mastermind", () => {
    expect(buildDesignTokensForProfile("perfil-que-nao-existe")).toEqual(GOLDEN_DESIGN_TOKENS.mastermind);
  });
});

describe("resolvePublicStorageUrl", () => {
  it("monta a URL publica do storage a partir de bucket + path", () => {
    expect(resolvePublicStorageUrl("https://xyz.supabase.co", "conteudo_aluno", "aluno1/audio.mp3")).toBe(
      "https://xyz.supabase.co/storage/v1/object/public/conteudo_aluno/aluno1/audio.mp3"
    );
  });

  it("nao duplica o bucket quando o path ja vem prefixado com ele", () => {
    expect(
      resolvePublicStorageUrl("https://xyz.supabase.co", "conteudo_aluno", "conteudo_aluno/aluno1/audio.mp3")
    ).toBe("https://xyz.supabase.co/storage/v1/object/public/conteudo_aluno/aluno1/audio.mp3");
  });

  it("path ja absoluto e devolvido como veio", () => {
    expect(resolvePublicStorageUrl("https://xyz.supabase.co", "conteudo_aluno", "https://outro.com/a.mp3")).toBe(
      "https://outro.com/a.mp3"
    );
  });

  it("sem bucket ou path retorna null", () => {
    expect(resolvePublicStorageUrl("https://xyz.supabase.co", null, "a.mp3")).toBeNull();
    expect(resolvePublicStorageUrl("https://xyz.supabase.co", "conteudo_aluno", null)).toBeNull();
  });
});

describe("hydrateMateriaisPublicUrls", () => {
  it("resolve arquivo_url a partir de storage_path quando nao ha URL http", () => {
    const result = hydrateMateriaisPublicUrls("https://xyz.supabase.co", {
      audio: { storage_path: "aluno1/topico1/audio.mp3", metadata: {} },
    });
    expect((result?.audio as { arquivo_url?: string } | undefined)?.arquivo_url).toBe(
      "https://xyz.supabase.co/storage/v1/object/public/conteudo_aluno/aluno1/topico1/audio.mp3"
    );
  });

  it("preserva arquivo_url ja absoluto", () => {
    const result = hydrateMateriaisPublicUrls("https://xyz.supabase.co", {
      markdown: { arquivo_url: "https://ja.com/m.md" },
    });
    expect((result?.markdown as { arquivo_url?: string } | undefined)?.arquivo_url).toBe("https://ja.com/m.md");
  });

  it("materiais nulo retorna nulo", () => {
    expect(hydrateMateriaisPublicUrls("https://xyz.supabase.co", null)).toBeNull();
  });
});
