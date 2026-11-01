import { normalizeBrainHexProfile, type BrainHexProfile } from "@/constants/brainHexProfiles";

/**
 * As quatro áreas do hub Social. Cada uma agrupa blocos que já existiam na aba (as âncoras da
 * faixa de atalhos): nada some, só muda a ordem e qual área abre a tela em destaque.
 */
export type AreaDoSocial = "arena" | "conversa" | "eventos" | "descobrir";

/** Âncoras da rolagem no celular, uma por bloco da aba. */
export type AncoraDoSocial = "evento" | "arena" | "convites" | "amigos" | "guildas" | "encontrar" | "bloqueados";

export const ANCORAS_DA_AREA: Record<AreaDoSocial, readonly AncoraDoSocial[]> = {
  eventos: ["evento"],
  arena: ["arena"],
  conversa: ["convites", "amigos", "guildas"],
  descobrir: ["encontrar"],
};

/** Ordem de quem não tem destaque: a mesma da aba antes do hub. */
const ORDEM_PADRAO: readonly AreaDoSocial[] = ["eventos", "arena", "conversa", "descobrir"];

/**
 * Perfil BrainHex → área em destaque. Fonte da motivação de cada arquétipo: Nacke, Bateman e
 * Mandryk (2014), "BrainHex: A neurobiological gamer typology survey".
 *
 * - Conqueror, Daredevil e Survivor vão para a Arena: são os perfis de batalha do app
 *   (`BATTLE_PROFILES` em `brainHexCapabilities.ts`, em paridade com `PERFIS_COM_BATALHA` da API).
 *   Conqueror quer vencer o adversário difícil e Daredevil quer o risco; o apoio da literatura é
 *   forte para os dois. Para o Survivor ele é fraco (o que o move é escapar de uma ameaça, não o
 *   PvP), e ele fica aqui para casar com a batalha que o app já dá a ele.
 * - Socializer vai para a Conversa: interagir com pessoas, amigos e guilda.
 * - Seeker vai para Descobrir: curiosidade e novidade. Conhecer colegas novos é a exploração
 *   que esta aba oferece.
 * - Achiever vai para Eventos: completar missões e colecionar recompensas.
 * - Mastermind vai para Eventos: planejar a melhor rota pelas missões e pelo evento, que é
 *   decisão e estratégia, não reflexo nem confronto. A Arena "de estratégia" tem apoio só moderado.
 *
 * Orji, Vassileva e Mandryk (2014) mostram que a mesma estratégia de persuasão pode ajudar um
 * perfil e atrapalhar outro: este mapa é ponto de partida, para medir, não verdade.
 */
export const AREA_EM_DESTAQUE: Record<BrainHexProfile, AreaDoSocial> = {
  conqueror: "arena",
  daredevil: "arena",
  survivor: "arena",
  socializer: "conversa",
  seeker: "descobrir",
  achiever: "eventos",
  mastermind: "eventos",
};

export function areaEmDestaque(perfil: string | null | undefined): AreaDoSocial {
  return AREA_EM_DESTAQUE[normalizeBrainHexProfile(perfil) ?? "mastermind"];
}

/** A área em destaque primeiro; as demais na ordem padrão. */
export function ordemDasAreas(perfil: string | null | undefined): AreaDoSocial[] {
  const destaque = areaEmDestaque(perfil);
  return [destaque, ...ORDEM_PADRAO.filter((area) => area !== destaque)];
}

/**
 * Ordem dos blocos na rolagem do celular. `disponiveis` diz o que existe agora (sem turma não há
 * evento nem arena; bloqueados só aparece quando há alguém bloqueado), e bloqueados fica sempre
 * por último.
 */
export function ordemDasAncoras(perfil: string | null | undefined, disponiveis: ReadonlySet<AncoraDoSocial>): AncoraDoSocial[] {
  const ordem = ordemDasAreas(perfil).flatMap((area) => ANCORAS_DA_AREA[area]);
  return [...ordem, "bloqueados" as const].filter((ancora) => disponiveis.has(ancora));
}
