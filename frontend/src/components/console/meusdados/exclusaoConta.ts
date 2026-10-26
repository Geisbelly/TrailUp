import { supabase } from "@/integrations/supabase/client";

/** O que a exclusão faz com cada coisa da conta (20261024_07, #195). Usado na zona de perigo e no modal. */
export const SAI_DA_CONTA = [
  "seus dados pessoais: nome, instituição, disciplina, descrição e o acesso (e-mail e senha)",
  "o seu acesso ao console, que acaba na hora",
];

/** Tudo o que é das turmas sai junto, para sempre (`trailup_apagar_turma_inteira`). */
export const APAGADO_COM_AS_TURMAS = (turmas: string, alunos: string) => [
  `${turmas}, com trilhas, tópicos, atividades, questões e arquivos`,
  `as matrículas, notas, respostas e entregas de ${alunos} nessas turmas`,
  "o material personalizado, guildas, convites, missões, moedas e o histórico de uso dessas turmas",
];

export const FICA_COM_OS_ALUNOS = [
  "a conta e o perfil de cada aluno, e as outras turmas em que ele estiver",
  "o que não é de turma: perfil BrainHex e registros de consentimento",
];

export type ResultadoExclusao = { ok: boolean; turmasApagadas?: number; alunosAfetados?: number; mensagem?: string };

/** Mensagem curta para o erro devolvido pela RPC (código 42501 = recusa de permissão). */
export function mensagemDeErroExclusao(erro: { code?: string; message?: string } | null | undefined): string {
  const texto = erro?.message ?? "";
  if (texto.includes("dono do app")) return "A conta de administração não pode ser excluída por aqui. Passe a administração para outra pessoa antes.";
  if (erro?.code === "42501") return "Só a própria conta de professor pode ser excluída por aqui.";
  return "Não foi possível excluir a conta agora. Tente de novo em alguns minutos.";
}

/** Chama a exclusão no servidor; a autorização (sessão, professor, não-dono) é toda feita lá. */
export async function excluirMinhaContaProfessor(): Promise<ResultadoExclusao> {
  const { data, error } = await supabase.rpc("fn_excluir_minha_conta_professor" as never);
  if (error) return { ok: false, mensagem: mensagemDeErroExclusao(error) };
  const r = (data ?? {}) as { ok?: boolean; turmas_apagadas?: number; alunos_afetados?: number };
  if (!r.ok) return { ok: false, mensagem: mensagemDeErroExclusao(null) };
  return { ok: true, turmasApagadas: r.turmas_apagadas ?? 0, alunosAfetados: r.alunos_afetados ?? 0 };
}
