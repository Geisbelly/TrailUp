/**
 * O rastreador de missões da Trilha: o "quest tracker" dos jogos, em função pura.
 *
 * Três perguntas, e nenhuma delas é do banco: **qual missão mostrar no botão**, **para onde o
 * "Ir" leva** e **como dizer o prazo e a recompensa**. O que a missão é, se é do aluno, quanto
 * dela foi feito e se acabou continua sendo a resposta do servidor (`missoes` + `missao_aluno`,
 * pela RLS) — nada aqui conclui, avalia ou grava.
 *
 * Sem Supabase de propósito, para rodar no `node --test`. A leitura fica em
 * `rastreadorDeMissoes.ts`.
 */
import type { Href } from "expo-router";

import type { MissaoDoAluno } from "./missaoModel";

/** O que o rastreador precisa saber de cada tópico da trilha. Vem do grafo + `classeAtual`. */
export type TopicoDoRastreador = {
  id: number;
  locked: boolean;
  completed: boolean;
  sequence: number;
  /** Ids das atividades DO PROFESSOR no tópico — é o que `criterio.atividade_id` aponta. */
  atividadeIds: readonly number[];
};

export type DestinoDaMissao =
  /** Missão-entrega: abre o tópico já na atividade. */
  | { tipo: "atividade"; topicoId: number; atividadeId: number }
  /** Missão-meta (minutos, tópicos, atividades, acerto...): abre o tópico da vez, onde está o próximo passo. */
  | { tipo: "topico"; topicoId: number }
  /** O alvo existe, mas o tópico ainda está selado: o "Ir" mostra o tópico no mapa e o que falta. */
  | { tipo: "bloqueado"; topicoId: number };

/** A missão como sai da leitura: a da aba Social, com categoria e recompensa. */
export type MissaoComExtras = MissaoDoAluno & {
  /** `missoes.categoria`. Sem a coluna (ou sem resposta), vale o default do banco. */
  categoria: "principal" | "secundaria";
  recompensa: Recompensa | null;
};

/** O destino é calculado na tela, não na leitura: muda quando o aluno avança na trilha. */
export type MissaoNoRastreador = MissaoComExtras & { destino: DestinoDaMissao | null };

export type Recompensa = { pontos: number; moedas: number };

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Missão que ainda pede algo do aluno. `concluida` e `expirada` são estado do servidor. */
export function missaoEmAberto(m: Pick<MissaoDoAluno, "status">): boolean {
  return m.status === "pendente" || m.status === "em_andamento";
}

/**
 * O tópico onde está o próximo passo do aluno.
 *
 * O de retomada (o último aberto), se ainda tiver o que fazer; senão o primeiro liberado e não
 * concluído, na ordem da trilha. Difere de `topicoInicial` (painel da Trilha) num ponto só:
 * aquele devolve o de retomada mesmo concluído, porque o painel mostra onde o aluno parou;
 * a missão precisa de onde ainda há trabalho. Tudo concluído → o de retomada, para revisar.
 */
export function topicoDaVez(
  topicos: readonly TopicoDoRastreador[],
  atualId: string | number | null | undefined,
): TopicoDoRastreador | null {
  const ordenados = [...topicos].sort((a, b) => a.sequence - b.sequence);
  const atual = atualId == null ? null : ordenados.find((t) => String(t.id) === String(atualId)) ?? null;
  if (atual && !atual.locked && !atual.completed) return atual;
  const proximo = ordenados.find((t) => !t.locked && !t.completed);
  if (proximo) return proximo;
  return atual && !atual.locked ? atual : null;
}

/**
 * Para onde o "Ir" leva.
 *
 * Só a missão-entrega (`atividade_especifica`) aponta um lugar exato. As outras medem um
 * acumulado — minutos, tópicos, atividades, acerto, sequência de dias — que se cumpre
 * estudando, então o lugar certo é o próximo passo da trilha. Atividade que não está em
 * tópico nenhum da turma (removida, ou de outra turma) cai no mesmo caminho: levar ao
 * próximo passo é melhor que um botão que não vai a lugar algum.
 */
export function destinoDaMissao(
  missao: Pick<MissaoDoAluno, "atividadeId">,
  topicos: readonly TopicoDoRastreador[],
  atualId: string | number | null | undefined,
): DestinoDaMissao | null {
  if (missao.atividadeId != null) {
    const dono = topicos.find((t) => t.atividadeIds.some((id) => Number(id) === missao.atividadeId));
    if (dono) {
      return dono.locked
        ? { tipo: "bloqueado", topicoId: dono.id }
        : { tipo: "atividade", topicoId: dono.id, atividadeId: missao.atividadeId };
    }
  }
  const vez = topicoDaVez(topicos, atualId);
  return vez ? { tipo: "topico", topicoId: vez.id } : null;
}

export function comDestino(
  missoes: readonly MissaoComExtras[],
  topicos: readonly TopicoDoRastreador[],
  atualId: string | number | null | undefined,
): MissaoNoRastreador[] {
  return missoes.map((m) => ({ ...m, destino: destinoDaMissao(m, topicos, atualId) }));
}

/** Rota do destino. A atividade vai como `?atividade=`, que a tela do tópico usa para abrir nela. */
export function rotaDoDestino(destino: DestinoDaMissao): Href | null {
  if (destino.tipo === "bloqueado") return null;
  const base = `/(tabs)/trilha/${encodeURIComponent(String(destino.topicoId))}`;
  return (destino.tipo === "atividade" ? `${base}?atividade=${destino.atividadeId}` : base) as Href;
}

/**
 * Dias de calendário até o prazo (0 = hoje, negativo = passou). `null` sem prazo.
 *
 * `janela_fim` é o fim EXCLUSIVO da janela: a diária grava a meia-noite seguinte
 * (`20261021_05`). Contar sobre o instante cru fazia a missão de hoje "vencer amanhã". Daí o
 * milissegundo a menos — num prazo do professor às 23:59 ele não muda o dia.
 */
export function diasAtePrazo(prazo: string | null, agora: Date = new Date()): number | null {
  if (!prazo) return null;
  const t = Date.parse(prazo);
  if (!Number.isFinite(t)) return null;
  const fim = new Date(t - 1);
  const meiaNoite = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // `round`, não `floor`: no horário de verão um dia tem 23 ou 25 horas.
  return Math.round((meiaNoite(fim) - meiaNoite(agora)) / UM_DIA_MS);
}

export type PrazoDaMissao = { rotulo: string; urgencia: "nenhuma" | "atencao" | "critica" };

export function prazoDaMissao(prazo: string | null, agora: Date = new Date()): PrazoDaMissao | null {
  const dias = diasAtePrazo(prazo, agora);
  if (dias === null) return null;
  if (dias < 0) return { rotulo: "Prazo encerrado", urgencia: "critica" };
  if (dias === 0) return { rotulo: "Termina hoje", urgencia: "atencao" };
  if (dias === 1) return { rotulo: "Termina amanhã", urgencia: "atencao" };
  return { rotulo: `Faltam ${dias} dias`, urgencia: "nenhuma" };
}

/**
 * A ordem do rastreador — e a primeira é a do botão.
 *
 * 1. **Prazo mais perto, por dia de calendário.** É o que some primeiro. A diária termina hoje,
 *    então costuma liderar; uma do professor que vence hoje empata com ela.
 * 2. **Principal antes de secundária** (`missoes.categoria`): o professor marcou o que importa.
 * 3. **No tópico onde o aluno está**: o "Ir" leva para perto, sem trocar de assunto.
 * 4. **A já começada, e a mais adiantada**: fechar o que está quase pronto rende mais que abrir
 *    outra frente.
 * 5. A ordem de `ordenarMissoes` (diária por slot, depois prazo e id), para não "dançar".
 *
 * Só entra o que está em aberto. Cumpridas e expiradas ficam na lista, mas nunca no botão.
 */
export function ordenarParaRastreador(
  missoes: readonly MissaoNoRastreador[],
  atualId: string | number | null | undefined,
  agora: Date = new Date(),
): MissaoNoRastreador[] {
  const posicao = new Map(missoes.map((m, i) => [m.id, i]));
  const dia = (m: MissaoNoRastreador) => diasAtePrazo(m.prazo, agora) ?? Number.POSITIVE_INFINITY;
  const aqui = (m: MissaoNoRastreador) =>
    atualId != null && m.destino != null && String(m.destino.topicoId) === String(atualId) ? 0 : 1;
  return missoes
    .filter(missaoEmAberto)
    .sort((a, b) => {
      if (dia(a) !== dia(b)) return dia(a) - dia(b);
      if (a.categoria !== b.categoria) return a.categoria === "principal" ? -1 : 1;
      if (aqui(a) !== aqui(b)) return aqui(a) - aqui(b);
      const comecada = (m: MissaoNoRastreador) => (m.status === "em_andamento" || m.progresso > 0 ? 0 : 1);
      if (comecada(a) !== comecada(b)) return comecada(a) - comecada(b);
      if (a.progresso !== b.progresso) return b.progresso - a.progresso;
      return (posicao.get(a.id) ?? 0) - (posicao.get(b.id) ?? 0);
    });
}

/** O que o rastreador desenha: a missão do botão, as em aberto (ela incluída) e as encerradas. */
export function montarRastreador(
  missoes: readonly MissaoNoRastreador[],
  atualId: string | number | null | undefined,
  agora: Date = new Date(),
): { atual: MissaoNoRastreador | null; abertas: MissaoNoRastreador[]; encerradas: MissaoNoRastreador[] } {
  const abertas = ordenarParaRastreador(missoes, atualId, agora);
  return { atual: abertas[0] ?? null, abertas, encerradas: missoes.filter((m) => !missaoEmAberto(m)) };
}

/** Progresso para a barra: 0..100, inteiro. Cumprida é 100 mesmo se o servidor gravou menos. */
export function percentualDaMissao(m: Pick<MissaoDoAluno, "progresso" | "status">): number {
  if (m.status === "concluida") return 100;
  const p = Number(m.progresso);
  return Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : 0;
}

type LinhaDePontuacao = { tipo: string; pontos?: number | string | null; moedas?: number | string | null };

/**
 * Quanto a missão paga, por `recompensa_tipo` — a chave de `eventos_pontuacao`.
 *
 * Mesma regra de `fn_pontos_do_evento`/`fn_moedas_do_evento`: a turma sobrepõe o global e NULL
 * herda (ver `resolverGanhoMoedas`). Zero nos dois é "sem recompensa", e o selo some: dizer
 * "+0" seria pior que não dizer nada.
 */
export function resolverRecompensa(
  tipo: string | null | undefined,
  globais: readonly LinhaDePontuacao[],
  daTurma: readonly LinhaDePontuacao[],
): Recompensa | null {
  if (!tipo) return null;
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const g = globais.find((l) => l.tipo === tipo);
  const t = daTurma.find((l) => l.tipo === tipo);
  const pontos = num(t?.pontos) ?? num(g?.pontos) ?? 0;
  const moedas = num(t?.moedas) ?? num(g?.moedas) ?? 0;
  const r = { pontos: Number.isFinite(pontos) ? pontos : 0, moedas: Number.isFinite(moedas) ? moedas : 0 };
  return r.pontos > 0 || r.moedas > 0 ? r : null;
}

export function rotuloDaRecompensa(r: Recompensa | null): string {
  if (!r) return "";
  // "pts", como no ranking: são os pontos de `eventos_aluno`, os mesmos que sobem a posição.
  return [r.pontos > 0 ? `+${r.pontos} pts` : "", r.moedas > 0 ? `+${r.moedas} moedas` : ""]
    .filter(Boolean)
    .join(" · ");
}
