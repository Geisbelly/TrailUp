import { describe, expect, it } from "vitest";
import { buildDesignTokensForProfile, hydrateMateriaisPublicUrls, resolvePublicStorageUrl,
  contarAlunosPorPerfilDominante,
  normalizarChaveDePerfil,
  resolveMaterialUrl,
} from "./personalizacaoFallback";

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

describe("resolveMaterialUrl (porte de build_material_url)", () => {
  it("material do bucket conteudo_aluno vai pro gateway", () => {
    expect(resolveMaterialUrl("https://xyz.supabase.co", "conteudo_aluno", "a/b/c.mp3")).toBe(
      "https://xyz.supabase.co/functions/v1/storage-redirect?path=a/b/c.mp3"
    );
  });

  it("outro bucket (fonte do professor) fica na URL publica direta", () => {
    // O gateway so' conhece caminhos de `vw_material_storage_paths`.
    expect(resolveMaterialUrl("https://xyz.supabase.co", "conteudos", "prof/slide.pptx")).toBe(
      "https://xyz.supabase.co/storage/v1/object/public/conteudos/prof/slide.pptx"
    );
  });

  it("path ja absoluto e devolvido como veio", () => {
    expect(resolveMaterialUrl("https://xyz.supabase.co", "conteudo_aluno", "https://outro.com/a.mp3")).toBe(
      "https://outro.com/a.mp3"
    );
  });

  it("sem bucket ou path retorna null", () => {
    expect(resolveMaterialUrl("https://xyz.supabase.co", null, "a.mp3")).toBeNull();
    expect(resolveMaterialUrl("https://xyz.supabase.co", "conteudo_aluno", null)).toBeNull();
  });
});

describe("hydrateMateriaisPublicUrls", () => {
  // Expectativa ATUALIZADA: este teste exigia a URL publica direta
  // (`/storage/v1/object/public/...`), que e' justamente a que da' 404 depois da
  // migracao para o R2. Material do bucket `conteudo_aluno` vai pro gateway.
  it("resolve arquivo_url a partir de storage_path apontando pro gateway", () => {
    const result = hydrateMateriaisPublicUrls("https://xyz.supabase.co", {
      audio: { storage_path: "aluno1/topico1/audio.mp3", metadata: {} },
    });
    expect((result?.audio as { arquivo_url?: string } | undefined)?.arquivo_url).toBe(
      "https://xyz.supabase.co/functions/v1/storage-redirect?path=aluno1/topico1/audio.mp3"
    );
  });

  // A regressao que motivou a correcao. O microservice grava `storage_path`
  // EXATAMENTE quando grava `arquivo_url` (server.ts: `storage_path: audioMp3Url
  // ? audioPath : null`), entao todo material real cai neste caso — e a
  // hidratacao sobrescrevia a URL do gateway com a direta, que e' morta.
  // E' o mesmo defeito que a migracao 20260922_06 corrigiu no lado Python.
  it("nao rebaixa para URL direta quando ha arquivo_url do gateway E storage_path", () => {
    const gateway =
      "https://xyz.supabase.co/functions/v1/storage-redirect?path=aluno1/topico1/audio.mp3";
    const result = hydrateMateriaisPublicUrls("https://xyz.supabase.co", {
      audio: {
        arquivo_url: gateway,
        storage_path: "aluno1/topico1/audio.mp3",
        metadata: { bucket: "conteudo_aluno" },
      },
    });
    const url = (result?.audio as { arquivo_url?: string } | undefined)?.arquivo_url;
    expect(url).toBe(gateway);
    expect(url).not.toContain("/object/public/");
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

describe("contarAlunosPorPerfilDominante", () => {
  // Espelha `listar_alunos_classe_com_perfil_dominante`:
  // ROW_NUMBER() OVER (PARTITION BY aluno_id ORDER BY afinidade DESC NULLS LAST, nome ASC)

  it("conta o perfil de maior afinidade de cada aluno", () => {
    expect(
      contarAlunosPorPerfilDominante(
        ["a", "b"],
        [
          { aluno_id: "a", afinidade: 80, perfil_nome: "seeker" },
          { aluno_id: "a", afinidade: 30, perfil_nome: "achiever" },
          { aluno_id: "b", afinidade: 90, perfil_nome: "seeker" },
        ]
      )
    ).toEqual({ seeker: 2 });
  });

  it("afinidade nula perde de qualquer numero, inclusive de zero (NULLS LAST)", () => {
    expect(
      contarAlunosPorPerfilDominante(
        ["a"],
        [
          { aluno_id: "a", afinidade: null, perfil_nome: "achiever" },
          { aluno_id: "a", afinidade: 0, perfil_nome: "survivor" },
        ]
      )
    ).toEqual({ survivor: 1 });
  });

  it("empate de afinidade desempata por nome ASC, nao pela ordem de chegada", () => {
    const linhas = [
      { aluno_id: "a", afinidade: 50, perfil_nome: "seeker" },
      { aluno_id: "a", afinidade: 50, perfil_nome: "achiever" },
    ];
    expect(contarAlunosPorPerfilDominante(["a"], linhas)).toEqual({ achiever: 1 });
    // invertendo a ordem de entrada, o resultado tem que ser o mesmo
    expect(contarAlunosPorPerfilDominante(["a"], [...linhas].reverse())).toEqual({ achiever: 1 });
  });

  it("aluno sem nenhuma linha de perfil conta como mastermind, nao some", () => {
    expect(contarAlunosPorPerfilDominante(["a", "b"], [
      { aluno_id: "a", afinidade: 70, perfil_nome: "conqueror" },
    ])).toEqual({ conqueror: 1, mastermind: 1 });
  });

  it("ignora linhas de aluno que nao e da turma", () => {
    expect(
      contarAlunosPorPerfilDominante(
        ["a"],
        [
          { aluno_id: "a", afinidade: 10, perfil_nome: "seeker" },
          { aluno_id: "intruso", afinidade: 99, perfil_nome: "daredevil" },
        ]
      )
    ).toEqual({ seeker: 1 });
  });

  it("turma vazia nao inventa contagem", () => {
    expect(contarAlunosPorPerfilDominante([], [
      { aluno_id: "a", afinidade: 10, perfil_nome: "seeker" },
    ])).toEqual({});
  });

  it("o total conferido bate com o numero de alunos da turma", () => {
    const alunos = ["a", "b", "c", "d"];
    const contagem = contarAlunosPorPerfilDominante(alunos, [
      { aluno_id: "a", afinidade: 10, perfil_nome: "seeker" },
      { aluno_id: "b", afinidade: 20, perfil_nome: "SOCIALISER" },
      { aluno_id: "c", afinidade: null, perfil_nome: "survivor" },
    ]);
    expect(Object.values(contagem).reduce((s, n) => s + n, 0)).toBe(alunos.length);
    expect(contagem.socializer).toBe(1); // apelido normalizado
    expect(contagem.mastermind).toBe(1); // o "d", sem perfil
  });
});

describe("normalizarChaveDePerfil", () => {
  it("espelha _normalize_profile_key", () => {
    expect(normalizarChaveDePerfil("Socialiser")).toBe("socializer");
    expect(normalizarChaveDePerfil("  SEEKER ")).toBe("seeker");
    expect(normalizarChaveDePerfil(null)).toBe("mastermind");
    expect(normalizarChaveDePerfil("")).toBe("mastermind");
    // chave desconhecida passa como veio, igual ao Python
    expect(normalizarChaveDePerfil("inventado")).toBe("inventado");
  });
});
