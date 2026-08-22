/**
 * Decide se o quiz ("desafios cognitivos") do deck do BrainHexPDF deve ser
 * escondido pro aluno atual, com base no modoOperacao dele. O deck e
 * compartilhado entre todos os alunos do mesmo perfil/topico - essa decisao
 * NAO pode mudar o deck em si, so como ele e exibido pra este aluno
 * especifico (ver withHideQuizParam).
 *
 * "Misto" mostra o quiz normalmente; qualquer outro modo explicito esconde.
 * Sem dado (aluno sem o campo preenchido, ex. cadastro antigo) mostra por
 * padrao - fail-open, nao esconde por falta de informacao.
 */
export function shouldHideQuiz(modoOperacaoNome: string | null | undefined): boolean {
  const normalizado = (modoOperacaoNome ?? "").trim().toLowerCase();
  if (!normalizado) return false;
  return normalizado !== "misto";
}

/**
 * Anexa ?hideQuiz=1 (ou &hideQuiz=1 se a URL ja tiver query string) na URL
 * do deck quando hide=true. Retorna a URL sem alteracao quando hide=false.
 */
export function withHideQuizParam(url: string, hide: boolean): string {
  if (!hide) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}hideQuiz=1`;
}
