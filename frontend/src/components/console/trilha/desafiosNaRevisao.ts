import {
  PERFIS_BRAINHEX,
  type DesafioCruzadinhaPublico,
  type DesafiosNormalizados,
  type PerfilBrainHex,
  type PropostaDeDesafio,
  type RespostaDaCruzadinha,
} from "../../../../supabase/functions/generate-content-ai/desafios.ts";
import { juntarExistentes, type Existentes } from "./perguntasExistentes";
import type { AiSuggestion } from "./types";

/** O que a revisão dos desafios na fila de sugestões calcula sem tocar no Supabase. */

/**
 * O texto de cada desafio que a IA não pode repetir: o enunciado da lógica e as pistas da
 * cruzadinha. Vai em `existentes.questoes` (o filtro da edge compara o enunciado da lógica com eles,
 * e o prompt lista todos).
 */
export function textosDosDesafios(desafios: unknown[]): string[] {
  const textos: string[] = [];
  for (const d of desafios) {
    if (!d || typeof d !== "object") continue;
    const desafio = d as { tipo?: unknown; enunciado?: unknown; palavras?: unknown };
    if (desafio.tipo === "logica" && typeof desafio.enunciado === "string") {
      textos.push(desafio.enunciado);
    } else if (desafio.tipo === "cruzadinha" && Array.isArray(desafio.palavras)) {
      for (const p of desafio.palavras) {
        const pista = p && typeof p === "object" ? (p as { pista?: unknown }).pista : null;
        if (typeof pista === "string") textos.push(pista);
      }
    }
  }
  return [...new Set(textos)];
}

/**
 * Liga ou desliga um perfil-alvo, na ordem dos 7. O último não sai: a RPC recusa desafio sem
 * perfil, e o professor tira a proposta inteira pela seleção.
 */
export function alternarPerfil(perfis: readonly PerfilBrainHex[], perfil: PerfilBrainHex): PerfilBrainHex[] {
  const tem = perfis.includes(perfil);
  if (tem && perfis.length === 1) return [...perfis];
  const proximo = new Set(perfis);
  if (tem) proximo.delete(perfil);
  else proximo.add(perfil);
  return PERFIS_BRAINHEX.filter((p) => proximo.has(p));
}

export type CasaDaGrade = { letra: string; numero?: number } | null;

/**
 * A grade da miniatura, montada da proposta que já saiu de `montarCruzadinha` na edge: a letra de
 * cada casa vem da resposta (`palavras["<numero><h|v>"]`), e a primeira casa de cada palavra leva o
 * número. Casa vazia é `null`.
 */
export function gradeDaCruzadinha(desafio: DesafioCruzadinhaPublico, resposta: RespostaDaCruzadinha): CasaDaGrade[][] {
  const grade: CasaDaGrade[][] = Array.from({ length: desafio.linhas }, () =>
    Array.from({ length: desafio.colunas }, () => null as CasaDaGrade),
  );
  for (const p of desafio.palavras) {
    const letras = Array.from(resposta.palavras[`${p.numero}${p.direcao}`] ?? "");
    for (let i = 0; i < p.tamanho; i += 1) {
      const l = p.linha + (p.direcao === "v" ? i : 0);
      const c = p.coluna + (p.direcao === "h" ? i : 0);
      if (l >= desafio.linhas || c >= desafio.colunas) continue;
      const atual = grade[l][c];
      grade[l][c] = {
        letra: atual?.letra || letras[i] || "",
        ...(i === 0 ? { numero: p.numero } : atual?.numero !== undefined ? { numero: atual.numero } : {}),
      };
    }
  }
  return grade;
}

/**
 * O `existentes` do pedido de desafios: os desafios já aplicados ao conteúdo e os que esperam
 * revisão na fila vão em `questoes`, na frente do que o tópico já tem. A ordem importa no teto
 * (`MAX_EXISTENTES`): quem sobra é a pergunta do tópico, não o desafio que o modelo repetiria.
 */
export function existentesDosDesafios(
  base: Partial<Existentes> | undefined,
  aplicados: string[],
  naFila: string[],
): Existentes {
  return juntarExistentes({ questoes: [...aplicados, ...naFila] }, base);
}

export type AvisoDosDesafios = { tipo: "warning" | "info"; texto: string; descricao?: string };

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/**
 * O aviso do pedido de desafios, que corre em paralelo com o de cards e atividades e nunca o
 * derruba. `null` quando não há o que dizer.
 */
export function avisoDosDesafios(
  resultado: PromiseSettledResult<DesafiosNormalizados>,
  haCardsOuAtividades: boolean,
): AvisoDosDesafios | null {
  if (resultado.status === "rejected") {
    const motivo = resultado.reason instanceof Error ? resultado.reason.message : "";
    return {
      tipo: "warning",
      texto: haCardsOuAtividades
        ? "Os desafios não vieram desta vez; os cards e as atividades estão abaixo."
        : "Os desafios não vieram desta vez.",
      ...(motivo ? { descricao: motivo } : {}),
    };
  }
  const { desafios, descartados } = resultado.value;
  if (desafios.length > 0 || descartados <= 0) return null;
  return {
    tipo: "info",
    texto: `A IA propôs ${descartados} ${plural(descartados, "desafio", "desafios")}, mas nenhum passou na conferência (seriam recusados ao aplicar ou entregavam a resposta). Peça de novo para tentar outros.`,
  };
}

/** As mensagens do "Aplicar" dos desafios: quantos viraram missão e o que o banco recusou. */
export function mensagensDosDesafiosCriados({ criados, falhas }: { criados: number; falhas: string[] }): {
  sucesso?: string;
  falha?: string;
  detalhes?: string;
} {
  return {
    ...(criados > 0
      ? { sucesso: `${criados} ${plural(criados, "desafio virou", "desafios viraram")} missão da turma.` }
      : {}),
    ...(falhas.length > 0
      ? {
        falha: `${falhas.length} ${plural(falhas.length, "desafio não foi criado", "desafios não foram criados")}.`,
        detalhes: falhas.join("\n"),
      }
      : {}),
  };
}

/** Um item da fila de sugestões. `desafios` vem de um pedido separado, só para conteúdo salvo. */
export type SugestaoNaFila = {
  conteudoId: number | null;
  titulo: string;
  sugestao: AiSuggestion & { desafios?: PropostaDeDesafio[] };
};

/**
 * O item que entra na fila depois dos dois pedidos (`content` e `desafios`), que correm em paralelo:
 * a falha de um não tira o que o outro trouxe. `null` quando nada veio.
 */
export function itemDaFila(
  conteudoId: number | null,
  titulo: string,
  doConteudo: PromiseSettledResult<AiSuggestion | null>,
  dosDesafios: PromiseSettledResult<DesafiosNormalizados>,
): SugestaoNaFila | null {
  const sugestao = doConteudo.status === "fulfilled" ? doConteudo.value : null;
  const cards = sugestao?.cards ?? [];
  const atividades = sugestao?.atividades ?? [];
  const desafios = dosDesafios.status === "fulfilled" ? dosDesafios.value.desafios : [];
  if (cards.length === 0 && atividades.length === 0 && desafios.length === 0) return null;
  return { conteudoId, titulo, sugestao: { ...(sugestao ?? {}), cards, atividades, desafios } };
}

/**
 * O que o "Aplicar" cria: os selecionados de cada lista, na ordem da lista. Nos desafios, só os
 * perfis mudam no console; o resto da proposta vai como a edge mandou.
 */
export function loteDoAplicar(
  sugestao: SugestaoNaFila["sugestao"],
  selecionados: { cards: Set<number>; atividades: Set<number>; desafios: Set<number> },
  perfisDosDesafios: PerfilBrainHex[][],
): { cards: AiSuggestion["cards"]; atividades: AiSuggestion["atividades"]; desafios: PropostaDeDesafio[] } {
  const emOrdem = (s: Set<number>) => Array.from(s).sort((a, b) => a - b);
  return {
    cards: emOrdem(selecionados.cards).flatMap((i) => (sugestao.cards[i] ? [sugestao.cards[i]] : [])),
    atividades: emOrdem(selecionados.atividades).flatMap((i) => (sugestao.atividades[i] ? [sugestao.atividades[i]] : [])),
    desafios: emOrdem(selecionados.desafios).flatMap((i) => {
      const proposta = sugestao.desafios?.[i];
      return proposta ? [{ ...proposta, perfis: perfisDosDesafios[i] ?? proposta.perfis }] : [];
    }),
  };
}

/**
 * A fila depois do "Aplicar". Sem recusa, ela avança. Com recusa, a cabeça vira um item novo só com
 * os desafios recusados (do lote, com os perfis que o professor escolheu): cards e atividades saem
 * porque já foram criados, e o professor tenta de novo ou pula.
 */
export function filaDepoisDoAplicar(
  fila: SugestaoNaFila[],
  loteDeDesafios: PropostaDeDesafio[],
  recusados: number[],
): SugestaoNaFila[] {
  const [cabeca, ...resto] = fila;
  if (!cabeca) return fila;
  const ficam = recusados.flatMap((i) => (loteDeDesafios[i] ? [loteDeDesafios[i]] : []));
  if (ficam.length === 0) return resto;
  return [{ ...cabeca, sugestao: { ...cabeca.sugestao, cards: [], atividades: [], desafios: ficam } }, ...resto];
}
