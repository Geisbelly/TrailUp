import { chaveDoPerfil } from "../perfilCores";
import { linhaDoExemplo, percentuaisDosTopicos, TRILHA_DE_EXEMPLO, TOTAL_DE_ALUNOS, type Linha } from "../exemploDaPesquisa";
import type { MomentoDeCuidado } from "./cuidado";
import type { EventoDoApp, SessaoDeTopico } from "./jornada";
import {
  PERFIS_COM_CRONOMETRO,
  regraDoCronometro,
  resumirTentativas,
  TIPOS_DO_BONUS,
  type BonusPago,
  type LinhaDeTentativa,
} from "./tentativas";
import type { EvolucaoAluno, Personalizacao, ProgressoItem } from "./tipos";
import type { DadosDoCuidado } from "./useCuidadoDoAluno";
import type { DadosDaJornada } from "./useJornadaDoAluno";
import type { TentativasDoAluno } from "./useTentativasDoAluno";

/**
 * O detalhe dos alunos de exemplo da turma de demonstração (pesquisa com professores).
 *
 * Tudo sai da mesma linha que gerou o aluno em `exemploDaPesquisa.ts` (nota, conclusão, acertos,
 * tempo, dias parado, perfil): a evolução termina na nota do cartão, a trilha soma a conclusão da
 * tabela, a jornada para no dia da última atividade e as tentativas ficam em torno dos acertos.
 * Nada disso sai do navegador nem é gravado. As leituras do banco reconhecem o id de exemplo e devolvem
 * daqui, em vez de perguntar ao Supabase por um aluno que não existe.
 */

const DIA_MS = 86_400_000;
const MIN_MS = 60_000;
const DIAS_NA_TURMA = 60;
const LIMITE_SEG = 600;

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const umaCasa = (v: number) => Math.round(v * 10) / 10;
/** Variação fixa entre -5 e 5, para os números não saírem todos iguais (e o teste ser determinístico). */
const variacao = (indice: number, k: number) => ((indice * 37 + k * 17) % 11) - 5;

function diaLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Às 19h do dia `dias` atrás, a hora em que a turma costuma estudar. */
function noitesAtras(hoje: Date, dias: number, minutos = 0): Date {
  const d = new Date(hoje.getTime() - dias * DIA_MS);
  d.setHours(19, 0, 0, 0);
  return new Date(d.getTime() + minutos * MIN_MS);
}

const temCronometro = (l: Linha) => (PERFIS_COM_CRONOMETRO as readonly string[]).includes(chaveDoPerfil(l.perfil) ?? "");

/** O dia (em dias atrás) de cada visita aos tópicos começados, do primeiro ao último estudo. */
function diasDasVisitas(l: Linha): number[] {
  const comecados = percentuaisDosTopicos(l).filter((p) => p > 0).length;
  const primeiro = DIAS_NA_TURMA - 3;
  if (comecados <= 1) return [Math.max(l.dias, 0)];
  return Array.from({ length: comecados }, (_, k) => Math.round(primeiro - ((primeiro - l.dias) * k) / (comecados - 1)));
}

// ---------------------------------------------------------------- evolução

/** A série diária de um aluno: começa mais baixa e termina exatamente nos números do cartão. */
function evolucaoDe(l: Linha, indice: number, alunoId: string, classeId: number, hoje: Date): EvolucaoAluno[] {
  const dias: number[] = [];
  for (let d = DIAS_NA_TURMA - 4; d > l.dias; d -= 4) dias.push(d);
  dias.push(l.dias);
  return dias.map((d, k) => {
    const t = dias.length === 1 ? 1 : k / (dias.length - 1);
    const ruido = k === dias.length - 1 ? 0 : variacao(indice, k) / 10;
    const acertos = limitar(Math.round(l.acertos - 14 * (1 - t) + ruido * 3), 0, 100);
    return {
      classe_id: classeId,
      aluno_id: alunoId,
      dia: diaLocal(noitesAtras(hoje, d)),
      nota_media_desempenho: limitar(umaCasa(l.nota - 1.6 * (1 - t) + ruido), 0, 10),
      taxa_acertos_pct: acertos,
      taxa_acertos_sem_erro_pct: limitar(acertos - 8, 0, 100),
      eficiencia_aprendizagem: umaCasa(acertos / 100),
      progresso_trilha_pct: Math.round(l.conclusao * t),
    };
  });
}

/** A evolução de todos os alunos de exemplo: a do aluno e a linha tracejada da média da turma. */
export function evolucaoDeExemplo(classeId: number, hoje: Date): EvolucaoAluno[] {
  const linhas: EvolucaoAluno[] = [];
  for (let i = 0; i < TOTAL_DE_ALUNOS; i += 1) {
    const id = `exemplo-${String(i + 1).padStart(2, "0")}`;
    const achado = linhaDoExemplo(id);
    if (achado) linhas.push(...evolucaoDe(achado.linha, i, id, classeId, hoje));
  }
  return linhas;
}

// ---------------------------------------------------------------- tentativas

type AtividadeFeita = {
  topicoIndice: number;
  atividadeIndice: number;
  id: number;
  titulo: string;
  questaoId: number;
  /** Uma por tentativa entregue; vazia = começou e não entregou. */
  acertos: number[];
  inicio: Date;
  duracoesSeg: number[];
};

const idDaAtividade = (t: number, a: number) => 920_000 + t * 100 + a;
const idDoConteudo = (t: number, c: number) => 910_000 + t * 100 + c;
const idDaQuestao = (t: number, a: number) => 930_000 + t * 100 + a;

/** As atividades que o aluno abriu, na ordem: as duas de cada tópico concluído, a primeira do que está no meio. */
function atividadesFeitas(l: Linha, indice: number, hoje: Date): AtividadeFeita[] {
  const percentuais = percentuaisDosTopicos(l);
  const visitas = diasDasVisitas(l);
  const feitas: AtividadeFeita[] = [];
  let visita = 0;
  percentuais.forEach((p, t) => {
    if (p <= 0) return;
    const dia = visitas[visita] ?? l.dias;
    visita += 1;
    const quantas = p >= 100 ? 2 : p >= 30 ? 1 : 0;
    for (let a = 0; a < Math.max(quantas, p < 30 ? 1 : 0); a += 1) {
      const base = limitar(l.acertos + variacao(indice, t * 2 + a) * 2, 20, 100);
      const entregou = quantas > a;
      // Abaixo de 60 o aluno tenta de novo, como o app oferece; a primeira tentativa sai mais baixa.
      const acertos = !entregou ? [] : base < 60 ? [limitar(base - 18, 0, 100), base] : [base];
      // Quem está em risco passa do tempo; o resto entrega dentro dos 10 minutos.
      const duracoesSeg = acertos.map((_, n) => (l.faixa === "alto" ? 640 + n * 30 : 320 + ((indice + t + n) % 5) * 50));
      feitas.push({
        topicoIndice: t,
        atividadeIndice: a,
        id: idDaAtividade(t, a),
        titulo: TRILHA_DE_EXEMPLO[t].atividades[a],
        questaoId: idDaQuestao(t, a),
        acertos,
        inicio: noitesAtras(hoje, dia, 20 + a * 25),
        duracoesSeg,
      });
    }
  });
  return feitas;
}

function bonusDe(acertos: number): number {
  return TIPOS_DO_BONUS.filter((tipo) => acertos >= Number(tipo.slice(tipo.lastIndexOf("_") + 1))).length * 10;
}

export function tentativasDeExemplo(alunoId: string, hoje: Date): TentativasDoAluno | null {
  const achado = linhaDoExemplo(alunoId);
  if (!achado) return null;
  const { linha: l, indice } = achado;
  const cronometrada = temCronometro(l);
  const linhas: LinhaDeTentativa[] = [];
  const bonus: BonusPago[] = [];
  const feitas = atividadesFeitas(l, indice, hoje);
  for (const f of feitas) {
    if (f.acertos.length === 0) {
      linhas.push({
        atividade_id: f.id,
        numero: 1,
        iniciada_em: f.inicio.toISOString(),
        respondida_em: null,
        cronometrada,
        limite_seg: cronometrada ? LIMITE_SEG : null,
        no_tempo: null,
        acertos_percentual: null,
        pontuacao_obtida: null,
        pontuacao_maxima: null,
      });
      continue;
    }
    f.acertos.forEach((acertos, n) => {
      const inicio = new Date(f.inicio.getTime() + n * 15 * MIN_MS);
      const noTempo = cronometrada ? f.duracoesSeg[n] <= LIMITE_SEG : null;
      linhas.push({
        atividade_id: f.id,
        numero: n + 1,
        iniciada_em: inicio.toISOString(),
        respondida_em: new Date(inicio.getTime() + f.duracoesSeg[n] * 1000).toISOString(),
        cronometrada,
        limite_seg: cronometrada ? LIMITE_SEG : null,
        no_tempo: noTempo,
        acertos_percentual: acertos,
        pontuacao_obtida: umaCasa(acertos / 10),
        pontuacao_maxima: 10,
      });
    });
    const ultima = f.acertos[f.acertos.length - 1];
    if (cronometrada && f.duracoesSeg[f.duracoesSeg.length - 1] <= LIMITE_SEG && bonusDe(ultima) > 0) {
      bonus.push({ referencia: `atividade:${f.id}`, valor: bonusDe(ultima) });
    }
  }
  return {
    // Quem está em risco e tem cronômetro: a IA o desligou, como faz por 3 das últimas 5 fora do tempo.
    escolha:
      cronometrada && l.faixa === "alto"
        ? {
            ligado: false,
            origem: "ia",
            motivo: "Três das últimas cinco tentativas cronometradas terminaram fora do tempo.",
            atualizado_em: noitesAtras(hoje, l.dias + 1).toISOString(),
          }
        : null,
    regra: regraDoCronometro(
      [
        { chave: "cronometro_atividade_padrao_seg", valor: String(LIMITE_SEG) },
        { chave: "cronometro_tolerancia_seg", valor: "15" },
      ],
      TIPOS_DO_BONUS.map((tipo) => ({ tipo, pontos: 10 })),
    ),
    atividades: resumirTentativas(
      linhas,
      feitas.map((f) => ({ id: f.id, titulo: f.titulo, tentativas_max: 3 })),
      bonus,
    ),
  };
}

// ---------------------------------------------------------------- jornada

export function jornadaDeExemplo(alunoId: string, hoje: Date): DadosDaJornada | null {
  const achado = linhaDoExemplo(alunoId);
  if (!achado) return null;
  const { linha: l, indice } = achado;
  const percentuais = percentuaisDosTopicos(l);
  const visitas = diasDasVisitas(l);
  const feitas = atividadesFeitas(l, indice, hoje);
  const eventos: EventoDoApp[] = [];
  const sessoes: SessaoDeTopico[] = [];
  const minutosPorTopico = l.tempoMin / Math.max(1, percentuais.filter((p) => p > 0).length);
  let visita = 0;
  const evento = (
    quando: Date,
    nome: string,
    topico: number,
    extra: Partial<Omit<EventoDoApp, "id" | "occurred_at" | "event_name" | "topico_id">> = {},
  ) =>
    eventos.push({
      id: `exemplo-${eventos.length + 1}`,
      occurred_at: quando.toISOString(),
      event_name: nome,
      topico_id: topico,
      conteudo_id: null,
      atividade_id: null,
      questao_id: null,
      attempt_number: null,
      is_correct: null,
      ...extra,
    });

  percentuais.forEach((p, t) => {
    if (p <= 0) return;
    const dia = visitas[visita] ?? l.dias;
    visita += 1;
    const topico = TRILHA_DE_EXEMPLO[t];
    const abertura = noitesAtras(hoje, dia);
    evento(abertura, "topic_open", topico.id);
    topico.conteudos.forEach((_, c) => {
      const conteudo = idDoConteudo(t, c);
      evento(noitesAtras(hoje, dia, 2 + c * 8), "content_open", topico.id, { conteudo_id: conteudo });
      if (p >= (c + 1) * 40) evento(noitesAtras(hoje, dia, 8 + c * 8), "content_complete", topico.id, { conteudo_id: conteudo });
    });
    for (const f of feitas.filter((x) => x.topicoIndice === t)) {
      evento(f.inicio, "activity_start", topico.id, { atividade_id: f.id });
      f.acertos.forEach((acertos, n) => {
        const resposta = new Date(f.inicio.getTime() + n * 15 * MIN_MS + f.duracoesSeg[n] * 1000);
        evento(resposta, "question_attempt", topico.id, {
          atividade_id: f.id,
          questao_id: f.questaoId,
          attempt_number: n + 1,
          is_correct: acertos >= 60,
        });
      });
      if (f.acertos.length) {
        const fim = new Date(f.inicio.getTime() + (f.acertos.length - 1) * 15 * MIN_MS + f.duracoesSeg[f.acertos.length - 1] * 1000 + MIN_MS);
        evento(fim, "activity_complete", topico.id, { atividade_id: f.id });
      }
    }
    if (p >= 100) evento(noitesAtras(hoje, dia, 75), "topic_complete", topico.id);
    sessoes.push({ topico_id: topico.id, aberto_em: abertura.toISOString(), duracao_sec: Math.round(minutosPorTopico * 60) });
  });

  // Quem vai bem volta ao primeiro tópico para revisar, no último dia de estudo.
  if (l.nota >= 8 && percentuais[0] >= 100) {
    const topico = TRILHA_DE_EXEMPLO[0];
    const volta = noitesAtras(hoje, l.dias, 90);
    evento(volta, "topic_open", topico.id);
    evento(new Date(volta.getTime() + 2 * MIN_MS), "content_revisit", topico.id, { conteudo_id: idDoConteudo(0, 1) });
    sessoes.push({ topico_id: topico.id, aberto_em: volta.toISOString(), duracao_sec: 6 * 60 });
  }

  eventos.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  return {
    eventos,
    sessoes,
    topicos: TRILHA_DE_EXEMPLO.map((t, k) => ({ id: t.id, nome: t.nome, ordem: k + 1 })),
    conteudos: TRILHA_DE_EXEMPLO.flatMap((t, k) => t.conteudos.map((titulo, c) => ({ id: idDoConteudo(k, c), topico_id: t.id, titulo }))),
    atividades: TRILHA_DE_EXEMPLO.flatMap((t, k) => t.atividades.map((titulo, a) => ({ id: idDaAtividade(k, a), topico_id: t.id, titulo }))),
    questoes: TRILHA_DE_EXEMPLO.flatMap((t, k) =>
      t.atividades.map((titulo, a) => ({
        id: idDaQuestao(k, a),
        atividade_id: idDaAtividade(k, a),
        enunciado: `${titulo}: questão de exemplo`,
        resposta_correta: "Resposta de exemplo",
      })),
    ),
  };
}

// ---------------------------------------------------------------- cuidado

export function cuidadoDeExemplo(alunoId: string, hoje: Date): DadosDoCuidado | null {
  const achado = linhaDoExemplo(alunoId);
  if (!achado) return null;
  const { linha: l } = achado;
  const percentuais = percentuaisDosTopicos(l);
  const atual = TRILHA_DE_EXEMPLO[Math.max(0, percentuais.filter((p) => p > 0).length - 1)];
  const momentos: MomentoDeCuidado[] = [];
  if (l.faixa !== "normal") {
    momentos.push({
      criado_em: noitesAtras(hoje, l.dias + 2, 40).toISOString(),
      topico_id: atual.id,
      origem: "sinais_de_uso",
      fatos: { erros_seguidos: 4, abandonos: l.faixa === "alto" ? 2 : 0 },
      acoes: { pausa_sugerida: true, cronometro_desligado: temCronometro(l) },
      resposta: "pausou",
      tentativas_antes: 3,
      acerto_antes_pct: limitar(l.acertos - 15, 0, 100),
      tentativas_depois: 2,
      acerto_depois_pct: l.acertos,
    });
  }
  if (l.faixa === "alto" && l.dias >= 9) {
    momentos.push({
      criado_em: noitesAtras(hoje, l.dias, 15).toISOString(),
      topico_id: atual.id,
      origem: "aluno_disse",
      fatos: {},
      acoes: { pausa_sugerida: true, tecnica_oferecida: true },
      resposta: "continuou",
      tentativas_antes: 1,
      acerto_antes_pct: limitar(l.acertos - 10, 0, 100),
      tentativas_depois: 0,
      acerto_depois_pct: null,
    });
  }
  if (l.faixa === "normal" && l.tempoMin >= 200) {
    momentos.push({
      criado_em: noitesAtras(hoje, l.dias + 1, 70).toISOString(),
      topico_id: atual.id,
      origem: "sinais_de_uso",
      fatos: { minutos_sem_parar: 55 },
      acoes: { pausa_sugerida: true },
      resposta: "pausou",
      tentativas_antes: 2,
      acerto_antes_pct: l.acertos,
      tentativas_depois: 1,
      acerto_depois_pct: limitar(l.acertos + 4, 0, 100),
    });
  }
  return {
    momentos: momentos.sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
    topicos: new Map(TRILHA_DE_EXEMPLO.map((t) => [t.id, t.nome])),
  };
}

// ---------------------------------------------------------------- personalização

const FORMATO_DO_PERFIL: Record<string, string> = {
  seeker: "texto",
  survivor: "cards",
  daredevil: "cards",
  mastermind: "apresentacao",
  conqueror: "cards",
  socializer: "audio",
  achiever: "texto",
};

const JUSTIFICATIVA_DO_PERFIL: Record<string, string> = {
  seeker: "Explora o conteúdo por conta própria: texto com exemplos abertos e perguntas para investigar.",
  survivor: "Prefere passos curtos e seguros: cards com uma ideia por vez e revisão logo depois.",
  daredevil: "Rende com ritmo e desafio: cards rápidos e um problema para resolver antes da teoria.",
  mastermind: "Gosta de entender a estrutura: apresentação que monta o raciocínio por etapas.",
  conqueror: "Responde bem a metas: cards com nível crescente e o resultado de cada etapa.",
  socializer: "Aprende conversando: áudio do Guia explicando, com exemplos da turma.",
  achiever: "Quer completar tudo: texto com checklist do que falta no tópico.",
};

const ETAPAS: { kind: string; nome: string }[] = [
  { kind: "texto", nome: "Texto" },
  { kind: "audio", nome: "Áudio" },
  { kind: "apresentacao", nome: "Apresentação" },
  { kind: "cards", nome: "Cards" },
];

export function personalizacaoDeExemplo(
  alunoId: string,
  hoje: Date,
): { personalizacoes: Personalizacao[]; progressoItens: ProgressoItem[] } | null {
  const achado = linhaDoExemplo(alunoId);
  if (!achado) return null;
  const { linha: l, indice } = achado;
  const percentuais = percentuaisDosTopicos(l);
  const visitas = diasDasVisitas(l);
  const perfil = chaveDoPerfil(l.perfil) ?? "seeker";
  const personalizacoes: Personalizacao[] = [];
  const progressoItens: ProgressoItem[] = [];
  const comecados = percentuais.filter((p) => p > 0).length;
  let visita = 0;
  percentuais.forEach((p, t) => {
    if (p <= 0) return;
    const dia = visitas[visita] ?? l.dias;
    visita += 1;
    const topico = TRILHA_DE_EXEMPLO[t];
    const id = (indice + 1) * 100 + t + 1;
    personalizacoes.push({
      id,
      ciclo_id: `exemplo-${id}`,
      topico_id: topico.id,
      formato_prioritario: FORMATO_DO_PERFIL[perfil],
      formatos_gerados: ETAPAS.map((e) => e.kind),
      plano: { justificativa: JUSTIFICATIVA_DO_PERFIL[perfil] },
      steps: ETAPAS.map((e) => ({ tipo: e.kind })),
      gerado_em: noitesAtras(hoje, dia + 1, -120).toISOString(),
    });
    ETAPAS.forEach((e, k) => {
      // No tópico concluído, tudo concluído; no que está no meio, as etapas até onde o aluno chegou.
      const percentual = p >= 100 ? 100 : limitar(Math.round(p * 1.6 - k * 35), 0, 100);
      const ehCards = e.kind === "cards";
      const acertos = ehCards && percentual > 0 ? limitar(l.acertos + variacao(indice, t + k), 0, 100) : null;
      progressoItens.push({
        id: id * 10 + k,
        item_key: `${topico.id}:${e.kind}`,
        item_kind: e.kind,
        item_title: `${e.nome}: ${topico.nome}`,
        status: percentual >= 100 ? "concluido" : percentual > 0 ? "em andamento" : "não iniciado",
        percentual_concluido: percentual,
        acertos_percentual: acertos,
        tempo_gasto_min: umaCasa(((l.tempoMin / comecados) * percentual) / 100 / ETAPAS.length),
        pontuacao_obtida: acertos === null ? null : umaCasa(acertos / 10),
        pontuacao_maxima: ehCards ? 10 : null,
        updated_at: noitesAtras(hoje, dia, 30 + k * 10).toISOString(),
      });
    });
  });
  return { personalizacoes: personalizacoes.reverse(), progressoItens };
}

// ---------------------------------------------------------------- conquistas

/** O que as métricas das conquistas leem de um aluno de exemplo, tirado do mesmo detalhe que o professor abre. */
export type MetricasDoAlunoDeExemplo = {
  /** O perfil principal e o segundo: com afinidade 46 e 24, são os dois representativos. */
  perfis: string[];
  atividadesConcluidas: number;
  diasSeguidos: number;
  minutosTotais: number;
  acertosPercentual: number;
  topicosVisitados: number;
  /** A entrega mais rápida, em minutos; null sem nenhuma atividade entregue. */
  atividadeMaisRapidaMin: number | null;
};

/** A maior sequência de dias seguidos entre os dias de estudo (contados em dias atrás). */
function maiorSequencia(diasAtras: number[]): number {
  const dias = [...new Set(diasAtras)].sort((a, b) => a - b);
  let maior = dias.length ? 1 : 0;
  let atual = maior;
  for (let k = 1; k < dias.length; k += 1) {
    atual = dias[k] === dias[k - 1] + 1 ? atual + 1 : 1;
    maior = Math.max(maior, atual);
  }
  return maior;
}

export function metricasDosAlunosDeExemplo(hoje: Date): MetricasDoAlunoDeExemplo[] {
  return Array.from({ length: TOTAL_DE_ALUNOS }, (_, i) => {
    const achado = linhaDoExemplo(`exemplo-${String(i + 1).padStart(2, "0")}`);
    const { linha: l, indice } = achado!;
    const entregues = atividadesFeitas(l, indice, hoje).filter((f) => f.acertos.length > 0);
    const duracoes = entregues.map((f) => f.duracoesSeg[f.duracoesSeg.length - 1] / 60);
    return {
      perfis: [l.perfil, l.segundo],
      atividadesConcluidas: entregues.length,
      diasSeguidos: maiorSequencia(diasDasVisitas(l)),
      minutosTotais: l.tempoMin,
      acertosPercentual: l.acertos,
      topicosVisitados: percentuaisDosTopicos(l).filter((p) => p > 0).length,
      atividadeMaisRapidaMin: duracoes.length ? Math.min(...duracoes) : null,
    };
  });
}
