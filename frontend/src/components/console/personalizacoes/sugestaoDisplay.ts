import type {
  SugestaoEfetividade,
  SugestaoHistoricoItem,
} from "./personalizacoesApi";

/** Rotulos PT-BR dos formatos canonicos do motor de sugestao. */
const ROTULO_FORMATO: Record<string, string> = {
  markdown: "Texto",
  audio: "Áudio",
  apresentacao: "Slides",
  cards: "Cards",
  pdf: "PDF",
};

export function rotuloDoFormato(formato: string | null | undefined): string {
  const chave = String(formato ?? "").trim().toLowerCase();
  if (!chave) return "—";
  return ROTULO_FORMATO[chave] ?? chave;
}

const ROTULO_ACAO: Record<string, string> = {
  criada: "Criada",
  revisada: "Revisada",
  mantida: "Mantida",
};

export function rotuloDaAcao(acao: string | null | undefined): string {
  const chave = String(acao ?? "").trim().toLowerCase();
  return ROTULO_ACAO[chave] ?? (chave || "—");
}

/**
 * Percentual a partir de uma fracao 0..1.
 *
 * `null` vira travessao, nunca "0%": a API usa `null` para "nao deu para medir",
 * e mostrar zero ali seria afirmar que o aluno ignorou a sugestao inteira.
 */
export function formatarFracao(valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(Number(valor))) return "—";
  return `${Math.round(Number(valor) * 100)}%`;
}

/** Percentual que ja vem na escala 0..100 (desempenho). */
export function formatarPercentual(valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(Number(valor))) return "—";
  return `${Math.round(Number(valor))}%`;
}

export function formatarDelta(valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(Number(valor))) return "—";
  const arredondado = Math.round(Number(valor));
  return arredondado > 0 ? `+${arredondado}` : String(arredondado);
}

export type LeituraDeEfetividade = {
  rotulo: string;
  valor: string;
  /** Ressalva a exibir junto do numero; null quando ele se sustenta sozinho. */
  ressalva: string | null;
};

/**
 * Traduz o resumo de efetividade em linhas exibiveis.
 *
 * A regra que atravessa tudo: **numero sem amostra vem com a ressalva colada
 * nele**. A API ja devolve `confiavel` e o `n`; esconder isso na interface
 * transformaria "duas observacoes" em "conclusao", que e exatamente o erro que o
 * professor nao tem como detectar sozinho.
 */
export function leiturasDeEfetividade(
  efetividade: SugestaoEfetividade | null | undefined
): LeituraDeEfetividade[] {
  const desempenho = efetividade?.desempenho ?? {};
  const revisoes = efetividade?.revisoes ?? {};
  const churn = efetividade?.churn ?? {};

  const nSeguiu = Number(desempenho.n_seguiu ?? 0);
  const nIgnorou = Number(desempenho.n_ignorou ?? 0);
  const comparadas = Number(revisoes.revisoes_comparadas ?? 0);
  const nAderencia = Number(efetividade?.n_aderencia ?? 0);

  return [
    {
      rotulo: "Aderência média",
      valor: formatarFracao(efetividade?.aderencia_media),
      ressalva: nAderencia > 0 ? null : "sem período medido ainda",
    },
    {
      rotulo: "Começou pelo formato aconselhado",
      valor: formatarFracao(efetividade?.taxa_seguiu_inicio),
      ressalva: nAderencia > 0 ? null : "sem período medido ainda",
    },
    {
      rotulo: "Desempenho seguindo × ignorando",
      valor: desempenho.confiavel
        ? `${formatarDelta(desempenho.diferenca)} pts`
        : "—",
      ressalva: desempenho.confiavel
        ? null
        : `amostra insuficiente (${nSeguiu} seguiu / ${nIgnorou} ignorou)`,
    },
    {
      rotulo: "Efeito das revisões",
      valor: comparadas > 0 ? `${formatarDelta(revisoes.delta_medio)} pts` : "—",
      ressalva: revisoes.confiavel
        ? null
        : comparadas > 0
        ? `${comparadas} revisão(ões) comparada(s) — pouco para concluir`
        : "nenhuma revisão comparável ainda",
    },
    {
      rotulo: "Revisões por tópico",
      valor:
        churn.revisoes_por_alvo == null
          ? "—"
          : String(Math.round(Number(churn.revisoes_por_alvo) * 100) / 100),
      // Churn alto nao e personalizacao fina: e limiar mal calibrado, e o
      // material fica trocando de lugar sem o aluno perceber por que.
      ressalva:
        Number(churn.revisoes_por_alvo ?? 0) >= 2
          ? "alto — o material está trocando de lugar com frequência"
          : null,
    },
  ];
}

/**
 * Ordena o historico do mais recente para o mais antigo.
 *
 * A API ja devolve nessa ordem; reordenar aqui protege a tela de uma mudanca de
 * contrato silenciosa, e o custo e uma comparacao por linha.
 */
export function historicoMaisRecentePrimeiro(
  historico: SugestaoHistoricoItem[] | null | undefined
): SugestaoHistoricoItem[] {
  return [...(historico ?? [])].sort((esquerda, direita) => {
    const porTopico = Number(direita.topico_id ?? 0) - Number(esquerda.topico_id ?? 0);
    if (porTopico !== 0) return porTopico;
    return Number(direita.versao ?? 0) - Number(esquerda.versao ?? 0);
  });
}
