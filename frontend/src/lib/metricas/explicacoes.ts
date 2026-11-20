// Explicações das métricas do console (spec 2026-11-20-metricas-explicadas). Cada texto foi
// escrito lendo a fonte de verdade, registrada em `referencia` (que nunca vai para a tela).
// O app tem o seu catálogo, com as mesmas chaves e o mesmo selo (ver paridade.test.ts).
import dados from "./explicacoes.json";

export type Selo = "medido" | "regra" | "estimativa";

export type ExplicacaoMetrica = {
  nome: string;
  selo: Selo;
  oQueMede: string;
  comoColeta: string;
  atualiza: string;
  limites?: string[];
  naoSignifica: string;
  referencia: string;
};

export type ChaveMetrica = keyof typeof dados;

const CATALOGO = dados as Record<ChaveMetrica, ExplicacaoMetrica>;

export function explicacaoDe(chave: ChaveMetrica): ExplicacaoMetrica {
  return CATALOGO[chave];
}

export const ROTULO_DO_SELO: Record<Selo, string> = {
  medido: "Medido",
  regra: "Calculado com regra",
  estimativa: "Estimativa",
};

export const FRASE_DO_SELO: Record<Selo, string> = {
  medido: "Medido: contagem ou soma direta do que o sistema registrou.",
  regra: "Calculado com regra: conta fixa sobre dados registrados. O número depende da regra, descrita abaixo.",
  estimativa: "Estimativa: sai de um modelo ou de uma regra aproximada e ainda não foi validada com alunos.",
};

const SELOS: readonly string[] = ["medido", "regra", "estimativa"];
const TEXTOS = ["nome", "oQueMede", "comoColeta", "atualiza", "naoSignifica", "referencia"] as const;
const MAX_LIMITES = 3;

/** Lista legível do que está errado no catálogo. Vazia = válido. */
export function problemasDoCatalogo(cat: Record<string, unknown>, maxCaracteres: number): string[] {
  const problemas: string[] = [];
  for (const [chave, bruto] of Object.entries(cat)) {
    const e = (bruto ?? {}) as Record<string, unknown>;
    if (!SELOS.includes(e.selo as string)) problemas.push(`${chave}: selo inválido (${String(e.selo)})`);
    for (const campo of TEXTOS) {
      const v = e[campo];
      if (typeof v !== "string" || v.trim() === "") {
        problemas.push(`${chave}: ${campo} vazio`);
      } else if (campo !== "referencia" && v.length > maxCaracteres) {
        problemas.push(`${chave}: ${campo} com ${v.length} caracteres (máximo ${maxCaracteres})`);
      }
    }
    if (e.limites !== undefined) {
      const limites = e.limites;
      if (!Array.isArray(limites)) {
        problemas.push(`${chave}: limites não é lista`);
      } else {
        if (limites.length > MAX_LIMITES) problemas.push(`${chave}: limites com ${limites.length} itens (máximo ${MAX_LIMITES})`);
        limites.forEach((l, i) => {
          if (typeof l !== "string" || l.trim() === "") problemas.push(`${chave}: limites[${i}] vazio`);
          else if (l.length > maxCaracteres) problemas.push(`${chave}: limites[${i}] com ${l.length} caracteres (máximo ${maxCaracteres})`);
        });
      }
    }
  }
  return problemas;
}
