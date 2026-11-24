import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import type { Duelo, LinhaDoRanking } from "../batalhas/batalha";
import { alunosDeExemplo, TRILHA_DE_EXEMPLO } from "../dashboard/exemploDaPesquisa";
import { chaveDoPerfil } from "../dashboard/perfilCores";
import type { AlunoAnalisado } from "../dashboard/aluno/tipos";
import { metricasDosAlunosDeExemplo, type MetricasDoAlunoDeExemplo } from "../dashboard/aluno/exemploDoAluno";
import type { ConquistaDaTurma } from "../conquistas/conquistasApi";
import type { GuildaDaTurma } from "../guildas/formacao";
import type { LinhaDaFila } from "../notas/fila";
import type { CriterioChave, Posicao } from "../rankings/rankings";

/**
 * Exemplos das outras abas da turma de demonstração da pesquisa (Rankings, Rank de batalhas,
 * Guildas, Notas). O mesmo acordo da Visão geral (`dashboard/exemploDaPesquisa.ts`): a rodada avalia
 * o formato, a turma do avaliador não tem histórico e não criamos aluno fictício no banco. Nada daqui
 * é gravado; cada aba mostra o selo de exemplo e o que o avaliador mudar num item de exemplo fica só
 * na tela.
 *
 * **Os alunos são os mesmos 32 da Visão geral**, com os mesmos ids (`exemplo-NN`) e os mesmos
 * números: quem lidera o ranking de pontuação é quem tem nota, conclusão e tempo altos no painel.
 */

const DIA_MS = 86_400_000;
const emDias = (hoje: Date, dias: number, horas = 0) => new Date(hoje.getTime() - dias * DIA_MS - horas * 3_600_000).toISOString();

/** Os 32 alunos de exemplo, sem turma (as abas só usam id, nome, perfil e os números). */
const alunos = (hoje: Date): AlunoAnalisado[] => alunosDeExemplo(0, "", hoje);

/** Perfil dominante de cada aluno de exemplo, na chave que a tabela do ranking pinta. */
export function perfisDeExemplo(hoje: Date = new Date()): Map<string, BrainHexProfileKey> {
  const mapa = new Map<string, BrainHexProfileKey>();
  for (const a of alunos(hoje)) {
    const chave = chaveDoPerfil(a.perfilDominante);
    if (chave) mapa.set(a.id, chave);
  }
  return mapa;
}

// ---------------------------------------------------------------- rankings

/** A pontuação de cada aluno num critério, derivada dos números dele no painel. */
function pontosNoCriterio(a: AlunoAnalisado, i: number, criterio: CriterioChave): number {
  switch (criterio) {
    case "pontuacao":
      return Math.round(a.porcentagemConcluida * 12 + a.acertosPercentual * 4 + a.tempoGastoMin);
    case "tempo":
      return a.tempoGastoMin;
    case "acertos":
      return a.acertosPercentual;
    case "percentual":
      return a.porcentagemConcluida;
    case "ranqueada":
      // Duelos vencidos valem 30; quem estuda mais duela mais, com uma variação pela posição.
      return 30 * Math.max(0, Math.round(a.acertosPercentual / 15) - (i % 3));
    case "missoes":
      return Math.max(0, Math.floor(a.porcentagemConcluida / 12) - (i % 2));
    case "elo":
      return 1000 + Math.round((a.acertosPercentual - 60) * 8) + (i % 5) * 7;
  }
}

/**
 * As posições de exemplo num critério. Com `reais`, junta os alunos de verdade do ranking (o aluno
 * de teste do avaliador) e reordena todo mundo: o que ele fizer como aluno aparece no meio dos exemplos.
 * Empate divide o lugar, como a view.
 */
export function posicoesDeExemplo(criterio: CriterioChave, reais: Posicao[] = [], hoje: Date = new Date()): Posicao[] {
  const exemplos = alunos(hoje).map((a, i) => ({ aluno_id: a.id, aluno_nome: a.nome, posicao: null, pontuacao: pontosNoCriterio(a, i, criterio) }));
  const todos = [...reais, ...exemplos].sort(
    (x, y) => (y.pontuacao ?? 0) - (x.pontuacao ?? 0) || x.aluno_nome.localeCompare(y.aluno_nome, "pt-BR"),
  );
  let posicao = 0;
  return todos.map((p, i) => {
    if (i === 0 || (todos[i - 1].pontuacao ?? 0) !== (p.pontuacao ?? 0)) posicao = i + 1;
    return { ...p, posicao };
  });
}

/**
 * Os critérios que ganham um ranking de exemplo quando a turma de demonstração não tem um aberto
 * com ele: um de estudo (pontuação), dois de jogo (ranqueada, Elo) e o de missões.
 */
export const CRITERIOS_DO_EXEMPLO: readonly CriterioChave[] = ["pontuacao", "ranqueada", "missoes", "elo"];

// ---------------------------------------------------------------- guildas

const NOMES_DAS_GUILDAS = [
  { nome: "Laço Infinito (exemplo)", descricao: "A gente não sai do while sem resposta." },
  { nome: "Os Compiladores (exemplo)", descricao: "Erro de sintaxe aqui não passa." },
  { nome: "Bit a Bit (exemplo)", descricao: null },
  { nome: "Pilha Cheia (exemplo)", descricao: "Estudamos à noite, depois do trabalho." },
  { nome: "Fluxograma (exemplo)", descricao: "Primeiro o desenho, depois o código." },
  { nome: "Vetor de Ouro (exemplo)", descricao: null },
  { nome: "Se Senão (exemplo)", descricao: "Toda decisão tem dois caminhos." },
  { nome: "Variáveis Livres (exemplo)", descricao: "Grupo de revisão às sextas." },
] as const;

/** Quantos alunos de exemplo ficam sem guilda: o estado "sem guilda" também é formato. */
export const SEM_GUILDA_NO_EXEMPLO = 4;

/**
 * Oito guildas com os alunos de exemplo: as quatro primeiras com 4 membros, as outras com 3, e os
 * últimos 4 alunos sem guilda. `limite` é o tamanho que a turma tem configurado, como o banco devolve.
 */
export function guildasDeExemplo(limite: number, hoje: Date = new Date()): GuildaDaTurma[] {
  const lista = alunos(hoje);
  let k = 0;
  return NOMES_DAS_GUILDAS.map((g, i) => {
    const tamanho = i < 4 ? 4 : 3;
    const membros = lista.slice(k, k + tamanho).map((a, j) => ({ alunoId: a.id, nome: a.nome, entrouEm: emDias(hoje, 20 - i, j) }));
    k += tamanho;
    return { id: `exemplo-guilda-${i + 1}`, nome: g.nome, descricao: g.descricao, limite, membros, criadaEm: emDias(hoje, 21 - i) };
  });
}

export const ehGuildaDeExemplo = (id: string) => id.startsWith("exemplo-guilda-");

// ---------------------------------------------------------------- batalhas

type DueloBase = {
  a: number;
  b: number | null;
  vence: 1 | 2 | null;
  pontos: [number, number];
  dias: number;
  modo: Duelo["modo"];
  dificuldade: Duelo["dificuldade"];
  consequencia: Duelo["consequencia"];
  aberto?: boolean;
};

// Índices em NOMES_DAS_GUILDAS. `vence` null num duelo encerrado é empate.
const DUELOS: readonly DueloBase[] = [
  { a: 0, b: 1, vence: null, pontos: [0, 0], dias: 0, modo: "velocidade", dificuldade: "normal", consequencia: "ranqueada", aberto: true },
  { a: 2, b: 3, vence: 1, pontos: [120, 90], dias: 1, modo: "todos", dificuldade: "normal", consequencia: "ranqueada" },
  { a: 0, b: 4, vence: 1, pontos: [150, 110], dias: 2, modo: "precisao", dificuldade: "dificil", consequencia: "ranqueada" },
  { a: 1, b: 5, vence: null, pontos: [100, 100], dias: 3, modo: "todos", dificuldade: "normal", consequencia: "treino" },
  { a: 6, b: 0, vence: 2, pontos: [80, 130], dias: 4, modo: "velocidade", dificuldade: "normal", consequencia: "ranqueada" },
  { a: 3, b: 7, vence: 2, pontos: [70, 95], dias: 5, modo: "duelo", dificuldade: "normal", consequencia: "treino" },
  { a: 2, b: 1, vence: 2, pontos: [90, 140], dias: 6, modo: "precisao", dificuldade: "dificil", consequencia: "ranqueada" },
  { a: 5, b: 4, vence: 1, pontos: [110, 60], dias: 8, modo: "todos", dificuldade: "normal", consequencia: "ranqueada" },
  { a: 7, b: null, vence: 1, pontos: [85, 0], dias: 9, modo: "todos", dificuldade: "normal", consequencia: "treino" },
  { a: 2, b: 6, vence: 1, pontos: [130, 120], dias: 11, modo: "velocidade", dificuldade: "dificil", consequencia: "ranqueada" },
];

/**
 * Duelos de exemplo entre as guildas de exemplo, e o ranking de guildas que sai deles pela mesma
 * regra do banco: só duelo encerrado conta, empate soma meio ponto no aproveitamento, e o desafio
 * sem rival vale para a guilda que o cumpriu.
 */
export function batalhasDeExemplo(hoje: Date = new Date()): { duelos: Duelo[]; ranking: LinhaDoRanking[] } {
  const nome = (i: number) => NOMES_DAS_GUILDAS[i].nome;
  const duelos: Duelo[] = DUELOS.map((d, i) => {
    const aberto = Boolean(d.aberto);
    const comRival = d.b !== null;
    return {
      id: `exemplo-duelo-${i + 1}`,
      titulo: "",
      formato: "guilda",
      modo: d.modo,
      dificuldade: d.dificuldade,
      consequencia: d.consequencia,
      eventoId: null,
      status: aberto ? "aberto" : "encerrado",
      resultado: aberto ? null : d.vence === null ? "empate" : "vitoria",
      vencedorEquipe: aberto ? null : d.vence,
      guildaNome: nome(d.a),
      rivalNome: comRival ? nome(d.b as number) : null,
      criadoEm: emDias(hoje, d.dias, 2),
      aceitaram: comRival ? 7 : 4,
      equipes: aberto
        ? []
        : comRival
          ? [{ equipe: 1, pontos: d.pontos[0], integrantes: 4 }, { equipe: 2, pontos: d.pontos[1], integrantes: 3 }]
          : [{ equipe: 1, pontos: d.pontos[0], integrantes: 4 }],
    };
  });

  const linhas = new Map<number, LinhaDoRanking>();
  const linha = (i: number) => {
    const atual = linhas.get(i) ?? { guildaId: `exemplo-guilda-${i + 1}`, nome: nome(i), vitorias: 0, empates: 0, duelos: 0 };
    linhas.set(i, atual);
    return atual;
  };
  for (const d of DUELOS) {
    if (d.aberto) continue;
    const a = linha(d.a);
    a.duelos += 1;
    if (d.b === null) {
      a.vitorias += 1;
      continue;
    }
    const b = linha(d.b);
    b.duelos += 1;
    if (d.vence === null) {
      a.empates += 1;
      b.empates += 1;
    } else (d.vence === 1 ? a : b).vitorias += 1;
  }
  return { duelos, ranking: [...linhas.values()] };
}

// ---------------------------------------------------------------- notas

type EntregaBase = {
  aluno: number;
  topico: number;
  atividade: 0 | 1;
  resposta: string | null;
  notaDaIa: number | null;
  dias: number;
  corrigida?: { nota: number; feedback: string };
};

const ENUNCIADOS: Record<string, { enunciado: string; gabarito: string }> = {
  "9101-0": {
    enunciado: "Descreva, em passos numerados, um algoritmo para fazer um café coado.",
    gabarito: "Passos em ordem, sem ambiguidade, com início e fim claros: ferver a água, colocar o filtro e o pó, despejar a água aos poucos, servir.",
  },
  "9103-0": {
    enunciado: "Explique como o programa decide se o aluno foi aprovado, com média 7, e o que acontece com média exatamente 7.",
    gabarito: "Usa uma condição `se media >= 7` para aprovado, `senão` reprovado. Média 7 entra no aprovado por causa do maior ou igual.",
  },
  "9104-1": {
    enunciado: "Explique a diferença entre os laços enquanto e para, e quando cada um é mais indicado.",
    gabarito: "O enquanto repete enquanto a condição for verdadeira e serve quando não se sabe quantas voltas; o para tem contador e serve quando o número de voltas é conhecido.",
  },
  "9106-1": {
    enunciado: "O que é o retorno de uma função? Dê um exemplo com a área do retângulo.",
    gabarito: "É o valor que a função devolve a quem a chamou. Ex.: `area(b, h)` devolve `b * h`.",
  },
};

const ENTREGAS: readonly EntregaBase[] = [
  { aluno: 4, topico: 3, atividade: 1, resposta: "O enquanto repete enquanto a condição for verdade. O para eu uso quando sei quantas vezes vai repetir, tipo contar até dez.", notaDaIa: 8.5, dias: 1 },
  { aluno: 22, topico: 3, atividade: 1, resposta: "Os dois repetem. O para é mais rápido.", notaDaIa: 4, dias: 2 },
  { aluno: 7, topico: 2, atividade: 0, resposta: "Se a média for maior que 7 aprova, senão reprova. Com 7 reprova.", notaDaIa: 5, dias: 3 },
  { aluno: 10, topico: 5, atividade: 1, resposta: "Retorno é o que a função devolve. area(b,h) retorna b*h, aí eu posso guardar numa variável.", notaDaIa: 9.5, dias: 0 },
  { aluno: 27, topico: 0, atividade: 0, resposta: "1. Ferver a água 2. Colocar o pó no filtro 3. Jogar a água 4. Servir", notaDaIa: null, dias: 4 },
  { aluno: 11, topico: 3, atividade: 1, resposta: "enquanto = while, para = for. Dá na mesma, depende do gosto da pessoa.", notaDaIa: null, dias: 2 },
  { aluno: 5, topico: 3, atividade: 1, resposta: null, notaDaIa: null, dias: 5 },
  { aluno: 8, topico: 2, atividade: 0, resposta: null, notaDaIa: null, dias: 6 },
  {
    aluno: 14,
    topico: 2,
    atividade: 0,
    resposta: "Uso se media >= 7 então aprovado, senão reprovado. Com 7 aprova, porque o >= inclui o 7.",
    notaDaIa: 10,
    dias: 7,
    corrigida: { nota: 10, feedback: "Perfeito, inclusive o caso da média exatamente 7." },
  },
  {
    aluno: 0,
    topico: 0,
    atividade: 0,
    resposta: "Ferver a água, pôr o filtro com pó na garrafa, despejar a água devagar e servir.",
    notaDaIa: 8,
    dias: 9,
    corrigida: { nota: 9, feedback: "Boa ordem. Faltou só numerar os passos, como o enunciado pede." },
  },
];

/** Os tópicos da trilha de exemplo, para o filtro de tópico da aba Notas. */
export const TOPICOS_DE_EXEMPLO = TRILHA_DE_EXEMPLO.map((t) => ({ id: t.id, nome: `${t.nome} (exemplo)` }));

/**
 * Entregas dissertativas de exemplo em todos os estados da fila: nota da IA para revisar, resposta que a
 * IA não corrigiu, prazo vencido sem entrega e já corrigida. O id da atividade é o do tópico × 10 + a
 * posição (`91041`), positivo e alto como o da trilha de exemplo.
 */
export function filaDeExemplo(hoje: Date = new Date()): LinhaDaFila[] {
  const lista = alunos(hoje);
  return ENTREGAS.map((e) => {
    const topico = TRILHA_DE_EXEMPLO[e.topico];
    const texto = ENUNCIADOS[`${topico.id}-${e.atividade}`] ?? ENUNCIADOS["9104-1"];
    const aluno = lista[e.aluno];
    return {
      alunoId: aluno.id,
      alunoNome: aluno.nome,
      atividadeId: topico.id * 10 + e.atividade + 1,
      topicoId: topico.id,
      titulo: topico.atividades[e.atividade],
      enunciado: texto.enunciado,
      gabarito: texto.gabarito,
      resposta: e.resposta,
      entregueEm: e.resposta ? emDias(hoje, e.dias, 3) : null,
      prazo: emDias(hoje, e.resposta ? e.dias - 2 : e.dias),
      pontuacaoMaxima: 10,
      pontuacaoObtida: e.corrigida ? e.corrigida.nota : e.notaDaIa,
      avaliadoEm: e.corrigida ? emDias(hoje, e.dias - 1) : null,
      feedback: e.corrigida ? e.corrigida.feedback : null,
    };
  });
}

// ---------------------------------------------------------------- conquistas e missões

/**
 * Quantos alunos de exemplo ganharam a conquista, pelo critério dela: a métrica é lida do mesmo
 * detalhe que o professor abre no aluno de exemplo (atividades entregues, dias de estudo, tempo,
 * acertos, tópicos), então "Primeiro passo" conta os 32 e "Acertos ≥ 90%" conta só quem tem 90.
 * Conquista por perfil conta só quem tem o perfil entre os representativos, como no banco. Soma-se
 * ao número real só no cartão: o aviso de editar o critério continua contando só quem ganhou de verdade.
 */
export function ganhadoresDeExemplo(
  conquista: Pick<ConquistaDaTurma, "escopo" | "perfil" | "criterio">,
  hoje: Date,
): number {
  const { metrica, limiar } = conquista.criterio;
  const ganhou = (a: MetricasDoAlunoDeExemplo): boolean => {
    switch (metrica.chave) {
      case "atividades_concluidas":
        return a.atividadesConcluidas >= Number(limiar);
      case "dias_seguidos":
        return a.diasSeguidos >= Number(limiar);
      case "minutos_totais":
        return a.minutosTotais >= Number(limiar);
      case "acertos_percentual":
        return a.acertosPercentual >= Number(limiar);
      case "topicos_visitados":
        return a.topicosVisitados >= (limiar === "todos" ? TRILHA_DE_EXEMPLO.length : Number(limiar));
      case "atividade_rapida":
        return a.atividadeMaisRapidaMin !== null && a.atividadeMaisRapidaMin <= Number(limiar);
      default:
        return false;
    }
  };
  return metricasDosAlunosDeExemplo(hoje).filter(
    (a) => (conquista.escopo !== "perfil" || (conquista.perfil !== null && a.perfis.includes(conquista.perfil))) && ganhou(a),
  ).length;
}

/** Quantos alunos de exemplo entregaram a atividade de uma missão de entrega (mesma regra: só o id decide). */
export function entreguesDeExemplo(missaoId: number): number {
  return 6 + (Math.abs(missaoId) * 7) % 22;
}
