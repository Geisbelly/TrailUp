/**
 * Questão corrigida no banco (`20261108_01`, fase 2 de
 * docs/analises/2026-11-08-gabarito-fora-do-app-do-aluno.md). Puro, para o `node --test`.
 *
 * O app não usa mais o gabarito para corrigir questão da turma. `questao_responder` corrige,
 * pontua e grava; o gabarito só chega quando o app o mostraria (acertou, ou modo imediato), e
 * `questao_revelar_gabarito` é o "ver gabarito". A questão personalizada local (id negativo, sem
 * linha em `questoes`) continua corrigida no aparelho.
 */

/** Por que a resposta valeu menos: a ordem e os fatores são os de `fn_questao_registrar_resposta`. */
export type RegraDaPontuacao = "primeira" | "viu_gabarito" | "resposta_repetida" | "nova_tentativa";

export type RespostaCorrigida = {
  correta: boolean;
  /** Já com o multiplicador do banco. */
  acertosPercentual: number;
  regra: RegraDaPontuacao;
  tentativa: number | null;
  erros: number;
  gabaritoLiberado: boolean;
  /** Só quando `gabaritoLiberado`. */
  respostaCorreta: string | null;
};

export type GabaritoRevelado = {
  correta: boolean;
  erros: number;
  gabaritoLiberado: boolean;
  respostaCorreta: string | null;
};

const REGRAS: readonly RegraDaPontuacao[] = ["primeira", "viu_gabarito", "resposta_repetida", "nova_tentativa"];

function objeto(bruto: unknown): Record<string, unknown> {
  return bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {};
}

function inteiro(valor: unknown): number | null {
  const n = Number(valor);
  return valor !== null && valor !== undefined && Number.isFinite(n) ? Math.round(n) : null;
}

function textoOuNulo(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor);
  return texto.trim() ? texto : null;
}

/** O retorno de `questao_responder` (e o `registro` da correção por IA). */
export function lerRespostaCorrigida(bruto: unknown): RespostaCorrigida {
  const linha = objeto(bruto);
  const correta = linha.correta === true;
  // Sem `acertos_percentual` é a `questao_responder` de antes da `20261108_01` (o deploy da web
  // pode chegar minutos antes de a API subir com a migration): vale 100/0, como ela gravou.
  const percentual =
    linha.acertos_percentual === undefined || linha.acertos_percentual === null
      ? correta
        ? 100
        : 0
      : Number(linha.acertos_percentual);
  const regra = REGRAS.includes(linha.regra as RegraDaPontuacao) ? (linha.regra as RegraDaPontuacao) : "primeira";
  const liberado = linha.gabarito_liberado === true;
  return {
    correta,
    acertosPercentual: Number.isFinite(percentual) ? Math.max(0, Math.min(100, percentual)) : 0,
    regra,
    tentativa: inteiro(linha.tentativa),
    erros: inteiro(linha.erros) ?? 0,
    gabaritoLiberado: liberado,
    respostaCorreta: liberado ? textoOuNulo(linha.resposta_correta) : null,
  };
}

/** O retorno de `questao_revelar_gabarito`. */
export function lerGabaritoRevelado(bruto: unknown): GabaritoRevelado {
  const linha = objeto(bruto);
  const liberado = linha.gabarito_liberado === true;
  return {
    correta: linha.correta === true,
    erros: inteiro(linha.erros) ?? 0,
    gabaritoLiberado: liberado,
    respostaCorreta: liberado ? textoOuNulo(linha.resposta_correta) : null,
  };
}

/**
 * O fator de pontos da atividade que o app aplicava sozinho (`multiplicador` em
 * QuestionActivity), agora a partir da regra que o banco decidiu. Errar vale 0.
 */
export function fatorDaRegra(regra: RegraDaPontuacao, fatorDaNovaTentativa: number): number {
  switch (regra) {
    case "viu_gabarito":
      return 0.2;
    case "resposta_repetida":
      return 0.5;
    case "nova_tentativa":
      return fatorDaNovaTentativa;
    default:
      return 1;
  }
}

/**
 * A questão vem do banco? Só ela é corrigida pela RPC. A personalizada local tem id negativo
 * (`stableNegativeId`) e nenhuma linha em `questoes`.
 */
export function questaoDoBanco(questaoId: unknown, personalizadaLocal: boolean): questaoId is number {
  const id = Number(questaoId);
  return !personalizadaLocal && Number.isSafeInteger(id) && id > 0;
}
