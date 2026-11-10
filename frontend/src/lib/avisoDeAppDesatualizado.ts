// Aviso ao professor quando ele salva algo que o app antigo não sabe mostrar (spec B, PR 4).
//
// O app abaixo da versão com os editores do spec B abre questão de código, numérica ou expressão
// como múltipla escolha sem alternativas, e mostra texto rico com os símbolos crus. O console não
// sabe que app cada aluno tem; o que ele sabe é a versão mínima que o banco exige
// (`app_config.app_versao_minima`, pública, `20261024_11`). Se ela já for a versão com respostas
// ricas, nenhum app antigo abre e não há o que avisar. Salvar nunca é bloqueado.

/**
 * A primeira versão do app com os editores do spec B (PR #1094). **Não chutar:** fica `null` até a
 * Geisbelly confirmar o build publicado, e com `null` o aviso aparece sempre.
 */
export const VERSAO_DO_APP_COM_RESPOSTAS_RICAS: string | null = null;

export const MENSAGEM_DO_AVISO = {
  tipo: "Alunos com o app desatualizado não conseguem responder esta questão.",
  rico: "Alunos com o app desatualizado verão este texto sem formatação.",
} as const;

/** "1.2.3" → [1, 2, 3]; aceita "v1.2" e sufixo "-beta". Malformada → null. (Igual ao do app.) */
function partes(versao: string | null | undefined): number[] | null {
  const limpa = (versao ?? "").trim().replace(/^v/i, "").split(/[-+]/)[0];
  if (!/^\d+(\.\d+){0,3}$/.test(limpa)) return null;
  return limpa.split(".").map(Number);
}

function comparar(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Algum app que não mostra isto ainda pode abrir? Na dúvida, sim. */
export function appPodeEstarDesatualizado(
  versaoMinima: string | null | undefined,
  versaoComRicas: string | null = VERSAO_DO_APP_COM_RESPOSTAS_RICAS,
): boolean {
  const comRicas = partes(versaoComRicas);
  const minima = partes(versaoMinima);
  if (!comRicas || !minima) return true;
  return comparar(minima, comRicas) < 0;
}

/** Lê a versão mínima e diz se o aviso vale. Falha de leitura conta como "pode estar". */
export async function precisaAvisarAppDesatualizado(): Promise<boolean> {
  if (!VERSAO_DO_APP_COM_RESPOSTAS_RICAS) return true;
  try {
    // Import tardio: o resto do módulo é puro e roda no vitest sem o cliente (que exige `localStorage`).
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.from("app_config").select("valor").eq("chave", "app_versao_minima").maybeSingle();
    if (error) return true;
    const valor = (data as { valor?: unknown } | null)?.valor;
    return appPodeEstarDesatualizado(typeof valor === "string" ? valor : null);
  } catch {
    return true;
  }
}
