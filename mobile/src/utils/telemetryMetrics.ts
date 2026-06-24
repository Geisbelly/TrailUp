import { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";

const MATERIAL_PRIORITY: Record<ContentBlock["tipo"], number> = {
  pdf: 90,
  documento: 85,
  apresentacao: 85,
  embed: 80,
  video: 75,
  youtube: 75,
  audio: 72,
  imagem: 68,
  markdown: 52,
  cards: 48,
  texto: 40,
};

export function parseContentIdFromItemKey(itemKey?: string | null) {
  if (!itemKey || !String(itemKey).startsWith("content:")) {
    return null;
  }

  const parsed = Number(String(itemKey).split(":")[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildPrimaryMaterialContext(params: {
  blocks: ContentBlock[];
  conteudoId?: number | null;
  itemKey?: string | null;
}) {
  const { blocks, conteudoId = null, itemKey = null } = params;
  if (!blocks.length) {
    return {
      materialKey: null,
      materialType: null,
    };
  }

  const primaryBlock = [...blocks]
    .sort((left, right) => {
      const rightPriority = MATERIAL_PRIORITY[right.tipo] ?? 0;
      const leftPriority = MATERIAL_PRIORITY[left.tipo] ?? 0;
      return rightPriority - leftPriority;
    })[0];

  const baseKey =
    conteudoId != null
      ? `content:${conteudoId}`
      : itemKey?.trim()
      ? itemKey.trim()
      : "content";

  return {
    materialKey: `material:${baseKey}:${primaryBlock.tipo}:${String(primaryBlock.id)}`,
    materialType: primaryBlock.tipo,
  };
}
