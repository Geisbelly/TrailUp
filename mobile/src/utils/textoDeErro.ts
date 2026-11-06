const TECNICO =
  /failed to fetch|network|timeout|timed out|abort|jwt|token|pgrst|postgres|violates|permission denied|row-level|duplicate key|relation |column |function |syntax|typeerror|referenceerror|undefined|cannot read|not found|unexpected|internal server|status code|http \d|\bfetch\b|\berror\b|\bexception\b|\bstack\b|\bnull\b/i;

/**
 * O que mostrar ao aluno quando algo falha. Mensagem escrita para gente (as RPCs
 * levantam em português) passa; erro técnico vira o texto de `reserva`.
 */
export function textoDeErro(erro: unknown, reserva: string): string {
  const mensagem = (erro instanceof Error ? erro.message : typeof erro === "string" ? erro : "").trim();
  if (!mensagem || mensagem.length > 200 || TECNICO.test(mensagem)) return reserva;
  return mensagem;
}
