import type { TurmaDistribuicao, TurmaPerfilMetricas } from "../useTurmaKpis";
import type { TurmaResumo } from "@/lib/turmaResumo";
import type { SegmentoPerfil } from "./graficos";
import { chaveDoPerfil, NOME_DO_PERFIL, PERFIS_EM_ORDEM } from "./perfilCores";
import { avaliarRisco, DIAS_EVADIDO, DIAS_INATIVO, type FaixaDoRisco, type SinaisDoBanco } from "./risco";
import type { AlunoAnalisado } from "./aluno/tipos";
import { kpisDosAlunos } from "./kpisDosAlunos";

/**
 * Turma ILUSTRATIVA para a demonstração da pesquisa com professores.
 *
 * A rodada avalia o formato das métricas (o que o painel mostra e como ele se explica), não o dado:
 * a turma do avaliador não tem alunos com histórico, e não criamos aluno fictício no banco. Os alunos
 * abaixo nunca saem do navegador, nunca são gravados e só aparecem com o selo de exemplo.
 *
 * **Tudo sai da mesma lista.** Cabeçalho, cartões, perfis, rosca de notas, "precisam de atenção" e a
 * tabela são contas sobre `alunosDeExemplo`, as mesmas que a turma de verdade usa. Antes os cartões
 * eram números fixos e o cabeçalho contava os alunos reais: o painel dizia 32 alunos e a turma, 1.
 *
 * Os alunos de verdade da turma (o aluno de teste do avaliador) entram na lista junto, com o dado
 * real: o que ele fizer como aluno aparece no mesmo painel.
 *
 * Dois perfis ficam abaixo do mínimo de alunos de propósito: o estado "poucos alunos" também é formato.
 */

export const CLASSE_DE_EXEMPLO = -1;

/** Prefixo do id dos alunos de exemplo: não abrem detalhe (não existem no banco). */
export const PREFIXO_DO_EXEMPLO = "exemplo-";
export const ehAlunoDeExemplo = (id: string) => id.startsWith(PREFIXO_DO_EXEMPLO);

type Perfil = (typeof PERFIS_EM_ORDEM)[number];

type Linha = {
  nome: string;
  perfil: Perfil;
  /** O segundo perfil mais forte (recorte "segundo perfil" dos gráficos). */
  segundo: Perfil;
  nota: number;
  conclusao: number;
  acertos: number;
  /** Tempo ativo (minutos), a mesma grandeza de `classe_aluno.tempoGastoMin`. */
  tempoMin: number;
  /** Dias desde o último estudo. 7 ou mais = inativo; 30 ou mais = evadido. */
  dias: number;
  /** Faixa do modelo de evasão. */
  faixa: FaixaDoRisco;
  /** Parado num tópico (abaixo da mediana da turma nele). */
  parado?: boolean;
};

const TOPICO_PARADO = "Estruturas de repetição";

// Nomes inventados, sem sobrenome: nenhum é de aluno real.
const LINHAS: readonly Linha[] = [
  { nome: "Ana Clara", perfil: "seeker", segundo: "mastermind", nota: 8.4, conclusao: 82, acertos: 86, tempoMin: 210, dias: 1, faixa: "normal" },
  { nome: "Bruno", perfil: "seeker", segundo: "achiever", nota: 7.6, conclusao: 71, acertos: 78, tempoMin: 160, dias: 2, faixa: "normal" },
  { nome: "Camila", perfil: "seeker", segundo: "socializer", nota: 6.8, conclusao: 63, acertos: 70, tempoMin: 120, dias: 3, faixa: "normal" },
  { nome: "Diego", perfil: "seeker", segundo: "conqueror", nota: 9.1, conclusao: 90, acertos: 92, tempoMin: 260, dias: 0, faixa: "normal" },
  { nome: "Elisa", perfil: "seeker", segundo: "survivor", nota: 5.9, conclusao: 48, acertos: 61, tempoMin: 75, dias: 4, faixa: "atencao", parado: true },
  { nome: "Felipe", perfil: "seeker", segundo: "daredevil", nota: 4.2, conclusao: 22, acertos: 44, tempoMin: 30, dias: 12, faixa: "alto" },
  { nome: "Gabriela", perfil: "survivor", segundo: "seeker", nota: 7.2, conclusao: 66, acertos: 74, tempoMin: 140, dias: 1, faixa: "normal" },
  { nome: "Heitor", perfil: "survivor", segundo: "mastermind", nota: 6.1, conclusao: 52, acertos: 63, tempoMin: 90, dias: 5, faixa: "normal" },
  { nome: "Isadora", perfil: "survivor", segundo: "socializer", nota: 3.8, conclusao: 18, acertos: 39, tempoMin: 20, dias: 16, faixa: "alto" },
  { nome: "João", perfil: "daredevil", segundo: "conqueror", nota: 8.0, conclusao: 77, acertos: 81, tempoMin: 190, dias: 0, faixa: "normal" },
  { nome: "Larissa", perfil: "daredevil", segundo: "socializer", nota: 6.5, conclusao: 58, acertos: 66, tempoMin: 110, dias: 2, faixa: "normal" },
  { nome: "Marcos", perfil: "daredevil", segundo: "seeker", nota: 5.4, conclusao: 41, acertos: 57, tempoMin: 60, dias: 9, faixa: "alto" },
  { nome: "Natália", perfil: "daredevil", segundo: "achiever", nota: 4.6, conclusao: 25, acertos: 48, tempoMin: 35, dias: 21, faixa: "alto" },
  { nome: "Otávio", perfil: "daredevil", segundo: "mastermind", nota: 7.4, conclusao: 69, acertos: 75, tempoMin: 150, dias: 1, faixa: "normal" },
  { nome: "Paula", perfil: "mastermind", segundo: "achiever", nota: 9.4, conclusao: 95, acertos: 94, tempoMin: 280, dias: 0, faixa: "normal" },
  { nome: "Rafael", perfil: "mastermind", segundo: "seeker", nota: 8.7, conclusao: 88, acertos: 89, tempoMin: 240, dias: 1, faixa: "normal" },
  { nome: "Sofia", perfil: "mastermind", segundo: "conqueror", nota: 8.2, conclusao: 80, acertos: 85, tempoMin: 200, dias: 2, faixa: "normal" },
  { nome: "Tiago", perfil: "mastermind", segundo: "survivor", nota: 6.9, conclusao: 61, acertos: 72, tempoMin: 125, dias: 3, faixa: "normal" },
  { nome: "Valéria", perfil: "mastermind", segundo: "socializer", nota: 7.8, conclusao: 74, acertos: 80, tempoMin: 170, dias: 1, faixa: "normal" },
  { nome: "Vitor", perfil: "conqueror", segundo: "daredevil", nota: 8.9, conclusao: 86, acertos: 88, tempoMin: 230, dias: 0, faixa: "normal" },
  { nome: "Yasmin", perfil: "conqueror", segundo: "achiever", nota: 7.0, conclusao: 64, acertos: 73, tempoMin: 135, dias: 2, faixa: "normal" },
  { nome: "André", perfil: "conqueror", segundo: "mastermind", nota: 6.3, conclusao: 55, acertos: 64, tempoMin: 100, dias: 4, faixa: "normal" },
  { nome: "Beatriz", perfil: "conqueror", segundo: "seeker", nota: 5.7, conclusao: 45, acertos: 59, tempoMin: 70, dias: 3, faixa: "atencao", parado: true },
  { nome: "Caio", perfil: "conqueror", segundo: "survivor", nota: 4.9, conclusao: 30, acertos: 51, tempoMin: 40, dias: 10, faixa: "alto" },
  { nome: "Daniela", perfil: "socializer", segundo: "seeker", nota: 8.1, conclusao: 76, acertos: 82, tempoMin: 185, dias: 1, faixa: "normal" },
  { nome: "Eduardo", perfil: "socializer", segundo: "conqueror", nota: 7.5, conclusao: 68, acertos: 77, tempoMin: 155, dias: 2, faixa: "normal" },
  { nome: "Fernanda", perfil: "socializer", segundo: "achiever", nota: 6.6, conclusao: 57, acertos: 67, tempoMin: 105, dias: 3, faixa: "normal" },
  { nome: "Gustavo", perfil: "socializer", segundo: "daredevil", nota: 6.0, conclusao: 50, acertos: 62, tempoMin: 85, dias: 5, faixa: "normal" },
  { nome: "Helena", perfil: "socializer", segundo: "survivor", nota: 5.2, conclusao: 38, acertos: 55, tempoMin: 55, dias: 6, faixa: "alto" },
  { nome: "Igor", perfil: "achiever", segundo: "mastermind", nota: 9.0, conclusao: 92, acertos: 91, tempoMin: 250, dias: 0, faixa: "normal" },
  { nome: "Júlia", perfil: "achiever", segundo: "conqueror", nota: 7.9, conclusao: 73, acertos: 79, tempoMin: 175, dias: 1, faixa: "normal" },
  { nome: "Lucas", perfil: "achiever", segundo: "seeker", nota: 6.4, conclusao: 47, acertos: 65, tempoMin: 95, dias: 8, faixa: "atencao" },
];

export const TOTAL_DE_ALUNOS = LINHAS.length;

const DIA_MS = 86_400_000;
const emDias = (hoje: Date, dias: number) => new Date(hoje.getTime() - dias * DIA_MS).toISOString();

/** Afinidades: o dominante na frente, o segundo depois e o resto baixo. */
function afinidades(l: Linha) {
  return PERFIS_EM_ORDEM.map((p) => ({
    nome: NOME_DO_PERFIL[p],
    afinidade: p === l.perfil ? 46 : p === l.segundo ? 24 : 6,
  }));
}

function sinaisDe(l: Linha, hoje: Date): SinaisDoBanco {
  const ultima = emDias(hoje, l.dias);
  return {
    semDado: false,
    ultimaAtividadeEm: ultima,
    inativoDesde: l.dias >= DIAS_INATIVO ? ultima : null,
    evadidoDesde: l.dias >= DIAS_EVADIDO ? ultima : null,
    estagnadoDesde: l.parado ? emDias(hoje, 15) : null,
    estagnadoTopico: l.parado ? TOPICO_PARADO : null,
    riscoFaixa: l.faixa,
    riscoOrigem: "modelo",
    riscoMotivo: l.faixa === "normal" ? null : l.dias >= DIAS_INATIVO ? "uso_caiu" : l.nota < 5 ? "nota_baixa" : "entregas_perdidas",
  };
}

/**
 * Os alunos de exemplo, já analisados como os de verdade (o risco sai do mesmo `avaliarRisco`).
 * `hoje` entra de fora para as datas acompanharem o dia e o teste ser determinístico.
 */
export function alunosDeExemplo(classeId: number, classeNome: string, hoje: Date): AlunoAnalisado[] {
  const mediaDaTurma = LINHAS.reduce((s, l) => s + l.nota, 0) / LINHAS.length;
  const taxaAlto = (100 * LINHAS.filter((l) => l.faixa === "alto").length) / LINHAS.length;
  return LINHAS.map((l, i) => {
    const sinais = sinaisDe(l, hoje);
    return {
      id: `${PREFIXO_DO_EXEMPLO}${String(i + 1).padStart(2, "0")}`,
      nome: `${l.nome} (exemplo)`,
      email: "",
      classe_id: classeId,
      classe_nome: classeNome,
      naTurmaDesde: emDias(hoje, 60),
      notaMedia: l.nota,
      temNota: true,
      porcentagemConcluida: l.conclusao,
      tempoGastoMin: l.tempoMin,
      tempoPresencaMin: Math.round(l.tempoMin * 2.2),
      acertosPercentual: l.acertos,
      temAcertos: true,
      ultimaAtividade: sinais.ultimaAtividadeEm,
      perfilDominante: NOME_DO_PERFIL[l.perfil],
      perfis: afinidades(l),
      modoOperacao: "",
      topicos: [],
      ultimaAtividadeEm: sinais.ultimaAtividadeEm,
      riscoFaixa: l.faixa,
      risco: avaliarRisco({ sinais, nota: l.nota }, { notaMedia: mediaDaTurma, taxaAbandonoPct: taxaAlto }, hoje),
    };
  });
}

// ---------------------------------------------------------------- contas sobre a lista

const diasSemEstudar = (a: AlunoAnalisado, hoje: Date) =>
  a.ultimaAtividadeEm ? Math.floor((hoje.getTime() - new Date(a.ultimaAtividadeEm).getTime()) / DIA_MS) : null;
const estaParado = (a: AlunoAnalisado) => a.risco?.fatores.some((f) => f.criterio === "estagnacao") ?? false;
const media = (valores: number[]) => (valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null);

/** O perfil em cada recorte: o dominante, o segundo mais forte, ou todos com afinidade de 20 ou mais. */
function perfisDoAluno(a: AlunoAnalisado, segmento: SegmentoPerfil): string[] {
  const ordenados = [...a.perfis].sort((x, y) => y.afinidade - x.afinidade);
  if (segmento === "majoritario") return [a.perfilDominante];
  if (segmento === "segundo") return ordenados[1] ? [ordenados[1].nome] : [];
  return ordenados.filter((p) => p.afinidade >= 20).map((p) => p.nome);
}

/** O resumo da turma (cartões secundários) a partir da lista. */
export function resumoDosAlunos(alunos: AlunoAnalisado[], hoje: Date): TurmaResumo {
  const kpis = kpisDosAlunos(alunos);
  const comDado = alunos.filter((a) => a.riscoFaixa !== null);
  const alto = comDado.filter((a) => a.riscoFaixa === "alto").length;
  const comUltima = alunos.map((a) => diasSemEstudar(a, hoje)).filter((d): d is number => d !== null);
  const presencas = alunos.map((a) => a.tempoPresencaMin).filter((t): t is number => t !== null);
  const presencaMedia = media(presencas);
  return {
    total_alunos: kpis.totalAlunos,
    taxa_media_conclusao_pct: kpis.mediaConclusao,
    media_nota_turma: kpis.mediaNotas,
    taxa_media_acertos_pct: kpis.mediaAcertos,
    // O mesmo tempo ativo que a tabela e o detalhe do aluno mostram (tempoGastoMin).
    tempo_ativo_medio_seg: media(alunos.map((a) => a.tempoGastoMin * 60)),
    tempo_medio_uso_seg: presencaMedia === null ? null : presencaMedia * 60,
    // Sem coluna por aluno para o chat: este é o único número fixo do exemplo.
    uso_chat_apos_erro_pct: 23.4,
    retorno_semanal_pct: comUltima.length ? (100 * comUltima.filter((d) => d < DIAS_INATIVO).length) / comUltima.length : null,
    retorno_semanal_elegiveis: comUltima.length,
    taxa_risco_abandono_pct: comDado.length ? (100 * alto) / comDado.length : null,
    alunos_risco_alto: alto,
    alunos_risco_com_dado: comDado.length,
    alunos_inativos: comUltima.filter((d) => d >= DIAS_INATIVO && d < DIAS_EVADIDO).length,
    alunos_estagnados: alunos.filter(estaParado).length,
    alunos_evadidos: comUltima.filter((d) => d >= DIAS_EVADIDO).length,
    alunos_sem_dado: alunos.length - comUltima.length,
  };
}

/** As linhas por perfil dos gráficos, nos três recortes, a partir da lista. */
export function perfisDosAlunos(alunos: AlunoAnalisado[], classeId: number, hoje: Date): TurmaPerfilMetricas[] {
  const linhas: TurmaPerfilMetricas[] = [];
  for (const segmento of ["majoritario", "segundo", "afinidade_20_plus"] as SegmentoPerfil[]) {
    for (const perfil of PERFIS_EM_ORDEM) {
      const doPerfil = alunos.filter((a) => perfisDoAluno(a, segmento).some((n) => chaveDoPerfil(n) === perfil));
      const comDado = doPerfil.filter((a) => a.riscoFaixa !== null);
      const altos = comDado.filter((a) => a.riscoFaixa === "alto").length;
      const dias = doPerfil.map((a) => diasSemEstudar(a, hoje));
      linhas.push({
        classe_id: classeId,
        segmento,
        perfil_nome: NOME_DO_PERFIL[perfil],
        total_alunos_segmento: doPerfil.length,
        alunos_inativos: dias.filter((d) => d !== null && d >= DIAS_INATIVO).length,
        alunos_estagnados: doPerfil.filter(estaParado).length,
        tempo_ativo_medio_seg: media(doPerfil.map((a) => a.tempoGastoMin * 60)),
        taxa_risco_abandono_pct: comDado.length ? (100 * altos) / comDado.length : null,
        alunos_risco_alto: altos,
        alunos_risco_com_dado: comDado.length,
        media_nota: media(doPerfil.filter((a) => a.temNota).map((a) => a.notaMedia)) ?? 0,
        taxa_acertos_pct: media(doPerfil.filter((a) => a.temAcertos).map((a) => a.acertosPercentual)) ?? 0,
        taxa_uso_chat_pct: 0,
        uso_chat_apos_erro_pct: 0,
      });
    }
  }
  return linhas;
}

/** Faixas como a view do banco: abaixo de 5 baixa, abaixo de 7 média, o resto alta; sem nota, sem_dado. */
export function distribuicaoDosAlunos(alunos: AlunoAnalisado[], classeId: number): TurmaDistribuicao[] {
  const contagem: Record<string, number> = { alta: 0, media: 0, baixa: 0, sem_dado: 0 };
  for (const a of alunos) {
    if (!a.temNota || (a.notaMedia === 0 && a.porcentagemConcluida === 0)) contagem.sem_dado += 1;
    else if (a.notaMedia < 5) contagem.baixa += 1;
    else if (a.notaMedia < 7) contagem.media += 1;
    else contagem.alta += 1;
  }
  return Object.entries(contagem)
    .filter(([, total]) => total > 0)
    .map(([faixa, total_alunos]) => ({
      classe_id: classeId,
      metrica: "nota_media",
      faixa,
      total_alunos,
      percentual: (100 * total_alunos) / (alunos.length || 1),
    }));
}

/**
 * A turma em tela é a de demonstração do avaliador? Só quando o escopo é exatamente ela: com outra
 * turma junto (o dono do projeto vê várias), o painel é o de verdade.
 */
export function mostraExemplo(classeDeDemonstracao: number | null | undefined, escopo: number[]): boolean {
  return classeDeDemonstracao != null && escopo.length === 1 && escopo[0] === classeDeDemonstracao;
}
