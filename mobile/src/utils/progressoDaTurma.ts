/**
 * % concluído de uma turma na escolha de turma, no celular e na tela larga. É o mesmo
 * número do Perfil e do topo da Trilha (`Classe.getProgressoGeral`), que conta o avanço
 * dentro de cada módulo. Antes o celular contava só os módulos fechados (2 de 5 = 40%)
 * enquanto a Trilha da mesma turma mostrava 58%.
 */
export function porcentagemDaTurma(classe: { getProgressoGeral?: () => number }): number {
  const p = Math.round(Number(classe.getProgressoGeral?.() ?? 0));
  return Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 0;
}
