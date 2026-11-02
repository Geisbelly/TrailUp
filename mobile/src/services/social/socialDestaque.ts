import { normalizeBrainHexProfile, type BrainHexProfile } from "@/constants/brainHexProfiles";

/**
 * As quatro áreas do hub Social. A área decide o cartão em destaque de cada perfil; as abas do
 * celular são três, porque o evento da turma também é disputa e mora dentro da Arena.
 */
export type AreaDoSocial = "arena" | "conversa" | "eventos" | "descobrir";

/**
 * As abas de página do celular. `arena` é a aba de disputa, que junta o evento da turma e a
 * arena; o nome, o ícone e o bloco que vem primeiro nela dependem do perfil (`cabecaDaDisputa`).
 */
export type AbaDoSocial = "arena" | "conversa" | "descobrir";

/** Os blocos que a aba já tinha. */
export type AncoraDoSocial = "evento" | "arena" | "convites" | "amigos" | "guildas" | "encontrar" | "bloqueados";

export const ANCORAS_DA_AREA: Record<AreaDoSocial, readonly AncoraDoSocial[]> = {
  eventos: ["evento"],
  arena: ["arena"],
  conversa: ["convites", "amigos", "guildas"],
  descobrir: ["encontrar"],
};

/** Ordem das áreas depois da que abre: a mesma da aba antes do hub. */
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

/** A aba em que cada área mora: Eventos dentro da Arena. */
export function abaDaArea(area: AreaDoSocial): AbaDoSocial {
  return area === "eventos" ? "arena" : area;
}

/**
 * As abas de página do celular, na ordem do perfil: a primeira é a que abre. Quem tem destaque
 * em Eventos (Achiever, Mastermind) abre na Arena, com o cartão do evento no topo dela.
 */
export function abasDoSocial(perfil: string | null | undefined): AbaDoSocial[] {
  const abas: AbaDoSocial[] = [];
  for (const area of ordemDasAreas(perfil)) {
    const aba = abaDaArea(area);
    if (!abas.includes(aba)) abas.push(aba);
  }
  return abas;
}

/**
 * O que a aba de disputa é para cada perfil. Só os perfis de batalha (destaque na Arena) a veem
 * como Arena, com o duelo primeiro. Para os demais ela é Eventos, com o evento e as missões
 * primeiro e a arena logo abaixo: a mesma ordem de antes do hub, sem vestir de batalha quem não
 * joga por confronto. Sem turma não há evento, e a aba volta a ser Arena para todos.
 */
export function cabecaDaDisputa(perfil: string | null | undefined, temTurma = true): "arena" | "eventos" {
  return temTurma && areaEmDestaque(perfil) !== "arena" ? "eventos" : "arena";
}

/** Os blocos da aba de disputa, na ordem do perfil. Sem turma não há evento nem missão do dia. */
export function blocosDaArena(perfil: string | null | undefined, temTurma: boolean): ("evento" | "arena")[] {
  const blocos: ("evento" | "arena")[] = cabecaDaDisputa(perfil, temTurma) === "arena" ? ["arena", "evento"] : ["evento", "arena"];
  return blocos.filter((bloco) => temTurma || bloco !== "evento");
}

/** Em que aba mora cada bloco. Bloqueados fica no fim da Conversa. */
export function abaDaAncora(ancora: AncoraDoSocial): AbaDoSocial {
  if (ancora === "bloqueados") return "conversa";
  const area = (Object.keys(ANCORAS_DA_AREA) as AreaDoSocial[]).find((a) => ANCORAS_DA_AREA[a].includes(ancora)) ?? "conversa";
  return abaDaArea(area);
}

/**
 * Ícone da aba Social na barra de baixo (e na lateral do desktop), por perfil. Como o da Trilha,
 * ele muda ao tocar: `inativo` é o da aba fechada, e `ativo`, o da aberta. Os dois mostram a área
 * que o perfil vê primeiro ao entrar (`AREA_EM_DESTAQUE`), para o aluno reconhecer o próprio Social.
 *
 * Duas formas de mudar. Conqueror, Daredevil e Survivor trocam de objeto, e o aberto é o mesmo
 * assunto um passo adiante (a espada vira o duelo, a luva pega fogo, a barraca acende a fogueira).
 * Os outros quatro ficam no glifo da #828 e passam do contorno ao preenchido. Pares escolhidos por
 * outra lógica (motivação do perfil, objeto que "ganha vida") não lembraram "Social" na barra e
 * foram descartados. O `strategy` do Mastermind não tem versão de contorno: só ele troca apenas
 * de cor.
 *
 * Nenhum repete o ícone da Trilha do mesmo perfil, nem fica parecido com ele quando os dois estão
 * fechados lado a lado (a Trilha fechada mostra o `icon_focus` de `brainHexConfig`). Por isso o
 * Conqueror fecha na espada sozinha (a Trilha dele mostra floretes) e o Survivor fecha na barraca
 * (a dele mostra espadas cruzadas, e os troncos da fogueira em X lembram as espadas). O teste
 * confere a repetição. E nenhum tem outro dono no app (um ícone, um significado — CLAUDE.md):
 * espada, espadas cruzadas, balões, lupa e calendário já querem dizer a mesma coisa no Social.
 */
export const ICONE_DO_SOCIAL: Record<BrainHexProfile, { ativo: string; inativo: string }> = {
  // A espada da Arena; aberta, o duelo.
  conqueror: { inativo: "sword", ativo: "sword-cross" },
  // A luva; aberta, a luta pega fogo.
  daredevil: { inativo: "boxing-glove", ativo: "fire" },
  // O abrigo; aberto, a turma em volta da fogueira.
  survivor: { inativo: "tent", ativo: "campfire" },
  // Os balões da Conversa, onde o Social do Socializer abre.
  socializer: { inativo: "forum-outline", ativo: "forum" },
  // A lupa de "Encontrar colegas". A bússola já é o mapa revelado e o tutorial.
  seeker: { inativo: "account-search-outline", ativo: "account-search" },
  // O evento da turma.
  achiever: { inativo: "calendar-star-outline", ativo: "calendar-star" },
  // O plano. Sem versão de contorno no MDI: muda só de cor ao abrir.
  mastermind: { inativo: "strategy", ativo: "strategy" },
};

/** Sem perfil conhecido, o ícone de antes: o grupo de pessoas. */
export function iconeDoSocial(perfil: string | null | undefined, ativo: boolean): string {
  const perfilNormalizado = normalizeBrainHexProfile(perfil);
  if (!perfilNormalizado) return ativo ? "account-group" : "account-group-outline";
  const icone = ICONE_DO_SOCIAL[perfilNormalizado];
  return ativo ? icone.ativo : icone.inativo;
}
