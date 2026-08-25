/**
 * ESTRUTURA DO BANCO DE DADOS - TRAILUP
 * Este arquivo contém a documentação da estrutura do banco de dados
 * e os tipos para integração futura com o Supabase
 * 
 * PARA CONECTAR COM SUPABASE:
 * 1. Configure as variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
 * 2. Importe o cliente de src/integrations/supabase/client.ts
 * 3. Substitua as funções mock pelos chamadas reais ao Supabase
 */

// =============================================================================
// TIPOS BASE (já existentes no banco)
// =============================================================================

export type AppRole = 'admin' | 'professor' | 'aluno';
export type StatusAtividade = 'não iniciado' | 'em andamento' | 'concluído';

// =============================================================================
// NOVAS TABELAS NECESSÁRIAS
// =============================================================================

/**
 * Tabela: user_roles
 * Gerencia roles de forma segura (evita privilege escalation)
 */
export interface UserRole {
  id: string; // uuid
  user_id: string; // uuid -> auth.users(id)
  role: AppRole;
  created_at: string;
}

/**
 * Tabela: atividade_modulos (NOVA)
 * Relacionamento N:N entre atividades e módulos (tópicos)
 */
export interface AtividadeModulo {
  id: number;
  atividade_id: number; // -> atividades(id)
  topico_id: number; // -> topicos(id)
  created_at: string;
}

/**
 * Tabela: app_config (NOVA)
 * Configurações globais do app incluindo links de download
 */
export interface AppConfig {
  id: number;
  chave: string; // 'play_store_link', 'apk_url', 'aab_url'
  valor: string;
  descricao: string;
  updated_at: string;
}

// =============================================================================
// AJUSTES EM TABELAS EXISTENTES
// =============================================================================

/**
 * Tabela: professor (ajustes)
 * Adicionar campos para autenticação e aprovação
 */
export interface Professor {
  id: string; // uuid -> auth.users(id)
  nome: string;
  email?: string;
  instituicao: string;
  disciplina: string;
  descricao: string;
  liberado: boolean; // default false
  termos_aceitos: boolean; // default false
  termos_aceitos_em: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Tabela: alunos (ajustes)
 * Adicionar apelido e consentimento de pesquisa
 */
export interface Aluno {
  id: string; // uuid -> auth.users(id)
  nome: string;
  email: string;
  apelido?: string;
  descricao?: string;
  modooperacao_id?: number;
  consentimento_pesquisa: boolean;
  consentimento_em?: string;
  created_at?: string;
}

/**
 * Tabela: aluno_perfil (existente)
 * Armazena afinidade de cada perfil BrainHex (0-100%)
 */
export interface AlunoPerfil {
  aluno_id: string;
  perfil_id: number;
  afinidade: number; // 0-100
  criado_em: string;
  atualizado_em: string;
}

/**
 * Tabela: perfil (existente - 7 perfis BrainHex)
 */
export interface Perfil {
  id: number;
  nome: string; // 'Achiever', 'Seeker', 'Mastermind', 'Conqueror', 'Socializer', 'Daredevil', 'Survivor'
  descricao: string;
  caracteristicas: Record<string, unknown>;
  created_at: string;
}

// =============================================================================
// TABELAS EXISTENTES (referência)
// =============================================================================

export interface Materia {
  id: number;
  nome: string;
  descricao?: string;
  created_at: string;
}

export interface Classe {
  id: number;
  materia_id: number;
  professor_id: string;
  descricao: string;
  created_at: string;
}

export interface ClasseAluno {
  id: number;
  classe_id: number;
  aluno_id: string;
  iadescricao_id?: number;
  notaMedia?: number;
  tempoMedioPorAtividade?: number;
  acertosPercentual?: number;
  porcentagemConcluida?: number;
  ultimaAtividade?: number;
  tempoGastoMin?: number;
  isComplete?: boolean;
  atividadesConcluidas?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Topico {
  id: number;
  classe_id: number;
  nome: string;
  descricao?: string;
  ordem?: number;
  next?: Record<string, unknown>;
  depende?: Record<string, unknown>;
  created_at: string;
}

export interface Conteudo {
  id: number;
  topico_id: number;
  titulo: string;
  tipo: string;
  conteudo?: string;
  ordem?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Atividade {
  id: number;
  topico_id: number;
  titulo: string;
  descricao?: string;
  tipo?: string;
  pontuacao_maxima: number;
  data_entrega?: string;
  created_at: string;
}

export interface Questao {
  id: number;
  atividade_id: number;
  enunciado: string;
  tipo?: string;
  alternativas?: Record<string, unknown>;
  resposta_correta?: string;
  nota_estabelecida?: number | null;
  midia_url?: string;
  created_at: string;
}

// =============================================================================
// SQL PARA AJUSTES NO BANCO
// =============================================================================

export const MIGRATION_SQL = `
-- =============================================================================
-- ENUM E TABELA DE ROLES (SEGURANÇA)
-- =============================================================================

CREATE TYPE public.app_role AS ENUM ('admin', 'professor', 'aluno');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função para verificar role (evita recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- =============================================================================
-- AJUSTES NA TABELA PROFESSOR
-- =============================================================================

ALTER TABLE public.professor 
  ADD COLUMN IF NOT EXISTS instituicao text,
  ADD COLUMN IF NOT EXISTS disciplina text,
  ADD COLUMN IF NOT EXISTS liberado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS termos_aceitos boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS termos_aceitos_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Função para verificar se professor está liberado
CREATE OR REPLACE FUNCTION public.is_professor_liberado(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.professor
    WHERE id = _user_id
      AND liberado = true
  )
$$;

-- =============================================================================
-- AJUSTES NA TABELA ALUNOS
-- =============================================================================

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS apelido text,
  ADD COLUMN IF NOT EXISTS consentimento_pesquisa boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS consentimento_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

-- =============================================================================
-- NOVA TABELA: ATIVIDADE_MODULOS (N:N)
-- Permite que uma atividade pertença a múltiplos módulos/tópicos
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.atividade_modulos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  atividade_id bigint NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  topico_id bigint NOT NULL REFERENCES public.topicos(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(atividade_id, topico_id)
);

ALTER TABLE public.atividade_modulos ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- NOVA TABELA: APP_CONFIG
-- Configurações globais do app (links de download, etc)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_config (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave text UNIQUE NOT NULL,
  valor text NOT NULL,
  descricao text,
  updated_at timestamp with time zone DEFAULT now()
);

-- Inserir configurações iniciais
INSERT INTO public.app_config (chave, valor, descricao) VALUES
  ('play_store_link', '', 'Link da Play Store'),
  ('apk_url', '', 'URL do arquivo APK para download'),
  ('aab_url', '', 'URL do arquivo AAB para download');

-- =============================================================================
-- INSERIR 7 PERFIS BRAINHEX
-- =============================================================================

INSERT INTO public.perfil (nome, descricao, caracteristicas) VALUES
  ('Achiever', 'Busca completar objetivos e colecionar conquistas', '{"foco": "metas", "motivacao": "conclusao"}'),
  ('Seeker', 'Curioso e explorador, gosta de descobrir novidades', '{"foco": "descoberta", "motivacao": "curiosidade"}'),
  ('Mastermind', 'Estrategista que prefere planejar e otimizar', '{"foco": "estrategia", "motivacao": "eficiencia"}'),
  ('Conqueror', 'Competitivo, gosta de superar desafios difíceis', '{"foco": "desafio", "motivacao": "vitoria"}'),
  ('Socializer', 'Valoriza interações sociais e colaboração', '{"foco": "pessoas", "motivacao": "conexao"}'),
  ('Daredevil', 'Busca emoção, adrenalina e experiências intensas', '{"foco": "emocao", "motivacao": "intensidade"}'),
  ('Survivor', 'Prefere segurança, cautela e evita riscos', '{"foco": "seguranca", "motivacao": "estabilidade"}')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Professors podem ver apenas alunos de suas classes
CREATE POLICY "Professors can view students in their classes"
ON public.alunos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'professor') AND
  public.is_professor_liberado(auth.uid()) AND
  EXISTS (
    SELECT 1 FROM public.classe_aluno ca
    JOIN public.classe c ON ca.classe_id = c.id
    WHERE ca.aluno_id = alunos.id
    AND c.professor_id = auth.uid()
  )
);

-- Alunos podem ver apenas seus próprios dados
CREATE POLICY "Students can view own data"
ON public.alunos
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Professors liberados podem gerenciar suas classes
CREATE POLICY "Professors can manage their classes"
ON public.classe
FOR ALL
TO authenticated
USING (
  professor_id = auth.uid() AND
  public.is_professor_liberado(auth.uid())
)
WITH CHECK (
  professor_id = auth.uid() AND
  public.is_professor_liberado(auth.uid())
);

-- Atividade_modulos: professors podem gerenciar via suas classes
CREATE POLICY "Professors can manage activity modules"
ON public.atividade_modulos
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'professor') AND
  public.is_professor_liberado(auth.uid())
);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_professor_updated_at
  BEFORE UPDATE ON public.professor
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para criar user_role ao cadastrar professor
CREATE OR REPLACE FUNCTION public.handle_new_professor()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'professor');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_professor_created
  AFTER INSERT ON public.professor
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_professor();

-- Trigger para criar user_role ao cadastrar aluno
CREATE OR REPLACE FUNCTION public.handle_new_aluno()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'aluno');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_aluno_created
  AFTER INSERT ON public.alunos
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_aluno();
`;

// =============================================================================
// DADOS MOCK PARA DESENVOLVIMENTO
// =============================================================================

export const MOCK_PERFIS: Perfil[] = [
  { id: 1, nome: 'Achiever', descricao: 'Busca completar objetivos e colecionar conquistas', caracteristicas: { foco: 'metas' }, created_at: new Date().toISOString() },
  { id: 2, nome: 'Seeker', descricao: 'Curioso e explorador', caracteristicas: { foco: 'descoberta' }, created_at: new Date().toISOString() },
  { id: 3, nome: 'Mastermind', descricao: 'Estrategista que prefere planejar', caracteristicas: { foco: 'estrategia' }, created_at: new Date().toISOString() },
  { id: 4, nome: 'Conqueror', descricao: 'Competitivo, gosta de superar desafios', caracteristicas: { foco: 'desafio' }, created_at: new Date().toISOString() },
  { id: 5, nome: 'Socializer', descricao: 'Valoriza interações sociais', caracteristicas: { foco: 'pessoas' }, created_at: new Date().toISOString() },
  { id: 6, nome: 'Daredevil', descricao: 'Busca emoção e adrenalina', caracteristicas: { foco: 'emocao' }, created_at: new Date().toISOString() },
  { id: 7, nome: 'Survivor', descricao: 'Prefere segurança e cautela', caracteristicas: { foco: 'seguranca' }, created_at: new Date().toISOString() },
];

export const BRAINHEX_PROFILES = [
  'Achiever',
  'Seeker', 
  'Mastermind',
  'Conqueror',
  'Socializer',
  'Daredevil',
  'Survivor',
] as const;

export type BrainHexProfile = typeof BRAINHEX_PROFILES[number];
