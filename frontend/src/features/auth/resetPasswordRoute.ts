// Caminho da pagina que recebe o link de recuperacao de senha.
//
// Mora num modulo proprio porque e usado em tres lugares que precisam
// concordar: a rota em App.tsx, o redirectTo mandado ao Supabase em
// EsqueciSenha e a propria pagina. Divergir aqui e o tipo de erro que so
// aparece quando alguem clica no link do e-mail e cai num 404.
//
// Nao aponta pra /auth/confirmacao de proposito: aquela pagina e do fluxo de
// CADASTRO e exige um "cadastro pendente" no storage, entao um link de
// recuperacao morreria la com "Nenhum cadastro pendente para este email".
export const RESET_PASSWORD_PATH = "/redefinir-senha";
export const FORGOT_PASSWORD_PATH = "/esqueci-senha";
