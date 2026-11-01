import type { IABattleConfig, IACharacterCue, IAEnemySpec } from '@/interfaces/personalizacao/IAContracts';

// Falas do boss geradas em lote pela API (`api/app/services/boss_falas.py`) e gravadas em
// `boss_falas`, uma linha por conteúdo × perfil. O app lê direto do Supabase e sorteia aqui;
// momento sem fala gerada cai na fala fixa de sempre, então a batalha nunca fica muda.
export const MOMENTOS_BOSS = [
  'entrada',
  'derrota',
  'dano',
  'metade_vida',
  'um_quarto_vida',
  'alerta_tempo',
  'contra_ataque',
  'vitoria',
] as const;
export type MomentoBoss = (typeof MOMENTOS_BOSS)[number];
export type MarcoDeVida = 'metade_vida' | 'um_quarto_vida';
export type FalasDoBoss = { nome: string; falas: Partial<Record<MomentoBoss, string[]>> };
export type FalasPorConteudo = Record<number, FalasDoBoss>;

type LinhaBossFalas = { conteudo_id?: unknown; nome?: unknown; falas?: unknown };

/** Linhas de `boss_falas` → mapa por conteúdo. Linha malformada some; momento malformado cai no fixo. */
export function lerFalasDoBoss(linhas: LinhaBossFalas[] | null | undefined): FalasPorConteudo {
  const mapa: FalasPorConteudo = {};
  for (const linha of linhas ?? []) {
    const conteudoId = Number(linha?.conteudo_id);
    const nome = typeof linha?.nome === 'string' ? linha.nome.trim() : '';
    if (!Number.isInteger(conteudoId) || conteudoId <= 0 || !nome) continue;
    const bruto = linha.falas && typeof linha.falas === 'object' ? (linha.falas as Record<string, unknown>) : {};
    const falas: FalasDoBoss['falas'] = {};
    for (const momento of MOMENTOS_BOSS) {
      const lista = Array.isArray(bruto[momento])
        ? (bruto[momento] as unknown[]).filter((fala): fala is string => typeof fala === 'string' && fala.trim() !== '')
        : [];
      if (lista.length) falas[momento] = lista.map((fala) => fala.trim());
    }
    mapa[conteudoId] = { nome, falas };
  }
  return mapa;
}

/** Conteúdo dono do boss: o `content:N` do escopo, senão o do inimigo. */
export function conteudoDoBoss(itemKey?: string | null, enemy?: Pick<IAEnemySpec, 'contentId' | 'itemKey'> | null): number | null {
  for (const chave of [itemKey, enemy?.itemKey]) {
    const id = /^content:(\d+)$/.exec(chave ?? '')?.[1];
    if (id) return Number(id);
  }
  return enemy?.contentId && enemy.contentId > 0 ? enemy.contentId : null;
}

export function escolherFala(
  falas: FalasDoBoss | null | undefined,
  momento: MomentoBoss,
  aleatorio: () => number = Math.random,
): string | null {
  const lista = falas?.falas[momento];
  if (!lista?.length) return null;
  return lista[Math.min(lista.length - 1, Math.floor(aleatorio() * lista.length))];
}

/**
 * Nome e falas de abertura/derrota/vitória do boss gerado. O `enemy.id` fica: ele entra na
 * chave do estado persistido (`buildBattleRuntimeKey`) e trocá-lo zeraria o boss do aluno.
 */
export function aplicarFalasNoBoss(
  battle: IABattleConfig,
  mapa: FalasPorConteudo,
  itemKey?: string | null,
): IABattleConfig {
  const conteudoId = conteudoDoBoss(itemKey ?? battle.sourceItemKey, battle.enemy);
  const falas = conteudoId != null ? mapa[conteudoId] : undefined;
  if (!falas) return battle;
  return {
    ...battle,
    enemy: {
      ...battle.enemy,
      name: falas.nome,
      contentId: battle.enemy.contentId ?? conteudoId,
      introLine: falas.falas.entrada?.[0] ?? battle.enemy.introLine,
      defeatLine: falas.falas.derrota?.[0] ?? battle.enemy.defeatLine,
    },
    victoryMessage: falas.falas.vitoria?.[0] ?? battle.victoryMessage,
  };
}

/**
 * Fala do boss para um golpe: o marco de vida que o golpe acabou de cruzar (um quarto vence
 * metade quando o golpe cruza os dois), senão uma provocação de dano. Golpe que derruba o boss
 * não provoca: quem fala é a derrota. Cada marco é anunciado uma vez por boss.
 */
export function falaDoGolpe(params: {
  falas: FalasDoBoss | null | undefined;
  hpAntes: number;
  hpDepois: number;
  hpMax: number;
  derrotado: boolean;
  marcosAnunciados?: MarcoDeVida[] | null;
  aleatorio?: () => number;
}): { momento: MomentoBoss; texto: string | null; marcos: MarcoDeVida[] } {
  const { falas, hpAntes, hpDepois, derrotado, aleatorio } = params;
  const hpMax = Math.max(1, params.hpMax);
  const anunciados = [...(params.marcosAnunciados ?? [])];
  if (derrotado) return { momento: 'derrota', texto: escolherFala(falas, 'derrota', aleatorio), marcos: anunciados };

  const cruzados = ([['metade_vida', 0.5], ['um_quarto_vida', 0.25]] as const)
    .filter(([marco, limite]) => !anunciados.includes(marco) && hpAntes / hpMax > limite && hpDepois / hpMax <= limite)
    .map(([marco]) => marco);
  const marcos = [...anunciados, ...cruzados];
  const marco = cruzados.includes('um_quarto_vida') ? 'um_quarto_vida' : cruzados[0];
  if (marco) return { momento: marco, texto: escolherFala(falas, marco, aleatorio), marcos };
  return { momento: 'dano', texto: escolherFala(falas, 'dano', aleatorio), marcos };
}

/**
 * Aviso do boss que o balão da batalha mostra: o mais antigo `battle_mode` deste tópico e, num
 * confronto de conteúdo, deste conteúdo. O painel do guia descarta esses avisos (só lê
 * `mentor_character`), então sem o balão a fala do boss nunca chega à tela.
 */
export function cueDoBoss(
  cues: IACharacterCue[],
  topicoId: number | null | undefined,
  itemKey?: string | null,
): IACharacterCue | null {
  if (topicoId == null) return null;
  return (
    cues.find(
      (cue) =>
        cue.featureKey === 'battle_mode' &&
        cue.topicoId === topicoId &&
        (!itemKey || !cue.itemKey || cue.itemKey === itemKey),
    ) ?? null
  );
}

/** Tempo do balão na tela: 6 s para fala curta, mais tempo para a longa, no máximo 12 s. */
export function duracaoDaFala(texto: string): number {
  return Math.max(6000, Math.min(12000, 2500 + texto.length * 60));
}

/**
 * Filas separadas: as falas do boss (uma a cada golpe) não podem empurrar a dica do guia para
 * fora. Guia: as 3 mais recentes; boss: as 2 mais recentes.
 */
export function enfileirarCue(fila: IACharacterCue[], nova: IACharacterCue): IACharacterCue[] {
  const doBoss = (cue: IACharacterCue) => cue.featureKey === 'battle_mode';
  const mesmaFila = fila.filter((cue) => doBoss(cue) === doBoss(nova));
  const outraFila = fila.filter((cue) => doBoss(cue) !== doBoss(nova));
  return [...outraFila, ...mesmaFila.slice(doBoss(nova) ? -1 : -2), nova];
}

