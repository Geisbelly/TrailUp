import { ModoApresentacao } from "@/utils/presentationOrder";
import { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";
import { buildPrimaryMaterialContext } from "@/utils/telemetryMetrics";

export type Conteudo = any;
export type Atividade = any;

export type Block =
  | { kind: "conteudo"; id: string | number; conteudo: Conteudo }
  | {
      kind: "atividade";
      id: string | number;
      atividade: Atividade;
      vinculadoConteudoId?: number;
    };

export type AtividadeResolvida = {
  correto: boolean;
  acertosPercentual: number;
  revisao?: boolean;
};

export function groupAtividadesByConteudo(
  atividades: Atividade[] = [],
  conteudos: Conteudo[] = []
) {
  const orderMap = new Map<number, number>();
  conteudos.forEach((c, idx) => orderMap.set(Number(c.id), idx));

  type Linked = {
    atividade: Atividade;
    vinculadoConteudoId: number | null;
    anchorIndex: number;
    ordem: number;
  };

  const linkedList: Linked[] = atividades.map((a, idx) => {
    const rawIds =
      Array.isArray(a.conteudo_ids) && a.conteudo_ids.length > 0
        ? a.conteudo_ids
        : a.conteudo_id
        ? [a.conteudo_id]
        : [];

    const anchorId =
      rawIds
        .map((cid: any) => Number(cid))
        .filter((cid: any) => orderMap.has(cid))
        .sort(
          (a: number, b: number) =>
            (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0)
        )[0] ?? null;

    const anchorIndex =
      anchorId != null ? orderMap.get(anchorId)! : Number.MAX_SAFE_INTEGER;

    return { atividade: a, vinculadoConteudoId: anchorId, anchorIndex, ordem: idx };
  });

  const byConteudo = new Map<number, Linked[]>();
  const unanchored: Linked[] = [];

  for (const item of linkedList) {
    if (item.vinculadoConteudoId == null) {
      unanchored.push(item);
      continue;
    }
    const arr = byConteudo.get(item.vinculadoConteudoId) ?? [];
    arr.push(item);
    byConteudo.set(item.vinculadoConteudoId, arr);
  }

  return { byConteudo, unanchored, linkedList };
}

export function buildBlocksForTopico(
  conteudos: Conteudo[],
  atividades: Atividade[],
  modo: ModoApresentacao
): Block[] {
  const blocks: Block[] = [];
  const { byConteudo, unanchored, linkedList } = groupAtividadesByConteudo(
    atividades,
    conteudos
  );

  const pushAtividades = (
    items: { atividade: Atividade; vinculadoConteudoId: number | null }[]
  ) => {
    items.forEach((item) =>
      blocks.push({
        kind: "atividade",
        id: `a-${item.atividade.id}`,
        atividade: item.atividade,
        vinculadoConteudoId: item.vinculadoConteudoId ?? undefined,
      })
    );
  };

  conteudos.forEach((c, idx) => {
    const cid = Number(c.id);
    const vinculadas = byConteudo.get(cid) ?? [];

    switch (modo) {
      case "atividade_primeiro":
        pushAtividades(vinculadas);
        blocks.push({ kind: "conteudo", id: `c-${cid}`, conteudo: c });
        break;
      case "conteudo_primeiro":
        blocks.push({ kind: "conteudo", id: `c-${cid}`, conteudo: c });
        pushAtividades(vinculadas);
        break;
      case "misto": {
        if (vinculadas.length === 0) {
          blocks.push({ kind: "conteudo", id: `c-${cid}`, conteudo: c });
          break;
        }
        const [first, ...rest] = vinculadas;
        if (idx % 2 === 0) {
          blocks.push({ kind: "conteudo", id: `c-${cid}`, conteudo: c });
          pushAtividades([first, ...rest]);
        } else {
          pushAtividades([first]);
          blocks.push({ kind: "conteudo", id: `c-${cid}`, conteudo: c });
          pushAtividades(rest);
        }
        break;
      }
      case "atividade_fim":
      default:
        blocks.push({ kind: "conteudo", id: `c-${cid}`, conteudo: c });
        break;
    }
  });

  if (modo === "atividade_fim") {
    const ordered = [...linkedList]
      .sort((a, b) => {
        if (a.anchorIndex !== b.anchorIndex) {
          return a.anchorIndex - b.anchorIndex;
        }
        return a.ordem - b.ordem;
      })
      .map((item) => ({
        atividade: item.atividade,
        vinculadoConteudoId: item.vinculadoConteudoId,
      }));
    pushAtividades(ordered);
  } else if (unanchored.length) {
    pushAtividades(unanchored);
  }

  return blocks;
}

export function calcularPosicaoInicial(blocks: Block[]): number {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.kind === "conteudo") {
      const status = String(block.conteudo.status ?? "").toLowerCase();
      const pct = Number(block.conteudo.percentual_concluido ?? 0);
      const concluido = status.includes("concl") || pct >= 100;
      if (!concluido) return i;
    } else if (block.kind === "atividade") {
      const status = String(block.atividade.status ?? "").toLowerCase();
      const concluido = status.includes("concl");
      if (!concluido) return i;
    }
  }
  return blocks.length > 0 ? blocks.length - 1 : 0;
}

export function isConteudoConcluido(
  conteudo: Conteudo,
  conteudosVistosLocal: Set<number>
) {
  const status = String(conteudo?.status ?? "").toLowerCase();
  const pct = Number(conteudo?.percentual_concluido ?? 0);
  return (
    status.includes("concl") ||
    pct >= 100 ||
    conteudosVistosLocal.has(Number(conteudo?.id))
  );
}

export function isAtividadeConcluida(
  atividade: Atividade,
  atividadesResolvidasLocal: Map<number, AtividadeResolvida>
) {
  const status = String(atividade?.status ?? "").toLowerCase();
  const pct = Number(atividade?.percentual_concluido ?? 0);
  const tentativaAtividade =
    atividade?.resposta_aluno != null ||
    Number(atividade?.ultima_tentativa ?? 0) > 0;
  const questoes = Array.isArray((atividade as any)?.questoes)
    ? (atividade as any).questoes
    : [];
  const tentativaQuestao = questoes.some(
    (questao: any) =>
      questao?.resposta_aluno != null ||
      Number(questao?.ultima_tentativa ?? 0) > 0
  );
  return (
    status.includes("concl") ||
    pct >= 100 ||
    tentativaAtividade ||
    tentativaQuestao ||
    atividadesResolvidasLocal.has(Number(atividade?.id))
  );
}

/**
 * Progresso sobre os blocos do topico -- o percurso que o aluno realmente ve.
 *
 * Existe porque a barra do modulo media outro conjunto: so conteudo/atividade do
 * professor, excluindo o material personalizado. Duas consequencias, as duas
 * visiveis pro aluno:
 *
 * 1. concluir um passo personalizado nao movia a barra (o passo entra no Set de
 *    vistos, mas ficava fora do somatorio) -- a tela avancava e a barra ficava
 *    parada;
 * 2. o rotulo diz "blocos", e o gate de exibicao usava a contagem dos blocos
 *    exibidos, entao numerador, denominador e rotulo falavam de tres universos
 *    diferentes.
 *
 * Recebe `blocks` (o topico inteiro), nao os blocos exibidos: se o aluno pula os
 * conteudos, eles continuam pendentes no modulo, e mostrar 100% ali seria trocar
 * um numero errado por outro.
 */
export function contarProgressoDeBlocos(params: {
  blocks: Block[];
  conteudosVistosLocal: Set<number>;
  atividadesResolvidasLocal: Map<number, AtividadeResolvida>;
}): { total: number; concluidos: number; pct: number } {
  const { blocks, conteudosVistosLocal, atividadesResolvidasLocal } = params;
  const lista = blocks ?? [];

  const concluidos = lista.reduce((soma, bloco) => {
    const feito =
      bloco.kind === "conteudo"
        ? isConteudoConcluido(bloco.conteudo, conteudosVistosLocal)
        : isAtividadeConcluida(bloco.atividade, atividadesResolvidasLocal);
    return soma + (feito ? 1 : 0);
  }, 0);

  const total = lista.length;
  const pct = total > 0 ? (concluidos / total) * 100 : 0;

  return { total, concluidos, pct: Math.max(0, Math.min(100, pct)) };
}

/**
 * Progresso mostrado durante a navegacao. Um checkpoint no bloco N confirma
 * que os N blocos anteriores foram atravessados pelos gates da tela. Isso
 * evita restaurar no bloco 17 com a barra visual ainda presa em 6/26 quando o
 * estado local foi recriado depois de fechar o app.
 */
export function calcularProgressoVisualPercurso(params: {
  total: number;
  concluidosConfirmados: number;
  maiorIndiceAlcancado: number;
  blocoAtualConcluido: boolean;
}) {
  const total = Math.max(0, Math.round(params.total));
  const confirmados = Math.max(0, Math.round(params.concluidosConfirmados));
  const anterioresPercorridos = Math.max(0, Math.round(params.maiorIndiceAlcancado));
  const percorridos = anterioresPercorridos + (params.blocoAtualConcluido ? 1 : 0);
  const concluidos = Math.min(total, Math.max(confirmados, percorridos));
  const pct = total > 0 ? (concluidos / total) * 100 : 0;
  return { total, concluidos, pct };
}

/**
 * Todo bloco do percurso esta realmente concluido?
 *
 * Antes a regra era `concluido || idx < index`: qualquer bloco ATRAS do cursor
 * contava como feito. Passar batido por uma questao equivalia a responde-la, e
 * o modulo era dado como concluido com as atividades intocadas -- o gate existia
 * so na aparencia.
 *
 * Posicao nao e evidencia de conclusao. Aqui so conta o que os predicados de
 * conclusao confirmam (que ja aceitam status do banco, tentativa registrada e
 * marcacao local, entao quem respondeu numa sessao anterior nao e penalizado).
 */
export function todosOsBlocosConcluidos(params: {
  blocks: Block[];
  conteudosVistosLocal: Set<number>;
  atividadesResolvidasLocal: Map<number, AtividadeResolvida>;
}): boolean {
  const { blocks, conteudosVistosLocal, atividadesResolvidasLocal } = params;
  const lista = blocks ?? [];
  if (lista.length === 0) return true;

  return lista.every((bloco) =>
    bloco.kind === "conteudo"
      ? isConteudoConcluido(bloco.conteudo, conteudosVistosLocal)
      : isAtividadeConcluida(bloco.atividade, atividadesResolvidasLocal)
  );
}

export function resolveLegacyStartPosition(
  blocks: Block[],
  ultimaAtividadeId?: number | null
) {
  if (ultimaAtividadeId != null) {
    const activityIndex = blocks.findIndex(
      (block) =>
        block.kind === "atividade" &&
        Number(block.atividade.id) === Number(ultimaAtividadeId)
    );
    if (activityIndex >= 0) {
      return activityIndex;
    }
  }

  return calcularPosicaoInicial(blocks);
}

export function resolveCheckpointPosition(
  blocks: Block[],
  blockKind?: "conteudo" | "atividade" | null,
  blockId?: number | null
) {
  if (!blockKind || blockId == null) return -1;

  return blocks.findIndex((block) => {
    if (block.kind !== blockKind) return false;
    const currentId =
      block.kind === "conteudo"
        ? Number(block.conteudo.id)
        : Number(block.atividade.id);
    return currentId === Number(blockId);
  });
}

export function resolveConteudoMaterialContext(
  blocks: ContentBlock[],
  conteudoId: number | null,
  itemKey: string | null
) {
  return buildPrimaryMaterialContext({
    blocks,
    conteudoId,
    itemKey,
  });
}

export function buildStableNegativeId(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const normalized = Math.abs(hash || 1);
  return -(normalized % 1_000_000_000) - 1;
}

export function normalizeModuleDifficulty(
  value: unknown
): "facil" | "medio" | "dificil" {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");

  if (["facil", "easy", "iniciante", "beginner"].includes(normalized)) {
    return "facil";
  }
  if (["dificil", "hard", "avancado", "advanced"].includes(normalized)) {
    return "dificil";
  }
  return "medio";
}
