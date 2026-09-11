import { supabase } from "@/database/supabase";
import type { CreditoDoAluno } from "@/utils/creditosDoAluno";

/**
 * Leitura do crédito que o professor concedeu ao aluno.
 *
 * A view `vw_creditos_concedidos` roda com `security_invoker = on`, então a RLS
 * de `eventos_aluno` é quem decide a audiência: o aluno vê as próprias linhas,
 * o professor vê as dos alunos das classes dele. Este módulo NÃO filtra por
 * `aluno_id` além do pedido explícito -- repetir o filtro aqui criaria uma
 * segunda regra de acesso, e é a do banco que vale.
 *
 * Não passa pela API: é leitura de tabela, sem modelo de linguagem no meio.
 */
export class Credito {
  /** Teto de linhas. Um ano de aulas diárias não chega perto disso. */
  static readonly LIMITE = 500;

  static async listarDoAluno(
    alunoId: string,
    opcoes: { classeId?: number | null } = {},
  ): Promise<CreditoDoAluno[]> {
    if (!alunoId) return [];

    let consulta = supabase
      .from("vw_creditos_concedidos")
      .select("id, tipo, valor, motivo, data_credito, classe_id")
      .eq("aluno_id", alunoId)
      .order("criado_em", { ascending: false })
      .limit(Credito.LIMITE);

    // Sem classe, traz de todas as turmas: o aluno que estuda em três quer o
    // histórico inteiro, e a tela mostra tudo junto.
    if (opcoes.classeId) {
      consulta = consulta.eq("classe_id", opcoes.classeId);
    }

    const { data, error } = await consulta;

    if (error) {
      console.warn("[Credito] Falha ao listar créditos:", error);
      return [];
    }

    return (data ?? []) as CreditoDoAluno[];
  }
}

export default Credito;
