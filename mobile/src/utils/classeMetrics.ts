import { ClasseResumo } from "@/models/ClasseResumo";
import { Classe } from "@/models/Classe";
import { isTopicoConcluido, progressoCanonicoTopico } from './topicoProgress';

type QuestaoLike = {
  resposta_aluno?: string | null;
  correta_aluno?: boolean | null;
  acertos_percentual?: number | null;
  tempo_gasto_seg?: number | null;
};

type AtividadeLike = {
  id: number;
  status?: string | null;
  percentual_concluido?: number | null;
  acertos_percentual?: number | null;
  tempo_gasto_min?: number | null;
  questoes?: QuestaoLike[];
};

type ConteudoLike = {
  status?: string | null;
  percentual_concluido?: number | null;
  tempo_gasto_min?: number | null;
};

type TopicoLike = {
  status?: string | null;
  percentual_concluido?: number | null;
  tempo_gasto_min?: number | null;
  conteudos: ConteudoLike[];
  atividades: AtividadeLike[];
};

export type ClasseAcademicMetrics = {
  totalTopicos: number;
  topicosConcluidos: number;
  topicosEmAndamento: number;
  totalConteudos: number;
  conteudosConcluidos: number;
  totalAtividades: number;
  atividadesConcluidas: number;
  progressPct: number;
  isComplete: boolean;
  tempoTotalMin: number;
  /** Tempo por escopo. Existiam apenas dentro do calculo; agora sao expostos
   *  para a tela poder detalhar em vez de mostrar um total opaco. */
  tempoTopicoMin: number;
  tempoConteudoMin: number;
  tempoAtividadeMin: number;
  tempoMedioPorAtividade: number;
  acertosPercentual: number;
  atividadesConcluidasIds: number[];
};

function roundMetric(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clampPercent(value?: number | null) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function isDone(status?: string | null, percentual?: number | null) {
  return String(status ?? "").toLowerCase().includes("concl") || Number(percentual ?? 0) >= 100;
}

function isDoing(status?: string | null, percentual?: number | null) {
  if (isDone(status, percentual)) return false;
  return String(status ?? "").toLowerCase().includes("andamento") || Number(percentual ?? 0) > 0;
}

function resolveAtividadeAcertos(atividade: AtividadeLike) {
  const direct = Number(atividade.acertos_percentual ?? NaN);
  if (Number.isFinite(direct)) {
    return clampPercent(direct);
  }

  const questoes = Array.isArray(atividade.questoes) ? atividade.questoes : [];
  const valores = questoes
    .map((questao) => {
      const percentual = Number(questao?.acertos_percentual ?? NaN);
      if (Number.isFinite(percentual)) {
        return clampPercent(percentual);
      }
      if (questao?.correta_aluno === true) return 100;
      if (questao?.correta_aluno === false) return 0;
      return null;
    })
    .filter((value): value is number => value != null);

  if (!valores.length) return null;
  return roundMetric(valores.reduce((sum, value) => sum + value, 0) / valores.length);
}

function resolveAtividadeTempoMin(atividade: AtividadeLike) {
  const direct = Number(atividade.tempo_gasto_min ?? NaN);
  if (Number.isFinite(direct) && direct > 0) {
    return Math.max(0, direct);
  }

  const questoes = Array.isArray(atividade.questoes) ? atividade.questoes : [];
  const totalSeg = questoes.reduce((sum, questao) => {
    const tempo = Number(questao?.tempo_gasto_seg ?? 0);
    return sum + (Number.isFinite(tempo) ? Math.max(0, tempo) : 0);
  }, 0);

  return totalSeg > 0 ? roundMetric(totalSeg / 60) : 0;
}

export function buildClasseAcademicMetrics(classe: Classe | null): ClasseAcademicMetrics {
  const topicos = (classe?.topicos ?? []) as TopicoLike[];
  const totalTopicos = topicos.length;
  const topicosConcluidos = topicos.filter((topico) =>
    isTopicoConcluido(topico)
  ).length;
  const topicosEmAndamento = topicos.filter((topico) =>
    isDoing(topico.status, topico.percentual_concluido)
  ).length;

  const conteudos = topicos.flatMap((topico) => topico.conteudos ?? []);
  const atividades = topicos.flatMap((topico) => topico.atividades ?? []);

  const totalConteudos = conteudos.length;
  const conteudosConcluidos = conteudos.filter((conteudo) =>
    isDone(conteudo.status, conteudo.percentual_concluido)
  ).length;
  const totalAtividades = atividades.length;
  const atividadesConcluidas = atividades.filter((atividade) =>
    isDone(atividade.status, atividade.percentual_concluido ?? null)
  ).length;

  // Material do professor é bônus quando há personalização. Não substitui
  // os percentuais derivados pelo banco, nem oculta progresso parcial.
  const percentualResumo = classe?.resumo?.porcentagemConcluida;
  const progressPct =
    percentualResumo != null && Number.isFinite(Number(percentualResumo))
      ? clampPercent(percentualResumo)
      : totalTopicos > 0
      ? topicos.reduce((sum, topico) => sum + (progressoCanonicoTopico(topico) ?? 0), 0) / totalTopicos
      : 0;

  const tempoTopicoMin = topicos.reduce((sum, topico) => {
    const tempo = Number(topico.tempo_gasto_min ?? 0);
    return sum + (Number.isFinite(tempo) ? Math.max(0, tempo) : 0);
  }, 0);
  const tempoAtividadeMin = atividades.reduce(
    (sum, atividade) => sum + resolveAtividadeTempoMin(atividade),
    0
  );
  // Os escopos se sobrepõem: use o total canônico; só estime a partir dos
  // itens quando o carregamento não trouxe nenhum total de classe/tópico.
  const tempoConteudoMin = conteudos.reduce((sum, conteudo) => {
    const tempo = Number((conteudo as any)?.tempo_gasto_min ?? 0);
    return sum + (Number.isFinite(tempo) ? Math.max(0, tempo) : 0);
  }, 0);
  // Content and activity scopes overlap (a question may be linked to a
  // content). The stored class/topic totals are authoritative, including 0.
  const tempoResumo = classe?.resumo?.tempoGastoMin;
  const hasTopicTime = topicos.some((topico) => topico.tempo_gasto_min != null);
  const tempoTotalMin = roundMetric(
    tempoResumo != null && Number.isFinite(Number(tempoResumo))
      ? Math.max(0, Number(tempoResumo))
      : hasTopicTime ? tempoTopicoMin : Math.max(tempoConteudoMin, tempoAtividadeMin),
  );

  const acuracias = atividades
    .map(resolveAtividadeAcertos)
    .filter((value): value is number => value != null);
  const acertosPercentual = acuracias.length
    ? roundMetric(acuracias.reduce((sum, value) => sum + value, 0) / acuracias.length)
    : 0;

  const tempoMedioPorAtividade =
    atividadesConcluidas > 0
      ? roundMetric(tempoAtividadeMin / atividadesConcluidas)
      : 0;

  return {
    totalTopicos,
    topicosConcluidos,
    topicosEmAndamento,
    totalConteudos,
    conteudosConcluidos,
    totalAtividades,
    atividadesConcluidas,
    progressPct,
    isComplete: classe?.resumo?.isComplete ?? (totalTopicos > 0 && progressPct >= 100),
    tempoTotalMin,
    tempoTopicoMin: roundMetric(tempoTopicoMin),
    tempoConteudoMin: roundMetric(tempoConteudoMin),
    tempoAtividadeMin: roundMetric(tempoAtividadeMin),
    tempoMedioPorAtividade,
    acertosPercentual,
    atividadesConcluidasIds: atividades
      .filter((atividade) => isDone(atividade.status, atividade.percentual_concluido ?? null))
      .map((atividade) => Number(atividade.id))
      .filter((id) => Number.isFinite(id)),
  };
}

export function buildClasseResumoFallback(
  classe: Classe | null,
  baseResumo: ClasseResumo | null
): ClasseResumo | null {
  if (!classe && !baseResumo) return null;

  const metrics = buildClasseAcademicMetrics(classe);
  const hasAcademicStructure =
    metrics.totalTopicos > 0 || metrics.totalConteudos > 0 || metrics.totalAtividades > 0;
  const alunoId = baseResumo?.aluno_id ?? classe?.aluno_id;
  const classeId = baseResumo?.classe_id ?? classe?.classe_id;

  if (!alunoId || classeId == null) {
    return baseResumo ?? null;
  }

  return {
    aluno_id: alunoId,
    classe_id: classeId,
    materia_nome: baseResumo?.materia_nome ?? null,
    materia_descricao: baseResumo?.materia_descricao ?? null,
    professor_nome: baseResumo?.professor_nome ?? null,
    professor_descricao: baseResumo?.professor_descricao ?? null,
    notaMedia: baseResumo?.notaMedia ?? null,
    tempoMedioPorAtividade:
      baseResumo?.tempoMedioPorAtividade ??
      (hasAcademicStructure ? metrics.tempoMedioPorAtividade : 0),
    acertosPercentual:
      baseResumo?.acertosPercentual ??
      (hasAcademicStructure ? metrics.acertosPercentual : 0),
    // O percentual da campanha e' o do BANCO. `trailup_recalcular_topico_aluno`
    // conta sobre o material personalizado; a conta local so' enxerga o material
    // do professor, e vinha ganhando -- o nome desta funcao diz "fallback", mas
    // a ordem estava invertida. Local so' quando o banco nao tem numero.
    porcentagemConcluida:
      baseResumo?.porcentagemConcluida ??
      (hasAcademicStructure ? metrics.progressPct : 0),
    ultimaAtividade:
      baseResumo?.ultimaAtividade ??
      (hasAcademicStructure
        ? metrics.atividadesConcluidasIds[metrics.atividadesConcluidasIds.length - 1] ?? null
        : null),
    tempoGastoMin:
      baseResumo?.tempoGastoMin ??
      (hasAcademicStructure ? metrics.tempoTotalMin : 0),
    isComplete:
      baseResumo?.isComplete ??
      (hasAcademicStructure ? metrics.isComplete : false),
    atividadesConcluidas:
      baseResumo?.atividadesConcluidas ??
      (hasAcademicStructure ? metrics.atividadesConcluidasIds : []),
    recomendacaoTrilha: baseResumo?.recomendacaoTrilha ?? null,
    modoOperacao: baseResumo?.modoOperacao ?? null,
    insights: baseResumo?.insights ?? null,
    perfisDetectados: baseResumo?.perfisDetectados ?? null,
  };
}
