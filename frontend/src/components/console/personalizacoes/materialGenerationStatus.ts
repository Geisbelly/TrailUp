// O merge no banco (merge_personalizacao_materiais_v2, api/alembic/versions)
// so marca metadata.status="completed" quando confirma que o arquivo existe
// no Storage -- uma geracao que falhou fica com metadata.status="failed" (ou
// "pending" enquanto ainda roda), mas os "partes" continuam com arquivo_url/
// storage_path de uma tentativa anterior ou de uma resposta que nunca subiu.
// Sem checar esse status antes de tentar renderizar, o componente baixa um
// arquivo que o proprio backend ja sabe que nao existe, e o professor ve um
// erro cru do Supabase em vez de "a geracao falhou".
export type MaterialGenerationStatus = {
  status: string | null;
  erro: string | null;
};

export function resolverStatusDeGeracao(
  material: Record<string, unknown> | null | undefined,
): MaterialGenerationStatus {
  const metadata =
    material && typeof material.metadata === "object" && material.metadata !== null
      ? (material.metadata as Record<string, unknown>)
      : null;
  const status = typeof metadata?.status === "string" ? metadata.status : null;
  const erro = typeof metadata?.error === "string" ? metadata.error : null;
  return { status, erro };
}
