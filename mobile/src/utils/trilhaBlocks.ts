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
