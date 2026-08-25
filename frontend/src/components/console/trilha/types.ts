export interface Topico {
  id: number;
  classe_id: number;
  nome: string;
  descricao: string | null;
  ordem: number | null;
  next: number[];
  depende: number[];
  created_at: string | null;
}

export interface Classe {
  id: number;
  descricao: string | null;
  materia_id?: number | null;
}

export interface Materia {
  id: number;
  nome: string | null;
  descricao?: string | null;
}

export interface ConteudoFile {
  path: string;
  name: string;
  size: number;
}

/** Arquivo aguardando upload em fluxos de materiais */
export interface StagedFile {
  file: File;
  id: string;
}

/** Descritor de arquivo usado para geração de trilha baseada em arquivos */
export interface FileDescriptor {
  name: string;
  mime_type: string;
  size: number;
  file_index: number;
}

/** Registro para persistência na tabela fontes_personalizacao */
export interface FontePersonalizacao {
  classe_id: number;
  topico_id: number;
  conteudo_id: number;
  tipo: string;
  storage_path: string;
  mime_type: string;
  nome_arquivo: string;
}

export interface Conteudo {
  id: number;
  titulo: string;
  tipo: string;
  ordem: number | null;
  conteudo: string | null;
  metadata?: { files?: ConteudoFile[] } | null;
}

export type TipoAtividade = "quiz" | "true_false" | "fill_blank" | "essay" | "questao" | "video" | "texto";

export interface AiSuggestion {
  descricao?: string;
  cards: Array<{ titulo: string; descricao: string }>;
  atividades: Array<{
    titulo: string;
    enunciado: string;
    tipo: TipoAtividade;
    alternativas: string[] | null;
    resposta_correta: string;
    nota_estabelecida?: number | null;
  }>;
}

export interface Atividade {
  id: number;
  topico_id: number;
  titulo: string;
  descricao: string | null;
  tipo: string | null;
  data_entrega: string | null;
}

export interface Questao {
  id: number;
  atividade_id: number;
  enunciado: string;
  tipo: string | null;
  alternativas: unknown;
  resposta_correta: string | null;
  nota_estabelecida?: number | null;
  midia_url?: string | null;
}

export interface CardItem {
  id: number;
  conteudo_id: number | null;
  conteudo_origem_id?: number | null;
  titulo: string | null;
  descricao: string | null;
  imagem_url: string | null;
}

export interface AtividadeConteudo {
  atividade_id: number;
  conteudo_id: number;
}
