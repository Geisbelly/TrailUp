import type {
  GeracaoConteudoStatus,
  GeracaoFormatoStatus,
} from "./personalizacoesApi";

export type PersonalizacaoStatusBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline";

export type PersonalizacaoStatusBadge = {
  label: string;
  variant: PersonalizacaoStatusBadgeVariant;
};

type PersonalizacaoStatusInput = {
  temPersonalizacao: boolean;
  geracaoStatus?: GeracaoConteudoStatus | null;
  status?: string | null;
  updatedAt?: string | null;
  geradoEm?: string | null;
  now?: Date;
};

const PROCESSAMENTO_TRAVADO_MS = 15 * 60 * 1000;

const GERACAO_STATUS_BADGES: Record<GeracaoConteudoStatus, PersonalizacaoStatusBadge> = {
  sem_material: { label: "Sem material", variant: "outline" },
  na_fila: { label: "Na fila", variant: "secondary" },
  enriquecendo: { label: "Enriquecendo", variant: "secondary" },
  gerando_midias: { label: "Gerando mídias", variant: "secondary" },
  pronto: { label: "Pronto", variant: "default" },
  parcial: { label: "Parcial", variant: "secondary" },
  falhou: { label: "Falhou", variant: "destructive" },
};

const FORMATO_STATUS_BADGES: Record<GeracaoFormatoStatus, PersonalizacaoStatusBadge> = {
  sem_material: { label: "Sem material", variant: "outline" },
  na_fila: { label: "Na fila", variant: "secondary" },
  gerando: { label: "Gerando", variant: "secondary" },
  pronto: { label: "Pronto", variant: "default" },
  falhou: { label: "Falhou", variant: "destructive" },
};

export function isGeracaoStatusAtivo(status?: string | null): boolean {
  return status === "na_fila" || status === "enriquecendo" || status === "gerando_midias";
}

export function getGeracaoStatusBadge(
  status?: GeracaoConteudoStatus | null
): PersonalizacaoStatusBadge {
  return status
    ? GERACAO_STATUS_BADGES[status] ?? { label: status, variant: "default" }
    : GERACAO_STATUS_BADGES.sem_material;
}

export function getFormatoStatusBadge(
  status?: GeracaoFormatoStatus | null,
  label?: string | null
): PersonalizacaoStatusBadge {
  const badge = status
    ? FORMATO_STATUS_BADGES[status] ?? { label: status, variant: "default" as const }
    : FORMATO_STATUS_BADGES.sem_material;
  const normalizedLabel = String(label ?? "").trim();
  return normalizedLabel ? { ...badge, label: normalizedLabel } : badge;
}

export function getPersonalizacaoStatusBadge({
  temPersonalizacao,
  geracaoStatus,
  status,
  updatedAt,
  geradoEm,
  now = new Date(),
}: PersonalizacaoStatusInput): PersonalizacaoStatusBadge {
  if (geracaoStatus) {
    return getGeracaoStatusBadge(geracaoStatus);
  }

  if (!temPersonalizacao) {
    return { label: "Sem material", variant: "outline" };
  }

  if (status === "processando_midias") {
    const timestamp = updatedAt ?? geradoEm;
    const timestampMs = timestamp ? Date.parse(timestamp) : Number.NaN;
    const estaTravado =
      Number.isFinite(timestampMs) &&
      now.getTime() - timestampMs >= PROCESSAMENTO_TRAVADO_MS;

    return estaTravado
      ? { label: "Travado", variant: "destructive" }
      : { label: "Gerando...", variant: "secondary" };
  }

  if (status === "failed" || status === "falha" || status === "failed_quality") {
    return { label: "Falhou", variant: "destructive" };
  }

  if (status === "partial") {
    return { label: "Parcial", variant: "secondary" };
  }

  if (status === "pronto" || !status) {
    return { label: "Pronto", variant: "default" };
  }

  return { label: status, variant: "default" };
}
