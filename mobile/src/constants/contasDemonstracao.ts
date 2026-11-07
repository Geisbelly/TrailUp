/**
 * Contas de demonstração: alunos usados para apresentar o app, não para estudar.
 *
 * Para elas a troca de perfil oferece os 7 perfis BrainHex, e não só os representativos
 * (`resolveRepresentativeBrainHexProfiles`): quem apresenta precisa mostrar a pele, o guia e o
 * material de cada perfil sem refazer o quiz. A afinidade gravada em `aluno_perfil` continua a
 * mesma — o perfil dominante, as conquistas por perfil e as missões seguem a regra de todos.
 *
 * Compare sempre por `ehContaDemonstracao`: o e-mail vem do banco com a caixa que o cadastro usou.
 *
 * O e-mail que chega aqui é o de `alunos.email`, não o do login: `SessaoContext` usa
 * `data.email ?? sessão`. Na conta de demonstração os dois são diferentes: ela entra pelo Google
 * com `geisbelly19@gmail.com`, e a linha em `alunos` guarda `demo@trailup.app`. Só o e-mail do
 * login na lista não liga nada (medido logado em 07/11). Os dois ficam na lista: o do login vale
 * enquanto `alunos` ainda não chegou ou se a linha vier sem e-mail.
 */
const CONTAS_DEMONSTRACAO: ReadonlySet<string> = new Set([
  "demo@trailup.app",
  "geisbelly19@gmail.com",
]);

export function ehContaDemonstracao(email?: string | null): boolean {
  if (!email) return false;
  return CONTAS_DEMONSTRACAO.has(email.trim().toLowerCase());
}
