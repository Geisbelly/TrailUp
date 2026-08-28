// Versao de cache de um material personalizado.
//
// O cache nativo (nativeContentCache.ts) e' chaveado pela URL e NUNCA
// revalida: se o arquivo local existe, ele e' devolvido. A unica expiracao
// e' `lastAccessedAt > 3 dias`, e esse campo e' renovado a cada acesso --
// entao material que o aluno usa nunca expira.
//
// Ao mesmo tempo, a regeracao no console faz UPDATE in place sem trocar
// `source_hash`, e o caminho no Storage embute `generation-<source_hash>`.
// A URL, portanto, nao muda. Sem esta versao na chave, o aluno fica com o
// material antigo para sempre.
//
// O console ja faz o equivalente em
// frontend/src/components/console/personalizacoes/materialPreview.ts
// (materialCacheVersion/versionedMaterialUrl). Aqui a mesma ideia, mais
// `revisao`, que e' o sinal que a regeracao incrementa (ver
// api/app/services/material_revisao.py).

type MaterialLike = Record<string, unknown> | null | undefined;

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function revisao(material: MaterialLike): number {
  const valor = material?.revisao;
  // Ausencia conta como 1, igual ao back (material_revisao.py): material
  // gerado antes deste campo e' a revisao 1, nao a zero.
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 1) return 1;
  return valor;
}

/** Identificador que muda sempre que o material muda. */
export function materialCacheVersion(material: MaterialLike): string {
  const metadata =
    material && typeof material.metadata === "object" && material.metadata
      ? (material.metadata as Record<string, unknown>)
      : {};

  const partes = [
    `r${revisao(material)}`,
    texto(metadata.generation_key) ?? texto(material?.generation_key),
    texto(metadata.updated_at) ?? texto(material?.updated_at),
  ].filter((parte): parte is string => Boolean(parte));

  return partes.join("|");
}

/**
 * Chave de cache da URL, versionada.
 *
 * Usa `#` porque o fragmento nao vai para o servidor: a chave muda sem
 * alterar a requisicao. Query string (`?v=`) tambem funcionaria, mas o
 * Storage do Supabase assina URLs com query, e concatenar ali arriscaria
 * quebrar assinatura.
 */
export function versionedCacheKey(url: string, material: MaterialLike): string {
  const base = texto(url);
  if (!base) return "";
  return `${base}#${materialCacheVersion(material)}`;
}
