/**
 * Decide se widgets que pedem producao ativa do aluno (quiz/"desafios
 * cognitivos", checklist, anotacao/reflexao) no deck do BrainHexPDF devem
 * ser escondidos pro aluno atual, com base no modoOperacao dele. O deck e
 * compartilhado entre todos os alunos do mesmo perfil/topico - essa decisao
 * NAO pode mudar o deck em si, so como ele e exibido pra este aluno
 * especifico (ver withHideParams).
 *
 * "Misto" mostra tudo normalmente; qualquer outro modo explicito esconde.
 * Sem dado (aluno sem o campo preenchido, ex. cadastro antigo) mostra por
 * padrao - fail-open, nao esconde por falta de informacao.
 */
function shouldHide(modoOperacaoNome: string | null | undefined): boolean {
  const normalizado = (modoOperacaoNome ?? "").trim().toLowerCase();
  if (!normalizado) return false;
  return normalizado !== "misto";
}

export function shouldHideQuiz(modoOperacaoNome: string | null | undefined): boolean {
  return shouldHide(modoOperacaoNome);
}

export function shouldHideChecklist(modoOperacaoNome: string | null | undefined): boolean {
  return shouldHide(modoOperacaoNome);
}

export function shouldHideNotes(modoOperacaoNome: string | null | undefined): boolean {
  return shouldHide(modoOperacaoNome);
}

export interface HideParamsFlags {
  hideQuiz: boolean;
  hideChecklist: boolean;
  hideNotes: boolean;
}

/**
 * Anexa ?hideQuiz=1&hideChecklist=1&hideNotes=1 (so as flags true, & se a
 * URL ja tiver query string) na URL do deck. Retorna a URL sem alteracao
 * quando nenhuma flag e true.
 */
export function withHideParams(url: string, flags: HideParamsFlags): string {
  const params = (
    [
      ["hideQuiz", flags.hideQuiz],
      ["hideChecklist", flags.hideChecklist],
      ["hideNotes", flags.hideNotes],
    ] as const
  )
    .filter(([, hide]) => hide)
    .map(([name]) => `${name}=1`);

  if (params.length === 0) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${params.join("&")}`;
}
