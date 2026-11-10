/**
 * A marca `formato_texto` (`'texto'` | `'rico'`) de questões e atividades (spec A, `20261108_03`).
 *
 * Lida numa consulta só dela, `select('id, formato_texto')`, e nunca junto com outra coluna: num
 * banco sem a migration a coluna não existe, e o erro derrubaria a leitura inteira que a
 * acompanhasse. Aqui qualquer falha vira "tudo texto", que é exatamente como o app desenhava
 * antes. A view `vw_aluno_classe_detalhado` não é tocada: a fase 3 do gabarito vai reescrevê-la.
 */

export type FormatoTexto = "texto" | "rico";

/** Qualquer coisa que não seja exatamente `'rico'` é texto. */
export function formatoDoTexto(valor: unknown): FormatoTexto {
  return valor === "rico" ? "rico" : "texto";
}

type Resposta = PromiseLike<{ data: unknown[] | null; error: unknown }>;
type ClienteMinimo = {
  from: (tabela: string) => { select: (colunas: string) => { in: (coluna: string, valores: number[]) => Resposta } };
};

/** Ids marcados como `'rico'`. Os ausentes do conjunto são texto. */
export async function idsComTextoRico(
  cliente: ClienteMinimo,
  tabela: "questoes" | "atividades",
  ids: number[],
): Promise<Set<number>> {
  const ricos = new Set<number>();
  const unicos = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
  if (unicos.length === 0) return ricos;
  try {
    const { data, error } = await cliente.from(tabela).select("id, formato_texto").in("id", unicos);
    if (error) return ricos;
    for (const linha of data ?? []) {
      const { id, formato_texto } = (linha ?? {}) as { id?: unknown; formato_texto?: unknown };
      if (formatoDoTexto(formato_texto) === "rico" && Number.isFinite(Number(id))) ricos.add(Number(id));
    }
  } catch {
    // Rede ou cliente: fica tudo texto, como antes.
  }
  return ricos;
}
