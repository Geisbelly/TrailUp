import { supabase } from "@/integrations/supabase/client";
import { csvDasNotas, lerNotas, nomeDoArquivo } from "./csvTurma";

/** Dispara o download no navegador. */
export function baixarArquivo(nome: string, conteudo: string, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Notas e XP da turma em CSV (#146). A conta é do banco (`professor_notas_da_turma`, só para o
 * professor da turma); aqui é só o formato do arquivo. Devolve quantos alunos foram exportados.
 */
export async function exportarNotasDaTurma(classeId: number, nomeDaTurma: string): Promise<number> {
  const { data, error } = await supabase.rpc("professor_notas_da_turma" as never, { p_classe_id: classeId } as never);
  if (error) throw new Error(error.message);
  const notas = lerNotas(data);
  if (!notas) throw new Error("A resposta não veio no formato esperado.");
  baixarArquivo(nomeDoArquivo(nomeDaTurma, new Date()), csvDasNotas(notas));
  return notas.length;
}
