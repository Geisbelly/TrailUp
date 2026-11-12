/**
 * As chaves de cache da trilha que sobraram de rotas anteriores.
 *
 * Com a mistura de material ligada, a chave leva o perfil ativo e os pesos (`chaveDoPerfilDaRota`,
 * separados por `|`). Cada mudança de afinidade, e a primeira renderização com `perfis = []`,
 * deixava uma entrada que nunca era apagada. Aqui saem as que têm assinatura (`|`) e não são a
 * atual. A chave de perfil puro fica: é a da mistura desligada, no máximo 7 por turma, e serve de
 * reserva se a chave voltar a `desligada`.
 *
 * `base` é o prefixo do cache, do aluno e da turma, terminado em `/`
 * (`@trailup/personalizacao-v4/<aluno>/<turma>/`). Sem a barra no fim, a turma 7 casaria com a 70.
 */
export function chavesDaRotaParaApagar(todas: readonly string[], base: string, atual: string): string[] {
  if (!base.endsWith('/')) return [];
  return todas.filter((chave) => chave !== atual && chave.startsWith(base) && chave.slice(base.length).includes('|'));
}
