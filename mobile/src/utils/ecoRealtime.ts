/**
 * O que fazer com um evento do Realtime em `conteudo_aluno`, `atividade_aluno` e `topico_aluno`.
 *
 * A trilha escuta as três tabelas, filtradas pelo próprio aluno, para refletir o progresso na
 * hora. Só que o próprio app escreve nelas a cada minuto com um material aberto: o relógio de
 * estudo grava a visita (`registrarVisita`, `payloadDeVisitaDoTopico`), que troca
 * `ultima_visualizacao`/`updated_at`, e a telemetria regrava `tempo_gasto_min` por gatilho. Cada
 * uma dessas escritas volta como evento, e cada evento relia a turma inteira
 * (`vw_aluno_classe_detalhado` + resumo) depois de 500 ms, sem limite nenhum. Foi essa leitura que
 * estourou o `statement_timeout` em 20/11, com o banco ocioso, e é ela que mantinha a recarga de
 * minuto em minuto mesmo depois do limitador de `recargaPorTempo.ts`.
 *
 * O evento não traz o valor anterior (as tabelas não têm `REPLICA IDENTITY FULL`), então a
 * comparação é contra o que a tela já mostra: se `status` e `percentual_concluido` chegam iguais,
 * nada que a trilha desenha a partir deles mudou e o evento é eco. Na dúvida (linha que a tela não
 * conhece, evento sem esses campos, INSERT ou DELETE), conta como mudança: errar para o lado de
 * reler custa uma leitura; errar para o outro lado deixa a trilha travada.
 */

export type TabelaDeProgresso = 'conteudo_aluno' | 'atividade_aluno' | 'topico_aluno';

export type EventoDeProgresso = {
  eventType?: string | null;
  new?: Record<string, unknown> | null;
};

export type EstadoDeProgresso = {
  status: string | null;
  percentual_concluido: number | null;
};

type ItemLocal = { id: number } & EstadoDeProgresso;

export type TopicoLocal = ItemLocal & {
  conteudos: ItemLocal[];
  atividades: ItemLocal[];
};

/** `não iniciado`, `nao iniciado` e `Concluído` são o mesmo estado para esta comparação. */
export function normalizarStatus(status: unknown): string | null {
  if (status == null) return null;
  const texto = String(status)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  return texto || null;
}

function normalizarPercentual(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero) : null;
}

const COLUNA_DO_ITEM: Record<TabelaDeProgresso, string> = {
  conteudo_aluno: 'conteudo_id',
  atividade_aluno: 'atividade_id',
  topico_aluno: 'topico_id',
};

/** A linha que a tela mostra para o item do evento, ou `null` se ela não o conhece. */
export function estadoLocalDoEvento(
  tabela: TabelaDeProgresso,
  linha: Record<string, unknown> | null | undefined,
  topicos: readonly TopicoLocal[],
): EstadoDeProgresso | null {
  const id = Number(linha?.[COLUNA_DO_ITEM[tabela]]);
  if (!Number.isFinite(id)) return null;
  for (const topico of topicos) {
    if (tabela === 'topico_aluno') {
      if (topico.id === id) return topico;
      continue;
    }
    const itens = tabela === 'conteudo_aluno' ? topico.conteudos : topico.atividades;
    const item = itens.find((candidato) => candidato.id === id);
    if (item) return item;
  }
  return null;
}

export function eventoMudaProgresso(
  evento: EventoDeProgresso,
  local: EstadoDeProgresso | null,
): boolean {
  if (evento.eventType !== 'UPDATE') return true;
  const novo = evento.new;
  if (!novo || !local) return true;
  if (!('status' in novo) && !('percentual_concluido' in novo)) return true;

  if ('status' in novo && normalizarStatus(novo.status) !== normalizarStatus(local.status)) {
    return true;
  }
  if (
    'percentual_concluido' in novo &&
    normalizarPercentual(novo.percentual_concluido) !== normalizarPercentual(local.percentual_concluido)
  ) {
    return true;
  }
  return false;
}

/**
 * Para quem não guarda o estado por item (os portões contam itens concluídos numa view): lembra o
 * último `status` visto por linha e diz se este evento o trocou. O primeiro evento de cada linha
 * conta como troca, porque não há com o que comparar.
 */
export function criarDetectorDeTrocaDeStatus() {
  const visto = new Map<string, string | null>();
  return (tabela: TabelaDeProgresso, evento: EventoDeProgresso): boolean => {
    if (evento.eventType !== 'UPDATE') return true;
    const novo = evento.new;
    const id = novo?.[COLUNA_DO_ITEM[tabela]];
    if (!novo || id == null || !('status' in novo)) return true;
    const chave = `${tabela}:${String(id)}`;
    const status = normalizarStatus(novo.status);
    const trocou = !visto.has(chave) || visto.get(chave) !== status;
    visto.set(chave, status);
    return trocou;
  };
}
