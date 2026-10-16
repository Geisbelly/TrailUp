export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alembic_version: {
        Row: {
          version_num: string
        }
        Insert: {
          version_num: string
        }
        Update: {
          version_num?: string
        }
        Relationships: []
      }
      aluno_atividade_diaria: {
        Row: {
          aberturas: number
          aluno_id: string
          atualizado_em: string
          dia: string
          id: number
          notificacoes_dia: number
          primeiro_acesso_em: string | null
          tempo_uso_seg: number
          timezone: string
          ultimo_acesso_em: string | null
        }
        Insert: {
          aberturas?: number
          aluno_id: string
          atualizado_em?: string
          dia: string
          id?: number
          notificacoes_dia?: number
          primeiro_acesso_em?: string | null
          tempo_uso_seg?: number
          timezone?: string
          ultimo_acesso_em?: string | null
        }
        Update: {
          aberturas?: number
          aluno_id?: string
          atualizado_em?: string
          dia?: string
          id?: number
          notificacoes_dia?: number
          primeiro_acesso_em?: string | null
          tempo_uso_seg?: number
          timezone?: string
          ultimo_acesso_em?: string | null
        }
        Relationships: []
      }
      aluno_mental_state_history: {
        Row: {
          aluno_id: string
          ciclo_id: string | null
          confidence: number | null
          created_at: string
          id: number
          intensity: number | null
          kind: string
          reason: string | null
        }
        Insert: {
          aluno_id: string
          ciclo_id?: string | null
          confidence?: number | null
          created_at?: string
          id?: never
          intensity?: number | null
          kind: string
          reason?: string | null
        }
        Update: {
          aluno_id?: string
          ciclo_id?: string | null
          confidence?: number | null
          created_at?: string
          id?: never
          intensity?: number | null
          kind?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_aluno_mental_state_history_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_aluno_mental_state_history_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_aluno_mental_state_history_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_aluno_mental_state_history_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_aluno_mental_state_history_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      aluno_perfil: {
        Row: {
          afinidade: number | null
          aluno_id: string
          atualizado_em: string | null
          criado_em: string | null
          perfil_id: number
        }
        Insert: {
          afinidade?: number | null
          aluno_id: string
          atualizado_em?: string | null
          criado_em?: string | null
          perfil_id: number
        }
        Update: {
          afinidade?: number | null
          aluno_id?: string
          atualizado_em?: string | null
          criado_em?: string | null
          perfil_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "aluno_perfil_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aluno_perfil_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "aluno_perfil_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "aluno_perfil_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "aluno_perfil_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "aluno_perfil_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      aluno_sessoes_app: {
        Row: {
          aluno_id: string
          atualizado_em: string
          device_id: string | null
          duracao_seg: number
          encerrada_em: string | null
          id: number
          iniciada_em: string
          origem: string
          plataforma: string
          timezone: string
        }
        Insert: {
          aluno_id: string
          atualizado_em?: string
          device_id?: string | null
          duracao_seg?: number
          encerrada_em?: string | null
          id?: number
          iniciada_em?: string
          origem?: string
          plataforma?: string
          timezone?: string
        }
        Update: {
          aluno_id?: string
          atualizado_em?: string
          device_id?: string | null
          duracao_seg?: number
          encerrada_em?: string | null
          id?: number
          iniciada_em?: string
          origem?: string
          plataforma?: string
          timezone?: string
        }
        Relationships: []
      }
      aluno_topico_dominio: {
        Row: {
          aluno_id: string
          atualizado_em: string
          confianca: number
          dominio_estimado: number
          id: number
          tendencia: string
          topico_id: number
        }
        Insert: {
          aluno_id: string
          atualizado_em?: string
          confianca: number
          dominio_estimado: number
          id?: number
          tendencia: string
          topico_id: number
        }
        Update: {
          aluno_id?: string
          atualizado_em?: string
          confianca?: number
          dominio_estimado?: number
          id?: number
          tendencia?: string
          topico_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "aluno_topico_dominio_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aluno_topico_dominio_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      alunos: {
        Row: {
          apelido: string | null
          banner_url: string | null
          descricao: string | null
          email: string
          foto_url: string | null
          id: string
          modo_resposta:
            | Database["public"]["Enums"]["modo_resposta_type"]
            | null
          modooperacao_id: number | null
          nome: string
          perfil_ativo: string | null
        }
        Insert: {
          apelido?: string | null
          banner_url?: string | null
          descricao?: string | null
          email: string
          foto_url?: string | null
          id: string
          modo_resposta?:
            | Database["public"]["Enums"]["modo_resposta_type"]
            | null
          modooperacao_id?: number | null
          nome: string
          perfil_ativo?: string | null
        }
        Update: {
          apelido?: string | null
          banner_url?: string | null
          descricao?: string | null
          email?: string
          foto_url?: string | null
          id?: string
          modo_resposta?:
            | Database["public"]["Enums"]["modo_resposta_type"]
            | null
          modooperacao_id?: number | null
          nome?: string
          perfil_ativo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alunos_modooperacao_id_fkey"
            columns: ["modooperacao_id"]
            isOneToOne: false
            referencedRelation: "modoOperacao"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          atualizado_em: string
          chave: string
          descricao: string | null
          publico: boolean
          valor: string
        }
        Insert: {
          atualizado_em?: string
          chave: string
          descricao?: string | null
          publico?: boolean
          valor: string
        }
        Update: {
          atualizado_em?: string
          chave?: string
          descricao?: string | null
          publico?: boolean
          valor?: string
        }
        Relationships: []
      }
      atividade_aluno: {
        Row: {
          acertos_percentual: number | null
          aluno_id: string
          atividade_id: number
          avaliacao_metadata: Json
          id: number
          percentual_concluido: number | null
          pontuacao_maxima: number | null
          pontuacao_obtida: number | null
          status: Database["public"]["Enums"]["status_atividade"] | null
          tempo_direto_min: number
          tempo_gasto_min: number | null
          ultima_visualizacao: string | null
          updated_at: string | null
        }
        Insert: {
          acertos_percentual?: number | null
          aluno_id: string
          atividade_id: number
          avaliacao_metadata?: Json
          id?: number
          percentual_concluido?: number | null
          pontuacao_maxima?: number | null
          pontuacao_obtida?: number | null
          status?: Database["public"]["Enums"]["status_atividade"] | null
          tempo_direto_min?: number
          tempo_gasto_min?: number | null
          ultima_visualizacao?: string | null
          updated_at?: string | null
        }
        Update: {
          acertos_percentual?: number | null
          aluno_id?: string
          atividade_id?: number
          avaliacao_metadata?: Json
          id?: number
          percentual_concluido?: number | null
          pontuacao_maxima?: number | null
          pontuacao_obtida?: number | null
          status?: Database["public"]["Enums"]["status_atividade"] | null
          tempo_direto_min?: number
          tempo_gasto_min?: number | null
          ultima_visualizacao?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atividade_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividade_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "atividade_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "atividade_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "atividade_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "atividade_aluno_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividade_aluno_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
        ]
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
        Update: {
          atividade_id?: number
          conteudo_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "atividade_conteudos_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividade_conteudos_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
          {
            foreignKeyName: "atividade_conteudos_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividade_conteudos_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
        ]
      }
      atividade_tentativa: {
        Row: {
          aluno_id: string
          atividade_id: number
          compra_id: number | null
          criado_em: string
          id: number
          ordem: number
          percentual: number
        }
        Insert: {
          aluno_id: string
          atividade_id: number
          compra_id?: number | null
          criado_em?: string
          id?: number
          ordem: number
          percentual: number
        }
        Update: {
          aluno_id?: string
          atividade_id?: number
          compra_id?: number | null
          criado_em?: string
          id?: number
          ordem?: number
          percentual?: number
        }
        Relationships: [
          {
            foreignKeyName: "atividade_tentativa_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividade_tentativa_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "atividade_tentativa_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "atividade_tentativa_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "atividade_tentativa_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "atividade_tentativa_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividade_tentativa_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
          {
            foreignKeyName: "atividade_tentativa_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "loja_compras"
            referencedColumns: ["id"]
          },
        ]
      }
      atividades: {
        Row: {
          created_at: string | null
          data_entrega: string | null
          descricao: string | null
          id: number
          metadata: Json
          pontuacao_maxima: number | null
          tipo: string | null
          titulo: string
          topico_id: number
        }
        Insert: {
          created_at?: string | null
          data_entrega?: string | null
          descricao?: string | null
          id?: number
          metadata?: Json
          pontuacao_maxima?: number | null
          tipo?: string | null
          titulo: string
          topico_id: number
        }
        Update: {
          created_at?: string | null
          data_entrega?: string | null
          descricao?: string | null
          id?: number
          metadata?: Json
          pontuacao_maxima?: number | null
          tipo?: string | null
          titulo?: string
          topico_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "atividades_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      bag_itens: {
        Row: {
          aluno_id: string
          atualizado_em: string
          classe_id: number | null
          conteudo: string | null
          conteudo_id: number | null
          criado_em: string
          excluido_em: string | null
          frente: string | null
          id: number
          metadata: Json
          tipo: string
          titulo: string
          topico_id: number | null
          verso: string | null
        }
        Insert: {
          aluno_id: string
          atualizado_em?: string
          classe_id?: number | null
          conteudo?: string | null
          conteudo_id?: number | null
          criado_em?: string
          excluido_em?: string | null
          frente?: string | null
          id?: never
          metadata?: Json
          tipo: string
          titulo: string
          topico_id?: number | null
          verso?: string | null
        }
        Update: {
          aluno_id?: string
          atualizado_em?: string
          classe_id?: number | null
          conteudo?: string | null
          conteudo_id?: number | null
          criado_em?: string
          excluido_em?: string | null
          frente?: string | null
          id?: never
          metadata?: Json
          tipo?: string
          titulo?: string
          topico_id?: number | null
          verso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bag_itens_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bag_itens_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "bag_itens_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bag_itens_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "bag_itens_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "bag_itens_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bag_itens_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "bag_itens_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bag_itens_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "bag_itens_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bag_itens_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      cards: {
        Row: {
          conteudo_id: number | null
          conteudo_origem_id: number | null
          cor: string | null
          created_at: string | null
          descricao: string | null
          id: number
          imagem_url: string | null
          ordem: number | null
          titulo: string | null
        }
        Insert: {
          conteudo_id?: number | null
          conteudo_origem_id?: number | null
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: number
          imagem_url?: string | null
          ordem?: number | null
          titulo?: string | null
        }
        Update: {
          conteudo_id?: number | null
          conteudo_origem_id?: number | null
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: number
          imagem_url?: string | null
          ordem?: number | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "fk_cards_conteudo_origem"
            columns: ["conteudo_origem_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cards_conteudo_origem"
            columns: ["conteudo_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
        ]
      }
      cards_personalizados: {
        Row: {
          aluno_id: string | null
          ativo: boolean
          atualizado_em: string
          ciclo_id: string
          classe_id: number
          conteudo_id: number | null
          criado_em: string
          descricao: string
          dificuldade: string | null
          icone: string | null
          id: number
          metadata: Json
          obsoleto_em: string | null
          ordem: number
          titulo: string
          topico_id: number
          xp: number | null
        }
        Insert: {
          aluno_id?: string | null
          ativo?: boolean
          atualizado_em?: string
          ciclo_id: string
          classe_id: number
          conteudo_id?: number | null
          criado_em?: string
          descricao: string
          dificuldade?: string | null
          icone?: string | null
          id?: never
          metadata?: Json
          obsoleto_em?: string | null
          ordem?: number
          titulo: string
          topico_id: number
          xp?: number | null
        }
        Update: {
          aluno_id?: string | null
          ativo?: boolean
          atualizado_em?: string
          ciclo_id?: string
          classe_id?: number
          conteudo_id?: number | null
          criado_em?: string
          descricao?: string
          dificuldade?: string | null
          icone?: string | null
          id?: never
          metadata?: Json
          obsoleto_em?: string | null
          ordem?: number
          titulo?: string
          topico_id?: number
          xp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_personalizados_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_personalizados_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "cards_personalizados_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cards_personalizados_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "cards_personalizados_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "cards_personalizados_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_personalizados_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "cards_personalizados_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_personalizados_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "cards_personalizados_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_personalizados_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      checkpoint_blobs: {
        Row: {
          blob: string | null
          channel: string
          checkpoint_ns: string
          thread_id: string
          type: string
          version: string
        }
        Insert: {
          blob?: string | null
          channel: string
          checkpoint_ns?: string
          thread_id: string
          type: string
          version: string
        }
        Update: {
          blob?: string | null
          channel?: string
          checkpoint_ns?: string
          thread_id?: string
          type?: string
          version?: string
        }
        Relationships: []
      }
      checkpoint_migrations: {
        Row: {
          v: number
        }
        Insert: {
          v: number
        }
        Update: {
          v?: number
        }
        Relationships: []
      }
      checkpoint_writes: {
        Row: {
          blob: string | null
          channel: string
          checkpoint_id: string
          checkpoint_ns: string
          idx: number
          task_id: string
          task_path: string
          thread_id: string
          type: string | null
        }
        Insert: {
          blob?: string | null
          channel: string
          checkpoint_id: string
          checkpoint_ns?: string
          idx: number
          task_id: string
          task_path?: string
          thread_id: string
          type?: string | null
        }
        Update: {
          blob?: string | null
          channel?: string
          checkpoint_id?: string
          checkpoint_ns?: string
          idx?: number
          task_id?: string
          task_path?: string
          thread_id?: string
          type?: string | null
        }
        Relationships: []
      }
      checkpoints: {
        Row: {
          checkpoint: Json
          checkpoint_id: string
          checkpoint_ns: string
          metadata: Json
          parent_checkpoint_id: string | null
          thread_id: string
          type: string | null
        }
        Insert: {
          checkpoint: Json
          checkpoint_id: string
          checkpoint_ns?: string
          metadata?: Json
          parent_checkpoint_id?: string | null
          thread_id: string
          type?: string | null
        }
        Update: {
          checkpoint?: Json
          checkpoint_id?: string
          checkpoint_ns?: string
          metadata?: Json
          parent_checkpoint_id?: string | null
          thread_id?: string
          type?: string | null
        }
        Relationships: []
      }
      classe: {
        Row: {
          created_at: string
          descricao: string | null
          id: number
          materia_id: number | null
          professor_id: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: number
          materia_id?: number | null
          professor_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: number
          materia_id?: number | null
          professor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classe_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "materia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "professor"
            referencedColumns: ["id"]
          },
        ]
      }
      classe_aluno: {
        Row: {
          acertosPercentual: number | null
          aluno_id: string | null
          atividadesConcluidas: Json | null
          classe_id: number | null
          created_at: string
          iadescricao_id: number | null
          id: number
          isComplete: boolean | null
          notaMedia: number | null
          porcentagemConcluida: number | null
          tempoGastoMin: number | null
          tempoMedioPorAtividade: number | null
          ultimaAtividade: number | null
          updated_at: string | null
        }
        Insert: {
          acertosPercentual?: number | null
          aluno_id?: string | null
          atividadesConcluidas?: Json | null
          classe_id?: number | null
          created_at?: string
          iadescricao_id?: number | null
          id?: number
          isComplete?: boolean | null
          notaMedia?: number | null
          porcentagemConcluida?: number | null
          tempoGastoMin?: number | null
          tempoMedioPorAtividade?: number | null
          ultimaAtividade?: number | null
          updated_at?: string | null
        }
        Update: {
          acertosPercentual?: number | null
          aluno_id?: string | null
          atividadesConcluidas?: Json | null
          classe_id?: number | null
          created_at?: string
          iadescricao_id?: number | null
          id?: number
          isComplete?: boolean | null
          notaMedia?: number | null
          porcentagemConcluida?: number | null
          tempoGastoMin?: number | null
          tempoMedioPorAtividade?: number | null
          ultimaAtividade?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "classe_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "classe_aluno_iadescricao_fk"
            columns: ["iadescricao_id"]
            isOneToOne: false
            referencedRelation: "iaDescricao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_aluno_ultimaatividade_fkey"
            columns: ["ultimaAtividade"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_aluno_ultimaatividade_fkey"
            columns: ["ultimaAtividade"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
          {
            foreignKeyName: "classe_aluno_ultimaAtividade_fkey"
            columns: ["ultimaAtividade"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_aluno_ultimaAtividade_fkey"
            columns: ["ultimaAtividade"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
        ]
      }
      classe_mapa_tema: {
        Row: {
          classe_id: number
          countries: Json
          created_at: string
          palette: Json
          template_id: string | null
          updated_at: string
          world_description: string | null
          world_name: string
          world_subtitle: string | null
        }
        Insert: {
          classe_id: number
          countries?: Json
          created_at?: string
          palette?: Json
          template_id?: string | null
          updated_at?: string
          world_description?: string | null
          world_name: string
          world_subtitle?: string | null
        }
        Update: {
          classe_id?: number
          countries?: Json
          created_at?: string
          palette?: Json
          template_id?: string | null
          updated_at?: string
          world_description?: string | null
          world_name?: string
          world_subtitle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classe_mapa_tema_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: true
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_mapa_tema_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: true
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      classe_perfil_summary: {
        Row: {
          atualizado_em: string
          classe_id: number
          distribuicao: Json
          id: number
          media_desempenho: Json
          perfil_predominante: string | null
          total_alunos: number
        }
        Insert: {
          atualizado_em?: string
          classe_id: number
          distribuicao?: Json
          id?: never
          media_desempenho?: Json
          perfil_predominante?: string | null
          total_alunos?: number
        }
        Update: {
          atualizado_em?: string
          classe_id?: number
          distribuicao?: Json
          id?: never
          media_desempenho?: Json
          perfil_predominante?: string | null
          total_alunos?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_classe_perfil_summary_classe"
            columns: ["classe_id"]
            isOneToOne: true
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_classe_perfil_summary_classe"
            columns: ["classe_id"]
            isOneToOne: true
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      conquistas: {
        Row: {
          categoria: string | null
          classe_id: number | null
          created_at: string | null
          criado_por: string | null
          criterio: Json | null
          descricao: string | null
          escopo: string
          icone_url: string | null
          id: number
          nome: string
          perfil_alvo: string | null
          pontos_recompensa: number | null
          tipo: string | null
        }
        Insert: {
          categoria?: string | null
          classe_id?: number | null
          created_at?: string | null
          criado_por?: string | null
          criterio?: Json | null
          descricao?: string | null
          escopo?: string
          icone_url?: string | null
          id?: number
          nome: string
          perfil_alvo?: string | null
          pontos_recompensa?: number | null
          tipo?: string | null
        }
        Update: {
          categoria?: string | null
          classe_id?: number | null
          created_at?: string | null
          criado_por?: string | null
          criterio?: Json | null
          descricao?: string | null
          escopo?: string
          icone_url?: string | null
          id?: number
          nome?: string
          perfil_alvo?: string | null
          pontos_recompensa?: number | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conquistas_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conquistas_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      conquistas_aluno: {
        Row: {
          aluno_id: string
          concluida: boolean | null
          conquista_id: number
          data_conquista: string | null
          id: number
          progresso: number | null
        }
        Insert: {
          aluno_id: string
          concluida?: boolean | null
          conquista_id: number
          data_conquista?: string | null
          id?: number
          progresso?: number | null
        }
        Update: {
          aluno_id?: string
          concluida?: boolean | null
          conquista_id?: number
          data_conquista?: string | null
          id?: number
          progresso?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conquistas_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conquistas_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "conquistas_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conquistas_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "conquistas_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "conquistas_aluno_conquista_id_fkey"
            columns: ["conquista_id"]
            isOneToOne: false
            referencedRelation: "conquistas"
            referencedColumns: ["id"]
          },
        ]
      }
      contato_envios: {
        Row: {
          aluno_id: string
          assunto: string | null
          criado_em: string
          id: number
        }
        Insert: {
          aluno_id: string
          assunto?: string | null
          criado_em?: string
          id?: number
        }
        Update: {
          aluno_id?: string
          assunto?: string | null
          criado_em?: string
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "contato_envios_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contato_envios_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "contato_envios_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contato_envios_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "contato_envios_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      conteudo_aluno: {
        Row: {
          aluno_id: string
          conteudo_id: number
          id: number
          percentual_concluido: number | null
          status: Database["public"]["Enums"]["status_atividade"] | null
          tempo_direto_min: number
          tempo_gasto_min: number | null
          ultima_visualizacao: string | null
          updated_at: string | null
        }
        Insert: {
          aluno_id: string
          conteudo_id: number
          id?: number
          percentual_concluido?: number | null
          status?: Database["public"]["Enums"]["status_atividade"] | null
          tempo_direto_min?: number
          tempo_gasto_min?: number | null
          ultima_visualizacao?: string | null
          updated_at?: string | null
        }
        Update: {
          aluno_id?: string
          conteudo_id?: number
          id?: number
          percentual_concluido?: number | null
          status?: Database["public"]["Enums"]["status_atividade"] | null
          tempo_direto_min?: number
          tempo_gasto_min?: number | null
          ultima_visualizacao?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conteudo_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteudo_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "conteudo_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conteudo_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "conteudo_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "conteudo_aluno_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteudo_aluno_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
        ]
      }
      conteudo_personalizado: {
        Row: {
          ai_patch: Json | null
          aluno_id: string | null
          brainhex_profile_key: string
          ciclo_id: string
          classe_id: number
          conteudo_id: number | null
          formato_prioritario: string | null
          formatos_gerados: string[] | null
          gerado_em: string
          id: number
          materiais: Json | null
          plano: Json | null
          source_hash: string | null
          status: string
          topico_id: number | null
          updated_at: string
        }
        Insert: {
          ai_patch?: Json | null
          aluno_id?: string | null
          brainhex_profile_key?: string
          ciclo_id: string
          classe_id: number
          conteudo_id?: number | null
          formato_prioritario?: string | null
          formatos_gerados?: string[] | null
          gerado_em?: string
          id?: never
          materiais?: Json | null
          plano?: Json | null
          source_hash?: string | null
          status?: string
          topico_id?: number | null
          updated_at?: string
        }
        Update: {
          ai_patch?: Json | null
          aluno_id?: string | null
          brainhex_profile_key?: string
          ciclo_id?: string
          classe_id?: number
          conteudo_id?: number | null
          formato_prioritario?: string | null
          formatos_gerados?: string[] | null
          gerado_em?: string
          id?: never
          materiais?: Json | null
          plano?: Json | null
          source_hash?: string | null
          status?: string
          topico_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteudo_personalizado_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteudo_personalizado_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "conteudo_personalizado_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conteudo_personalizado_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "conteudo_personalizado_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "conteudo_personalizado_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteudo_personalizado_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "conteudo_personalizado_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteudo_personalizado_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
          {
            foreignKeyName: "fk_conteudo_personalizado_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conteudo_personalizado_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_conteudo_personalizado_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_conteudo_personalizado_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_conteudo_personalizado_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_conteudo_personalizado_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conteudo_personalizado_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "fk_conteudo_personalizado_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conteudo_personalizado_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "fk_conteudo_personalizado_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conteudo_personalizado_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      conteudos: {
        Row: {
          conteudo: string | null
          created_at: string | null
          id: number
          metadata: Json | null
          ordem: number | null
          tipo: string
          titulo: string
          topico_id: number
        }
        Insert: {
          conteudo?: string | null
          created_at?: string | null
          id?: number
          metadata?: Json | null
          ordem?: number | null
          tipo: string
          titulo: string
          topico_id: number
        }
        Update: {
          conteudo?: string | null
          created_at?: string | null
          id?: number
          metadata?: Json | null
          ordem?: number | null
          tipo?: string
          titulo?: string
          topico_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "conteudos_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteudos_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      desafio_participantes: {
        Row: {
          aluno_id: string
          convidado_em: string
          desafio_id: string
          equipe: number
          estado: string
          respondido_em: string | null
        }
        Insert: {
          aluno_id: string
          convidado_em?: string
          desafio_id: string
          equipe: number
          estado?: string
          respondido_em?: string | null
        }
        Update: {
          aluno_id?: string
          convidado_em?: string
          desafio_id?: string
          equipe?: number
          estado?: string
          respondido_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "desafio_participantes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desafio_participantes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "desafio_participantes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "desafio_participantes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "desafio_participantes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "desafio_participantes_desafio_id_fkey"
            columns: ["desafio_id"]
            isOneToOne: false
            referencedRelation: "guilda_desafios"
            referencedColumns: ["id"]
          },
        ]
      }
      estudo_intervalos: {
        Row: {
          aluno_id: string
          classe_id: number
          criado_em: string
          id: string
          tempo_min: number
          topico_id: number
        }
        Insert: {
          aluno_id: string
          classe_id: number
          criado_em?: string
          id: string
          tempo_min: number
          topico_id: number
        }
        Update: {
          aluno_id?: string
          classe_id?: number
          criado_em?: string
          id?: string
          tempo_min?: number
          topico_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "estudo_intervalos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estudo_intervalos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "estudo_intervalos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "estudo_intervalos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "estudo_intervalos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "estudo_intervalos_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estudo_intervalos_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "estudo_intervalos_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estudo_intervalos_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      estudo_sessoes: {
        Row: {
          aberto_em: string
          aluno_id: string
          atividade_id: number | null
          classe_id: number
          conteudo_id: number | null
          criado_em: string
          duracao_sec: number | null
          fechado_em: string
          id: string
          scope: string
          topico_id: number
        }
        Insert: {
          aberto_em: string
          aluno_id: string
          atividade_id?: number | null
          classe_id: number
          conteudo_id?: number | null
          criado_em?: string
          duracao_sec?: number | null
          fechado_em: string
          id: string
          scope: string
          topico_id: number
        }
        Update: {
          aberto_em?: string
          aluno_id?: string
          atividade_id?: number | null
          classe_id?: number
          conteudo_id?: number | null
          criado_em?: string
          duracao_sec?: number | null
          fechado_em?: string
          id?: string
          scope?: string
          topico_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "estudo_sessoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estudo_sessoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "estudo_sessoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "estudo_sessoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "estudo_sessoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "estudo_sessoes_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estudo_sessoes_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
          {
            foreignKeyName: "estudo_sessoes_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estudo_sessoes_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "estudo_sessoes_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estudo_sessoes_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "estudo_sessoes_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estudo_sessoes_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      eventos_aluno: {
        Row: {
          aluno_id: string | null
          classe_id: number | null
          concedido_por: string | null
          criado_em: string | null
          id: number
          idempotencia_key: string | null
          motivo: string | null
          referencia: string | null
          tipo: string
          valor: number | null
        }
        Insert: {
          aluno_id?: string | null
          classe_id?: number | null
          concedido_por?: string | null
          criado_em?: string | null
          id?: number
          idempotencia_key?: string | null
          motivo?: string | null
          referencia?: string | null
          tipo: string
          valor?: number | null
        }
        Update: {
          aluno_id?: string | null
          classe_id?: number | null
          concedido_por?: string | null
          criado_em?: string | null
          id?: number
          idempotencia_key?: string | null
          motivo?: string | null
          referencia?: string | null
          tipo?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "eventos_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "eventos_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "eventos_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "eventos_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "eventos_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      eventos_pontuacao: {
        Row: {
          atualizado_em: string
          descricao: string | null
          moedas: number
          pontos: number
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          descricao?: string | null
          moedas?: number
          pontos?: number
          tipo: string
        }
        Update: {
          atualizado_em?: string
          descricao?: string | null
          moedas?: number
          pontos?: number
          tipo?: string
        }
        Relationships: []
      }
      eventos_pontuacao_classe: {
        Row: {
          classe_id: number
          moedas: number | null
          pontos: number | null
          tipo: string
        }
        Insert: {
          classe_id: number
          moedas?: number | null
          pontos?: number | null
          tipo: string
        }
        Update: {
          classe_id?: number
          moedas?: number | null
          pontos?: number | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_pontuacao_classe_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_pontuacao_classe_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      expo_tokens: {
        Row: {
          aluno_id: string | null
          app_version: string | null
          ativo: boolean
          atualizado_em: string
          created_at: string | null
          desativado_motivo: string | null
          device_name: string | null
          id: string
          plataforma: string
          timezone: string
          token: string
          ultima_atividade_em: string
        }
        Insert: {
          aluno_id?: string | null
          app_version?: string | null
          ativo?: boolean
          atualizado_em?: string
          created_at?: string | null
          desativado_motivo?: string | null
          device_name?: string | null
          id?: string
          plataforma?: string
          timezone?: string
          token: string
          ultima_atividade_em?: string
        }
        Update: {
          aluno_id?: string | null
          app_version?: string | null
          ativo?: boolean
          atualizado_em?: string
          created_at?: string | null
          desativado_motivo?: string | null
          device_name?: string | null
          id?: string
          plataforma?: string
          timezone?: string
          token?: string
          ultima_atividade_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "expo_tokens_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expo_tokens_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "expo_tokens_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expo_tokens_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "expo_tokens_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      fontes_personalizacao: {
        Row: {
          aluno_id: string | null
          arquivo_url: string | null
          classe_id: number
          conteudo_id: number | null
          criado_em: string
          descricao: string | null
          id: number
          metadata: Json
          mime_type: string | null
          nome_arquivo: string | null
          origem: string
          professor_id: string | null
          storage_path: string | null
          tamanho_bytes: number | null
          tipo: string
          titulo: string | null
          topico_id: number | null
          visibilidade: string
        }
        Insert: {
          aluno_id?: string | null
          arquivo_url?: string | null
          classe_id: number
          conteudo_id?: number | null
          criado_em?: string
          descricao?: string | null
          id?: never
          metadata?: Json
          mime_type?: string | null
          nome_arquivo?: string | null
          origem?: string
          professor_id?: string | null
          storage_path?: string | null
          tamanho_bytes?: number | null
          tipo: string
          titulo?: string | null
          topico_id?: number | null
          visibilidade?: string
        }
        Update: {
          aluno_id?: string | null
          arquivo_url?: string | null
          classe_id?: number
          conteudo_id?: number | null
          criado_em?: string
          descricao?: string | null
          id?: never
          metadata?: Json
          mime_type?: string | null
          nome_arquivo?: string | null
          origem?: string
          professor_id?: string | null
          storage_path?: string | null
          tamanho_bytes?: number | null
          tipo?: string
          titulo?: string | null
          topico_id?: number | null
          visibilidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_fontes_personalizacao_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_fontes_personalizacao_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_fontes_personalizacao_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_fontes_personalizacao_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_fontes_personalizacao_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_fontes_personalizacao_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_fontes_personalizacao_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "fk_fontes_personalizacao_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_fontes_personalizacao_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "fk_fontes_personalizacao_professor"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "professor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_fontes_personalizacao_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_fontes_personalizacao_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      guilda_config_turma: {
        Row: {
          classe_id: number
          formacao_fim: string | null
          formacao_inicio: string | null
          tamanho_maximo: number
          updated_at: string
        }
        Insert: {
          classe_id: number
          formacao_fim?: string | null
          formacao_inicio?: string | null
          tamanho_maximo?: number
          updated_at?: string
        }
        Update: {
          classe_id?: number
          formacao_fim?: string | null
          formacao_inicio?: string | null
          tamanho_maximo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guilda_config_turma_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: true
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_config_turma_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: true
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      guilda_convites: {
        Row: {
          classe_id: number
          convidado_id: string
          convidante_id: string
          created_at: string
          guilda_id: string
          id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          classe_id: number
          convidado_id: string
          convidante_id: string
          created_at?: string
          guilda_id: string
          id?: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          classe_id?: number
          convidado_id?: string
          convidante_id?: string
          created_at?: string
          guilda_id?: string
          id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "guilda_convites_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_convites_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "guilda_convites_convidado_id_fkey"
            columns: ["convidado_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_convites_convidado_id_fkey"
            columns: ["convidado_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "guilda_convites_convidado_id_fkey"
            columns: ["convidado_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "guilda_convites_convidado_id_fkey"
            columns: ["convidado_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_convites_convidado_id_fkey"
            columns: ["convidado_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_convites_convidante_id_fkey"
            columns: ["convidante_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_convites_convidante_id_fkey"
            columns: ["convidante_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "guilda_convites_convidante_id_fkey"
            columns: ["convidante_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "guilda_convites_convidante_id_fkey"
            columns: ["convidante_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_convites_convidante_id_fkey"
            columns: ["convidante_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_convites_guilda_id_fkey"
            columns: ["guilda_id"]
            isOneToOne: false
            referencedRelation: "guildas"
            referencedColumns: ["id"]
          },
        ]
      }
      guilda_desafio_questoes: {
        Row: {
          desafio_id: string
          ordem: number
          questao_id: number
        }
        Insert: {
          desafio_id: string
          ordem: number
          questao_id: number
        }
        Update: {
          desafio_id?: string
          ordem?: number
          questao_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "guilda_desafio_questoes_desafio_id_fkey"
            columns: ["desafio_id"]
            isOneToOne: false
            referencedRelation: "guilda_desafios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_desafio_questoes_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_desafio_questoes_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["questao_id"]
          },
        ]
      }
      guilda_desafio_respostas: {
        Row: {
          aluno_id: string
          correta: boolean
          desafio_id: string
          questao_id: number
          respondida_em: string
          resposta: string
          tempo_ms: number | null
        }
        Insert: {
          aluno_id: string
          correta: boolean
          desafio_id: string
          questao_id: number
          respondida_em?: string
          resposta: string
          tempo_ms?: number | null
        }
        Update: {
          aluno_id?: string
          correta?: boolean
          desafio_id?: string
          questao_id?: number
          respondida_em?: string
          resposta?: string
          tempo_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "guilda_desafio_respostas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_desafio_respostas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "guilda_desafio_respostas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "guilda_desafio_respostas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_desafio_respostas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_desafio_respostas_desafio_id_fkey"
            columns: ["desafio_id"]
            isOneToOne: false
            referencedRelation: "guilda_desafios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_desafio_respostas_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_desafio_respostas_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["questao_id"]
          },
        ]
      }
      guilda_desafios: {
        Row: {
          classe_id: number
          configuracao: Json
          created_at: string
          criado_por: string
          encerrado_em: string | null
          formato: string
          guilda_id: string | null
          guilda_rival_id: string | null
          id: string
          modo: string
          resultado: string | null
          status: string
          titulo: string
          vencedor_equipe: number | null
        }
        Insert: {
          classe_id: number
          configuracao?: Json
          created_at?: string
          criado_por: string
          encerrado_em?: string | null
          formato?: string
          guilda_id?: string | null
          guilda_rival_id?: string | null
          id?: string
          modo: string
          resultado?: string | null
          status?: string
          titulo?: string
          vencedor_equipe?: number | null
        }
        Update: {
          classe_id?: number
          configuracao?: Json
          created_at?: string
          criado_por?: string
          encerrado_em?: string | null
          formato?: string
          guilda_id?: string | null
          guilda_rival_id?: string | null
          id?: string
          modo?: string
          resultado?: string | null
          status?: string
          titulo?: string
          vencedor_equipe?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "guilda_desafios_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_desafios_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "guilda_desafios_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_desafios_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "guilda_desafios_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "guilda_desafios_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_desafios_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_desafios_guilda_id_fkey"
            columns: ["guilda_id"]
            isOneToOne: false
            referencedRelation: "guildas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_desafios_guilda_rival_id_fkey"
            columns: ["guilda_rival_id"]
            isOneToOne: false
            referencedRelation: "guildas"
            referencedColumns: ["id"]
          },
        ]
      }
      guilda_evento_snapshot: {
        Row: {
          aluno_id: string | null
          aluno_nome: string
          captured_at: string
          classe_id: number
          evento_id: string
          guilda_id: string
          id: string
          posicao: number
        }
        Insert: {
          aluno_id?: string | null
          aluno_nome: string
          captured_at?: string
          classe_id: number
          evento_id: string
          guilda_id: string
          id?: string
          posicao: number
        }
        Update: {
          aluno_id?: string | null
          aluno_nome?: string
          captured_at?: string
          classe_id?: number
          evento_id?: string
          guilda_id?: string
          id?: string
          posicao?: number
        }
        Relationships: [
          {
            foreignKeyName: "guilda_evento_snapshot_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_evento_snapshot_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "guilda_evento_snapshot_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "guilda_evento_snapshot_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_evento_snapshot_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_evento_snapshot_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_evento_snapshot_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "guilda_evento_snapshot_guilda_id_fkey"
            columns: ["guilda_id"]
            isOneToOne: false
            referencedRelation: "guildas"
            referencedColumns: ["id"]
          },
        ]
      }
      guilda_membros: {
        Row: {
          aluno_id: string | null
          classe_id: number
          guilda_id: string
          id: string
          joined_at: string
          left_at: string | null
        }
        Insert: {
          aluno_id?: string | null
          classe_id: number
          guilda_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
        }
        Update: {
          aluno_id?: string | null
          classe_id?: number
          guilda_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guilda_membros_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_membros_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "guilda_membros_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "guilda_membros_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_membros_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_membros_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_membros_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "guilda_membros_guilda_id_fkey"
            columns: ["guilda_id"]
            isOneToOne: false
            referencedRelation: "guildas"
            referencedColumns: ["id"]
          },
        ]
      }
      guilda_mensagens: {
        Row: {
          autor_id: string
          classe_id: number
          conteudo: Json
          created_at: string
          guilda_id: string
          id: string
          texto: string
          tipo: string
        }
        Insert: {
          autor_id: string
          classe_id: number
          conteudo?: Json
          created_at?: string
          guilda_id: string
          id?: string
          texto?: string
          tipo?: string
        }
        Update: {
          autor_id?: string
          classe_id?: number
          conteudo?: Json
          created_at?: string
          guilda_id?: string
          id?: string
          texto?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "guilda_mensagens_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_mensagens_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "guilda_mensagens_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "guilda_mensagens_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_mensagens_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guilda_mensagens_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guilda_mensagens_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "guilda_mensagens_guilda_id_fkey"
            columns: ["guilda_id"]
            isOneToOne: false
            referencedRelation: "guildas"
            referencedColumns: ["id"]
          },
        ]
      }
      guildas: {
        Row: {
          ativa: boolean
          classe_id: number
          created_at: string
          criado_por: string
          descricao: string | null
          emblema: string
          id: string
          limite_membros: number
          logo_url: string | null
          modo_perfil: string
          nome: string
          perfil_alvo: string | null
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          classe_id: number
          created_at?: string
          criado_por: string
          descricao?: string | null
          emblema?: string
          id?: string
          limite_membros?: number
          logo_url?: string | null
          modo_perfil?: string
          nome: string
          perfil_alvo?: string | null
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          classe_id?: number
          created_at?: string
          criado_por?: string
          descricao?: string | null
          emblema?: string
          id?: string
          limite_membros?: number
          logo_url?: string | null
          modo_perfil?: string
          nome?: string
          perfil_alvo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guildas_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guildas_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "guildas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guildas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "guildas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "guildas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "guildas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      ia_decision_logs: {
        Row: {
          actions: Json
          aluno_id: string
          atividade_id: number | null
          batch_id: string | null
          ciclo_id: string | null
          classe_id: number
          conteudo_id: number | null
          created_at: string
          decision_summary: string | null
          id: number
          input_summary: Json
          model_name: string | null
          parsed_response: Json | null
          prompt_text: string | null
          provider: string | null
          raw_response: string | null
          sessao_id: string | null
          source: string
          stage: string
          topico_id: number | null
          trigger_event: string | null
        }
        Insert: {
          actions?: Json
          aluno_id: string
          atividade_id?: number | null
          batch_id?: string | null
          ciclo_id?: string | null
          classe_id: number
          conteudo_id?: number | null
          created_at?: string
          decision_summary?: string | null
          id?: never
          input_summary?: Json
          model_name?: string | null
          parsed_response?: Json | null
          prompt_text?: string | null
          provider?: string | null
          raw_response?: string | null
          sessao_id?: string | null
          source: string
          stage: string
          topico_id?: number | null
          trigger_event?: string | null
        }
        Update: {
          actions?: Json
          aluno_id?: string
          atividade_id?: number | null
          batch_id?: string | null
          ciclo_id?: string | null
          classe_id?: number
          conteudo_id?: number | null
          created_at?: string
          decision_summary?: string | null
          id?: never
          input_summary?: Json
          model_name?: string | null
          parsed_response?: Json | null
          prompt_text?: string | null
          provider?: string | null
          raw_response?: string | null
          sessao_id?: string | null
          source?: string
          stage?: string
          topico_id?: number | null
          trigger_event?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ia_decision_logs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_atividade"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_atividade"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      iaDescricao: {
        Row: {
          aluno_id: string | null
          created_at: string
          id: number
          insights: Json | null
          modoOperacao: string | null
          perfisDetectados: Json | null
          recomendacaoTrilha: string | null
        }
        Insert: {
          aluno_id?: string | null
          created_at?: string
          id?: number
          insights?: Json | null
          modoOperacao?: string | null
          perfisDetectados?: Json | null
          recomendacaoTrilha?: string | null
        }
        Update: {
          aluno_id?: string | null
          created_at?: string
          id?: number
          insights?: Json | null
          modoOperacao?: string | null
          perfisDetectados?: Json | null
          recomendacaoTrilha?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iadescricao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iadescricao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "iadescricao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "iadescricao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "iadescricao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "IADescricao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "IADescricao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "IADescricao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "IADescricao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "IADescricao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      intervencoes: {
        Row: {
          acao: string | null
          aluno_id: string | null
          base: string | null
          classe_id: number | null
          contexto: Json
          created_at: string
          escopo: string
          geracao_id: string | null
          id: string
          motivo: string | null
          motivo_descarte: string | null
          natureza: string
          resolved_at: string | null
          status: string
          texto: string | null
          tipo: string
        }
        Insert: {
          acao?: string | null
          aluno_id?: string | null
          base?: string | null
          classe_id?: number | null
          contexto?: Json
          created_at?: string
          escopo?: string
          geracao_id?: string | null
          id?: string
          motivo?: string | null
          motivo_descarte?: string | null
          natureza?: string
          resolved_at?: string | null
          status?: string
          texto?: string | null
          tipo: string
        }
        Update: {
          acao?: string | null
          aluno_id?: string | null
          base?: string | null
          classe_id?: number | null
          contexto?: Json
          created_at?: string
          escopo?: string
          geracao_id?: string | null
          id?: string
          motivo?: string | null
          motivo_descarte?: string | null
          natureza?: string
          resolved_at?: string | null
          status?: string
          texto?: string | null
          tipo?: string
        }
        Relationships: []
      }
      loja_compras: {
        Row: {
          aluno_id: string
          alvo_id: number | null
          alvo_tipo: string | null
          classe_id: number
          consumido_em: string | null
          criado_em: string
          id: number
          idempotency_key: string
          item_codigo: string
          origem: string
          preco_pago: number
          status: string
        }
        Insert: {
          aluno_id: string
          alvo_id?: number | null
          alvo_tipo?: string | null
          classe_id: number
          consumido_em?: string | null
          criado_em?: string
          id?: number
          idempotency_key: string
          item_codigo: string
          origem?: string
          preco_pago?: number
          status?: string
        }
        Update: {
          aluno_id?: string
          alvo_id?: number | null
          alvo_tipo?: string | null
          classe_id?: number
          consumido_em?: string | null
          criado_em?: string
          id?: number
          idempotency_key?: string
          item_codigo?: string
          origem?: string
          preco_pago?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loja_compras_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_compras_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "loja_compras_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "loja_compras_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "loja_compras_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "loja_compras_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_compras_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "loja_compras_item_codigo_fkey"
            columns: ["item_codigo"]
            isOneToOne: false
            referencedRelation: "loja_itens"
            referencedColumns: ["codigo"]
          },
        ]
      }
      loja_config_classe: {
        Row: {
          atualizado_em: string
          classe_id: number
          itens_desligados: string[]
          prazo_max_dias_total: number
          prazo_max_por_ativ: number
          retry_max_por_topico: number
        }
        Insert: {
          atualizado_em?: string
          classe_id: number
          itens_desligados?: string[]
          prazo_max_dias_total?: number
          prazo_max_por_ativ?: number
          retry_max_por_topico?: number
        }
        Update: {
          atualizado_em?: string
          classe_id?: number
          itens_desligados?: string[]
          prazo_max_dias_total?: number
          prazo_max_por_ativ?: number
          retry_max_por_topico?: number
        }
        Relationships: [
          {
            foreignKeyName: "loja_config_classe_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: true
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_config_classe_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: true
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      loja_dotacao: {
        Row: {
          classe_id: number
          item_codigo: string
          quantidade: number
        }
        Insert: {
          classe_id: number
          item_codigo: string
          quantidade?: number
        }
        Update: {
          classe_id?: number
          item_codigo?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "loja_dotacao_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_dotacao_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "loja_dotacao_item_codigo_fkey"
            columns: ["item_codigo"]
            isOneToOne: false
            referencedRelation: "loja_itens"
            referencedColumns: ["codigo"]
          },
        ]
      }
      loja_formato_escolhido: {
        Row: {
          aluno_id: string
          atualizado_em: string
          formato: string
          topico_id: number
        }
        Insert: {
          aluno_id: string
          atualizado_em?: string
          formato: string
          topico_id: number
        }
        Update: {
          aluno_id?: string
          atualizado_em?: string
          formato?: string
          topico_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "loja_formato_escolhido_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_formato_escolhido_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "loja_formato_escolhido_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "loja_formato_escolhido_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "loja_formato_escolhido_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      loja_itens: {
        Row: {
          ativo: boolean
          codigo: string
          descricao: string
          efeito: string
          nome: string
          ordem: number
          parametros: Json
          preco_base: number
          preco_fator: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          descricao: string
          efeito: string
          nome: string
          ordem?: number
          parametros?: Json
          preco_base: number
          preco_fator?: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          descricao?: string
          efeito?: string
          nome?: string
          ordem?: number
          parametros?: Json
          preco_base?: number
          preco_fator?: number
        }
        Relationships: []
      }
      materia: {
        Row: {
          created_at: string
          descricao: string | null
          id: number
          nome: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: number
          nome?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: number
          nome?: string | null
        }
        Relationships: []
      }
      materiais_gerados: {
        Row: {
          aluno_id: string | null
          arquivo_url: string | null
          conteudo_id: number | null
          criado_em: string
          generation_key: string | null
          id: number
          metadata: Json
          payload: Json | null
          personalizacao_id: number | null
          storage_path: string | null
          tipo: string
        }
        Insert: {
          aluno_id?: string | null
          arquivo_url?: string | null
          conteudo_id?: number | null
          criado_em?: string
          generation_key?: string | null
          id?: never
          metadata?: Json
          payload?: Json | null
          personalizacao_id?: number | null
          storage_path?: string | null
          tipo: string
        }
        Update: {
          aluno_id?: string | null
          arquivo_url?: string | null
          conteudo_id?: number | null
          criado_em?: string
          generation_key?: string | null
          id?: never
          metadata?: Json
          payload?: Json | null
          personalizacao_id?: number | null
          storage_path?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_materiais_gerados_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_materiais_gerados_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_materiais_gerados_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_materiais_gerados_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_materiais_gerados_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_materiais_gerados_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_materiais_gerados_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "fk_materiais_gerados_personalizacao"
            columns: ["personalizacao_id"]
            isOneToOne: false
            referencedRelation: "conteudo_personalizado"
            referencedColumns: ["id"]
          },
        ]
      }
      midias: {
        Row: {
          conteudo_id: number | null
          created_at: string | null
          id: number
          legenda: string | null
          metadata: Json
          ordem: number | null
          tipo: string
          url: string
        }
        Insert: {
          conteudo_id?: number | null
          created_at?: string | null
          id?: number
          legenda?: string | null
          metadata?: Json
          ordem?: number | null
          tipo: string
          url: string
        }
        Update: {
          conteudo_id?: number | null
          created_at?: string | null
          id?: number
          legenda?: string | null
          metadata?: Json
          ordem?: number | null
          tipo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "midias_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "midias_conteudo_id_fkey"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
        ]
      }
      modoOperacao: {
        Row: {
          created_at: string
          descricao: string | null
          id: number
          modoResposta: string | null
          nome: string | null
          ordem: Json | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: number
          modoResposta?: string | null
          nome?: string | null
          ordem?: Json | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: number
          modoResposta?: string | null
          nome?: string | null
          ordem?: Json | null
        }
        Relationships: []
      }
      moedas_ledger: {
        Row: {
          aluno_id: string
          classe_id: number | null
          compra_id: number | null
          criado_em: string
          delta: number
          evento_tipo: string | null
          id: number
          motivo: string
          referencia: string | null
        }
        Insert: {
          aluno_id: string
          classe_id?: number | null
          compra_id?: number | null
          criado_em?: string
          delta: number
          evento_tipo?: string | null
          id?: number
          motivo: string
          referencia?: string | null
        }
        Update: {
          aluno_id?: string
          classe_id?: number | null
          compra_id?: number | null
          criado_em?: string
          delta?: number
          evento_tipo?: string | null
          id?: number
          motivo?: string
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moedas_ledger_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moedas_ledger_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "moedas_ledger_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "moedas_ledger_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "moedas_ledger_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "moedas_ledger_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moedas_ledger_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          aluno_id: string | null
          contexto: Json
          corpo: string
          created_at: string | null
          horario_envio: string | null
          id: number
          origem: string | null
          origem_id: number | null
          push_enviado_em: string | null
          push_erro: string | null
          read: boolean | null
          status: string | null
          tipo: string | null
          titulo: string
        }
        Insert: {
          aluno_id?: string | null
          contexto?: Json
          corpo: string
          created_at?: string | null
          horario_envio?: string | null
          id?: never
          origem?: string | null
          origem_id?: number | null
          push_enviado_em?: string | null
          push_erro?: string | null
          read?: boolean | null
          status?: string | null
          tipo?: string | null
          titulo: string
        }
        Update: {
          aluno_id?: string | null
          contexto?: Json
          corpo?: string
          created_at?: string | null
          horario_envio?: string | null
          id?: never
          origem?: string | null
          origem_id?: number | null
          push_enviado_em?: string | null
          push_erro?: string | null
          read?: boolean | null
          status?: string | null
          tipo?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "notificacoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notificacoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "notificacoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      notificacoes_agendamentos: {
        Row: {
          aluno_id: string | null
          ativo: boolean | null
          atualizado_em: string
          contexto: Json | null
          corpo: string | null
          created_at: string | null
          execucoes: number
          gatilho: string
          hora_local: number | null
          horario: string | null
          id: number
          minuto_local: number
          prioridade: number
          proxima_execucao: string | null
          recorrencia: string
          timezone: string
          tipo: string
          titulo: string | null
          ultima_execucao: string | null
        }
        Insert: {
          aluno_id?: string | null
          ativo?: boolean | null
          atualizado_em?: string
          contexto?: Json | null
          corpo?: string | null
          created_at?: string | null
          execucoes?: number
          gatilho?: string
          hora_local?: number | null
          horario?: string | null
          id?: never
          minuto_local?: number
          prioridade?: number
          proxima_execucao?: string | null
          recorrencia?: string
          timezone?: string
          tipo: string
          titulo?: string | null
          ultima_execucao?: string | null
        }
        Update: {
          aluno_id?: string | null
          ativo?: boolean | null
          atualizado_em?: string
          contexto?: Json | null
          corpo?: string | null
          created_at?: string | null
          execucoes?: number
          gatilho?: string
          hora_local?: number | null
          horario?: string | null
          id?: never
          minuto_local?: number
          prioridade?: number
          proxima_execucao?: string | null
          recorrencia?: string
          timezone?: string
          tipo?: string
          titulo?: string | null
          ultima_execucao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_agendamentos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_agendamentos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "notificacoes_agendamentos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notificacoes_agendamentos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "notificacoes_agendamentos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      notificacoes_config: {
        Row: {
          atualizado_em: string
          chave: string
          descricao: string | null
          publico: boolean
          valor: string
        }
        Insert: {
          atualizado_em?: string
          chave: string
          descricao?: string | null
          publico?: boolean
          valor: string
        }
        Update: {
          atualizado_em?: string
          chave?: string
          descricao?: string | null
          publico?: boolean
          valor?: string
        }
        Relationships: []
      }
      notificacoes_ia: {
        Row: {
          aluno_id: string | null
          contexto: Json | null
          corpo: string | null
          created_at: string | null
          id: number
          motivo: string | null
          origem: string
          pendente_id: number | null
          prioridade: number
          promovida_em: string | null
          resposta_hash: string | null
          status: string
          tipo: string
          titulo: string | null
        }
        Insert: {
          aluno_id?: string | null
          contexto?: Json | null
          corpo?: string | null
          created_at?: string | null
          id?: never
          motivo?: string | null
          origem?: string
          pendente_id?: number | null
          prioridade?: number
          promovida_em?: string | null
          resposta_hash?: string | null
          status?: string
          tipo: string
          titulo?: string | null
        }
        Update: {
          aluno_id?: string | null
          contexto?: Json | null
          corpo?: string | null
          created_at?: string | null
          id?: never
          motivo?: string | null
          origem?: string
          pendente_id?: number | null
          prioridade?: number
          promovida_em?: string | null
          resposta_hash?: string | null
          status?: string
          tipo?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_ia_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_ia_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "notificacoes_ia_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notificacoes_ia_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "notificacoes_ia_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      notificacoes_pendentes: {
        Row: {
          agendamento_id: number | null
          aluno_id: string | null
          atualizado_em: string
          contexto: Json | null
          corpo: string | null
          created_at: string | null
          dedupe_key: string | null
          entregue_em: string | null
          expira_em: string | null
          gatilho: string
          horario: string | null
          id: number
          notificacao_id: number | null
          prioridade: number | null
          status: string | null
          sugestao_id: number | null
          tipo: string
          titulo: string | null
          ultimo_erro: string | null
        }
        Insert: {
          agendamento_id?: number | null
          aluno_id?: string | null
          atualizado_em?: string
          contexto?: Json | null
          corpo?: string | null
          created_at?: string | null
          dedupe_key?: string | null
          entregue_em?: string | null
          expira_em?: string | null
          gatilho?: string
          horario?: string | null
          id?: never
          notificacao_id?: number | null
          prioridade?: number | null
          status?: string | null
          sugestao_id?: number | null
          tipo: string
          titulo?: string | null
          ultimo_erro?: string | null
        }
        Update: {
          agendamento_id?: number | null
          aluno_id?: string | null
          atualizado_em?: string
          contexto?: Json | null
          corpo?: string | null
          created_at?: string | null
          dedupe_key?: string | null
          entregue_em?: string | null
          expira_em?: string | null
          gatilho?: string
          horario?: string | null
          id?: never
          notificacao_id?: number | null
          prioridade?: number | null
          status?: string | null
          sugestao_id?: number | null
          tipo?: string
          titulo?: string | null
          ultimo_erro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_pendentes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_pendentes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "notificacoes_pendentes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notificacoes_pendentes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "notificacoes_pendentes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      notificacoes_push_envios: {
        Row: {
          aluno_id: string | null
          conciliado_em: string | null
          criado_em: string
          notificacao_id: number | null
          request_id: number
          resultado: string | null
          tokens: string[]
        }
        Insert: {
          aluno_id?: string | null
          conciliado_em?: string | null
          criado_em?: string
          notificacao_id?: number | null
          request_id: number
          resultado?: string | null
          tokens: string[]
        }
        Update: {
          aluno_id?: string | null
          conciliado_em?: string | null
          criado_em?: string
          notificacao_id?: number | null
          request_id?: number
          resultado?: string | null
          tokens?: string[]
        }
        Relationships: []
      }
      perfil: {
        Row: {
          caracteristicas: Json | null
          created_at: string
          descricao: string | null
          id: number
          nome: string | null
        }
        Insert: {
          caracteristicas?: Json | null
          created_at?: string
          descricao?: string | null
          id?: number
          nome?: string | null
        }
        Update: {
          caracteristicas?: Json | null
          created_at?: string
          descricao?: string | null
          id?: number
          nome?: string | null
        }
        Relationships: []
      }
      personalizacao_blocos_gerados: {
        Row: {
          audio_script: string | null
          block_id: string
          enriched_payload: Json | null
          id: number
          job_id: string
          markdown: string | null
          slides: Json | null
          updated_at: string
        }
        Insert: {
          audio_script?: string | null
          block_id: string
          enriched_payload?: Json | null
          id?: number
          job_id: string
          markdown?: string | null
          slides?: Json | null
          updated_at?: string
        }
        Update: {
          audio_script?: string | null
          block_id?: string
          enriched_payload?: Json | null
          id?: number
          job_id?: string
          markdown?: string | null
          slides?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personalizacao_blocos_gerados_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "personalizacao_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      personalizacao_item_progresso: {
        Row: {
          acertos_percentual: number | null
          aluno_id: string
          classe_id: number
          completed_at: string | null
          id: number
          item_key: string
          item_kind: string
          item_title: string
          metadata: Json
          percentual_concluido: number
          personalizacao_id: number
          pontuacao_maxima: number | null
          pontuacao_obtida: number | null
          status: string
          tempo_gasto_min: number
          topico_id: number
          updated_at: string
        }
        Insert: {
          acertos_percentual?: number | null
          aluno_id: string
          classe_id: number
          completed_at?: string | null
          id?: never
          item_key: string
          item_kind: string
          item_title: string
          metadata?: Json
          percentual_concluido?: number
          personalizacao_id: number
          pontuacao_maxima?: number | null
          pontuacao_obtida?: number | null
          status?: string
          tempo_gasto_min?: number
          topico_id: number
          updated_at?: string
        }
        Update: {
          acertos_percentual?: number | null
          aluno_id?: string
          classe_id?: number
          completed_at?: string | null
          id?: never
          item_key?: string
          item_kind?: string
          item_title?: string
          metadata?: Json
          percentual_concluido?: number
          personalizacao_id?: number
          pontuacao_maxima?: number | null
          pontuacao_obtida?: number | null
          status?: string
          tempo_gasto_min?: number
          topico_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_personalizacao_item_progresso_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personalizacao_item_progresso_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_personalizacao_item_progresso_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_personalizacao_item_progresso_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_personalizacao_item_progresso_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_personalizacao_item_progresso_personalizacao"
            columns: ["personalizacao_id"]
            isOneToOne: false
            referencedRelation: "conteudo_personalizado"
            referencedColumns: ["id"]
          },
        ]
      }
      personalizacao_job_targets: {
        Row: {
          aluno_id: string | null
          attempts: number
          block_id: string | null
          brainhex_profile_key: string | null
          conteudo_id: number | null
          created_at: string
          id: number
          is_profile_template: boolean
          job_id: string
          last_error: string | null
          media_kind: string | null
          part_ordem: number | null
          personalizacao_id: number | null
          status: string
          topico_id: number
          updated_at: string
        }
        Insert: {
          aluno_id?: string | null
          attempts?: number
          block_id?: string | null
          brainhex_profile_key?: string | null
          conteudo_id?: number | null
          created_at?: string
          id?: never
          is_profile_template?: boolean
          job_id: string
          last_error?: string | null
          media_kind?: string | null
          part_ordem?: number | null
          personalizacao_id?: number | null
          status?: string
          topico_id: number
          updated_at?: string
        }
        Update: {
          aluno_id?: string | null
          attempts?: number
          block_id?: string | null
          brainhex_profile_key?: string | null
          conteudo_id?: number | null
          created_at?: string
          id?: never
          is_profile_template?: boolean
          job_id?: string
          last_error?: string | null
          media_kind?: string | null
          part_ordem?: number | null
          personalizacao_id?: number | null
          status?: string
          topico_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_personalizacao_job_targets_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personalizacao_job_targets_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_personalizacao_job_targets_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_personalizacao_job_targets_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_personalizacao_job_targets_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_personalizacao_job_targets_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personalizacao_job_targets_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "fk_personalizacao_job_targets_job"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "personalizacao_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personalizacao_job_targets_personalizacao"
            columns: ["personalizacao_id"]
            isOneToOne: false
            referencedRelation: "conteudo_personalizado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personalizacao_job_targets_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personalizacao_job_targets_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      personalizacao_jobs: {
        Row: {
          aluno_id: string | null
          classe_id: number
          conteudo_id: number | null
          created_at: string
          error_count: number
          finished_at: string | null
          id: string
          kind: string
          last_error: string | null
          media_snapshot: Json | null
          payload: Json
          processed_targets: number
          started_at: string | null
          status: string
          topico_id: number | null
          total_targets: number
          trigger_source: string
          updated_at: string
        }
        Insert: {
          aluno_id?: string | null
          classe_id: number
          conteudo_id?: number | null
          created_at?: string
          error_count?: number
          finished_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          media_snapshot?: Json | null
          payload?: Json
          processed_targets?: number
          started_at?: string | null
          status?: string
          topico_id?: number | null
          total_targets?: number
          trigger_source: string
          updated_at?: string
        }
        Update: {
          aluno_id?: string | null
          classe_id?: number
          conteudo_id?: number | null
          created_at?: string
          error_count?: number
          finished_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          media_snapshot?: Json | null
          payload?: Json
          processed_targets?: number
          started_at?: string | null
          status?: string
          topico_id?: number | null
          total_targets?: number
          trigger_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_personalizacao_jobs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personalizacao_jobs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_personalizacao_jobs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_personalizacao_jobs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_personalizacao_jobs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_personalizacao_jobs_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personalizacao_jobs_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "fk_personalizacao_jobs_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personalizacao_jobs_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "fk_personalizacao_jobs_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personalizacao_jobs_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      personalizacao_percurso: {
        Row: {
          aluno_id: string
          classe_id: number
          item_keys: Json
          personalizacao_id: number
          topico_id: number
          updated_at: string
        }
        Insert: {
          aluno_id: string
          classe_id: number
          item_keys: Json
          personalizacao_id: number
          topico_id: number
          updated_at?: string
        }
        Update: {
          aluno_id?: string
          classe_id?: number
          item_keys?: Json
          personalizacao_id?: number
          topico_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personalizacao_percurso_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personalizacao_percurso_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "personalizacao_percurso_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "personalizacao_percurso_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "personalizacao_percurso_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "personalizacao_percurso_personalizacao_id_fkey"
            columns: ["personalizacao_id"]
            isOneToOne: false
            referencedRelation: "conteudo_personalizado"
            referencedColumns: ["id"]
          },
        ]
      }
      personalizacao_sugestao: {
        Row: {
          aluno_id: string
          atualizado_em: string
          classe_id: number | null
          conteudo_id: number | null
          criado_em: string
          evidencia: Json
          formato_inicial: string | null
          id: number
          ordem: Json
          origem: string
          topico_id: number
          versao: number
        }
        Insert: {
          aluno_id: string
          atualizado_em?: string
          classe_id?: number | null
          conteudo_id?: number | null
          criado_em?: string
          evidencia?: Json
          formato_inicial?: string | null
          id?: number
          ordem?: Json
          origem?: string
          topico_id: number
          versao?: number
        }
        Update: {
          aluno_id?: string
          atualizado_em?: string
          classe_id?: number | null
          conteudo_id?: number | null
          criado_em?: string
          evidencia?: Json
          formato_inicial?: string | null
          id?: number
          ordem?: Json
          origem?: string
          topico_id?: number
          versao?: number
        }
        Relationships: []
      }
      personalizacao_sugestao_log: {
        Row: {
          acao: string
          aluno_id: string
          classe_id: number | null
          conteudo_id: number | null
          criado_em: string
          evidencia: Json
          id: number
          motivos: Json
          ordem_antes: Json | null
          ordem_depois: Json | null
          sugestao_id: number | null
          topico_id: number
          versao: number
        }
        Insert: {
          acao: string
          aluno_id: string
          classe_id?: number | null
          conteudo_id?: number | null
          criado_em?: string
          evidencia?: Json
          id?: number
          motivos?: Json
          ordem_antes?: Json | null
          ordem_depois?: Json | null
          sugestao_id?: number | null
          topico_id: number
          versao: number
        }
        Update: {
          acao?: string
          aluno_id?: string
          classe_id?: number | null
          conteudo_id?: number | null
          criado_em?: string
          evidencia?: Json
          id?: number
          motivos?: Json
          ordem_antes?: Json | null
          ordem_depois?: Json | null
          sugestao_id?: number | null
          topico_id?: number
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "personalizacao_sugestao_log_sugestao_id_fkey"
            columns: ["sugestao_id"]
            isOneToOne: false
            referencedRelation: "personalizacao_sugestao"
            referencedColumns: ["id"]
          },
        ]
      }
      professor: {
        Row: {
          created_at: string
          descricao: string | null
          disciplina: string | null
          geracao_automatica: boolean
          id: string
          instituicao: string | null
          liberado: boolean | null
          nome: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          disciplina?: string | null
          geracao_automatica?: boolean
          id: string
          instituicao?: string | null
          liberado?: boolean | null
          nome?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          disciplina?: string | null
          geracao_automatica?: boolean
          id?: string
          instituicao?: string | null
          liberado?: boolean | null
          nome?: string | null
        }
        Relationships: []
      }
      professor_aluno: {
        Row: {
          aluno_id: string
          created_at: string | null
          has_acesso: boolean
          professor_id: string
        }
        Insert: {
          aluno_id: string
          created_at?: string | null
          has_acesso?: boolean
          professor_id: string
        }
        Update: {
          aluno_id?: string
          created_at?: string | null
          has_acesso?: boolean
          professor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professor_aluno_aluno_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professor_aluno_aluno_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "professor_aluno_aluno_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "professor_aluno_aluno_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "professor_aluno_aluno_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "professor_aluno_professor_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "professor"
            referencedColumns: ["id"]
          },
        ]
      }
      professor_intervencoes_passo: {
        Row: {
          aluno_id: string
          classe_id: number
          created_at: string
          id: string
          passo_ref: string
          professor_id: string
          texto: string
          topico_id: number | null
        }
        Insert: {
          aluno_id: string
          classe_id: number
          created_at?: string
          id?: string
          passo_ref: string
          professor_id?: string
          texto: string
          topico_id?: number | null
        }
        Update: {
          aluno_id?: string
          classe_id?: number
          created_at?: string
          id?: string
          passo_ref?: string
          professor_id?: string
          texto?: string
          topico_id?: number | null
        }
        Relationships: []
      }
      questao_aluno: {
        Row: {
          acertos_percentual: number | null
          aluno_id: string
          atividade_id: number
          correta: boolean | null
          criado_em: string | null
          id: number
          questao_id: number
          resposta: string
          tempo_gasto_seg: number | null
          tentativa: number
        }
        Insert: {
          acertos_percentual?: number | null
          aluno_id: string
          atividade_id: number
          correta?: boolean | null
          criado_em?: string | null
          id?: never
          questao_id: number
          resposta: string
          tempo_gasto_seg?: number | null
          tentativa?: number
        }
        Update: {
          acertos_percentual?: number | null
          aluno_id?: string
          atividade_id?: number
          correta?: boolean | null
          criado_em?: string | null
          id?: never
          questao_id?: number
          resposta?: string
          tempo_gasto_seg?: number | null
          tentativa?: number
        }
        Relationships: [
          {
            foreignKeyName: "questao_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questao_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "questao_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "questao_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "questao_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "questao_aluno_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questao_aluno_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
          {
            foreignKeyName: "questao_aluno_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questao_aluno_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["questao_id"]
          },
        ]
      }
      questao_gabarito: {
        Row: {
          atualizado_em: string
          questao_id: number
          resposta_correta: string | null
        }
        Insert: {
          atualizado_em?: string
          questao_id: number
          resposta_correta?: string | null
        }
        Update: {
          atualizado_em?: string
          questao_id?: number
          resposta_correta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questao_gabarito_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: true
            referencedRelation: "questoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questao_gabarito_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: true
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["questao_id"]
          },
        ]
      }
      questao_gabarito_revelado: {
        Row: {
          aluno_id: string
          questao_id: number
          revelado_em: string
        }
        Insert: {
          aluno_id: string
          questao_id: number
          revelado_em?: string
        }
        Update: {
          aluno_id?: string
          questao_id?: number
          revelado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "questao_gabarito_revelado_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questao_gabarito_revelado_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "questao_gabarito_revelado_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "questao_gabarito_revelado_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "questao_gabarito_revelado_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      questoes: {
        Row: {
          alternativas: Json | null
          atividade_id: number
          created_at: string | null
          enunciado: string
          id: number
          midia_url: string | null
          nota_estabelecida: number | null
          resposta_correta: string | null
          tipo: string | null
        }
        Insert: {
          alternativas?: Json | null
          atividade_id: number
          created_at?: string | null
          enunciado: string
          id?: number
          midia_url?: string | null
          nota_estabelecida?: number | null
          resposta_correta?: string | null
          tipo?: string | null
        }
        Update: {
          alternativas?: Json | null
          atividade_id?: number
          created_at?: string | null
          enunciado?: string
          id?: number
          midia_url?: string | null
          nota_estabelecida?: number | null
          resposta_correta?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questoes_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questoes_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
        ]
      }
      rag_chunks: {
        Row: {
          aluno_id: string | null
          classe_id: number | null
          conteudo_id: number | null
          created_at: string
          embedding: string | null
          fonte_id: number | null
          id: string
          metadata: Json
          scope: string
          source_hash: string | null
          texto: string
          topico_id: number | null
          updated_at: string
        }
        Insert: {
          aluno_id?: string | null
          classe_id?: number | null
          conteudo_id?: number | null
          created_at?: string
          embedding?: string | null
          fonte_id?: number | null
          id?: string
          metadata?: Json
          scope: string
          source_hash?: string | null
          texto: string
          topico_id?: number | null
          updated_at?: string
        }
        Update: {
          aluno_id?: string | null
          classe_id?: number | null
          conteudo_id?: number | null
          created_at?: string
          embedding?: string | null
          fonte_id?: number | null
          id?: string
          metadata?: Json
          scope?: string
          source_hash?: string | null
          texto?: string
          topico_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      rag_relacoes: {
        Row: {
          destino_id: string
          origem_id: string
          tipo: string
        }
        Insert: {
          destino_id: string
          origem_id: string
          tipo: string
        }
        Update: {
          destino_id?: string
          origem_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "rag_relacoes_destino_id_fkey"
            columns: ["destino_id"]
            isOneToOne: false
            referencedRelation: "rag_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_relacoes_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "rag_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_tipo: {
        Row: {
          created_at: string | null
          criterio: string | null
          descricao: string | null
          icone: number | null
          id: number
          nome: string
        }
        Insert: {
          created_at?: string | null
          criterio?: string | null
          descricao?: string | null
          icone?: number | null
          id?: number
          nome: string
        }
        Update: {
          created_at?: string | null
          criterio?: string | null
          descricao?: string | null
          icone?: number | null
          id?: number
          nome?: string
        }
        Relationships: []
      }
      ranks: {
        Row: {
          classe_id: number | null
          created_at: string | null
          id: number
          periodo: string | null
          tipo_id: number
        }
        Insert: {
          classe_id?: number | null
          created_at?: string | null
          id?: number
          periodo?: string | null
          tipo_id: number
        }
        Update: {
          classe_id?: number | null
          created_at?: string | null
          id?: number
          periodo?: string | null
          tipo_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ranks_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranks_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "ranks_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "rank_tipo"
            referencedColumns: ["id"]
          },
        ]
      }
      social_mensagens: {
        Row: {
          created_at: string
          destinatario_id: string
          id: string
          remetente_id: string
          texto: string
        }
        Insert: {
          created_at?: string
          destinatario_id: string
          id?: string
          remetente_id: string
          texto: string
        }
        Update: {
          created_at?: string
          destinatario_id?: string
          id?: string
          remetente_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_mensagens_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_mensagens_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "social_mensagens_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "social_mensagens_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "social_mensagens_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "social_mensagens_remetente_id_fkey"
            columns: ["remetente_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_mensagens_remetente_id_fkey"
            columns: ["remetente_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "social_mensagens_remetente_id_fkey"
            columns: ["remetente_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "social_mensagens_remetente_id_fkey"
            columns: ["remetente_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "social_mensagens_remetente_id_fkey"
            columns: ["remetente_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      social_relacionamentos: {
        Row: {
          aluno_a_id: string
          aluno_b_id: string
          blocked_by_id: string | null
          created_at: string
          id: string
          responded_at: string | null
          solicitante_id: string
          status: string
          updated_at: string
        }
        Insert: {
          aluno_a_id: string
          aluno_b_id: string
          blocked_by_id?: string | null
          created_at?: string
          id?: string
          responded_at?: string | null
          solicitante_id: string
          status: string
          updated_at?: string
        }
        Update: {
          aluno_a_id?: string
          aluno_b_id?: string
          blocked_by_id?: string | null
          created_at?: string
          id?: string
          responded_at?: string | null
          solicitante_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_relacionamentos_aluno_a_id_fkey"
            columns: ["aluno_a_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_relacionamentos_aluno_a_id_fkey"
            columns: ["aluno_a_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "social_relacionamentos_aluno_a_id_fkey"
            columns: ["aluno_a_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "social_relacionamentos_aluno_a_id_fkey"
            columns: ["aluno_a_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "social_relacionamentos_aluno_a_id_fkey"
            columns: ["aluno_a_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "social_relacionamentos_aluno_b_id_fkey"
            columns: ["aluno_b_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_relacionamentos_aluno_b_id_fkey"
            columns: ["aluno_b_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "social_relacionamentos_aluno_b_id_fkey"
            columns: ["aluno_b_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "social_relacionamentos_aluno_b_id_fkey"
            columns: ["aluno_b_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "social_relacionamentos_aluno_b_id_fkey"
            columns: ["aluno_b_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "social_relacionamentos_blocked_by_id_fkey"
            columns: ["blocked_by_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_relacionamentos_blocked_by_id_fkey"
            columns: ["blocked_by_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "social_relacionamentos_blocked_by_id_fkey"
            columns: ["blocked_by_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "social_relacionamentos_blocked_by_id_fkey"
            columns: ["blocked_by_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "social_relacionamentos_blocked_by_id_fkey"
            columns: ["blocked_by_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "social_relacionamentos_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_relacionamentos_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "social_relacionamentos_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "social_relacionamentos_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "social_relacionamentos_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      solicitacoes_exclusao: {
        Row: {
          aluno_id: string | null
          created_at: string
          email: string
          id: number
          motivo: string | null
          status: string
          updated_at: string
        }
        Insert: {
          aluno_id?: string | null
          created_at?: string
          email: string
          id?: never
          motivo?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          aluno_id?: string | null
          created_at?: string
          email?: string
          id?: never
          motivo?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_exclusao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_exclusao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "solicitacoes_exclusao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "solicitacoes_exclusao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "solicitacoes_exclusao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
        ]
      }
      telemetria_eventos_app: {
        Row: {
          aluno_id: string
          atividade_id: number | null
          attempt_number: number | null
          chat_role: string | null
          classe_id: number
          client_event_id: string
          conteudo_id: number | null
          created_at: string
          event_group: string
          event_name: string
          event_source: string
          id: string
          is_correct: boolean | null
          item_key: string | null
          occurred_at: string
          payload: Json
          questao_id: number | null
          route_name: string | null
          screen_name: string | null
          sessao_id: string
          time_since_prev_sec: number | null
          topico_id: number | null
          trigger_context: string | null
        }
        Insert: {
          aluno_id: string
          atividade_id?: number | null
          attempt_number?: number | null
          chat_role?: string | null
          classe_id: number
          client_event_id: string
          conteudo_id?: number | null
          created_at?: string
          event_group: string
          event_name: string
          event_source?: string
          id?: string
          is_correct?: boolean | null
          item_key?: string | null
          occurred_at: string
          payload?: Json
          questao_id?: number | null
          route_name?: string | null
          screen_name?: string | null
          sessao_id: string
          time_since_prev_sec?: number | null
          topico_id?: number | null
          trigger_context?: string | null
        }
        Update: {
          aluno_id?: string
          atividade_id?: number | null
          attempt_number?: number | null
          chat_role?: string | null
          classe_id?: number
          client_event_id?: string
          conteudo_id?: number | null
          created_at?: string
          event_group?: string
          event_name?: string
          event_source?: string
          id?: string
          is_correct?: boolean | null
          item_key?: string | null
          occurred_at?: string
          payload?: Json
          questao_id?: number | null
          route_name?: string | null
          screen_name?: string | null
          sessao_id?: string
          time_since_prev_sec?: number | null
          topico_id?: number | null
          trigger_context?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_atividade"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_atividade"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_questao"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_questao"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["questao_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_sessao"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "telemetria_sessoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_sessao"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "vw_metricas_sessoes_aluno_dia"
            referencedColumns: ["sessao_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      telemetria_lotes: {
        Row: {
          active_sec: number
          aluno_id: string
          analysis_ciclo_id: string | null
          analysis_error: string | null
          atividade_id: number | null
          captured_at: string
          classe_id: number
          conteudo_id: number | null
          created_at: string
          flush_reason: string
          frame_sent: boolean
          id: string
          idle_sec: number
          max_depth_px: number
          payload: Json
          route_name: string
          screen_dwell_sec: number
          screen_name: string
          scroll_distance_px: number
          sessao_id: string
          study_elapsed_sec: number
          topico_id: number | null
          touch_count: number
        }
        Insert: {
          active_sec: number
          aluno_id: string
          analysis_ciclo_id?: string | null
          analysis_error?: string | null
          atividade_id?: number | null
          captured_at: string
          classe_id: number
          conteudo_id?: number | null
          created_at?: string
          flush_reason: string
          frame_sent?: boolean
          id: string
          idle_sec: number
          max_depth_px: number
          payload: Json
          route_name: string
          screen_dwell_sec: number
          screen_name: string
          scroll_distance_px: number
          sessao_id: string
          study_elapsed_sec: number
          topico_id?: number | null
          touch_count: number
        }
        Update: {
          active_sec?: number
          aluno_id?: string
          analysis_ciclo_id?: string | null
          analysis_error?: string | null
          atividade_id?: number | null
          captured_at?: string
          classe_id?: number
          conteudo_id?: number | null
          created_at?: string
          flush_reason?: string
          frame_sent?: boolean
          id?: string
          idle_sec?: number
          max_depth_px?: number
          payload?: Json
          route_name?: string
          screen_dwell_sec?: number
          screen_name?: string
          scroll_distance_px?: number
          sessao_id?: string
          study_elapsed_sec?: number
          topico_id?: number | null
          touch_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_telemetria_lotes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_lotes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_telemetria_lotes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_telemetria_lotes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_lotes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_lotes_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_lotes_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "fk_telemetria_lotes_sessao"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "telemetria_sessoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_lotes_sessao"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "vw_metricas_sessoes_aluno_dia"
            referencedColumns: ["sessao_id"]
          },
        ]
      }
      telemetria_sessoes: {
        Row: {
          aluno_id: string
          camera_opt_in: boolean
          classe_id: number
          created_at: string
          ended_at: string | null
          id: string
          started_at: string
          topico_inicial_id: number | null
          updated_at: string
        }
        Insert: {
          aluno_id: string
          camera_opt_in?: boolean
          classe_id: number
          created_at?: string
          ended_at?: string | null
          id: string
          started_at: string
          topico_inicial_id?: number | null
          updated_at?: string
        }
        Update: {
          aluno_id?: string
          camera_opt_in?: boolean
          classe_id?: number
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          topico_inicial_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      telemetria_time_metric_entries: {
        Row: {
          active_sec: number
          aluno_id: string
          atividade_id: number | null
          captured_at: string
          classe_id: number
          conteudo_id: number | null
          created_at: string
          dwell_sec: number
          entry_key: string | null
          id: number
          idle_sec: number
          item_key: string | null
          lote_id: string
          material_key: string | null
          material_tipo: string | null
          max_depth_px: number
          questao_id: number | null
          scope: string
          scroll_distance_px: number
          sessao_id: string
          topico_id: number | null
          touch_count: number
          visits: number
        }
        Insert: {
          active_sec?: number
          aluno_id: string
          atividade_id?: number | null
          captured_at: string
          classe_id: number
          conteudo_id?: number | null
          created_at?: string
          dwell_sec?: number
          entry_key?: string | null
          id?: never
          idle_sec?: number
          item_key?: string | null
          lote_id: string
          material_key?: string | null
          material_tipo?: string | null
          max_depth_px?: number
          questao_id?: number | null
          scope: string
          scroll_distance_px?: number
          sessao_id: string
          topico_id?: number | null
          touch_count?: number
          visits?: number
        }
        Update: {
          active_sec?: number
          aluno_id?: string
          atividade_id?: number | null
          captured_at?: string
          classe_id?: number
          conteudo_id?: number | null
          created_at?: string
          dwell_sec?: number
          entry_key?: string | null
          id?: never
          idle_sec?: number
          item_key?: string | null
          lote_id?: string
          material_key?: string | null
          material_tipo?: string | null
          max_depth_px?: number
          questao_id?: number | null
          scope?: string
          scroll_distance_px?: number
          sessao_id?: string
          topico_id?: number | null
          touch_count?: number
          visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_lote"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "telemetria_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_sessao"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "telemetria_sessoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_sessao"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "vw_metricas_sessoes_aluno_dia"
            referencedColumns: ["sessao_id"]
          },
        ]
      }
      topico_aluno: {
        Row: {
          aluno_id: string
          id: number
          percentual_concluido: number | null
          status: Database["public"]["Enums"]["status_atividade"] | null
          tempo_direto_min: number
          tempo_gasto_min: number | null
          topico_id: number
          ultima_atividade: number | null
          ultima_visualizacao: string | null
          updated_at: string | null
        }
        Insert: {
          aluno_id: string
          id?: number
          percentual_concluido?: number | null
          status?: Database["public"]["Enums"]["status_atividade"] | null
          tempo_direto_min?: number
          tempo_gasto_min?: number | null
          topico_id: number
          ultima_atividade?: number | null
          ultima_visualizacao?: string | null
          updated_at?: string | null
        }
        Update: {
          aluno_id?: string
          id?: number
          percentual_concluido?: number | null
          status?: Database["public"]["Enums"]["status_atividade"] | null
          tempo_direto_min?: number
          tempo_gasto_min?: number | null
          topico_id?: number
          ultima_atividade?: number | null
          ultima_visualizacao?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topico_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topico_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "topico_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "topico_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "topico_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "topico_aluno_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topico_aluno_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
          {
            foreignKeyName: "topico_aluno_ultima_atividade_fkey"
            columns: ["ultima_atividade"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topico_aluno_ultima_atividade_fkey"
            columns: ["ultima_atividade"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
        ]
      }
      topico_edges: {
        Row: {
          classe_id: number
          created_at: string | null
          from_id: number
          to_id: number
        }
        Insert: {
          classe_id: number
          created_at?: string | null
          from_id: number
          to_id: number
        }
        Update: {
          classe_id?: number
          created_at?: string | null
          from_id?: number
          to_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "topico_edges_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topico_edges_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "topico_edges_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topico_edges_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
          {
            foreignKeyName: "topico_edges_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topico_edges_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      topicos: {
        Row: {
          classe_id: number
          created_at: string | null
          depende: Json | null
          descricao: string | null
          id: number
          next: Json | null
          nome: string
          ordem: number | null
        }
        Insert: {
          classe_id: number
          created_at?: string | null
          depende?: Json | null
          descricao?: string | null
          id?: number
          next?: Json | null
          nome: string
          ordem?: number | null
        }
        Update: {
          classe_id?: number
          created_at?: string | null
          depende?: Json | null
          descricao?: string | null
          id?: number
          next?: Json | null
          nome?: string
          ordem?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "topicos_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topicos_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      trilha_aluno: {
        Row: {
          aluno_id: string
          classe_id: number
          configuracao: Json | null
          created_at: string | null
          id: string
          status: string | null
          trilha_modelo_id: number | null
        }
        Insert: {
          aluno_id: string
          classe_id: number
          configuracao?: Json | null
          created_at?: string | null
          id?: string
          status?: string | null
          trilha_modelo_id?: number | null
        }
        Update: {
          aluno_id?: string
          classe_id?: number
          configuracao?: Json | null
          created_at?: string | null
          id?: string
          status?: string | null
          trilha_modelo_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trilha_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trilha_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "trilha_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trilha_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "trilha_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "trilha_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trilha_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "trilha_aluno_trilha_modelo_id_fkey"
            columns: ["trilha_modelo_id"]
            isOneToOne: false
            referencedRelation: "trilha_modelo"
            referencedColumns: ["id"]
          },
        ]
      }
      trilha_checkpoint_navegacao: {
        Row: {
          aluno_id: string
          block_id: number | null
          block_kind: string | null
          classe_id: number
          mostrar_resumo: boolean
          question_index: number | null
          scope_id: string
          step_index: number | null
          topico_id: number
          updated_at: string
        }
        Insert: {
          aluno_id: string
          block_id?: number | null
          block_kind?: string | null
          classe_id: number
          mostrar_resumo?: boolean
          question_index?: number | null
          scope_id?: string
          step_index?: number | null
          topico_id: number
          updated_at?: string
        }
        Update: {
          aluno_id?: string
          block_id?: number | null
          block_kind?: string | null
          classe_id?: number
          mostrar_resumo?: boolean
          question_index?: number | null
          scope_id?: string
          step_index?: number | null
          topico_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trilha_checkpoint_navegacao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trilha_checkpoint_navegacao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "trilha_checkpoint_navegacao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trilha_checkpoint_navegacao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "trilha_checkpoint_navegacao_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "trilha_checkpoint_navegacao_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trilha_checkpoint_navegacao_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "trilha_checkpoint_navegacao_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trilha_checkpoint_navegacao_topico_id_fkey"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      trilha_modelo: {
        Row: {
          classe_id: number
          created_at: string | null
          id: number
          nome: string | null
          perfis: Json | null
          regras: Json | null
          tipo: string | null
        }
        Insert: {
          classe_id: number
          created_at?: string | null
          id?: never
          nome?: string | null
          perfis?: Json | null
          regras?: Json | null
          tipo?: string | null
        }
        Update: {
          classe_id?: number
          created_at?: string | null
          id?: never
          nome?: string | null
          perfis?: Json | null
          regras?: Json | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trilha_modelo_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trilha_modelo_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
    }
    Views: {
      vw_aluno_classe_detalhado: {
        Row: {
          aluno_id: string | null
          atividade_acertos_percentual: number | null
          atividade_conteudo_atividade_id: number | null
          atividade_conteudo_conteudo_id: number | null
          atividade_data_entrega: string | null
          atividade_descricao: string | null
          atividade_id: number | null
          atividade_percentual_concluido: number | null
          atividade_pontuacao_obtida: number | null
          atividade_status:
            | Database["public"]["Enums"]["status_atividade"]
            | null
          atividade_tempo_gasto_min: number | null
          atividade_tipo: string | null
          atividade_titulo: string | null
          atividade_ultima_visualizacao: string | null
          classe_id: number | null
          conteudo_conteudo: string | null
          conteudo_id: number | null
          conteudo_metadata: Json | null
          conteudo_ordem: number | null
          conteudo_percentual_concluido: number | null
          conteudo_status:
            | Database["public"]["Enums"]["status_atividade"]
            | null
          conteudo_tempo_gasto_min: number | null
          conteudo_tipo: string | null
          conteudo_titulo: string | null
          conteudo_ultima_visualizacao: string | null
          midia_id: number | null
          midia_legenda: string | null
          midia_ordem: number | null
          midia_tipo: string | null
          midia_url: string | null
          pontuacao_maxima: number | null
          questao_alternativas: Json | null
          questao_enunciado: string | null
          questao_id: number | null
          questao_midia_url: string | null
          questao_resposta_correta: string | null
          questao_tipo: string | null
          topico_depende: Json | null
          topico_descricao: string | null
          topico_id: number | null
          topico_next: Json | null
          topico_nome: string | null
          topico_ordem: number | null
          topico_percentual_concluido: number | null
          topico_status: Database["public"]["Enums"]["status_atividade"] | null
          topico_tempo_gasto_min: number | null
          topico_ultima_atividade: number | null
          topico_ultima_visualizacao: string | null
          topico_updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atividade_conteudos_atividade_id_fkey"
            columns: ["atividade_conteudo_atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividade_conteudos_atividade_id_fkey"
            columns: ["atividade_conteudo_atividade_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
          {
            foreignKeyName: "atividade_conteudos_conteudo_id_fkey"
            columns: ["atividade_conteudo_conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividade_conteudos_conteudo_id_fkey"
            columns: ["atividade_conteudo_conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "topico_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topico_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "topico_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "topico_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "topico_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "topico_aluno_ultima_atividade_fkey"
            columns: ["topico_ultima_atividade"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topico_aluno_ultima_atividade_fkey"
            columns: ["topico_ultima_atividade"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
          {
            foreignKeyName: "topicos_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topicos_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_aluno_classe_resumo: {
        Row: {
          acertosPercentual: number | null
          aluno_id: string | null
          atividadesConcluidas: Json | null
          classe_id: number | null
          insights: Json | null
          isComplete: boolean | null
          materia_descricao: string | null
          materia_nome: string | null
          modoOperacao: string | null
          notaMedia: number | null
          perfisDetectados: Json | null
          porcentagemConcluida: number | null
          professor_descricao: string | null
          professor_nome: string | null
          recomendacaoTrilha: string | null
          tempoGastoMin: number | null
          tempoMedioPorAtividade: number | null
          ultimaAtividade: number | null
        }
        Relationships: [
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "classe_aluno_ultimaatividade_fkey"
            columns: ["ultimaAtividade"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_aluno_ultimaatividade_fkey"
            columns: ["ultimaAtividade"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
          {
            foreignKeyName: "classe_aluno_ultimaAtividade_fkey"
            columns: ["ultimaAtividade"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_aluno_ultimaAtividade_fkey"
            columns: ["ultimaAtividade"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
        ]
      }
      vw_aluno_perfil_segmentos: {
        Row: {
          afinidade: number | null
          aluno_id: string | null
          classe_id: number | null
          perfil_id: number | null
          perfil_nome: string | null
          segmento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classe_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_aluno_usuario: {
        Row: {
          aluno_id: string | null
          apelido: string | null
          banner_url: string | null
          descricao: string | null
          email: string | null
          foto_url: string | null
          modo_resposta:
            | Database["public"]["Enums"]["modo_resposta_type"]
            | null
          modoOperacao_descricao: string | null
          modoOperacao_nome: string | null
          modoOperacao_ordem: Json | null
          nome: string | null
          user_id: string | null
        }
        Relationships: []
      }
      vw_creditos_concedidos: {
        Row: {
          aluno_id: string | null
          classe_id: number | null
          concedido_por: string | null
          criado_em: string | null
          data_credito: string | null
          id: number | null
          motivo: string | null
          nome_aluno: string | null
          tipo: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "eventos_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "eventos_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "eventos_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "eventos_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "eventos_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_ia_decision_logs_resumo: {
        Row: {
          aluno_id: string | null
          atividade_id: number | null
          batch_id: string | null
          ciclo_id: string | null
          classe_id: number | null
          conteudo_id: number | null
          created_at: string | null
          decision_summary: string | null
          id: number | null
          model_name: string | null
          prompt_chars: number | null
          prompt_preview: string | null
          provider: string | null
          raw_response_chars: number | null
          raw_response_preview: string | null
          sessao_id: string | null
          source: string | null
          stage: string | null
          topico_id: number | null
          total_acoes: number | null
          trigger_event: string | null
        }
        Insert: {
          aluno_id?: string | null
          atividade_id?: number | null
          batch_id?: string | null
          ciclo_id?: string | null
          classe_id?: number | null
          conteudo_id?: number | null
          created_at?: string | null
          decision_summary?: string | null
          id?: number | null
          model_name?: string | null
          prompt_chars?: never
          prompt_preview?: never
          provider?: string | null
          raw_response_chars?: never
          raw_response_preview?: never
          sessao_id?: string | null
          source?: string | null
          stage?: string | null
          topico_id?: number | null
          total_acoes?: never
          trigger_event?: string | null
        }
        Update: {
          aluno_id?: string | null
          atividade_id?: number | null
          batch_id?: string | null
          ciclo_id?: string | null
          classe_id?: number | null
          conteudo_id?: number | null
          created_at?: string | null
          decision_summary?: string | null
          id?: number | null
          model_name?: string | null
          prompt_chars?: never
          prompt_preview?: never
          provider?: string | null
          raw_response_chars?: never
          raw_response_preview?: never
          sessao_id?: string | null
          source?: string | null
          stage?: string | null
          topico_id?: number | null
          total_acoes?: never
          trigger_event?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ia_decision_logs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_atividade"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_atividade"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ia_decision_logs_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      vw_material_storage_paths: {
        Row: {
          conteudo_id: number | null
          personalizacao_id: number | null
          storage_path: string | null
        }
        Relationships: []
      }
      vw_metricas_chat_aluno_classe: {
        Row: {
          aberturas_chat_por_sessao: number | null
          aluno_id: string | null
          classe_id: number | null
          frequencia_chat_por_sessao: number | null
          momento_uso_chat: Json | null
          numero_interacoes_chat: number | null
          tempo_chat_seg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_metricas_comportamento_aluno_classe: {
        Row: {
          aluno_id: string | null
          classe_id: number | null
          interrupcoes_sessao: number | null
          media_tempo_entre_interacoes_seg: number | null
          media_tentativas_por_questao: number | null
          mediana_tempo_entre_interacoes_seg: number | null
          revisitas_conteudo: number | null
          total_tentativas: number | null
        }
        Relationships: []
      }
      vw_metricas_desempenho_aluno_classe: {
        Row: {
          aluno_id: string | null
          classe_id: number | null
          eficiencia_aprendizagem: number | null
          nota_media_desempenho: number | null
          progresso_trilha_pct: number | null
          taxa_acertos_pct: number | null
          taxa_acertos_sem_erro_pct: number | null
          tempo_medio_conclusao_topico_seg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "classe_aluno_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "classe_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_metricas_distribuicao_turma_classe: {
        Row: {
          classe_id: number | null
          faixa: string | null
          metrica: string | null
          percentual: number | null
          total_alunos: number | null
        }
        Relationships: []
      }
      vw_metricas_engajamento_aluno_classe: {
        Row: {
          aluno_id: string | null
          classe_id: number | null
          interacoes_por_sessao: number | null
          numero_sessoes: number | null
          sessoes_por_dia: number | null
          taxa_abandono_pct: number | null
          taxa_conclusao_topicos_pct: number | null
          taxa_retorno_pct: number | null
          taxa_uso_chat_pct: number | null
          tempo_medio_conclusao_topico_seg: number | null
          tempo_medio_sessao_seg: number | null
          tempo_medio_topico_seg: number | null
          tempo_total_uso_seg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_metricas_evolucao_desempenho_aluno_dia: {
        Row: {
          aluno_id: string | null
          classe_id: number | null
          dia: string | null
          eficiencia_aprendizagem: number | null
          nota_media_desempenho: number | null
          progresso_trilha_pct: number | null
          taxa_acertos_pct: number | null
          taxa_acertos_sem_erro_pct: number | null
        }
        Relationships: []
      }
      vw_metricas_sessoes_aluno_dia: {
        Row: {
          aberturas_chat: number | null
          aluno_id: string | null
          classe_id: number | null
          dia: string | null
          interacoes: number | null
          mensagens_chat: number | null
          sessao_id: string | null
          tempo_ativo_seg: number | null
          tempo_ocioso_seg: number | null
          tempo_sessao_seg: number | null
          usou_chat: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_sessoes_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_metricas_turma_geral_classe: {
        Row: {
          classe_id: number | null
          eficiencia_media_aprendizagem: number | null
          frequencia_chat_media_sessao: number | null
          media_nota_turma: number | null
          media_tentativas_por_questao: number | null
          sessoes_medias_por_aluno: number | null
          taxa_interrupcoes_pct: number | null
          taxa_media_abandono_pct: number | null
          taxa_media_acertos_pct: number | null
          taxa_media_acertos_sem_erro_pct: number | null
          taxa_media_conclusao_pct: number | null
          taxa_media_retorno_pct: number | null
          taxa_media_uso_chat_pct: number | null
          taxa_revisitas_pct: number | null
          tempo_medio_chat_seg: number | null
          tempo_medio_uso_seg: number | null
          total_alunos: number | null
          uso_chat_apos_erro_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "classe_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_metricas_turma_perfil_classe: {
        Row: {
          classe_id: number | null
          eficiencia_aprendizagem: number | null
          media_nota: number | null
          media_tentativas_por_questao: number | null
          perfil_nome: string | null
          segmento: string | null
          taxa_abandono_pct: number | null
          taxa_acertos_pct: number | null
          taxa_acertos_sem_erro_pct: number | null
          taxa_conclusao_topicos_pct: number | null
          taxa_retorno_pct: number | null
          taxa_uso_chat_pct: number | null
          tempo_chat_seg: number | null
          tempo_medio_uso_seg: number | null
          total_alunos_segmento: number | null
          uso_chat_apos_erro_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "classe_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classe_aluno_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_rank_posicoes_por_classe: {
        Row: {
          classe_id: number | null
          id_aluno: string | null
          medalha: string | null
          nome_aluno: string | null
          percentual_do_lider: number | null
          pontuacao: number | null
          posicao: number | null
          rank_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ranks_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranks_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_rank_posicoes_por_classe_todas: {
        Row: {
          classe_id: number | null
          id_aluno: string | null
          medalha: string | null
          nome_aluno: string | null
          percentual_do_lider: number | null
          pontuacao: number | null
          posicao: number | null
          rank_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ranks_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranks_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_ranks_info_por_classe: {
        Row: {
          classe_id: number | null
          criterio: string | null
          descricao: string | null
          icone: number | null
          nome_rank: string | null
          rank_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ranks_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranks_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_sequencia_navegacao_aluno: {
        Row: {
          aluno_id: string | null
          atividade_id: number | null
          classe_id: number | null
          conteudo_id: number | null
          event_name: string | null
          item_key: string | null
          occurred_at: string | null
          ordem_navegacao: number | null
          route_name: string | null
          screen_name: string | null
          sessao_id: string | null
          topico_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_atividade"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_atividade"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["atividade_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "conteudos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_conteudo"
            columns: ["conteudo_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["conteudo_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_sessao"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "telemetria_sessoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_sessao"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "vw_metricas_sessoes_aluno_dia"
            referencedColumns: ["sessao_id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "topicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_eventos_app_topico"
            columns: ["topico_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_detalhado"
            referencedColumns: ["topico_id"]
          },
        ]
      }
      vw_telemetria_tempo_atividade_aluno: {
        Row: {
          aluno_id: string | null
          atividade_id: number | null
          classe_id: number | null
          scroll_px: number | null
          tempo_ativo_seg: number | null
          tempo_ocioso_seg: number | null
          tempo_total_seg: number | null
          topico_id: number | null
          total_toques: number | null
          ultima_captura_em: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_telemetria_tempo_conteudo_aluno: {
        Row: {
          aluno_id: string | null
          classe_id: number | null
          conteudo_id: number | null
          scroll_px: number | null
          tempo_ativo_seg: number | null
          tempo_ocioso_seg: number | null
          tempo_total_seg: number | null
          topico_id: number | null
          total_toques: number | null
          ultima_captura_em: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
      vw_telemetria_tempo_topico_aluno: {
        Row: {
          aluno_id: string | null
          classe_id: number | null
          scroll_px: number | null
          tempo_ativo_seg: number | null
          tempo_ocioso_seg: number | null
          tempo_total_seg: number | null
          topico_id: number | null
          total_lotes: number | null
          total_toques: number | null
          ultima_captura_em: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["aluno_id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_usuario"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_aluno"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_rank_posicoes_por_classe_todas"
            referencedColumns: ["id_aluno"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "classe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_telemetria_time_metric_entries_classe"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "vw_aluno_classe_resumo"
            referencedColumns: ["classe_id"]
          },
        ]
      }
    }
    Functions: {
      app_alunos_do_professor: { Args: never; Returns: string[] }
      app_classe_da_atividade: {
        Args: { p_atividade: number }
        Returns: number
      }
      app_classe_da_questao: { Args: { p_questao: number }; Returns: number }
      app_classe_do_conteudo: { Args: { p_conteudo: number }; Returns: number }
      app_classe_do_topico: { Args: { p_topico: number }; Returns: number }
      app_classes_do_aluno: { Args: never; Returns: number[] }
      app_classes_do_professor: { Args: never; Returns: number[] }
      app_colegas_de_turma: { Args: never; Returns: string[] }
      app_minhas_classes: { Args: never; Returns: number[] }
      app_pode_ver_aluno: { Args: { p_aluno: string }; Returns: boolean }
      app_prazo_atraso_fator: { Args: never; Returns: number }
      app_rank_limite_visivel: { Args: never; Returns: number }
      arena_convite_responder: {
        Args: { p_aceitar: boolean; p_desafio_id: string }
        Returns: Json
      }
      arena_desafio: { Args: { p_desafio_id: string }; Returns: Json }
      arena_desafio_criar: {
        Args: {
          p_adversarios?: string[]
          p_aliado?: string
          p_classe_id: number
          p_formato?: string
          p_guilda_id?: string
          p_guilda_rival?: string
          p_modo?: string
          p_quantidade?: number
        }
        Returns: Json
      }
      arena_encerrar: { Args: { p_desafio_id: string }; Returns: Json }
      arena_listar: { Args: { p_classe_id: number }; Returns: Json }
      arena_responder: {
        Args: {
          p_desafio_id: string
          p_questao_id: number
          p_resposta: string
          p_tempo_ms?: number
        }
        Returns: Json
      }
      bag_atualizar: {
        Args: {
          p_classe_id?: number
          p_conteudo?: string
          p_conteudo_id?: number
          p_frente?: string
          p_id: number
          p_metadata?: Json
          p_tipo: string
          p_titulo: string
          p_topico_id?: number
          p_verso?: string
        }
        Returns: Json
      }
      bag_criar: {
        Args: {
          p_classe_id?: number
          p_conteudo?: string
          p_conteudo_id?: number
          p_frente?: string
          p_metadata?: Json
          p_tipo: string
          p_titulo: string
          p_topico_id?: number
          p_verso?: string
        }
        Returns: Json
      }
      bag_excluir: { Args: { p_id: number }; Returns: Json }
      bag_listar: {
        Args: {
          p_busca?: string
          p_classe_id?: number
          p_origem?: string
          p_tipo?: string
          p_topico_id?: number
        }
        Returns: Json
      }
      bag_validar_vinculo: {
        Args: {
          p_aluno: string
          p_classe: number
          p_conteudo: number
          p_topico: number
        }
        Returns: undefined
      }
      excluir_classe: { Args: { p_classe_id: number }; Returns: boolean }
      fn_arena_equipes: {
        Args: { p_desafio_id: string }
        Returns: {
          equipe: number
          integrantes: number
          pontos: number
          tempo_ms: number
        }[]
      }
      fn_arena_placar: {
        Args: { p_desafio_id: string }
        Returns: {
          acertos: number
          aluno_id: string
          equipe: number
          estado: string
          respondidas: number
          tempo_total_ms: number
        }[]
      }
      fn_atualizar_aluno_perfil: {
        Args: {
          p_apelido?: string
          p_banner_url?: string
          p_descricao?: string
          p_foto_url?: string
          p_modo_resposta?: Database["public"]["Enums"]["modo_resposta_type"]
          p_modooperacao_nome?: string
          p_nome_completo?: string
        }
        Returns: {
          apelido: string | null
          banner_url: string | null
          descricao: string | null
          email: string
          foto_url: string | null
          id: string
          modo_resposta:
            | Database["public"]["Enums"]["modo_resposta_type"]
            | null
          modooperacao_id: number | null
          nome: string
          perfil_ativo: string | null
        }
        SetofOptions: {
          from: "*"
          to: "alunos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_auth_email_exists: { Args: { p_email: string }; Returns: boolean }
      fn_cadastrar_aluno_com_perfis: {
        Args: {
          p_apelido: string
          p_auth_user_id: string
          p_email: string
          p_modooperacao_nome: string
          p_nome_completo: string
          p_perfis: Json
        }
        Returns: {
          apelido: string | null
          banner_url: string | null
          descricao: string | null
          email: string
          foto_url: string | null
          id: string
          modo_resposta:
            | Database["public"]["Enums"]["modo_resposta_type"]
            | null
          modooperacao_id: number | null
          nome: string
          perfil_ativo: string | null
        }
        SetofOptions: {
          from: "*"
          to: "alunos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_conquista_metrica_suportada: {
        Args: { p_metrica: string }
        Returns: boolean
      }
      fn_enviar_contato_sendgrid: {
        Args: {
          p_assunto: string
          p_email: string
          p_mensagem: string
          p_nome: string
        }
        Returns: undefined
      }
      fn_evento_creditado: { Args: { p_tipo: string }; Returns: boolean }
      fn_evento_de_conclusao: { Args: { p_tipo: string }; Returns: boolean }
      fn_eventos_aluno_referencia_id: {
        Args: { p_referencia: string }
        Returns: number
      }
      fn_eventos_aluno_resolve_classe_id: {
        Args: { p_referencia: string; p_tipo: string }
        Returns: number
      }
      fn_fator_de_atraso: {
        Args: { p_aluno: string; p_quando: string; p_referencia: string }
        Returns: number
      }
      fn_moedas_do_evento: {
        Args: { p_classe_id: number; p_tipo: string }
        Returns: number
      }
      fn_nota_90_10: {
        Args: { p_aluno: string; p_atividade_id: number }
        Returns: number
      }
      fn_pontos_do_evento: { Args: { p_tipo: string }; Returns: number }
      fn_prazo_efetivo: {
        Args: { p_aluno: string; p_atividade: number }
        Returns: string
      }
      fn_questao_alternativas_em_ordem: {
        Args: { p_alts: Json; p_questao_id: number }
        Returns: Json
      }
      fn_questao_alternativas_normalizadas: {
        Args: { p_alts: Json }
        Returns: Json
      }
      fn_questao_associacao_em_ordem: {
        Args: { p_alts: Json; p_gabarito?: string; p_questao_id: number }
        Returns: Json
      }
      fn_questao_confere: {
        Args: { p_questao_id: number; p_resposta: string }
        Returns: boolean
      }
      fn_questao_confere_lista: {
        Args: { p_gabarito: string; p_resposta: string; p_tipo: string }
        Returns: boolean
      }
      fn_questao_elegivel_retry: {
        Args: { p_questao_id: number }
        Returns: boolean
      }
      fn_questao_gabarito_em_texto: {
        Args: { p_alts: Json; p_resposta: string }
        Returns: string
      }
      fn_questao_liberada: { Args: { p_questao_id: number }; Returns: boolean }
      fn_questao_liberada_para: {
        Args: { p_aluno: string; p_questao_id: number }
        Returns: boolean
      }
      fn_questao_resposta_em_lista: {
        Args: { p_valor: string }
        Returns: string[]
      }
      fn_rank_rebuild_for_classe: {
        Args: { p_classe_id: number }
        Returns: undefined
      }
      fn_revisou_topico: {
        Args: { p_desde: string; p_topico_id: number }
        Returns: boolean
      }
      fn_texto_comparavel: { Args: { p_texto: string }; Returns: string }
      fn_trilha_by_classe: {
        Args: { p_aluno_id: string; p_classe_id: number }
        Returns: {
          from_id: number
          node_id: number
          status: string
          title: string
          to_id: number
        }[]
      }
      guilda_aceitar_convite: { Args: { p_convite_id: string }; Returns: Json }
      guilda_atualizar: {
        Args: {
          p_descricao?: string
          p_emblema?: string
          p_guilda_id: string
          p_nome: string
        }
        Returns: Json
      }
      guilda_atualizar_config: {
        Args: {
          p_descricao?: string
          p_emblema?: string
          p_guilda_id: string
          p_logo_url?: string
          p_modo_perfil?: string
          p_nome: string
          p_perfil_alvo?: string
        }
        Returns: Json
      }
      guilda_bloqueio_ativo: {
        Args: { p_one: string; p_two: string }
        Returns: boolean
      }
      guilda_cancelar_convite: { Args: { p_convite_id: string }; Returns: Json }
      guilda_chat_enviar: {
        Args: {
          p_conteudo?: Json
          p_guilda_id: string
          p_texto?: string
          p_tipo?: string
        }
        Returns: Json
      }
      guilda_chat_listar: {
        Args: { p_guilda_id: string; p_limite?: number }
        Returns: Json
      }
      guilda_chat_questao_responder: {
        Args: { p_mensagem_id: string; p_resposta: string }
        Returns: Json
      }
      guilda_classe_atual: { Args: { p_classe_id: number }; Returns: number }
      guilda_configurar_turma: {
        Args: {
          p_classe_id: number
          p_fim?: string
          p_inicio?: string
          p_tamanho_maximo: number
        }
        Returns: Json
      }
      guilda_congelar_composicao: {
        Args: { p_classe_id: number; p_evento_id: string }
        Returns: number
      }
      guilda_convidar: {
        Args: { p_convidado_id: string; p_guilda_id: string }
        Returns: Json
      }
      guilda_criar: {
        Args: {
          p_classe_id: number
          p_descricao?: string
          p_emblema?: string
          p_logo_url?: string
          p_modo_perfil?: string
          p_nome: string
          p_perfil_alvo?: string
        }
        Returns: Json
      }
      guilda_desafio_criar: {
        Args: { p_guilda_id: string; p_modo?: string; p_quantidade?: number }
        Returns: Json
      }
      guilda_desafio_responder: {
        Args: { p_desafio_id: string; p_questao_id: number; p_resposta: string }
        Returns: Json
      }
      guilda_dissolver: { Args: { p_guilda_id: string }; Returns: Json }
      guilda_e_colega: {
        Args: { p_aluno: string; p_classe: number }
        Returns: boolean
      }
      guilda_entrar: { Args: { p_guilda_id: string }; Returns: Json }
      guilda_janela_aberta: { Args: { p_classe: number }; Returns: boolean }
      guilda_listar: {
        Args: { p_classe_id: number }
        Returns: {
          classe_id: number
          convites_enviados: Json
          convites_recebidos: Json
          descricao: string
          emblema: string
          guilda_id: string
          limite_membros: number
          logo_url: string
          membros: Json
          membros_ativos: number
          modo_perfil: string
          nome: string
          perfil_alvo: string
          sou_criador: boolean
          sou_membro: boolean
        }[]
      }
      guilda_recusar_convite: { Args: { p_convite_id: string }; Returns: Json }
      guilda_sair: { Args: { p_guilda_id: string }; Returns: Json }
      inscrever_aluno_em_classe: {
        Args: { p_aluno_id: string; p_classe_id: number }
        Returns: undefined
      }
      loja_catalogo: {
        Args: { p_classe_id: number }
        Returns: {
          codigo: string
          descricao: string
          disponivel: boolean
          efeito: string
          gratis_restantes: number
          nome: string
          ordem: number
          preco: number
        }[]
      }
      loja_compradas_do_item: {
        Args: { p_classe_id: number; p_item: string }
        Returns: number
      }
      loja_comprar: {
        Args: {
          p_alvo_id?: number
          p_alvo_tipo?: string
          p_classe_id: number
          p_idempotency_key: string
          p_item: string
          p_parametro?: string
        }
        Returns: Json
      }
      loja_extrato: {
        Args: { p_limite?: number }
        Returns: {
          classe_id: number
          criado_em: string
          delta: number
          evento_tipo: string
          motivo: string
        }[]
      }
      loja_saldo: { Args: never; Returns: number }
      loja_saldo_item: {
        Args: { p_classe_id: number; p_item: string }
        Returns: number
      }
      mark_personalizacao_failed_v2: {
        Args: {
          p_ciclo_id: string
          p_error_message: string
          p_id: number
          p_source_hash: string
        }
        Returns: boolean
      }
      merge_personalizacao_materiais_v2: {
        Args: {
          p_ciclo_id: string
          p_id: number
          p_source_hash: string
          p_updates: Json
        }
        Returns: Json
      }
      notificacoes_cfg_int: {
        Args: { p_chave: string; p_default: number }
        Returns: number
      }
      notificacoes_cfg_txt: {
        Args: { p_chave: string; p_default: string }
        Returns: string
      }
      notificacoes_conciliar_push: {
        Args: { p_limite?: number }
        Returns: Json
      }
      notificacoes_dedupe_key: {
        Args: { p_dia: string; p_motivo: string; p_tipo: string }
        Returns: string
      }
      notificacoes_desativar_dispositivo: {
        Args: { p_push_token: string }
        Returns: undefined
      }
      notificacoes_dia_local: {
        Args: { p_momento?: string; p_timezone: string }
        Returns: string
      }
      notificacoes_em_silencio: {
        Args: { p_momento?: string; p_timezone: string }
        Returns: boolean
      }
      notificacoes_encerrar_sessao: { Args: never; Returns: undefined }
      notificacoes_entregar: {
        Args: { p_aluno: string; p_gatilhos?: string[] }
        Returns: number
      }
      notificacoes_enviar_push: {
        Args: {
          p_aluno: string
          p_corpo: string
          p_dados: Json
          p_notificacao_id: number
          p_prioridade?: number
          p_titulo: string
        }
        Returns: number
      }
      notificacoes_garantir_rotinas: {
        Args: { p_aluno: string; p_timezone?: string }
        Returns: undefined
      }
      notificacoes_heartbeat: {
        Args: { p_segundos?: number; p_sessao_id?: number; p_timezone?: string }
        Returns: Json
      }
      notificacoes_minhas_rotinas: {
        Args: never
        Returns: {
          ativo: boolean
          contexto: Json
          corpo: string
          gatilho: string
          hora_local: number
          id: number
          minuto_local: number
          prioridade: number
          proxima_execucao: string
          recorrencia: string
          timezone: string
          tipo: string
          titulo: string
        }[]
      }
      notificacoes_processar_rotinas: {
        Args: { p_aluno: string; p_gatilho: string; p_uso_seg?: number }
        Returns: number
      }
      notificacoes_proxima_ocorrencia: {
        Args: {
          p_agora: string
          p_hora: number
          p_minuto: number
          p_recorrencia: string
          p_timezone: string
        }
        Returns: string
      }
      notificacoes_registrar_login: {
        Args: {
          p_app_version?: string
          p_device_id?: string
          p_plataforma?: string
          p_push_token?: string
          p_timezone?: string
        }
        Returns: Json
      }
      notificacoes_salvar_rotina: {
        Args: {
          p_ativo?: boolean
          p_contexto?: Json
          p_corpo?: string
          p_gatilho?: string
          p_hora_local?: number
          p_minuto_local?: number
          p_prioridade?: number
          p_recorrencia?: string
          p_timezone?: string
          p_tipo: string
          p_titulo?: string
        }
        Returns: Json
      }
      notificacoes_tz: { Args: { p_timezone: string }; Returns: string }
      notificacoes_varrer: { Args: { p_limite?: number }; Returns: Json }
      provisionar_estrutura_aluno_classe: {
        Args: { p_aluno_id: string; p_classe_id: number }
        Returns: undefined
      }
      questao_gabarito_do_aluno: {
        Args: { p_questao_id: number }
        Returns: Json
      }
      questao_responder: {
        Args: {
          p_questao_id: number
          p_resposta: string
          p_tempo_gasto_seg?: number
        }
        Returns: Json
      }
      registrar_credito_da_turma: {
        Args: {
          p_alunos?: string[]
          p_classe_id: number
          p_data?: string
          p_motivo?: string
          p_tipo?: string
          p_valor?: number
        }
        Returns: number
      }
      registrar_presenca_da_turma: {
        Args: {
          p_alunos?: string[]
          p_classe_id: number
          p_data?: string
          p_tipo?: string
          p_valor?: number
        }
        Returns: number
      }
      social_aceitar_convite: {
        Args: { p_relationship_id: string }
        Returns: Json
      }
      social_bloquear: { Args: { p_alvo: string }; Returns: Json }
      social_chat_enviar: {
        Args: { p_destinatario_id: string; p_texto: string }
        Returns: Json
      }
      social_chat_listar: { Args: { p_destinatario_id: string }; Returns: Json }
      social_desbloquear: { Args: { p_relationship_id: string }; Returns: Json }
      social_desfazer_amizade: {
        Args: { p_relationship_id: string }
        Returns: Json
      }
      social_enviar_convite: { Args: { p_destinatario: string }; Returns: Json }
      social_listar_pessoas:
        | {
            Args: never
            Returns: {
              aluno_id: string
              apelido: string
              foto_url: string
              nome: string
              perfil_ativo: string
              relationship_id: string
              status: string
            }[]
          }
        | {
            Args: { p_classe_id: number }
            Returns: {
              aluno_id: string
              apelido: string
              foto_url: string
              guilda_id: string
              guilda_nome: string
              nome: string
              perfil_ativo: string
              relationship_id: string
              status: string
            }[]
          }
      social_notificar_evento: {
        Args: {
          p_aluno_id: string
          p_corpo: string
          p_dados?: Json
          p_dedupe_key: string
          p_tipo: string
          p_titulo: string
        }
        Returns: number
      }
      social_par: {
        Args: { p_one: string; p_two: string }
        Returns: {
          aluno_a_id: string
          aluno_b_id: string
        }[]
      }
      social_perfil_publico: {
        Args: { p_aluno_id: string; p_classe_id: number }
        Returns: Json
      }
      social_presenca_aluno: { Args: { p_aluno_id: string }; Returns: Json }
      social_presenca_turma: { Args: { p_classe_id: number }; Returns: Json }
      social_recusar_convite: {
        Args: { p_relationship_id: string }
        Returns: Json
      }
      social_sao_colegas: {
        Args: { p_one: string; p_two: string }
        Returns: boolean
      }
      telemetria_id_do_item_key: {
        Args: { p_item_key: string; p_prefixo: string }
        Returns: number
      }
      trailup_progresso_percurso: {
        Args: { p_aluno: string; p_classe: number }
        Returns: {
          feitos: number
          topico_id: number
          total: number
        }[]
      }
      trailup_recalcular_atividade_respostas: {
        Args: { p_aluno: string; p_atividade: number }
        Returns: undefined
      }
      trailup_recalcular_classe_aluno: {
        Args: { p_aluno: string; p_classe: number }
        Returns: undefined
      }
      trailup_recalcular_topico_aluno: {
        Args: { p_aluno: string; p_topico: number }
        Returns: undefined
      }
      trailup_registrar_intervalo_estudo: {
        Args: {
          p_aluno: string
          p_atividade: number
          p_conteudo: number
          p_intervalo: string
          p_tempo_min: number
          p_topico: number
        }
        Returns: undefined
      }
      trailup_registrar_sessao_estudo: {
        Args: {
          p_aberto_em: string
          p_aluno: string
          p_atividade: number
          p_conteudo: number
          p_fechado_em: string
          p_scope: string
          p_sessao: string
          p_topico: number
        }
        Returns: undefined
      }
      trailup_registrar_tempo_estudo: {
        Args: {
          p_aluno: string
          p_atividade: number
          p_conteudo: number
          p_tempo_min: number
          p_topico: number
        }
        Returns: undefined
      }
      trailup_resumo_presenca: { Args: { p_timezone?: string }; Returns: Json }
      trailup_tempo_sessao_min: {
        Args: {
          p_aluno: string
          p_atividade: number
          p_conteudo: number
          p_scope: string
          p_topico: number
        }
        Returns: number
      }
      trailup_tempo_telemetria_min: {
        Args: {
          p_aluno: string
          p_atividade: number
          p_conteudo: number
          p_scope: string
          p_topico: number
        }
        Returns: number
      }
      trailup_tempo_telemetria_min_v2: {
        Args: {
          p_aluno: string
          p_atividade: number
          p_conteudo: number
          p_questao: number
          p_scope: string
          p_topico: number
        }
        Returns: number
      }
    }
    Enums: {
      modo_resposta_type: "imediato" | "pensante"
      status_atividade: "não iniciado" | "em andamento" | "concluido"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      modo_resposta_type: ["imediato", "pensante"],
      status_atividade: ["não iniciado", "em andamento", "concluido"],
    },
  },
} as const
