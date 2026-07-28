import { describe, expect, it } from "vitest";
import type {
  GeracaoConteudoStatus,
  PersonalizacaoPerfilItem,
} from "./personalizacoesApi";
import {
  limitarPercentual,
  resolverGeracaoFormato,
  resumirGeracaoConteudo,
  statusGeracaoDoPerfil,
  temGeracaoAtiva,
} from "./generationStatus";

function perfil(
  status: GeracaoConteudoStatus,
  progressoPercentual: number
): PersonalizacaoPerfilItem {
  return {
    tem_personalizacao: status !== "sem_material",
    personalizacao: null,
    geracao: {
      status,
      progresso_percentual: progressoPercentual,
      blocos_total: 4,
      blocos_concluidos: status === "enriquecendo" ? 2 : 4,
      formatos: {},
    },
  } as PersonalizacaoPerfilItem;
}

describe("status de geração por conteúdo", () => {
  it("considera somente os três estados transitórios como ativos para polling", () => {
    expect(temGeracaoAtiva([
      perfil("na_fila", 5),
      perfil("enriquecendo", 25),
      perfil("gerando_midias", 70),
    ])).toBe(true);

    expect(temGeracaoAtiva([
      perfil("pronto", 100),
      perfil("parcial", 80),
      perfil("falhou", 40),
      perfil("sem_material", 0),
    ])).toBe(false);
  });

  it("calcula o resumo dos sete perfis e limita o progresso entre zero e cem", () => {
    const resumo = resumirGeracaoConteudo([
      perfil("pronto", 120),
      perfil("pronto", 100),
      perfil("gerando_midias", 70),
      perfil("enriquecendo", 30),
      perfil("parcial", 80),
      perfil("falhou", 10),
      perfil("sem_material", -5),
    ]);

    expect(resumo).toEqual({
      totalPerfis: 7,
      perfisProntos: 2,
      perfisAtivos: 2,
      perfisParciais: 1,
      perfisFalhos: 1,
      perfisSemMaterial: 1,
      progressoPercentual: 56,
    });
    expect(limitarPercentual(Number.NaN)).toBe(0);
  });

  it("prioriza o status real de cada mídia mesmo quando há material legado", () => {
    const item = perfil("parcial", 80);
    item.geracao!.formatos.audio = {
      status: "falhou",
      label: "Falha no áudio",
      erro: "TTS indisponível",
    };

    expect(resolverGeracaoFormato(item, "audio", true)).toEqual({
      status: "falhou",
      label: "Falha no áudio",
      erro: "TTS indisponível",
    });
  });

  it("mantém compatibilidade com respostas antigas sem o objeto geracao", () => {
    const legado = {
      tem_personalizacao: true,
      personalizacao: { status: "processando_midias" },
    } as PersonalizacaoPerfilItem;

    expect(statusGeracaoDoPerfil(legado)).toBe("gerando_midias");
    expect(resolverGeracaoFormato(legado, "markdown", false).status).toBe("gerando");
    expect(resolverGeracaoFormato(legado, "pdf", false).status).toBe("sem_material");
    expect(resolverGeracaoFormato(legado, "markdown", true).status).toBe("pronto");
  });
});
