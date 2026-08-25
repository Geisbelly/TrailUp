// Regra de senha compartilhada pelos tres pontos que mexem em senha:
// recuperacao por e-mail (RedefinirSenha), troca com o professor logado
// (ProfileSection) e, por tabela, o cadastro. Vive num lugar so pra nao
// existir "minimo de 6" escrito em quatro arquivos com valores diferentes.
//
// O minimo segue o que o cadastro e o login ja exigiam (6). Nao aumentei aqui
// porque uma regra mais dura na troca do que no cadastro deixaria senhas
// legitimas "invalidas" na hora de trocar; se for pra endurecer, endurece nos
// tres ao mesmo tempo mudando esta constante.
export const SENHA_MINIMA = 6;

export interface ValidacaoSenha {
  ok: boolean;
  /** Mensagem pronta pra exibir; null quando ok. */
  erro: string | null;
  /** Campo que deve receber o foco/destaque do erro. */
  campo: "senhaAtual" | "novaSenha" | "confirmacao" | null;
}

const OK: ValidacaoSenha = { ok: true, erro: null, campo: null };

function falha(campo: ValidacaoSenha["campo"], erro: string): ValidacaoSenha {
  return { ok: false, erro, campo };
}

/**
 * Valida a nova senha (e a confirmacao). `senhaAtual` so e informada na troca
 * com o usuario logado - na recuperacao por e-mail ninguem sabe a senha antiga,
 * que e justamente o motivo de estar recuperando.
 */
export function validarNovaSenha(params: {
  novaSenha: string;
  confirmacao: string;
  senhaAtual?: string;
}): ValidacaoSenha {
  const { novaSenha, confirmacao, senhaAtual } = params;

  if (senhaAtual !== undefined && !senhaAtual) {
    return falha("senhaAtual", "Informe a senha atual.");
  }

  if (!novaSenha) {
    return falha("novaSenha", "Informe a nova senha.");
  }

  if (novaSenha.length < SENHA_MINIMA) {
    return falha("novaSenha", `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  }

  if (senhaAtual !== undefined && novaSenha === senhaAtual) {
    return falha("novaSenha", "A nova senha precisa ser diferente da atual.");
  }

  if (novaSenha !== confirmacao) {
    return falha("confirmacao", "A confirmação não confere com a nova senha.");
  }

  return OK;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * Traduz o erro do Supabase pra uma mensagem util em pt-br. O texto cru vem em
 * ingles e as vezes e tecnico demais pro professor ("New password should be
 * different from the old password").
 */
export function mensagemDeErroDeSenha(error: unknown): string {
  const bruto = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();

  if (bruto.includes("different from the old password")) {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (bruto.includes("should be at least") || bruto.includes("password should be")) {
    return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  }
  if (bruto.includes("invalid login credentials")) {
    return "Senha atual incorreta.";
  }
  if (bruto.includes("same_password")) {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (bruto.includes("expired") || bruto.includes("invalid") || bruto.includes("token")) {
    return "Este link de recuperação expirou ou já foi usado. Peça um novo.";
  }
  if (bruto.includes("rate limit") || bruto.includes("too many")) {
    return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  }
  return "Não foi possível concluir. Tente novamente.";
}
