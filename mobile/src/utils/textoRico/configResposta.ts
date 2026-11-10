/**
 * `questoes.config_resposta` (`20261110_02`): o que o aluno precisa para responder, e nada do
 * gabarito. Código: `{ linguagem }`; expressão: `{ variaveis }`; numérica: `{ dimensao }`, só para
 * o teclado sugerir unidades.
 *
 * Lida numa consulta só dela, como `formato_texto` (ver `formatoTexto.ts`): num banco sem a
 * migration a coluna não existe, e o erro não pode derrubar a leitura da trilha. Falha vira "sem
 * configuração", e o editor abre sem linguagem nem atalho de unidade.
 */

export type ConfigResposta = {
  linguagem: string | null;
  variaveis: string[];
  dimensao: string | null;
};

const VAZIA: ConfigResposta = { linguagem: null, variaveis: [], dimensao: null };

function textoCurto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  return texto && texto.length <= 40 ? texto : null;
}

export function lerConfigResposta(bruto: unknown): ConfigResposta {
  let valor = bruto;
  if (typeof valor === "string") {
    try {
      valor = JSON.parse(valor);
    } catch {
      return VAZIA;
    }
  }
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return VAZIA;
  const linha = valor as Record<string, unknown>;
  return {
    linguagem: textoCurto(linha.linguagem),
    variaveis: Array.isArray(linha.variaveis)
      ? linha.variaveis.map(textoCurto).filter((v): v is string => v !== null).slice(0, 12)
      : [],
    dimensao: textoCurto(linha.dimensao),
  };
}

type Resposta = PromiseLike<{ data: unknown[] | null; error: unknown }>;
type ClienteMinimo = {
  from: (tabela: string) => { select: (colunas: string) => { in: (coluna: string, valores: number[]) => Resposta } };
};

/** A configuração de cada questão que tem uma. As ausentes do mapa não têm. */
export async function configsDaResposta(cliente: ClienteMinimo, ids: number[]): Promise<Map<number, ConfigResposta>> {
  const configs = new Map<number, ConfigResposta>();
  const unicos = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
  if (unicos.length === 0) return configs;
  try {
    const { data, error } = await cliente.from("questoes").select("id, config_resposta").in("id", unicos);
    if (error) return configs;
    for (const linha of data ?? []) {
      const { id, config_resposta } = (linha ?? {}) as { id?: unknown; config_resposta?: unknown };
      if (config_resposta == null || !Number.isFinite(Number(id))) continue;
      configs.set(Number(id), lerConfigResposta(config_resposta));
    }
  } catch {
    // Rede ou cliente: os editores abrem sem configuração.
  }
  return configs;
}
