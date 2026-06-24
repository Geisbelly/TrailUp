// src/interfaces/contexts/ITrilhaBaseProps.ts
import type { GraphLayout } from "@/hooks/use-grafo-trilha";
import type { Classe } from "@/models/Classe";
import type { ModoOperacao } from "@/models/ModoOperacao";

export interface ITrilhaBaseProps {
  /** Lista de classes do aluno */
  classes: Classe[];

  /** Índice da classe atualmente selecionada */
  classeAtualIndex: number;

  /** Classe atualmente selecionada (atalho útil) */
  classeAtual: Classe | null;

  /** Modo de operação visual/ordenação da trilha */
  modoOperacao: ModoOperacao;

  /** Grafo já calculado (opcional — se o pai quiser prover) */
  grafo?: GraphLayout | null;

  /** Troca de classe atual (opcional) */
  setClasseAtual?: (index: number) => void;

  /** Troca de modo de operação (opcional) */
  setModoOperacao?: (modo: ModoOperacao) => void;
}
