/**
 * O campo "Nome completo" do cadastro do aluno. Pura.
 *
 * O nome vai para `alunos.nome`, e é dele que sai o primeiro nome com que a notificação chama o
 * aluno quando não há apelido (`notificacoes_primeiro_nome`, 20261103_12), além do que o professor
 * vê no console. Sem validação, um aluno cadastrou o nome de usuário dele ("rafanuntavares") e passou
 * a receber "Retome o raciocínio, rafanuntavares". O apelido (nick) tem campo próprio logo abaixo.
 *
 * Devolve a mensagem do problema, ou `null` quando o nome serve.
 */
export function problemaDoNomeCompleto(nome: string): string | null {
  const limpo = nome.trim().replace(/\s+/g, " ");
  if (!limpo) return "Digite seu nome completo.";
  if (/[@\d_]/.test(limpo)) return "Use seu nome real, sem @, números ou _. O apelido vai no campo de baixo.";
  // Palavra = trecho com ao menos uma letra (de qualquer alfabeto); "de", "da" e iniciais contam.
  const palavras = limpo.split(" ").filter((p) => /\p{L}/u.test(p));
  if (palavras.length < 2) return "Digite nome e sobrenome.";
  if (limpo.length > 120) return "O nome pode ter até 120 caracteres.";
  return null;
}

/** O nome como vai para o banco: sem espaço sobrando. */
export function nomeCompletoLimpo(nome: string): string {
  return nome.trim().replace(/\s+/g, " ");
}
