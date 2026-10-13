// Duplicar turma pela função do banco duplicar_classe (migration 20261011_01).

export type ErroDoBanco = { code?: string | null; message?: string | null } | null | undefined;

/**
 * Mensagem do erro da RPC para o professor. Função ausente = migration ainda
 * não aplicada neste ambiente: dizer isso, não mostrar o erro do PostgREST.
 */
export function mensagemDeErroDaDuplicacao(erro: ErroDoBanco): string {
  const codigo = erro?.code ?? "";
  const texto = erro?.message ?? "";
  if (codigo === "PGRST202" || codigo === "42883" || /could not find the function|function .*duplicar_classe.* does not exist/i.test(texto)) {
    return "A duplicação ainda não está disponível neste ambiente.";
  }
  if (codigo === "42501") return "Você não tem permissão para duplicar esta turma.";
  return texto ? `Não foi possível duplicar a turma: ${texto}` : "Não foi possível duplicar a turma.";
}

/** A RPC devolve o id da cópia; qualquer outra coisa é resposta inesperada. */
export function idDaCopia(dado: unknown): number | null {
  const id = typeof dado === "string" ? Number(dado) : dado;
  return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
}
