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
  status?: string | null;
  updatedAt?: string | null;
  geradoEm?: string | null;
  now?: Date;
};

const PROCESSAMENTO_TRAVADO_MS = 15 * 60 * 1000;

export function getPersonalizacaoStatusBadge({
  temPersonalizacao,
  status,
  updatedAt,
  geradoEm,
  now = new Date(),
}: PersonalizacaoStatusInput): PersonalizacaoStatusBadge {
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
