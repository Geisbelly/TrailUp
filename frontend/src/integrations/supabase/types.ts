export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/**
 * Tipos resumidos do banco usados no console.
 * Substitua por tipos gerados automaticamente se preferir.
 */
export type Database = {
  public: {
    Tables: {
      alunos: {
        Row: {
          id: string
          nome: string
          email: string
          descricao: string | null
          modooperacao_id: number | null
          apelido: string | null
          foto_url: string | null
          banner_url: string | null
          modo_resposta: string | null
        }
        Insert: {
          id: string
          nome: string
          email: string
          descricao?: string | null
          modooperacao_id?: number | null
          apelido?: string | null
          foto_url?: string | null
          banner_url?: string | null
          modo_resposta?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["alunos"]["Insert"]>
        Relationships: [
          {
            foreignKeyName: "alunos_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
            referencedSchema: "auth"
          },
          {
            foreignKeyName: "alunos_modooperacao_id_fkey"
            columns: ["modooperacao_id"]
            isOneToOne: false
            referencedRelation: "modoOperacao"
            referencedColumns: ["id"]
          }
        ]
      }
      aluno_perfil: {
        Row: {
          aluno_id: string
          perfil_id: number
          afinidade: number | null
          criado_em: string | null
          atualizado_em: string | null
        }
        Insert: {
          aluno_id: string
          perfil_id: number
          afinidade?: number | null
          criado_em?: string | null
          atualizado_em?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["aluno_perfil"]["Insert"]>
        Relationships: []
      }
      perfil: {
        Row: {
          id: number
          nome: string | null
          descricao: string | null
          caracteristicas: Json | null
          created_at: string
        }
        Insert: {
          id?: number
          nome?: string | null
          descricao?: string | null
          caracteristicas?: Json | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["perfil"]["Insert"]>
        Relationships: []
      }
      modoOperacao: {
        Row: {
          id: number
          nome: string | null
          descricao: string | null
          ordem: Json | null
          created_at: string
          modoResposta: string | null
        }
        Insert: {
          id?: number
          nome?: string | null
          descricao?: string | null
          ordem?: Json | null
          created_at?: string
          modoResposta?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["modoOperacao"]["Insert"]>
        Relationships: []
      }
      iaDescricao: {
        Row: {
          id: number
          aluno_id: string | null
          recomendacaoTrilha: string | null
          modoOperacao: string | null
          insights: Json | null
          perfisDetectados: Json | null
          created_at: string
        }
        Insert: {
          id?: number
          aluno_id?: string | null
          recomendacaoTrilha?: string | null
          modoOperacao?: string | null
          insights?: Json | null
          perfisDetectados?: Json | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["iaDescricao"]["Insert"]>
        Relationships: []
      }
      professor: {
        Row: {
          id: string
          nome: string | null
          descricao: string | null
          instituicao: string | null
          disciplina: string | null
          liberado: boolean
          created_at: string
        }
        Insert: {
          id: string
          nome?: string | null
          descricao?: string | null
          instituicao?: string | null
          disciplina?: string | null
          liberado?: boolean | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["professor"]["Insert"]>
        Relationships: []
      }
      professor_aluno: {
        Row: {
          professor_id: string
          aluno_id: string
          has_acesso: boolean
          created_at: string | null
        }
        Insert: {
          professor_id: string
          aluno_id: string
          has_acesso?: boolean
          created_at?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["professor_aluno"]["Insert"]>
        Relationships: []
      }
      materia: {
        Row: {
          id: number
          nome: string | null
          descricao: string | null
          created_at: string
        }
        Insert: {
          id?: number
          nome?: string | null
          descricao?: string | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["materia"]["Insert"]>
        Relationships: []
      }
      classe: {
        Row: {
          id: number
          materia_id: number | null
          professor_id: string | null
          descricao: string | null
          created_at: string
        }
        Insert: {
          id?: number
          materia_id?: number | null
          professor_id?: string | null
          descricao?: string | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["classe"]["Insert"]>
        Relationships: []
      }
      classe_aluno: {
        Row: {
          id: number
          classe_id: number | null
          aluno_id: string | null
          iadescricao_id: number | null
          notaMedia: number | null
          tempoMedioPorAtividade: number | null
          acertosPercentual: number | null
          created_at: string
          porcentagemConcluida: number | null
          ultimaAtividade: number | null
          tempoGastoMin: number | null
          isComplete: boolean | null
          atividadesConcluidas: Json | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          classe_id?: number | null
          aluno_id?: string | null
          iadescricao_id?: number | null
          notaMedia?: number | null
          tempoMedioPorAtividade?: number | null
          acertosPercentual?: number | null
          created_at?: string
          porcentagemConcluida?: number | null
          ultimaAtividade?: number | null
          tempoGastoMin?: number | null
          isComplete?: boolean | null
          atividadesConcluidas?: Json | null
          updated_at?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["classe_aluno"]["Insert"]>
        Relationships: []
      }
      fontes_personalizacao: {
        Row: {
          id: number
          classe_id: number
          topico_id: number | null
          conteudo_id: number | null
          aluno_id: string | null
          professor_id: string | null
          visibilidade: string
          tipo: string
          titulo: string | null
          descricao: string | null
          arquivo_url: string | null
          storage_path: string | null
          mime_type: string | null
          nome_arquivo: string | null
          tamanho_bytes: number | null
          origem: string
          metadata: Json
          criado_em: string
        }
        Insert: {
          id?: number
          classe_id: number
          topico_id?: number | null
          conteudo_id?: number | null
          aluno_id?: string | null
          professor_id?: string | null
          visibilidade?: string
          tipo: string
          titulo?: string | null
          descricao?: string | null
          arquivo_url?: string | null
          storage_path?: string | null
          mime_type?: string | null
          nome_arquivo?: string | null
          tamanho_bytes?: number | null
          origem?: string
          metadata?: Json
          criado_em?: string
        }
        Update: Partial<Database["public"]["Tables"]["fontes_personalizacao"]["Insert"]>
        Relationships: []
      }
      topicos: {
        Row: {
          id: number
          classe_id: number
          nome: string
          descricao: string | null
          ordem: number | null
          created_at: string
          next: Json | null
          depende: Json | null
        }
        Insert: {
          id?: number
          classe_id: number
          nome: string
          descricao?: string | null
          ordem?: number | null
          created_at?: string
          next?: Json | null
          depende?: Json | null
        }
        Update: Partial<Database["public"]["Tables"]["topicos"]["Insert"]>
        Relationships: []
      }
      conteudos: {
        Row: {
          id: number
          topico_id: number
          titulo: string
          tipo: string
          conteudo: string | null
          ordem: number | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: number
          topico_id: number
          titulo: string
          tipo: string
          conteudo?: string | null
          ordem?: number | null
          metadata?: Json | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["conteudos"]["Insert"]>
        Relationships: []
      }
      atividades: {
        Row: {
          id: number
          topico_id: number
          titulo: string
          descricao: string | null
          tipo: string | null
          pontuacao_maxima: number | null
          data_entrega: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: number
          topico_id: number
          titulo: string
          descricao?: string | null
          tipo?: string | null
          pontuacao_maxima?: number | null
          data_entrega?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["atividades"]["Insert"]>
        Relationships: []
      }
      atividade_conteudos: {
        Row: {
          atividade_id: number
          conteudo_id: number
        }
        Insert: {
          atividade_id: number
          conteudo_id: number
        }
        Update: Partial<Database["public"]["Tables"]["atividade_conteudos"]["Insert"]>
        Relationships: []
      }
      atividade_aluno: {
        Row: {
          id: number
          aluno_id: string
          atividade_id: number
          status: string | null
          percentual_concluido: number | null
          acertos_percentual: number | null
          tempo_gasto_min: number | null
          ultima_visualizacao: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          aluno_id: string
          atividade_id: number
          status?: string | null
          percentual_concluido?: number | null
          acertos_percentual?: number | null
          tempo_gasto_min?: number | null
          ultima_visualizacao?: string | null
          updated_at?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["atividade_aluno"]["Insert"]>
        Relationships: []
      }
      conteudo_aluno: {
        Row: {
          id: number
          aluno_id: string
          conteudo_id: number
          status: string | null
          percentual_concluido: number | null
          tempo_gasto_min: number | null
          ultima_visualizacao: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          aluno_id: string
          conteudo_id: number
          status?: string | null
          percentual_concluido?: number | null
          tempo_gasto_min?: number | null
          ultima_visualizacao?: string | null
          updated_at?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["conteudo_aluno"]["Insert"]>
        Relationships: []
      }
      questoes: {
        Row: {
          id: number
          atividade_id: number
          enunciado: string
          tipo: string | null
          alternativas: Json | null
          resposta_correta: string | null
          midia_url: string | null
          nota_estabelecida: number | null
          created_at: string
        }
        Insert: {
          id?: number
          atividade_id: number
          enunciado: string
          tipo?: string | null
          alternativas?: Json | null
          resposta_correta?: string | null
          midia_url?: string | null
          nota_estabelecida?: number | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["questoes"]["Insert"]>
        Relationships: []
      }
      rank_tipo: {
        Row: {
          id: number
          nome: string
          descricao: string | null
          criterio: string | null
          created_at: string
          icone: number | null
        }
        Insert: {
          id?: number
          nome: string
          descricao?: string | null
          criterio?: string | null
          created_at?: string
          icone?: number | null
        }
        Update: Partial<Database["public"]["Tables"]["rank_tipo"]["Insert"]>
        Relationships: []
      }
      ranks: {
        Row: {
          id: number
          tipo_id: number
          classe_id: number | null
          periodo: string | null
          created_at: string
        }
        Insert: {
          id?: number
          tipo_id: number
          classe_id?: number | null
          periodo?: string | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["ranks"]["Insert"]>
        Relationships: []
      }
      rank_posicoes: {
        Row: {
          id: number
          rank_id: number
          aluno_id: string
          posicao: number | null
          pontuacao: number | null
          progresso: number | null
          medalha: string | null
          created_at: string
        }
        Insert: {
          id?: number
          rank_id: number
          aluno_id: string
          posicao?: number | null
          pontuacao?: number | null
          progresso?: number | null
          medalha?: string | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["rank_posicoes"]["Insert"]>
        Relationships: []
      }
      questao_aluno: {
        Row: {
          id: number
          aluno_id: string
          questao_id: number
          atividade_id: number
          tentativa: number
          resposta: string
          correta: boolean | null
          acertos_percentual: number | null
          tempo_gasto_seg: number | null
          criado_em: string | null
        }
        Insert: {
          id?: number
          aluno_id: string
          questao_id: number
          atividade_id: number
          tentativa?: number
          resposta: string
          correta?: boolean | null
          acertos_percentual?: number | null
          tempo_gasto_seg?: number | null
          criado_em?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["questao_aluno"]["Insert"]>
        Relationships: []
      }
      topico_edges: {
        Row: {
          from_id: number
          to_id: number
          classe_id: number
          created_at: string
        }
        Insert: {
          from_id: number
          to_id: number
          classe_id: number
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["topico_edges"]["Insert"]>
        Relationships: []
      }
      topico_aluno: {
        Row: {
          id: number
          aluno_id: string
          topico_id: number
          status: string | null
          percentual_concluido: number | null
          ultima_atividade: number | null
          ultima_visualizacao: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          aluno_id: string
          topico_id: number
          status?: string | null
          percentual_concluido?: number | null
          ultima_atividade?: number | null
          ultima_visualizacao?: string | null
          updated_at?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["topico_aluno"]["Insert"]>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_cadastrar_aluno_com_perfis: {
        Args: {
          p_auth_user_id: string
          p_nome_completo: string
          p_email: string
          p_apelido: string
          p_modooperacao_nome: string
          p_perfis: Json
        }
        Returns: Database["public"]["Tables"]["alunos"]["Row"]
      }
      fn_auth_email_exists: {
        Args: {
          p_email: string
        }
        Returns: boolean
      }
      inscrever_aluno_em_classe: {
        Args: {
          p_aluno_id: string
          p_classe_id: number
        }
        Returns: Database["public"]["Tables"]["classe_aluno"]["Row"]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
