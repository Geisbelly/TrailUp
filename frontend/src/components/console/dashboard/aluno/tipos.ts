export interface AlunoPerfil {
  nome: string;
  afinidade: number;
}

export interface Aluno {
  id: string;
  nome: string;
  email: string;
  classe_id: number;
  classe_nome: string;
  /** created_at da linha de classe_aluno: quando o aluno entrou na turma. */
  naTurmaDesde: string | null;
  notaMedia: number;
  porcentagemConcluida: number;
  tempoGastoMin: number;
  acertosPercentual: number;
  ultimaAtividade: string | null;
  perfilDominante: string;
  perfis: AlunoPerfil[];
  modoOperacao: string;
  topicos: {
    id: number;
    nome: string;
    status: "concluido" | "disponivel" | "bloqueado";
    percentual: number;
  }[];
}

export type Personalizacao = {
  id: number;
  ciclo_id: string;
  topico_id?: number | null;
  formato_prioritario?: string | null;
  formatos_gerados?: string[];
  plano?: Record<string, unknown> | null;
  materials?: Record<string, unknown> | null;
  materiais?: Record<string, unknown> | null;
  steps?: Array<Record<string, unknown>>;
  gerado_em?: string | null;
};

export type ProgressoItem = {
  id: number;
  item_key: string;
  item_kind: string;
  item_title: string;
  status: string;
  percentual_concluido: number;
  acertos_percentual?: number | null;
  tempo_gasto_min: number;
  pontuacao_obtida?: number | null;
  pontuacao_maxima?: number | null;
  updated_at?: string | null;
};

export type PersonalizacaoDocenteResponse = {
  aluno_id: string;
  classe_id: number;
  topico_id?: number | null;
  contexto_aluno?: Record<string, unknown> | null;
  personalizacoes?: Personalizacao[];
  progresso_itens?: ProgressoItem[];
};

export type EvolucaoAluno = {
  classe_id: number;
  aluno_id: string;
  dia: string;
  nota_media_desempenho: number;
  taxa_acertos_pct: number;
  taxa_acertos_sem_erro_pct: number;
  eficiencia_aprendizagem: number;
  progresso_trilha_pct: number;
};
