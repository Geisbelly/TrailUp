// Explicações das métricas do app (spec 2026-11-20-metricas-explicadas). Os textos falam com o
// aluno e são mais curtos que os do console; o selo de cada chave comum é o mesmo nos dois
// (frontend/src/lib/metricas/paridade.test.ts). `referencia` registra a fonte e nunca vai para a tela.
import dados from "@/constants/metricasExplicadas.json";
import type { ProfileMetricsViewModel } from "@/components/perfil/profileMetricsViewModel";

export type Selo = "medido" | "regra" | "estimativa";

export type ExplicacaoMetrica = {
  nome: string;
  selo: Selo;
  oQueMede: string;
  comoColeta: string;
  atualiza: string;
  limites?: string[];
  naoSignifica: string;
  referencia: string;
};

export type ChaveMetrica = keyof typeof dados;

const CATALOGO = dados as Record<ChaveMetrica, ExplicacaoMetrica>;

export function explicacaoDe(chave: ChaveMetrica): ExplicacaoMetrica {
  return CATALOGO[chave];
}

export function rotuloAcessivel(chave: ChaveMetrica): string {
  return `Como funciona: ${CATALOGO[chave].nome}`;
}

export const ROTULO_DO_SELO: Record<Selo, string> = {
  medido: "Medido",
  regra: "Calculado",
  estimativa: "Estimativa",
};

export const FRASE_DO_SELO: Record<Selo, string> = {
  medido: "Medido: o app contou direto o que aconteceu.",
  regra: "Calculado: uma conta feita em cima do que o app registrou.",
  estimativa: "Estimativa: um palpite do sistema, ainda não conferido com alunos.",
};

/** Que explicação acompanha cada número do Perfil. Os painéis leem daqui, não escrevem a chave à mão. */
export const CHAVE_DO_CAMPO = {
  progresso: "aluno.progresso",
  acertos: "aluno.acertos",
  tempo: "aluno.tempo_total",
  tempoMedio: "aluno.tempo_total",
  tempoTopicoAcumuladoMin: "aluno.tempo_total",
  tempoConteudoAcumuladoMin: "aluno.tempo_total",
  tempoAtividadeAcumuladoMin: "aluno.tempo_total",
  sessionActiveSec: "aluno.tempo_sessao",
  tempoAtivoMin: "aluno.tempo_sessao",
  tempoTopico: "aluno.tempo_sessao",
  tempoConteudo: "aluno.tempo_sessao",
  tempoAtividade: "aluno.tempo_sessao",
  sessionEngajamento: "aluno.engajamento_sessao",
  touchTotal: "aluno.interacoes_sessao",
  scrollTotal: "aluno.interacoes_sessao",
  topicosVisitados: "aluno.topicos_visitados",
  diasAtivos: "aluno.dias_ativos",
  semanaDiaria: "aluno.dias_ativos",
  eventosRecentes: "aluno.registros_recentes",
  ultimoEvento: "aluno.ultimo_estudo",
  concluidos: "aluno.topicos_concluidos",
  emAndamento: "aluno.topicos_concluidos",
  topicosDescobertos: "aluno.exploracao",
  taxaExploracao: "aluno.exploracao",
  conteudosConcluidos: "aluno.conteudos_concluidos",
  taxaConteudo: "aluno.conteudos_concluidos",
  atividadesConcluidas: "aluno.atividades_concluidas",
  taxaAtividade: "aluno.atividades_concluidas",
  totalConquistas: "aluno.conquistas",
  melhorPosicao: "aluno.ranking",
  afinidades: "aluno.afinidades",
  danoTotal: "aluno.dano_boss",
  melhorTempoMin: "aluno.melhor_tempo",
  emotionLabel: "aluno.emocao",
  analysisSummary: "aluno.leitura_adaptativa",
} as const satisfies Partial<Record<keyof ProfileMetricsViewModel, ChaveMetrica>>;

/** Gráficos que juntam várias métricas e não são um campo só do view model. */
export const CHAVE_DO_GRAFICO = {
  radar: "aluno.radar",
} as const satisfies Record<string, ChaveMetrica>;

const SELOS: readonly string[] = ["medido", "regra", "estimativa"];
const TEXTOS = ["nome", "oQueMede", "comoColeta", "atualiza", "naoSignifica", "referencia"] as const;
const MAX_LIMITES = 3;

/** Lista legível do que está errado no catálogo. Vazia = válido. Mesma regra do console. */
export function problemasDoCatalogo(cat: Record<string, unknown>, maxCaracteres: number): string[] {
  const problemas: string[] = [];
  for (const [chave, bruto] of Object.entries(cat)) {
    const e = (bruto ?? {}) as Record<string, unknown>;
    if (!SELOS.includes(e.selo as string)) problemas.push(`${chave}: selo inválido (${String(e.selo)})`);
    for (const campo of TEXTOS) {
      const v = e[campo];
      if (typeof v !== "string" || v.trim() === "") {
        problemas.push(`${chave}: ${campo} vazio`);
      } else if (campo !== "referencia" && v.length > maxCaracteres) {
        problemas.push(`${chave}: ${campo} com ${v.length} caracteres (máximo ${maxCaracteres})`);
      }
    }
    if (e.limites !== undefined) {
      const limites = e.limites;
      if (!Array.isArray(limites)) {
        problemas.push(`${chave}: limites não é lista`);
      } else {
        if (limites.length > MAX_LIMITES) problemas.push(`${chave}: limites com ${limites.length} itens (máximo ${MAX_LIMITES})`);
        limites.forEach((l, i) => {
          if (typeof l !== "string" || l.trim() === "") problemas.push(`${chave}: limites[${i}] vazio`);
          else if (l.length > maxCaracteres) problemas.push(`${chave}: limites[${i}] com ${l.length} caracteres (máximo ${maxCaracteres})`);
        });
      }
    }
  }
  return problemas;
}
