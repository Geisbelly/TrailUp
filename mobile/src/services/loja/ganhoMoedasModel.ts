// "Como ganhar" da Loja na web em tela larga (#346, protótipo v4, 12-loja.md
// §4.1): quanto cada ação rende na turma. Puro, para rodar em Node.
// O valor global vem de `eventos_pontuacao.moedas`; a turma sobrepõe em
// `eventos_pontuacao_classe.moedas` (NULL herda o global) — a mesma regra de
// `fn_moedas_do_evento` (20260912_02_ganho_de_moedas.py).

export const ACOES_QUE_RENDEM: { tipo: string; rotulo: string }[] = [
  { tipo: "conteudo_concluido", rotulo: "Concluir um conteúdo" },
  { tipo: "atividade_concluida", rotulo: "Concluir uma atividade" },
  { tipo: "atividade_acertada", rotulo: "Acertar uma atividade" },
  { tipo: "atividade_revisada", rotulo: "Revisar uma atividade" },
];

type Linha = { tipo: string; moedas: number | string | null };

export function resolverGanhoMoedas(globais: readonly Linha[], daTurma: readonly Linha[]) {
  const numero = (v: Linha["moedas"]) => (v === null || v === undefined || v === "" ? null : Number(v));
  return ACOES_QUE_RENDEM.map(({ tipo, rotulo }) => {
    const turma = numero(daTurma.find((l) => l.tipo === tipo)?.moedas ?? null);
    const global = numero(globais.find((l) => l.tipo === tipo)?.moedas ?? null);
    const moedas = turma ?? global ?? 0;
    return { tipo, rotulo, moedas: Number.isFinite(moedas) ? moedas : 0 };
  });
}
