/**
 * Média só de quem tem o valor. classe_aluno guarda nota e acertos como nulos
 * até a primeira atividade corrigida; somar esses nulos como 0 fabrica uma
 * média baixa que não existe. Sem ninguém com valor, devolve null.
 */
export function mediaDosPreenchidos(valores: (number | null)[]): number | null {
  const preenchidos = valores.filter((v): v is number => v !== null && !Number.isNaN(v));
  if (preenchidos.length === 0) return null;
  return preenchidos.reduce((soma, v) => soma + v, 0) / preenchidos.length;
}
