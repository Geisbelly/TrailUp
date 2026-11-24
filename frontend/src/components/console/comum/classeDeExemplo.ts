import { createContext, useContext } from "react";

/**
 * A turma de demonstração do avaliador da pesquisa, ou `null` para todo o resto. O Console a fornece
 * a todas as abas; cada aba que tem exemplo (`exemploDasAbas.ts`) pergunta se a turma em tela é ela.
 */
export const ClasseDeExemplo = createContext<number | null>(null);

export function useClasseDeExemplo(): number | null {
  return useContext(ClasseDeExemplo);
}

/** A turma escolhida na aba é a de demonstração? */
export function ehTurmaDeExemplo(classeDeExemplo: number | null, turmaId: number | null | undefined): boolean {
  return classeDeExemplo != null && turmaId === classeDeExemplo;
}
