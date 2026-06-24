// src/interfaces/contexts/ITrilhaProps.ts
import type { Classe } from "@/models/Classe";
import type { ModoOperacao } from "@/models/ModoOperacao";

/**
 * Representa uma trilha (classe) individual na visualização do aluno.
 */
export interface ITrilhaProps {
  /** Classe associada à trilha */
  classe: Classe;

  /** Título exibido (pode vir do resumo da classe) */
  titulo?: string;

  /** Descrição opcional */
  descricao?: string;

  /** Progresso percentual (0–100) */
  progresso?: number;

  /** Modo de operação (define a ordem de apresentação) */
  modoOperacao?: ModoOperacao;
}
