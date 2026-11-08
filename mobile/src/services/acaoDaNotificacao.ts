/**
 * O botão de ação do detalhe da notificação: para onde ir ver aquilo de que ela fala.
 *
 * Tudo sai do `contexto` que o banco já grava em `notificacoes` (o motor copia o da fila, e a fila
 * copia o de `notificacoes_ia`). Nenhuma chave aqui foi inventada no app:
 *
 * - `alteracao_professor` (`fn_alteracao_aluno_notificar`, `20261101_12`): `topico_id`,
 *   `conteudo_id` ou `atividade_id`, e `decisao` (`destacar` | `revisar`);
 * - `novo_material` (`notificacoes_novo_material_produzir`, `20261102_21`): `classe_id`,
 *   `topico_id` e, quando o mesmo aviso junta vários tópicos, `topicos` > 1;
 * - `rank` e `amigo_rank` (`20261102_18`): `rank_id`. Abre a categoria só se ela está no ranking
 *   carregado (a tela da categoria procura nele); rank encerrado ou de outra turma vai à aba Ranking;
 * - `chat_privado` (`20261102_06`): `remetente_id`;
 * - `social_convite_recebido` e `social_convite_aceito`: a aba Social;
 * - `conquista` (gatilhos de conquista, sem id): a biblioteca de conquistas;
 * - `lembrete` (IA): o `topico` dela é o NOME, não o id, então vai à trilha. Também as rotinas
 *   que chamam de volta ao estudo (`20260826_04`): `revisao_diaria` ("continue de onde parou") e
 *   `retomada_login` ("de volta à trilha"). O mapa mostra o "Você parou aqui".
 *
 * Sem destino conhecido, `null`, e a tela não mostra botão: `suporte`, `sequencia`, `sistema`
 * (aviso de exclusão de conta), `pausa_saudavel` (pede PAUSA: um botão de estudar seria o oposto)
 * e qualquer tipo novo. Um botão que leva ao lugar errado é pior que nenhum.
 *
 * Tópico só é destino se estiver numa turma do aluno (a lista carregada no app). Fora dela (turma
 * trocada, tópico removido) o `ClassSelectionGate` redirecionaria ao mapa, então não há botão. E
 * só abre direto o tópico que o aluno já pode abrir com certeza: começado, concluído ou sem
 * pré-requisito. O resto vai ao mapa da turma, onde o bloqueio aparece como em qualquer lugar do
 * app — abrir direto um tópico bloqueado pularia a regra de liberação da trilha.
 */

export type NotificacaoComDestino = {
  id: number;
  tipo: string | null | undefined;
  contexto: Record<string, unknown> | null | undefined;
};

/** O que o app sabe de cada tópico das turmas do aluno. */
export type TopicoConhecido = {
  id: number;
  classeId: number;
  /** Já dá para abrir sem passar pela regra de liberação (ver `topicoAberto`). */
  aberto: boolean;
  conteudoIds: readonly number[];
  atividadeIds: readonly number[];
};

/** O que o app já carregou e que decide se o destino existe. */
export type DestinosConhecidos = {
  topicos: readonly TopicoConhecido[];
  /** `rank_id` das categorias no ranking carregado. */
  rankIds: readonly number[];
};

export type IconeDaAcao =
  | "book-open-page-variant-outline"
  | "clipboard-edit-outline"
  | "map-marker-path"
  | "podium"
  | "trophy-outline"
  | "message-text-outline"
  | "account-multiple-outline";

export type AcaoDaNotificacao = {
  rotulo: string;
  icone: IconeDaAcao;
  rota: string;
  /** `navigate` nas abas que podem já estar abertas (Social, mapa); `push` no resto. */
  modo: "push" | "navigate";
  /** Turma a escolher antes de navegar, quando o destino é de outra turma do aluno. */
  classeId: number | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id inteiro positivo, aceitando número ou texto ("12"). `jsonb` devolve número, o push devolve texto. */
export function idPositivo(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : typeof valor === "string" && /^\d+$/.test(valor.trim()) ? Number(valor) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Pode abrir o tópico direto: o aluno já começou ou concluiu, ou ele não tem pré-requisito.
 * É a parte da regra de `Topico.estaDesbloqueado` que não depende dos outros tópicos; quando
 * depende, a resposta é "não sei", e o destino vira o mapa.
 */
export function topicoAberto(topico: { status?: string | null; depende?: unknown }): boolean {
  const status = String(topico.status ?? "").toLowerCase();
  if (status === "em andamento" || status.startsWith("concl")) return true;
  const depende = topico.depende;
  if (depende == null) return true;
  if (Array.isArray(depende)) return depende.every((d) => !Number(d));
  return false;
}

const MAPA = "/(tabs)";

function mapa(rotulo: string, classeId: number | null): AcaoDaNotificacao {
  return { rotulo, icone: "map-marker-path", rota: MAPA, modo: "navigate", classeId };
}

function rotaDoTopico(topicoId: number, extra?: string): string {
  return `/(tabs)/trilha/${topicoId}${extra ? `?${extra}` : ""}`;
}

function acaoDeAlteracao(ctx: Record<string, unknown>, topicos: readonly TopicoConhecido[]): AcaoDaNotificacao | null {
  const topico = topicos.find((t) => t.id === idPositivo(ctx.topico_id));
  if (!topico) return null;
  if (!topico.aberto) return mapa("Ver na trilha", topico.classeId);

  const atividadeId = idPositivo(ctx.atividade_id);
  if (atividadeId !== null && topico.atividadeIds.includes(atividadeId)) {
    const revisar = ctx.decisao === "revisar";
    return {
      rotulo: revisar ? "Refazer atividade" : "Ver atividade",
      icone: "clipboard-edit-outline",
      rota: rotaDoTopico(topico.id, `atividade=${atividadeId}`),
      modo: "push",
      classeId: topico.classeId,
    };
  }
  const conteudoId = idPositivo(ctx.conteudo_id);
  if (conteudoId !== null && topico.conteudoIds.includes(conteudoId)) {
    return {
      rotulo: "Ver material",
      icone: "book-open-page-variant-outline",
      rota: rotaDoTopico(topico.id, `conteudo=${conteudoId}`),
      modo: "push",
      classeId: topico.classeId,
    };
  }
  // O item mudou de tópico ou saiu dele: o tópico do aviso ainda é o lugar certo.
  return {
    rotulo: "Ver tópico",
    icone: "book-open-page-variant-outline",
    rota: rotaDoTopico(topico.id),
    modo: "push",
    classeId: topico.classeId,
  };
}

function acaoDeMaterialNovo(ctx: Record<string, unknown>, topicos: readonly TopicoConhecido[]): AcaoDaNotificacao | null {
  const classeId = idPositivo(ctx.classe_id);
  const daTurma = classeId !== null && topicos.some((t) => t.classeId === classeId);
  // Vários tópicos num aviso só ("3 tópicos ganharam material"): o `topico_id` é só o primeiro.
  if ((idPositivo(ctx.topicos) ?? 1) > 1) return daTurma ? mapa("Ver trilha", classeId) : null;

  const topico = topicos.find((t) => t.id === idPositivo(ctx.topico_id));
  if (!topico) return null;
  if (!topico.aberto) return mapa("Ver na trilha", topico.classeId);
  return {
    rotulo: "Ver material",
    icone: "book-open-page-variant-outline",
    rota: rotaDoTopico(topico.id),
    modo: "push",
    classeId: topico.classeId,
  };
}

export function acaoDaNotificacao(
  notificacao: NotificacaoComDestino,
  { topicos, rankIds }: DestinosConhecidos,
): AcaoDaNotificacao | null {
  const ctx = notificacao.contexto && typeof notificacao.contexto === "object" ? notificacao.contexto : {};
  switch (notificacao.tipo) {
    case "alteracao_professor":
      return acaoDeAlteracao(ctx, topicos);
    case "novo_material":
      return acaoDeMaterialNovo(ctx, topicos);
    case "rank":
    case "amigo_rank": {
      const rankId = idPositivo(ctx.rank_id);
      if (rankId === null) return null;
      return rankIds.includes(rankId)
        ? { rotulo: "Ver ranking", icone: "podium", rota: `/(tabs)/ranking/${rankId}`, modo: "push", classeId: null }
        : { rotulo: "Ver ranking", icone: "podium", rota: "/ranking", modo: "navigate", classeId: null };
    }
    case "conquista":
      return {
        rotulo: "Ver conquistas",
        icone: "trophy-outline",
        rota: "/(tabs)/perfil/biblioteca-conquistas",
        modo: "push",
        classeId: null,
      };
    case "chat_privado": {
      const remetente = ctx.remetente_id;
      if (typeof remetente !== "string" || !UUID.test(remetente)) return null;
      return {
        rotulo: "Abrir conversa",
        icone: "message-text-outline",
        rota: `/social?conversa=${remetente}&notificacao=${notificacao.id}`,
        modo: "navigate",
        classeId: null,
      };
    }
    case "social_convite_recebido":
    case "social_convite_aceito":
      return { rotulo: "Abrir Social", icone: "account-multiple-outline", rota: "/social", modo: "navigate", classeId: null };
    case "lembrete":
    case "revisao_diaria":
    case "retomada_login":
      return topicos.length ? mapa("Ir para a trilha", null) : null;
    default:
      return null;
  }
}

type TurmaCarregada = {
  classe_id: number;
  topicos: readonly {
    id: number;
    status?: string | null;
    depende?: unknown;
    conteudos?: readonly { id: number }[];
    atividades?: readonly { id: number }[];
  }[];
};

/** Os tópicos de todas as turmas do aluno, como o `TrilhaContext` os carregou. */
export function topicosDasTurmas(turmas: readonly TurmaCarregada[]): TopicoConhecido[] {
  return turmas.flatMap((turma) =>
    (turma.topicos ?? []).map((t) => ({
      id: Number(t.id),
      classeId: Number(turma.classe_id),
      aberto: topicoAberto(t),
      conteudoIds: (t.conteudos ?? []).map((c) => Number(c.id)),
      atividadeIds: (t.atividades ?? []).map((a) => Number(a.id)),
    })),
  );
}
