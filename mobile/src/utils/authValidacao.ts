/**
 * Regras de validação das telas de entrar e de recuperar senha. Ficam fora das telas para o
 * celular e a web larga usarem a mesma conta e para dar para testar sem montar a tela.
 */

// O mesmo formato que o login sempre exigiu (RFC simplificada: aceita aspas e subdomínios).
const FORMATO_EMAIL_LOGIN =
  /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@(([^<>()[\]\\.,;:\s@"]+\.)+[^<>()[\]\\.,;:\s@"]{2,})$/i;

// Recuperar senha é mais frouxo de propósito: o servidor decide se o endereço existe.
const FORMATO_EMAIL_RECUPERACAO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailDeLoginValido(email: string): boolean {
  return FORMATO_EMAIL_LOGIN.test(email);
}

export function emailDeRecuperacaoValido(email: string): boolean {
  return FORMATO_EMAIL_RECUPERACAO.test(email);
}

/** "Entrar" fica desabilitado até o e-mail ter formato válido e a senha não estar vazia. */
export function dadosDeLoginValidos(email: string, senha: string): boolean {
  return emailDeLoginValido(email) && senha.trim().length > 0;
}
