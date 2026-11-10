// O professor confere o gabarito antes de salvar, com o mesmo código da edge (spec B, PR 4).
//
// `conferir.ts` é o núcleo da `questao-conferir-resposta`, puro e com o mathjs por parâmetro; o
// console importa o arquivo da edge, não uma cópia, e o mathjs da mesma versão exata
// (`package.json` e `npm:mathjs@15.2.0`). Assim "confere aqui" quer dizer "confere no aluno".
// O mathjs é grande: só é carregado quando o professor abre um gabarito desses (`carregarMathjs`).

import {
  conferir,
  EsperadaInvalida,
  lerValor,
  type MathJs,
  type Motivo,
} from "../../supabase/functions/questao-conferir-resposta/conferir.ts";

import type { GabaritoDoServidor } from "@/components/console/trilha/gabaritoDoServidor";

export type ResultadoDoExemplo = { correta: boolean; motivo?: Motivo } | { esperadaInvalida: true };

/** O valor como a edge o entendeu (`10 km / h`), ou `null` quando ela não lê. */
export function previaDoValorCom(math: MathJs, texto: string): string | null {
  const valor = lerValor(math, texto);
  if (!valor) return null;
  return valor.unidade ? String(valor.unidade) : String(valor.numero);
}

const TIPO_DO_FORMATO = { numeric: "numerica", expression: "expressao" } as const;

/**
 * Confere uma resposta de exemplo contra o gabarito montado. A semente é fixa: o aluno usa o id da
 * questão, e uma expressão equivalente confere com qualquer semente.
 */
export function conferirExemploCom(
  math: MathJs,
  formato: "numeric" | "expression",
  gabarito: Pick<GabaritoDoServidor, "configResposta" | "respostaCorreta" | "criterios">,
  resposta: string,
): ResultadoDoExemplo {
  const objeto = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  try {
    return conferir(
      math,
      {
        tipo: TIPO_DO_FORMATO[formato],
        respostaEsperada: gabarito.respostaCorreta.trim(),
        criterios: objeto(gabarito.criterios),
        configResposta: objeto(gabarito.configResposta),
      },
      resposta,
      1,
    );
  } catch (erro) {
    if (erro instanceof EsperadaInvalida) return { esperadaInvalida: true };
    throw erro;
  }
}

let mathjs: Promise<MathJs> | null = null;

export function carregarMathjs(): Promise<MathJs> {
  mathjs ??= import("mathjs").then(({ all, create }) => create(all) as unknown as MathJs);
  return mathjs;
}
