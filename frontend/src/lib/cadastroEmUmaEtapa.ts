/**
 * Cadastro em UMA etapa — e por que isso é uma correção de segurança, não de UX.
 *
 * O cadastro era em duas telas: primeiro o e-mail, que ia a
 * `fn_auth_email_exists(p_email)` para decidir entre "entrar" e "criar". Essa RPC é
 * `SECURITY DEFINER` com `EXECUTE` para `anon`, então qualquer pessoa na internet podia fazer
 * `POST /rest/v1/rpc/fn_auth_email_exists` e descobrir se um e-mail tem conta no TrailUp — sem
 * autenticar e **sem rate limit**. É a issue #329 (P0).
 *
 * Juntar as etapas mata o oráculo junto com a função: com e-mail e senha na mesma tela, quem
 * decide é `signIn`/`signUp`, pela API de autenticação, que tem limite de taxa própria.
 *
 * ## A parte que realmente fecha o buraco
 *
 * Não é juntar os campos — é `mensagemDeAcesso`. Se "senha errada" e "este e-mail já tem conta"
 * produzirem mensagens diferentes, o oráculo volta, só mais devagar. As duas devolvem a MESMA
 * string, e há teste cobrando isso.
 *
 * ## O que continua distinguível, e por quê
 *
 * `email_not_confirmed` recebe mensagem própria: é o único jeito de dizer a quem se cadastrou
 * ontem que falta clicar no link. O Supabase só responde isso para credencial **correta**, então
 * quem sonda precisa acertar a senha — e o endpoint de auth tem limite de taxa, diferente da RPC
 * aberta que esta mudança remove. Resíduo consciente, muito menor que o original.
 */

export type DadosDoAcesso = {
  email: string;
  senha: string;
  confirmSenha: string;
  termos: boolean;
};

/** A mesma frase para senha errada e para conta já existente. Não especialize. */
export const MENSAGEM_CREDENCIAL = "E-mail ou senha incorretos.";

/** Mínimo que o Supabase aceita; repetido aqui para o erro sair antes da ida ao servidor. */
export const SENHA_MINIMA = 6;

function texto(erro: unknown): string {
  if (!erro) return "";
  const e = erro as { message?: unknown; code?: unknown; error_description?: unknown };
  return [e.message, e.code, e.error_description]
    .filter((parte) => typeof parte === "string")
    .join(" ")
    .toLowerCase();
}

/** Credencial inválida: conta inexistente OU senha errada — o Supabase não distingue, e é bom. */
export function ehCredencialInvalida(erro: unknown): boolean {
  const t = texto(erro);
  return t.includes("invalid login credentials") || t.includes("invalid_credentials");
}

/**
 * `signUp` recusando porque a conta existe.
 *
 * Depende da configuração do projeto: com confirmação de e-mail ligada o Supabase às vezes
 * devolve sucesso ofuscado em vez de erro. Os dois casos estão tratados — este reconhecedor para
 * o erro, e `mensagemDeAcesso` para dar a ele a mesma resposta de senha errada.
 */
export function ehContaJaExistente(erro: unknown): boolean {
  const t = texto(erro);
  return (
    t.includes("already registered") ||
    t.includes("already been registered") ||
    t.includes("user already exists") ||
    t.includes("user_already_exists")
  );
}

export function ehEmailNaoConfirmado(erro: unknown): boolean {
  const t = texto(erro);
  return t.includes("email not confirmed") || t.includes("email_not_confirmed");
}

/**
 * A mensagem que o visitante vê.
 *
 * **Invariante desta função:** `ehCredencialInvalida` e `ehContaJaExistente` caem na MESMA
 * string. Qualquer especialização aqui reabre a enumeração que a #329 descreve, agora pela tela
 * de cadastro em vez da RPC.
 */
export function mensagemDeAcesso(erro: unknown): string {
  if (ehEmailNaoConfirmado(erro)) {
    return "Falta confirmar seu e-mail. Procure o link que enviamos ou peça um novo.";
  }
  if (ehCredencialInvalida(erro) || ehContaJaExistente(erro)) {
    return MENSAGEM_CREDENCIAL;
  }
  const t = texto(erro);
  if (t.includes("rate") || t.includes("too many")) {
    return "Muitas tentativas. Aguarde um instante e tente de novo.";
  }
  const original = (erro as { message?: unknown })?.message;
  return typeof original === "string" && original.trim() !== ""
    ? original
    : "Não foi possível continuar. Tente novamente.";
}

/**
 * Validação local, antes de qualquer ida ao servidor.
 *
 * `confirmSenha` e `termos` só são exigidos no caminho de CRIAÇÃO — e esse caminho só é tentado
 * depois de o `signIn` falhar, quando já não se sabe se a conta existe. Então pedir os dois ali
 * não revela nada: a mesma exigência aparece para senha errada e para e-mail sem conta.
 */
export function validarAcesso(dados: DadosDoAcesso, criando: boolean): string | null {
  const email = dados.email.trim();
  if (email === "" || !email.includes("@")) return "Informe um e-mail válido.";
  if (dados.senha === "") return "Informe a senha.";
  if (!criando) return null;
  if (dados.senha.length < SENHA_MINIMA) return `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`;
  if (dados.senha !== dados.confirmSenha) return "As senhas não coincidem.";
  if (!dados.termos) return "É necessário aceitar os termos para continuar.";
  return null;
}

/** O e-mail como o banco e o Supabase o veem. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}
