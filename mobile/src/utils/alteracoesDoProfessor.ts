/**
 * Alterações do professor em itens que o aluno já viu ou fez (`alteracao_aluno`, migração
 * `20261101_12`): o que a tela do tópico precisa saber, sem I/O. A leitura e a marca de visto
 * ficam em `services/alteracoesProfessor.ts`.
 *
 * A revisão é uma camada à parte e nunca mexe em `atividade_aluno.status`: o progresso continua
 * concluído, e a nota de antes fica guardada no banco até o aluno refazer (vale a maior).
 */

export type DecisaoEfetiva = 'pendente_analise' | 'cosmetica' | 'destacar' | 'revisar';

export type LinhaAlteracaoAluno = {
  id: number;
  conteudo_id: number | null;
  atividade_id: number | null;
  topico_id: number;
  decisao_efetiva: DecisaoEfetiva | string | null;
  resumo: string | null;
  vista_em: string | null;
  revisada_em: string | null;
};

export type Destaque = { resumo: string | null };

export type AlteracoesDoAluno = {
  /** Item com mudança que o aluno ainda não abriu. Chave de `chaveDoItem`. */
  destaques: Map<string, Destaque>;
  /** Atividades que a IA (ou o professor) pediu para refazer e ainda não foram refeitas. */
  revisoesPendentes: Map<number, Destaque>;
};

export const SEM_ALTERACOES: AlteracoesDoAluno = {
  destaques: new Map(),
  revisoesPendentes: new Map(),
};

export const COLUNAS_ALTERACAO_ALUNO =
  'id, conteudo_id, atividade_id, topico_id, decisao_efetiva, resumo, vista_em, revisada_em';

export function chaveDoItem(tipo: 'conteudo' | 'atividade', id: number | string): string {
  return `${tipo}:${Number(id)}`;
}

function resumoMaisRecente(atual: Destaque | undefined, resumo: string | null): Destaque {
  return { resumo: resumo?.trim() ? resumo.trim() : atual?.resumo ?? null };
}

/**
 * Reduz as linhas ao que a tela precisa. `pendente_analise` e `cosmetica` não aparecem: sem
 * decisão não se inventa destaque, e erro de digitação não é novidade. Linhas em ordem de id
 * (a mais nova por último), para o resumo da mudança mais recente ganhar.
 */
export function resumirAlteracoes(linhas: LinhaAlteracaoAluno[] | null | undefined): AlteracoesDoAluno {
  const destaques = new Map<string, Destaque>();
  const revisoesPendentes = new Map<number, Destaque>();
  const ordenadas = [...(linhas ?? [])].sort((a, b) => Number(a.id) - Number(b.id));
  for (const linha of ordenadas) {
    const decisao = String(linha.decisao_efetiva ?? '');
    if (decisao !== 'destacar' && decisao !== 'revisar') continue;
    const chave =
      linha.atividade_id != null
        ? chaveDoItem('atividade', linha.atividade_id)
        : linha.conteudo_id != null
        ? chaveDoItem('conteudo', linha.conteudo_id)
        : null;
    if (!chave) continue;
    if (!linha.vista_em) {
      destaques.set(chave, resumoMaisRecente(destaques.get(chave), linha.resumo));
    }
    if (decisao === 'revisar' && !linha.revisada_em && linha.atividade_id != null) {
      const id = Number(linha.atividade_id);
      revisoesPendentes.set(id, resumoMaisRecente(revisoesPendentes.get(id), linha.resumo));
    }
  }
  return { destaques, revisoesPendentes };
}

/** Quantos itens de um tópico têm destaque, para o resumo do tópico. */
export function contarDestaquesDoTopico(
  linhas: LinhaAlteracaoAluno[] | null | undefined,
  topicoId: number
): number {
  const doTopico = (linhas ?? []).filter((l) => Number(l.topico_id) === Number(topicoId));
  return resumirAlteracoes(doTopico).destaques.size;
}
