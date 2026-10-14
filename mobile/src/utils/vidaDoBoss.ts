import type { BrainHexProfile } from '@/constants/brainHexProfiles';
import { normalizeBrainHexProfile } from '@/constants/brainHexProfiles';
import {
  BATTLE_DIFFICULTY_RULES,
  type BattleDifficultyKey,
  type BattleDifficultyRule,
} from '@/utils/batalhaRegras';

/**
 * Quanta vida o boss do tópico tem.
 *
 * ## O que havia antes
 *
 * `BATTLE_DIFFICULTY_RULES` dá uma vida fixa por dificuldade do módulo — e o
 * boss do tópico nasce em `IAContext` sem dica nenhuma de dificuldade, então
 * caía sempre em `medium`: **180 de vida e 36 de escudo para todo tópico do
 * app**, do de dois conteúdos ao de trinta. Com os números de `medium`, um
 * tópico de 2 conteúdos e 1 atividade entrega no máximo
 * `2×12 + (25+24) = 73` de dano: o boss era **literalmente invencível**. Um
 * tópico de 20 conteúdos e 10 atividades entrega 660, e o boss morria com um
 * terço da trilha feita.
 *
 * ## A conta
 *
 * O teto de dano da trilha (`orcamentoDeDano`) sai dos MESMOS números que o
 * runtime usa para descontar — é por isso que eles moram em
 * `batalhaRegras.ts`, e não copiados aqui. A vida é uma fração desse teto:
 *
 *     vida + escudo = orçamento × fração
 *
 * A fração é o **empenho** exigido: quanto da trilha o aluno precisa fazer
 * para derrubar o boss. `minimo` derruba com metade do percurso; `maximo` só
 * com o percurso inteiro e boa pontaria.
 *
 * ## Invariante
 *
 * `vida + escudo <= orçamento`, sempre. É o que impede o caso invencível
 * acima, e é o teste que importa neste arquivo. Dificuldade e densidade de
 * desafio mexem na fração, nunca no teto.
 *
 * ## Por que a dificuldade não entra multiplicando a vida
 *
 * O dano por evento já escala com a dificuldade (`contentComplete` vai de 8 a
 * 16). Se a vida escalasse junto, o número de blocos necessários seria o
 * mesmo nos três níveis e "difícil" não significaria nada. Por isso ela mexe
 * na FRAÇÃO: no difícil o aluno precisa cobrir proporcionalmente mais trilha.
 */

export type EmpenhoAlvo = 'minimo' | 'medio' | 'maximo';

export type ComposicaoDoTopico = {
  /** Blocos de conteúdo do percurso — material do professor e personalizado. */
  conteudos: number;
  /** Blocos de atividade do percurso. */
  atividades: number;
  /** Questões somadas das atividades: o desafio dentro dos blocos. */
  questoes: number;
};

export type BossDimensionado = {
  hpMax: number;
  shieldMax: number;
  empenho: EmpenhoAlvo;
  /** O teto de dano da trilha. Exposto para dar para auditar o invariante. */
  orcamento: number;
};

/**
 * A faixa de empenho de cada perfil, pelas tendências do BrainHex.
 *
 * Hoje só `survivor`, `daredevil` e `conqueror` enxergam a batalha
 * (`brainHexCapabilities.ts`); os outros quatro estão aqui para a tabela não
 * ficar incompleta se essa lista crescer, e porque uma tabela com buraco vira
 * `?? 'medio'` escondido no meio do código.
 *
 *  - `conqueror` — derrotar adversários difíceis, insistindo até vencer, É a
 *    tendência. Percurso inteiro.
 *  - `achiever` — completismo: vai fazer tudo de qualquer jeito, e um boss que
 *    morre antes do fim tira o sentido de terminar.
 *  - `daredevil` — risco e adrenalina, não desgaste. Meio.
 *  - `mastermind` — eficiência: a graça é ganhar com o mínimo de movimento.
 *  - `survivor` — tensão e escapatória. A luta precisa ser vencível.
 *  - `seeker` e `socializer` — exploração e convívio; a batalha não é o que
 *    os traz, então ela não pode virar pedágio.
 */
export const EMPENHO_POR_PERFIL: Record<BrainHexProfile, EmpenhoAlvo> = {
  conqueror: 'maximo',
  achiever: 'maximo',
  daredevil: 'medio',
  mastermind: 'medio',
  survivor: 'minimo',
  seeker: 'minimo',
  socializer: 'minimo',
};

/** Quanto do teto de dano cada faixa cobra. */
export const FRACAO_POR_EMPENHO: Record<EmpenhoAlvo, number> = {
  minimo: 0.5,
  medio: 0.75,
  maximo: 1,
};

/** No difícil o aluno cobre mais trilha pelo mesmo boss; no fácil, menos. */
const FATOR_POR_DIFICULDADE: Record<BattleDifficultyKey, number> = {
  easy: 0.9,
  medium: 1,
  hard: 1.1,
};

/** Fração do total que vira escudo — mantém a proporção 36/180 de hoje. */
const PARTE_DO_ESCUDO = 0.2;

/** Acima de 4 questões por atividade o desafio pesa; o teto evita extrapolar. */
const QUESTOES_DE_REFERENCIA = 4;
const PESO_MAXIMO_DO_DESAFIO = 1.1;

export function empenhoDoPerfil(perfil?: string | null): EmpenhoAlvo {
  const normalizado = normalizeBrainHexProfile(perfil);
  return normalizado ? EMPENHO_POR_PERFIL[normalizado] : 'medio';
}

/**
 * O dano máximo que o tópico inteiro consegue entregar.
 *
 * Um `activity_correct` com 100% de acerto vale `base × 1.4` (a escala de
 * `getDefaultBattleDamage`), limitado pelo teto por evento. É o melhor caso, e
 * é o que faz desta conta um teto de verdade.
 */
export function orcamentoDeDano(
  composicao: ComposicaoDoTopico,
  regra: BattleDifficultyRule
): number {
  const conteudos = Math.max(0, Math.floor(composicao.conteudos));
  const atividades = Math.max(0, Math.floor(composicao.atividades));
  const dano = regra.damage;
  const porAcerto = Math.min(dano.max, Math.round(dano.activityCorrect * 1.4));
  const porConclusao = Math.min(dano.max, dano.activityComplete);
  const porConteudo = Math.min(dano.max, dano.contentComplete);
  return conteudos * porConteudo + atividades * (porAcerto + porConclusao);
}

function pesoDoDesafio(composicao: ComposicaoDoTopico): number {
  const atividades = Math.max(0, Math.floor(composicao.atividades));
  if (atividades <= 0) return 1;
  const porAtividade = Math.max(0, composicao.questoes) / atividades;
  if (porAtividade <= QUESTOES_DE_REFERENCIA) return 1;
  const excedente = (porAtividade - QUESTOES_DE_REFERENCIA) / QUESTOES_DE_REFERENCIA;
  return Math.min(PESO_MAXIMO_DO_DESAFIO, 1 + excedente * 0.1);
}

export function dimensionarBoss(params: {
  composicao: ComposicaoDoTopico;
  dificuldade: BattleDifficultyKey;
  perfil?: string | null;
}): BossDimensionado {
  const { composicao, dificuldade } = params;
  const regra = BATTLE_DIFFICULTY_RULES[dificuldade];
  const orcamento = orcamentoDeDano(composicao, regra);
  const empenho = empenhoDoPerfil(params.perfil);

  const fracao =
    FRACAO_POR_EMPENHO[empenho] * FATOR_POR_DIFICULDADE[dificuldade] * pesoDoDesafio(composicao);

  // O `min` com o orçamento é o invariante, não um detalhe de arredondamento:
  // é ele que garante que a trilha dá conta do boss que ela mesma gerou.
  const total = Math.min(orcamento, Math.round(orcamento * fracao));
  const shieldMax = Math.floor(total * PARTE_DO_ESCUDO);
  const hpMax = total - shieldMax;

  return { hpMax, shieldMax, empenho, orcamento };
}

/**
 * Forma minima de um bloco do percurso, estrutural de proposito: o `Block` de
 * `trilhaBlocks.ts` casa com ela, e importar aquele modulo aqui traria junto
 * `telemetryMetrics` e o resto da cadeia para dentro de um calculo puro.
 */
export type BlocoDoPercurso = {
  kind: string;
  atividade?: { questoes?: unknown[] | null } | null;
};

/**
 * Conta o percurso do topico a partir dos blocos ja montados.
 *
 * Os blocos sao a fonte certa, e nao `topico.conteudos`: eles ja unem material
 * do professor e personalizado, e sao a mesma lista que define "terminei o
 * topico" (`contarProgressoDeBlocos`). Dimensionar o boss por uma contagem e
 * medir a conclusao por outra deixaria o boss vivo com a trilha acabada.
 */
export function composicaoDeBlocos(blocos: readonly BlocoDoPercurso[]): ComposicaoDoTopico {
  let conteudos = 0;
  let atividades = 0;
  let questoes = 0;
  for (const bloco of blocos) {
    if (bloco?.kind === 'atividade') {
      atividades += 1;
      questoes += Array.isArray(bloco.atividade?.questoes) ? bloco.atividade!.questoes!.length : 0;
      continue;
    }
    if (bloco?.kind === 'conteudo') conteudos += 1;
  }
  return { conteudos, atividades, questoes };
}
