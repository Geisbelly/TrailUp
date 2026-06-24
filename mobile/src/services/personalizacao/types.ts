export type PersonalizacaoRecord = {
  id: number;
  aluno_id: string;
  classe_id?: number | null;
  conteudo_id?: number | null;
  topico_id?: number | null;
  ciclo_id: string;
  status?: string | null;
  source_hash?: string | null;
  formato_prioritario?: string | null;
  formatos_gerados?: string[] | null;
  plano?: Record<string, any> | null;
  materiais?: Record<string, any> | null;
  aiPatch?: Record<string, any> | null;
  ai_patch?: Record<string, any> | null;
  design_tokens?: Record<string, any> | null;
  designTokens?: Record<string, any> | null;
  steps?: Record<string, any>[] | null;
  gerado_em?: string | null;
  updated_at?: string | null;
};

export type PersonalizacaoListResponse = {
  aluno_id: string;
  total: number;
  itens: PersonalizacaoRecord[];
};

export type CardPersonalizadoRecord = {
  id: number;
  aluno_id?: string | null;
  classe_id?: number | null;
  topico_id?: number | null;
  conteudo_id?: number | null;
  ciclo_id?: string | null;
  ordem?: number | null;
  titulo?: string | null;
  descricao?: string | null;
  icone?: string | null;
  dificuldade?: string | null;
  xp?: number | null;
  metadata?: Record<string, any> | null;
  ativo?: boolean | null;
};

export type PersonalizarPayload = {
  classe_id: number;
  topico_id?: number | null;
  conteudo_id?: number | null;
  conteudo_foco_id?: number | null;
  perfis?: { nome: string; afinidade?: number | null }[];
  topico_snapshot?: Record<string, any> | null;
  materiais_origem_cliente?: Record<string, any>[];
};

export type PersonalizacaoProgressPayload = {
  personalizacao_id: number;
  classe_id: number;
  topico_id: number;
  item_key: string;
  item_kind: "content" | "activity" | "cards";
  item_title: string;
  status: "nao_iniciado" | "em_andamento" | "concluido";
  percentual_concluido: number;
  acertos_percentual?: number | null;
  tempo_gasto_min?: number | null;
  pontuacao_obtida?: number | null;
  pontuacao_maxima?: number | null;
  metadata?: Record<string, any> | null;
};

export type PersonalizacaoProgressDirectPayload =
  PersonalizacaoProgressPayload & { aluno_id: string };

export type MentorChatMessagePayload = {
  role: "assistant" | "user";
  content: string;
};

export type MentorChatPayload = {
  classe_id: number;
  topico_id?: number | null;
  conteudo_id?: number | null;
  escopo?: "modulo" | "trilha_home";
  mensagem: string;
  historico?: MentorChatMessagePayload[];
};

export type MentorChatResponse = {
  reply: string;
  scope: "modulo" | "trilha_home";
  should_close?: boolean;
  hinted_actions?: string[];
};

export type PersonalizacaoJobRecord = {
  id: number;
  kind: string;
  status: string;
  classe_id: number;
  aluno_id: string | null;
  topico_id: number | null;
  conteudo_id: number | null;
  total_targets: number | null;
  processed_targets: number | null;
  error_count: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type ListarPersonalizacoesPerfilParams = {
  classeId: number;
  topicoId?: number | null;
  conteudoId?: number | null;
  brainhexProfileKey: string;
  limit?: number;
};

export type ListarJobsParams = {
  alunoId: string;
  classeId: number;
  limit?: number;
};

export type SubscribePersonalizacoesClasseParams = {
  classeId: number;
  onChange: () => void;
};
