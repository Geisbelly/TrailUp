/**
 * Como o ícone de missões da Trilha se veste em cada perfil BrainHex.
 *
 * O esqueleto é o mesmo para todos: um ícone de 58px no canto de baixo, na linha do mentor,
 * com o selo de quantas missões estão em aberto; tocar abre a folha, e só ela tem texto.
 * Lugar e tamanho fixos de propósito — interface que muda as coisas de lugar piora o uso
 * (Findlater & McGrenere), e os estudos de gamificação por tipo de jogador personalizam
 * elemento e enquadramento, nunca a posição. O que muda por perfil cabe no mesmo quadrado:
 *
 * | Perfil      | Moldura           | Emblema               | Progresso em volta                     |
 * | ----------- | ----------------- | --------------------- | -------------------------------------- |
 * | Seeker      | círculo           | `map-search`          | pontilhado, como pegadas de trilha     |
 * | Survivor    | placa com rebites | `heart-pulse`         | contorno da placa; pulsa no prazo      |
 * | Daredevil   | círculo           | `run-fast`            | anel grosso; pulsa no prazo            |
 * | Mastermind  | hexágono          | `puzzle`              | contorno do hexágono                   |
 * | Conqueror   | círculo           | `shield-sword`        | anel                                   |
 * | Socializer  | círculo           | `handshake`           | anel fino                              |
 * | Achiever    | círculo           | `format-list-checks`  | um segmento por missão, aceso se feita |
 *
 * **Um ícone, um significado** (CLAUDE.md): os emblemas são só de missões. A medalha é de
 * conquistas, a bússola é do mapa, o rosto do guia marca "Você parou aqui" — nada disso entra
 * aqui, e o teste confere que nenhum emblema aparece em outro arquivo do app. O mesmo vale
 * para as palavras: os títulos das folhas não repetem nome que o app já usa para outra coisa
 * ("Campanha", "Desafio"). E tudo na paleta do perfil — a arte da ampulheta do Survivor, azul
 * num perfil cinza-aço, ficou de fora por isso. Puro (sem imagem nem React) para o teste
 * rodar no Node.
 */
import { normalizeBrainHexProfile, type BrainHexProfile } from "@/constants/brainHexProfiles";

export type MolduraDoRastreador = "circulo" | "hexagono" | "placa";
export type ProgressoDoRastreador = "pontilhado" | "grosso" | "contorno" | "anel" | "fino" | "segmentos";

export type VarianteDoRastreador = {
  perfil: BrainHexProfile;
  moldura: MolduraDoRastreador;
  /** `MaterialCommunityIcons` do ícone e do cabeçalho da folha. Exclusivo de missões. */
  emblema: string;
  progresso: ProgressoDoRastreador;
  /** O emblema pulsa nas últimas 3 horas do prazo da missão da vez (`prazoApertado`). */
  pulsaNoPrazo: boolean;
  /** Título da folha com a lista. `{guia}` vira o nome do guia do perfil. */
  tituloDaFolha: string;
  /** Sobretítulo da missão em destaque na folha. */
  rotulo: string;
  /** O mesmo, quando a missão em destaque é a principal. */
  rotuloPrincipal: string;
};

const VARIANTES: Record<BrainHexProfile, Omit<VarianteDoRastreador, "perfil">> = {
  seeker: {
    moldura: "circulo",
    emblema: "map-search",
    progresso: "pontilhado",
    pulsaNoPrazo: false,
    tituloDaFolha: "Diário de expedição",
    rotulo: "PRÓXIMA PISTA",
    rotuloPrincipal: "PISTA PRINCIPAL",
  },
  survivor: {
    moldura: "placa",
    emblema: "heart-pulse",
    progresso: "contorno",
    pulsaNoPrazo: true,
    tituloDaFolha: "Plano de sobrevivência",
    rotulo: "SOBREVIVA",
    rotuloPrincipal: "PRIORIDADE",
  },
  daredevil: {
    moldura: "circulo",
    emblema: "run-fast",
    progresso: "grosso",
    pulsaNoPrazo: true,
    // "Desafio" já é a métrica "Desafios resolvidos" e o título do guia Ember.
    tituloDaFolha: "Façanhas",
    rotulo: "FAÇANHA",
    rotuloPrincipal: "FAÇANHA MÁXIMA",
  },
  mastermind: {
    moldura: "hexagono",
    emblema: "puzzle",
    progresso: "contorno",
    pulsaNoPrazo: false,
    tituloDaFolha: "Plano de ação",
    rotulo: "PRÓXIMO PASSO",
    rotuloPrincipal: "OBJETIVO PRINCIPAL",
  },
  conqueror: {
    moldura: "circulo",
    emblema: "shield-sword",
    progresso: "anel",
    pulsaNoPrazo: false,
    // "Campanha" já é o avanço na turma nas métricas do perfil.
    tituloDaFolha: "Ordens de comando",
    rotulo: "ORDEM",
    rotuloPrincipal: "ORDEM PRINCIPAL",
  },
  socializer: {
    moldura: "circulo",
    emblema: "handshake",
    progresso: "fino",
    pulsaNoPrazo: false,
    tituloDaFolha: "Pedidos de {guia}",
    // "Mateo e Zuri" são dois: o rótulo não leva verbo, para não errar a concordância.
    rotulo: "PEDIDO DE {guia}",
    rotuloPrincipal: "PEDIDO ESPECIAL",
  },
  achiever: {
    moldura: "circulo",
    emblema: "format-list-checks",
    progresso: "segmentos",
    pulsaNoPrazo: false,
    tituloDaFolha: "Lista de feitos",
    rotulo: "PRÓXIMO FEITO",
    rotuloPrincipal: "FEITO PRINCIPAL",
  },
};

/** Sem perfil reconhecido, o mesmo padrão do resto da Trilha (`resolveActiveBrainHexProfile`). */
export function varianteDoRastreador(perfil: string | null | undefined): VarianteDoRastreador {
  const p = normalizeBrainHexProfile(perfil) ?? "mastermind";
  return { perfil: p, ...VARIANTES[p] };
}

/** Troca `{guia}` pelo nome do guia. No sobretítulo, em caixa alta como o resto dele. */
export function comGuia(texto: string, guia: string, caixaAlta = false): string {
  return texto.replace("{guia}", caixaAlta ? guia.toLocaleUpperCase("pt-BR") : guia);
}

/**
 * Os segmentos do Achiever: um por missão (até 8), acesos os das cumpridas. Com mais de 8, a
 * proporção é mantida — 8 segmentos para 12 missões, 6 cumpridas, acendem 4.
 */
export function segmentosDosFeitos(feitas: number, total: number): { total: number; acesos: number } {
  if (total <= 0) return { total: 0, acesos: 0 };
  const n = Math.min(total, 8);
  return { total: n, acesos: Math.min(n, Math.round((feitas / total) * n)) };
}

/** Quanto falta para o emblema começar a pulsar: as últimas 3 horas. */
export const JANELA_DO_PULSO_MS = 3 * 60 * 60 * 1000;

/**
 * O prazo está apertado? Só nas últimas 3 horas, e não "termina hoje": a diária termina hoje
 * todo dia, e um ícone que pulsa o dia inteiro vira ruído e deixa de avisar.
 */
export function prazoApertado(prazo: string | null, agora: Date = new Date()): boolean {
  if (!prazo) return false;
  const falta = new Date(prazo).getTime() - agora.getTime();
  return Number.isFinite(falta) && falta > 0 && falta <= JANELA_DO_PULSO_MS;
}
