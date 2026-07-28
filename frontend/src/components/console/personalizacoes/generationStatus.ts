import type {
  GeracaoConteudoStatus,
  GeracaoFormato,
  PersonalizacaoPerfilItem,
} from "./personalizacoesApi";
import { isGeracaoStatusAtivo } from "./statusBadge";

type PerfilComGeracao = Pick<
  PersonalizacaoPerfilItem,
  "geracao" | "tem_personalizacao" | "personalizacao"
>;

export type ResumoGeracaoConteudo = {
  totalPerfis: number;
  perfisProntos: number;
  perfisAtivos: number;
  perfisParciais: number;
  perfisFalhos: number;
  perfisSemMaterial: number;
  progressoPercentual: number;
};

export function limitarPercentual(value: number | null | undefined): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

export function statusGeracaoDoPerfil(item: PerfilComGeracao): GeracaoConteudoStatus {
  if (item.geracao?.status) return item.geracao.status;
  if (!item.tem_personalizacao) return "sem_material";

  const legacyStatus = item.personalizacao?.status;
  if (legacyStatus === "processando_midias") return "gerando_midias";
  if (legacyStatus === "partial") return "parcial";
  if (legacyStatus === "failed" || legacyStatus === "falha" || legacyStatus === "failed_quality") {
    return "falhou";
  }
  return "pronto";
}

export function temGeracaoAtiva(perfis: PerfilComGeracao[]): boolean {
  return perfis.some((item) => isGeracaoStatusAtivo(statusGeracaoDoPerfil(item)));
}

export function resumirGeracaoConteudo(perfis: PerfilComGeracao[]): ResumoGeracaoConteudo {
  const statuses = perfis.map(statusGeracaoDoPerfil);
  const progressos = perfis.map((item, index) => {
    if (item.geracao) return limitarPercentual(item.geracao.progresso_percentual);
    return statuses[index] === "pronto" ? 100 : 0;
  });

  return {
    totalPerfis: perfis.length,
    perfisProntos: statuses.filter((status) => status === "pronto").length,
    perfisAtivos: statuses.filter(isGeracaoStatusAtivo).length,
    perfisParciais: statuses.filter((status) => status === "parcial").length,
    perfisFalhos: statuses.filter((status) => status === "falhou").length,
    perfisSemMaterial: statuses.filter((status) => status === "sem_material").length,
    progressoPercentual:
      progressos.length > 0
        ? limitarPercentual(progressos.reduce((total, value) => total + value, 0) / progressos.length)
        : 0,
  };
}

export function resolverGeracaoFormato(
  item: PerfilComGeracao,
  key: "markdown" | "pdf" | "audio" | "apresentacao",
  temMaterial: boolean
): GeracaoFormato {
  const formato = item.geracao?.formatos?.[key];
  if (formato) return formato;
  if (temMaterial) return { status: "pronto", label: "Pronto" };
  // PDF é legado/opcional e só entra no contrato quando realmente existe.
  if (key === "pdf") return { status: "sem_material", label: "Sem material" };

  const statusGeral = statusGeracaoDoPerfil(item);
  if (statusGeral === "na_fila" || statusGeral === "enriquecendo") {
    return { status: "na_fila", label: "Na fila" };
  }
  if (statusGeral === "gerando_midias") {
    return { status: "gerando", label: "Gerando" };
  }
  if (statusGeral === "falhou") {
    return { status: "falhou", label: "Falhou" };
  }
  return { status: "sem_material", label: "Sem material" };
}
