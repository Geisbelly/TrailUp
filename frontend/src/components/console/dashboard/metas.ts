// Metas provisórias do dashboard, todas num lugar só para o time poder trocar
// sem caçar número pelo código (docs/frontend/redesign-fase-2/01-analise-dashboard.md,
// seção 9, decisão 2). Configuração por turma fica para depois.
export const META_ACERTOS_PCT = 70;
export const META_ABANDONO_PCT = 15;

export type TomMetrica = "bom" | "atencao" | "informativo" | "neutro";

export type SentidoMeta = "maior_melhor" | "menor_melhor";

export function tomDaMetrica(valor: number, meta: number, sentido: SentidoMeta): Exclude<TomMetrica, "informativo" | "neutro"> {
  const atingiu = sentido === "maior_melhor" ? valor >= meta : valor <= meta;
  return atingiu ? "bom" : "atencao";
}

export function fraseDoTom(tom: TomMetrica, meta: number, sentido: SentidoMeta): string {
  if (tom === "bom") return `Bom · meta ${meta}%`;
  if (tom === "atencao") {
    return sentido === "maior_melhor" ? `Atenção · abaixo da meta de ${meta}%` : `Atenção · acima da meta de ${meta}%`;
  }
  return "";
}
