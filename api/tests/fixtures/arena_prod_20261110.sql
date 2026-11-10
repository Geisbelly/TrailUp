-- Arena de produção, lida do catálogo em 2026-11-10 por
-- scripts/gerar_fixture_arena_de_producao.py. Só estrutura e configuração de pontos; nenhum dado de aluno.
-- Vai por cima de schema_prod_esqueleto_20261024.sql.
SET check_function_bodies = off;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public."alunos" ADD COLUMN IF NOT EXISTS "id" uuid;
ALTER TABLE public."alunos" ADD COLUMN IF NOT EXISTS "nome" text;
ALTER TABLE public."alunos" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE public."alunos" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."alunos" ADD COLUMN IF NOT EXISTS "modooperacao_id" bigint;
ALTER TABLE public."alunos" ADD COLUMN IF NOT EXISTS "apelido" text;
ALTER TABLE public."alunos" ADD COLUMN IF NOT EXISTS "foto_url" text;
ALTER TABLE public."alunos" ADD COLUMN IF NOT EXISTS "banner_url" text;
ALTER TABLE public."alunos" ADD COLUMN IF NOT EXISTS "modo_resposta" text DEFAULT 'imediato'::modo_resposta_type;
ALTER TABLE public."alunos" ADD COLUMN IF NOT EXISTS "perfil_ativo" character varying(32);
ALTER TABLE public."alunos" ADD COLUMN IF NOT EXISTS "moldura_equipada" text;
ALTER TABLE public."app_config" ADD COLUMN IF NOT EXISTS "chave" text;
ALTER TABLE public."app_config" ADD COLUMN IF NOT EXISTS "valor" text;
ALTER TABLE public."app_config" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."app_config" ADD COLUMN IF NOT EXISTS "publico" boolean DEFAULT false;
ALTER TABLE public."app_config" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."atividade_aluno" ADD COLUMN IF NOT EXISTS "id" bigint DEFAULT nextval('atividade_aluno_id_seq'::regclass);
ALTER TABLE public."atividade_aluno" ADD COLUMN IF NOT EXISTS "aluno_id" uuid;
ALTER TABLE public."atividade_aluno" ADD COLUMN IF NOT EXISTS "atividade_id" bigint;
ALTER TABLE public."atividade_aluno" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'não iniciado'::status_atividade;
ALTER TABLE public."atividade_aluno" ADD COLUMN IF NOT EXISTS "percentual_concluido" numeric DEFAULT 0;
ALTER TABLE public."atividade_aluno" ADD COLUMN IF NOT EXISTS "acertos_percentual" numeric DEFAULT 0;
ALTER TABLE public."atividade_aluno" ADD COLUMN IF NOT EXISTS "tempo_gasto_min" numeric DEFAULT 0;
ALTER TABLE public."atividade_aluno" ADD COLUMN IF NOT EXISTS "ultima_visualizacao" timestamp without time zone DEFAULT now();
ALTER TABLE public."atividade_aluno" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."atividade_aluno" ADD COLUMN IF NOT EXISTS "pontuacao_obtida" numeric;
ALTER TABLE public."atividade_aluno" ADD COLUMN IF NOT EXISTS "pontuacao_maxima" numeric;
ALTER TABLE public."atividade_aluno" ADD COLUMN IF NOT EXISTS "avaliacao_metadata" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public."atividade_aluno" ADD COLUMN IF NOT EXISTS "tempo_direto_min" numeric DEFAULT 0;
ALTER TABLE public."atividade_prazo_aluno" ADD COLUMN IF NOT EXISTS "aluno_id" uuid;
ALTER TABLE public."atividade_prazo_aluno" ADD COLUMN IF NOT EXISTS "atividade_id" bigint;
ALTER TABLE public."atividade_prazo_aluno" ADD COLUMN IF NOT EXISTS "dias_extras" integer DEFAULT 0;
ALTER TABLE public."atividade_prazo_aluno" ADD COLUMN IF NOT EXISTS "prazo_efetivo" timestamp with time zone;
ALTER TABLE public."atividade_prazo_aluno" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."atividades" ADD COLUMN IF NOT EXISTS "id" bigint DEFAULT nextval('atividades_id_seq'::regclass);
ALTER TABLE public."atividades" ADD COLUMN IF NOT EXISTS "topico_id" bigint;
ALTER TABLE public."atividades" ADD COLUMN IF NOT EXISTS "titulo" text;
ALTER TABLE public."atividades" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."atividades" ADD COLUMN IF NOT EXISTS "tipo" text;
ALTER TABLE public."atividades" ADD COLUMN IF NOT EXISTS "pontuacao_maxima" integer DEFAULT 10;
ALTER TABLE public."atividades" ADD COLUMN IF NOT EXISTS "data_entrega" timestamp with time zone;
ALTER TABLE public."atividades" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."atividades" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public."atividades" ADD COLUMN IF NOT EXISTS "tentativas_max" integer DEFAULT 3;
ALTER TABLE public."atividades" ADD COLUMN IF NOT EXISTS "formato_texto" text DEFAULT 'texto'::text;
ALTER TABLE public."classe" ADD COLUMN IF NOT EXISTS "id" bigint;
ALTER TABLE public."classe" ADD COLUMN IF NOT EXISTS "materia_id" bigint;
ALTER TABLE public."classe" ADD COLUMN IF NOT EXISTS "professor_id" uuid;
ALTER TABLE public."classe" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."classe" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."classe" ADD COLUMN IF NOT EXISTS "xp_peso_nota_pct" numeric(5,2) DEFAULT 0;
ALTER TABLE public."classe" ADD COLUMN IF NOT EXISTS "xp_meta_nota" integer DEFAULT 1000;
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "id" bigint;
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "classe_id" bigint;
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "aluno_id" uuid;
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "iadescricao_id" bigint;
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "notaMedia" numeric;
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "tempoMedioPorAtividade" numeric;
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "acertosPercentual" numeric;
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "porcentagemConcluida" numeric;
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "ultimaAtividade" bigint;
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "tempoGastoMin" numeric;
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "isComplete" boolean;
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "atividadesConcluidas" json;
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."classe_aluno" ADD COLUMN IF NOT EXISTS "nota_final" numeric;
ALTER TABLE public."conteudos" ADD COLUMN IF NOT EXISTS "id" bigint DEFAULT nextval('conteudos_id_seq'::regclass);
ALTER TABLE public."conteudos" ADD COLUMN IF NOT EXISTS "topico_id" bigint;
ALTER TABLE public."conteudos" ADD COLUMN IF NOT EXISTS "titulo" text;
ALTER TABLE public."conteudos" ADD COLUMN IF NOT EXISTS "tipo" text;
ALTER TABLE public."conteudos" ADD COLUMN IF NOT EXISTS "conteudo" text;
ALTER TABLE public."conteudos" ADD COLUMN IF NOT EXISTS "ordem" integer;
ALTER TABLE public."conteudos" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE public."conteudos" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."desafio_participantes" ADD COLUMN IF NOT EXISTS "desafio_id" uuid;
ALTER TABLE public."desafio_participantes" ADD COLUMN IF NOT EXISTS "aluno_id" uuid;
ALTER TABLE public."desafio_participantes" ADD COLUMN IF NOT EXISTS "equipe" smallint;
ALTER TABLE public."desafio_participantes" ADD COLUMN IF NOT EXISTS "estado" text DEFAULT 'convidado'::text;
ALTER TABLE public."desafio_participantes" ADD COLUMN IF NOT EXISTS "convidado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."desafio_participantes" ADD COLUMN IF NOT EXISTS "respondido_em" timestamp with time zone;
CREATE TABLE IF NOT EXISTS public."evento_inscricoes" (
  "evento_id" uuid NOT NULL,
  "aluno_id" uuid NOT NULL,
  "inscrito_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.evento_inscricoes ADD PRIMARY KEY (evento_id, aluno_id);
ALTER TABLE public."eventos_aluno" ADD COLUMN IF NOT EXISTS "id" bigint DEFAULT nextval('eventos_aluno_id_seq'::regclass);
ALTER TABLE public."eventos_aluno" ADD COLUMN IF NOT EXISTS "tipo" text;
ALTER TABLE public."eventos_aluno" ADD COLUMN IF NOT EXISTS "referencia" text;
ALTER TABLE public."eventos_aluno" ADD COLUMN IF NOT EXISTS "valor" numeric;
ALTER TABLE public."eventos_aluno" ADD COLUMN IF NOT EXISTS "criado_em" timestamp without time zone DEFAULT now();
ALTER TABLE public."eventos_aluno" ADD COLUMN IF NOT EXISTS "aluno_id" uuid;
ALTER TABLE public."eventos_aluno" ADD COLUMN IF NOT EXISTS "concedido_por" uuid;
ALTER TABLE public."eventos_aluno" ADD COLUMN IF NOT EXISTS "classe_id" bigint;
ALTER TABLE public."eventos_aluno" ADD COLUMN IF NOT EXISTS "idempotencia_key" uuid;
ALTER TABLE public."eventos_aluno" ADD COLUMN IF NOT EXISTS "motivo" text;
ALTER TABLE public."eventos_aluno" ADD COLUMN IF NOT EXISTS "fora_do_xp" boolean DEFAULT false;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "classe_id" bigint;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "topico_id" bigint;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "titulo" text;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "descricao" text DEFAULT ''::text;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'rascunho'::text;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "inicio" timestamp with time zone;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "fim" timestamp with time zone;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "modalidade_guilda" boolean DEFAULT false;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "guilda_tamanho_max" integer;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "pecas" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "pontos" integer DEFAULT 0;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "moedas" integer DEFAULT 0;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "medalha_participacao" boolean DEFAULT true;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "medalha_destaque" boolean DEFAULT false;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "recompensa" text;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "criado_por" uuid DEFAULT auth.uid();
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "aberto_em" timestamp with time zone;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "encerrado_em" timestamp with time zone;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "conquista_participacao_id" bigint;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "conquista_destaque_id" bigint;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "abrir_no_inicio" boolean DEFAULT false;
ALTER TABLE public."eventos_classe" ADD COLUMN IF NOT EXISTS "arena_criterios" text[] DEFAULT '{}'::text[];
ALTER TABLE public."eventos_pontuacao" ADD COLUMN IF NOT EXISTS "tipo" text;
ALTER TABLE public."eventos_pontuacao" ADD COLUMN IF NOT EXISTS "pontos" numeric DEFAULT 0;
ALTER TABLE public."eventos_pontuacao" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."eventos_pontuacao" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."eventos_pontuacao" ADD COLUMN IF NOT EXISTS "moedas" numeric DEFAULT 0;
ALTER TABLE public."eventos_pontuacao" ADD COLUMN IF NOT EXISTS "penalidade" boolean DEFAULT false;
ALTER TABLE public."guilda_desafio_questoes" ADD COLUMN IF NOT EXISTS "desafio_id" uuid;
ALTER TABLE public."guilda_desafio_questoes" ADD COLUMN IF NOT EXISTS "questao_id" bigint;
ALTER TABLE public."guilda_desafio_questoes" ADD COLUMN IF NOT EXISTS "ordem" integer;
ALTER TABLE public."guilda_desafio_respostas" ADD COLUMN IF NOT EXISTS "desafio_id" uuid;
ALTER TABLE public."guilda_desafio_respostas" ADD COLUMN IF NOT EXISTS "questao_id" bigint;
ALTER TABLE public."guilda_desafio_respostas" ADD COLUMN IF NOT EXISTS "aluno_id" uuid;
ALTER TABLE public."guilda_desafio_respostas" ADD COLUMN IF NOT EXISTS "resposta" text;
ALTER TABLE public."guilda_desafio_respostas" ADD COLUMN IF NOT EXISTS "correta" boolean;
ALTER TABLE public."guilda_desafio_respostas" ADD COLUMN IF NOT EXISTS "respondida_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."guilda_desafio_respostas" ADD COLUMN IF NOT EXISTS "tempo_ms" integer;
ALTER TABLE public."guilda_desafio_respostas" ADD COLUMN IF NOT EXISTS "tentativas" integer DEFAULT 1;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "guilda_id" uuid;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "classe_id" bigint;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "criado_por" uuid;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "modo" text;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'aberto'::text;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "titulo" text DEFAULT 'Desafio da guilda'::text;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "configuracao" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "formato" text DEFAULT 'guilda'::text;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "encerrado_em" timestamp with time zone;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "vencedor_equipe" smallint;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "guilda_rival_id" uuid;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "resultado" text;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "consequencia" text DEFAULT 'ranqueada'::text;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "dificuldade" text DEFAULT 'normal'::text;
ALTER TABLE public."guilda_desafios" ADD COLUMN IF NOT EXISTS "evento_id" uuid;
ALTER TABLE public."guilda_membros" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."guilda_membros" ADD COLUMN IF NOT EXISTS "guilda_id" uuid;
ALTER TABLE public."guilda_membros" ADD COLUMN IF NOT EXISTS "classe_id" bigint;
ALTER TABLE public."guilda_membros" ADD COLUMN IF NOT EXISTS "aluno_id" uuid;
ALTER TABLE public."guilda_membros" ADD COLUMN IF NOT EXISTS "joined_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."guilda_membros" ADD COLUMN IF NOT EXISTS "left_at" timestamp with time zone;
ALTER TABLE public."guilda_mensagens" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."guilda_mensagens" ADD COLUMN IF NOT EXISTS "guilda_id" uuid;
ALTER TABLE public."guilda_mensagens" ADD COLUMN IF NOT EXISTS "classe_id" bigint;
ALTER TABLE public."guilda_mensagens" ADD COLUMN IF NOT EXISTS "autor_id" uuid;
ALTER TABLE public."guilda_mensagens" ADD COLUMN IF NOT EXISTS "tipo" text DEFAULT 'text'::text;
ALTER TABLE public."guilda_mensagens" ADD COLUMN IF NOT EXISTS "texto" text DEFAULT ''::text;
ALTER TABLE public."guilda_mensagens" ADD COLUMN IF NOT EXISTS "conteudo" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public."guilda_mensagens" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."guilda_mensagens" ADD COLUMN IF NOT EXISTS "texto_cifrado" bytea;
ALTER TABLE public."guilda_mensagens" ADD COLUMN IF NOT EXISTS "conteudo_cifrado" bytea;
ALTER TABLE public."guildas" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."guildas" ADD COLUMN IF NOT EXISTS "classe_id" bigint;
ALTER TABLE public."guildas" ADD COLUMN IF NOT EXISTS "nome" text;
ALTER TABLE public."guildas" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."guildas" ADD COLUMN IF NOT EXISTS "emblema" text DEFAULT 'constellation'::text;
ALTER TABLE public."guildas" ADD COLUMN IF NOT EXISTS "limite_membros" integer DEFAULT 10;
ALTER TABLE public."guildas" ADD COLUMN IF NOT EXISTS "criado_por" uuid;
ALTER TABLE public."guildas" ADD COLUMN IF NOT EXISTS "ativa" boolean DEFAULT true;
ALTER TABLE public."guildas" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."guildas" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."guildas" ADD COLUMN IF NOT EXISTS "logo_url" text;
ALTER TABLE public."guildas" ADD COLUMN IF NOT EXISTS "modo_perfil" text DEFAULT 'misto'::text;
ALTER TABLE public."guildas" ADD COLUMN IF NOT EXISTS "perfil_alvo" text;
ALTER TABLE public."questao_aluno" ADD COLUMN IF NOT EXISTS "id" bigint;
ALTER TABLE public."questao_aluno" ADD COLUMN IF NOT EXISTS "aluno_id" uuid;
ALTER TABLE public."questao_aluno" ADD COLUMN IF NOT EXISTS "questao_id" bigint;
ALTER TABLE public."questao_aluno" ADD COLUMN IF NOT EXISTS "atividade_id" bigint;
ALTER TABLE public."questao_aluno" ADD COLUMN IF NOT EXISTS "tentativa" integer DEFAULT 1;
ALTER TABLE public."questao_aluno" ADD COLUMN IF NOT EXISTS "resposta" text;
ALTER TABLE public."questao_aluno" ADD COLUMN IF NOT EXISTS "correta" boolean;
ALTER TABLE public."questao_aluno" ADD COLUMN IF NOT EXISTS "acertos_percentual" numeric DEFAULT 0;
ALTER TABLE public."questao_aluno" ADD COLUMN IF NOT EXISTS "tempo_gasto_seg" integer;
ALTER TABLE public."questao_aluno" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."questao_gabarito" ADD COLUMN IF NOT EXISTS "questao_id" bigint;
ALTER TABLE public."questao_gabarito" ADD COLUMN IF NOT EXISTS "resposta_correta" text;
ALTER TABLE public."questao_gabarito" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."questao_gabarito" ADD COLUMN IF NOT EXISTS "criterios" jsonb;
ALTER TABLE public."questoes" ADD COLUMN IF NOT EXISTS "id" bigint DEFAULT nextval('questoes_id_seq'::regclass);
ALTER TABLE public."questoes" ADD COLUMN IF NOT EXISTS "atividade_id" bigint;
ALTER TABLE public."questoes" ADD COLUMN IF NOT EXISTS "enunciado" text;
ALTER TABLE public."questoes" ADD COLUMN IF NOT EXISTS "tipo" text;
ALTER TABLE public."questoes" ADD COLUMN IF NOT EXISTS "alternativas" jsonb;
ALTER TABLE public."questoes" ADD COLUMN IF NOT EXISTS "resposta_correta" text;
ALTER TABLE public."questoes" ADD COLUMN IF NOT EXISTS "midia_url" text;
ALTER TABLE public."questoes" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."questoes" ADD COLUMN IF NOT EXISTS "nota_estabelecida" numeric(10,2);
ALTER TABLE public."questoes" ADD COLUMN IF NOT EXISTS "dificuldade" text;
ALTER TABLE public."questoes" ADD COLUMN IF NOT EXISTS "formato_texto" text DEFAULT 'texto'::text;
ALTER TABLE public."questoes" ADD COLUMN IF NOT EXISTS "config_resposta" jsonb;
ALTER TABLE public."ranqueada_elo" ADD COLUMN IF NOT EXISTS "classe_id" bigint;
ALTER TABLE public."ranqueada_elo" ADD COLUMN IF NOT EXISTS "aluno_id" uuid;
ALTER TABLE public."ranqueada_elo" ADD COLUMN IF NOT EXISTS "rating" integer;
ALTER TABLE public."ranqueada_elo" ADD COLUMN IF NOT EXISTS "partidas" integer DEFAULT 0;
ALTER TABLE public."ranqueada_elo" ADD COLUMN IF NOT EXISTS "vitorias" integer DEFAULT 0;
ALTER TABLE public."ranqueada_elo" ADD COLUMN IF NOT EXISTS "empates" integer DEFAULT 0;
ALTER TABLE public."ranqueada_elo" ADD COLUMN IF NOT EXISTS "derrotas" integer DEFAULT 0;
ALTER TABLE public."ranqueada_elo" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."ranqueada_elo_partida" ADD COLUMN IF NOT EXISTS "desafio_id" uuid;
ALTER TABLE public."ranqueada_elo_partida" ADD COLUMN IF NOT EXISTS "aluno_id" uuid;
ALTER TABLE public."ranqueada_elo_partida" ADD COLUMN IF NOT EXISTS "classe_id" bigint;
ALTER TABLE public."ranqueada_elo_partida" ADD COLUMN IF NOT EXISTS "equipe" smallint;
ALTER TABLE public."ranqueada_elo_partida" ADD COLUMN IF NOT EXISTS "resultado" text;
ALTER TABLE public."ranqueada_elo_partida" ADD COLUMN IF NOT EXISTS "rating_antes" integer;
ALTER TABLE public."ranqueada_elo_partida" ADD COLUMN IF NOT EXISTS "k" smallint;
ALTER TABLE public."ranqueada_elo_partida" ADD COLUMN IF NOT EXISTS "delta" integer;
ALTER TABLE public."ranqueada_elo_partida" ADD COLUMN IF NOT EXISTS "rating_depois" integer;
ALTER TABLE public."ranqueada_elo_partida" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."social_relacionamentos" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."social_relacionamentos" ADD COLUMN IF NOT EXISTS "aluno_a_id" uuid;
ALTER TABLE public."social_relacionamentos" ADD COLUMN IF NOT EXISTS "aluno_b_id" uuid;
ALTER TABLE public."social_relacionamentos" ADD COLUMN IF NOT EXISTS "solicitante_id" uuid;
ALTER TABLE public."social_relacionamentos" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."social_relacionamentos" ADD COLUMN IF NOT EXISTS "blocked_by_id" uuid;
ALTER TABLE public."social_relacionamentos" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."social_relacionamentos" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."social_relacionamentos" ADD COLUMN IF NOT EXISTS "responded_at" timestamp with time zone;
ALTER TABLE public."topico_aluno" ADD COLUMN IF NOT EXISTS "id" bigint DEFAULT nextval('topico_aluno_id_seq'::regclass);
ALTER TABLE public."topico_aluno" ADD COLUMN IF NOT EXISTS "aluno_id" uuid;
ALTER TABLE public."topico_aluno" ADD COLUMN IF NOT EXISTS "topico_id" bigint;
ALTER TABLE public."topico_aluno" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'não iniciado'::status_atividade;
ALTER TABLE public."topico_aluno" ADD COLUMN IF NOT EXISTS "percentual_concluido" numeric DEFAULT 0;
ALTER TABLE public."topico_aluno" ADD COLUMN IF NOT EXISTS "ultima_atividade" bigint;
ALTER TABLE public."topico_aluno" ADD COLUMN IF NOT EXISTS "ultima_visualizacao" timestamp without time zone DEFAULT now();
ALTER TABLE public."topico_aluno" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."topico_aluno" ADD COLUMN IF NOT EXISTS "tempo_gasto_min" real DEFAULT '0'::real;
ALTER TABLE public."topico_aluno" ADD COLUMN IF NOT EXISTS "tempo_direto_min" numeric DEFAULT 0;
ALTER TABLE public."topicos" ADD COLUMN IF NOT EXISTS "id" bigint DEFAULT nextval('topicos_id_seq'::regclass);
ALTER TABLE public."topicos" ADD COLUMN IF NOT EXISTS "classe_id" bigint;
ALTER TABLE public."topicos" ADD COLUMN IF NOT EXISTS "nome" text;
ALTER TABLE public."topicos" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."topicos" ADD COLUMN IF NOT EXISTS "ordem" integer;
ALTER TABLE public."topicos" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."topicos" ADD COLUMN IF NOT EXISTS "next" json;
ALTER TABLE public."topicos" ADD COLUMN IF NOT EXISTS "depende" json;
ALTER TABLE public.desafio_participantes DROP CONSTRAINT IF EXISTS desafio_participantes_equipe_check;
ALTER TABLE public.desafio_participantes ADD CONSTRAINT desafio_participantes_equipe_check CHECK ((equipe = ANY (ARRAY[1, 2])));
ALTER TABLE public.desafio_participantes DROP CONSTRAINT IF EXISTS desafio_participantes_estado_check;
ALTER TABLE public.desafio_participantes ADD CONSTRAINT desafio_participantes_estado_check CHECK ((estado = ANY (ARRAY['convidado'::text, 'aceito'::text, 'recusado'::text])));
ALTER TABLE public.eventos_pontuacao DROP CONSTRAINT IF EXISTS eventos_pontuacao_moedas_check;
ALTER TABLE public.eventos_pontuacao ADD CONSTRAINT eventos_pontuacao_moedas_check CHECK ((moedas >= (0)::numeric));
ALTER TABLE public.eventos_pontuacao DROP CONSTRAINT IF EXISTS eventos_pontuacao_pontos_check;
ALTER TABLE public.eventos_pontuacao ADD CONSTRAINT eventos_pontuacao_pontos_check CHECK (((pontos >= (0)::numeric) OR penalidade));
ALTER TABLE public.guilda_desafio_questoes DROP CONSTRAINT IF EXISTS guilda_desafio_questoes_ordem_check;
ALTER TABLE public.guilda_desafio_questoes ADD CONSTRAINT guilda_desafio_questoes_ordem_check CHECK ((ordem > 0));
ALTER TABLE public.guilda_desafio_respostas DROP CONSTRAINT IF EXISTS guilda_desafio_respostas_tentativas_check;
ALTER TABLE public.guilda_desafio_respostas ADD CONSTRAINT guilda_desafio_respostas_tentativas_check CHECK ((tentativas >= 1));
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_consequencia_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_consequencia_check CHECK ((consequencia = ANY (ARRAY['treino'::text, 'ranqueada'::text, 'evento'::text])));
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_dificuldade_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_dificuldade_check CHECK ((dificuldade = ANY (ARRAY['normal'::text, 'dificil'::text])));
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_evento_consequencia_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_evento_consequencia_check CHECK (((evento_id IS NULL) OR (consequencia = 'evento'::text)));
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_formato_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_formato_check CHECK ((formato = ANY (ARRAY['guilda'::text, 'dupla'::text, 'solo'::text, 'turma'::text])));
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_guilda_do_formato;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_guilda_do_formato CHECK (((formato = 'guilda'::text) = (guilda_id IS NOT NULL)));
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_modo_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_modo_check CHECK ((modo = ANY (ARRAY['todos'::text, 'velocidade'::text, 'precisao'::text])));
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_resultado_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_resultado_check CHECK (((resultado IS NULL) OR (resultado = ANY (ARRAY['vitoria'::text, 'empate'::text, 'sem_adversario'::text]))));
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_rival_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_rival_check CHECK (((guilda_rival_id IS NULL) OR ((formato = 'guilda'::text) AND (guilda_rival_id <> guilda_id))));
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_status_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'encerrado'::text])));
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_vencedor_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_vencedor_check CHECK (((vencedor_equipe IS NULL) OR (vencedor_equipe = ANY (ARRAY[1, 2]))));
ALTER TABLE public.guilda_membros DROP CONSTRAINT IF EXISTS guilda_membros_check;
ALTER TABLE public.guilda_membros ADD CONSTRAINT guilda_membros_check CHECK (((left_at IS NULL) OR (left_at >= joined_at)));
ALTER TABLE public.guildas DROP CONSTRAINT IF EXISTS guildas_descricao_check;
ALTER TABLE public.guildas ADD CONSTRAINT guildas_descricao_check CHECK (((descricao IS NULL) OR (char_length(descricao) <= 180)));
ALTER TABLE public.guildas DROP CONSTRAINT IF EXISTS guildas_limite_membros_check;
ALTER TABLE public.guildas ADD CONSTRAINT guildas_limite_membros_check CHECK (((limite_membros >= 2) AND (limite_membros <= 10)));
ALTER TABLE public.guildas DROP CONSTRAINT IF EXISTS guildas_modo_perfil_check;
ALTER TABLE public.guildas ADD CONSTRAINT guildas_modo_perfil_check CHECK ((modo_perfil = ANY (ARRAY['misto'::text, 'perfil'::text])));
ALTER TABLE public.guildas DROP CONSTRAINT IF EXISTS guildas_nome_check;
ALTER TABLE public.guildas ADD CONSTRAINT guildas_nome_check CHECK (((char_length(btrim(nome)) >= 2) AND (char_length(btrim(nome)) <= 40)));
ALTER TABLE public.guildas DROP CONSTRAINT IF EXISTS guildas_perfil_alvo_check;
ALTER TABLE public.guildas ADD CONSTRAINT guildas_perfil_alvo_check CHECK (((modo_perfil = 'misto'::text) OR (NULLIF(btrim(perfil_alvo), ''::text) IS NOT NULL)));
ALTER TABLE public.ranqueada_elo DROP CONSTRAINT IF EXISTS ranqueada_elo_derrotas_check;
ALTER TABLE public.ranqueada_elo ADD CONSTRAINT ranqueada_elo_derrotas_check CHECK ((derrotas >= 0));
ALTER TABLE public.ranqueada_elo DROP CONSTRAINT IF EXISTS ranqueada_elo_empates_check;
ALTER TABLE public.ranqueada_elo ADD CONSTRAINT ranqueada_elo_empates_check CHECK ((empates >= 0));
ALTER TABLE public.ranqueada_elo DROP CONSTRAINT IF EXISTS ranqueada_elo_partidas_check;
ALTER TABLE public.ranqueada_elo ADD CONSTRAINT ranqueada_elo_partidas_check CHECK ((partidas >= 0));
ALTER TABLE public.ranqueada_elo DROP CONSTRAINT IF EXISTS ranqueada_elo_vitorias_check;
ALTER TABLE public.ranqueada_elo ADD CONSTRAINT ranqueada_elo_vitorias_check CHECK ((vitorias >= 0));
ALTER TABLE public.ranqueada_elo_partida DROP CONSTRAINT IF EXISTS ranqueada_elo_partida_check;
ALTER TABLE public.ranqueada_elo_partida ADD CONSTRAINT ranqueada_elo_partida_check CHECK ((rating_depois = (rating_antes + delta)));
ALTER TABLE public.ranqueada_elo_partida DROP CONSTRAINT IF EXISTS ranqueada_elo_partida_equipe_check;
ALTER TABLE public.ranqueada_elo_partida ADD CONSTRAINT ranqueada_elo_partida_equipe_check CHECK ((equipe = ANY (ARRAY[1, 2])));
ALTER TABLE public.ranqueada_elo_partida DROP CONSTRAINT IF EXISTS ranqueada_elo_partida_resultado_check;
ALTER TABLE public.ranqueada_elo_partida ADD CONSTRAINT ranqueada_elo_partida_resultado_check CHECK ((resultado = ANY (ARRAY['vitoria'::text, 'empate'::text, 'derrota'::text])));
ALTER TABLE public.social_relacionamentos DROP CONSTRAINT IF EXISTS social_bloqueador_do_par;
ALTER TABLE public.social_relacionamentos ADD CONSTRAINT social_bloqueador_do_par CHECK (((blocked_by_id IS NULL) OR ((blocked_by_id = aluno_a_id) OR (blocked_by_id = aluno_b_id))));
ALTER TABLE public.social_relacionamentos DROP CONSTRAINT IF EXISTS social_bloqueio_consistente;
ALTER TABLE public.social_relacionamentos ADD CONSTRAINT social_bloqueio_consistente CHECK (((status = 'blocked'::text) = (blocked_by_id IS NOT NULL)));
ALTER TABLE public.social_relacionamentos DROP CONSTRAINT IF EXISTS social_par_distinto;
ALTER TABLE public.social_relacionamentos ADD CONSTRAINT social_par_distinto CHECK ((aluno_a_id <> aluno_b_id));
ALTER TABLE public.social_relacionamentos DROP CONSTRAINT IF EXISTS social_relacionamentos_status_check;
ALTER TABLE public.social_relacionamentos ADD CONSTRAINT social_relacionamentos_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'blocked'::text])));
ALTER TABLE public.social_relacionamentos DROP CONSTRAINT IF EXISTS social_solicitante_do_par;
ALTER TABLE public.social_relacionamentos ADD CONSTRAINT social_solicitante_do_par CHECK (((solicitante_id = aluno_a_id) OR (solicitante_id = aluno_b_id)));
CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_idempotencia_unico ON public.eventos_aluno USING btree (idempotencia_key) WHERE (idempotencia_key IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_meta_unico ON public.eventos_aluno USING btree (aluno_id, tipo, referencia) WHERE (tipo = 'meta_atingida'::text);
CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_creditado_unico ON public.eventos_aluno USING btree (aluno_id, tipo, referencia) WHERE (tipo = ANY (ARRAY['presenca_aula'::text, 'participacao_aula'::text, 'conquista_desbloqueada'::text, 'nota_professor'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_evento_classe_unico ON public.eventos_aluno USING btree (aluno_id, tipo, referencia) WHERE (tipo = 'evento_classe_pontos'::text);
CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_bonus_tempo_unico ON public.eventos_aluno USING btree (aluno_id, tipo, referencia) WHERE (tipo ~~ 'atividade\_no\_tempo\_%'::text);
CREATE UNIQUE INDEX IF NOT EXISTS guilda_membro_ativo_por_guilda_uidx ON public.guilda_membros USING btree (guilda_id, aluno_id) WHERE (left_at IS NULL);

CREATE OR REPLACE FUNCTION public.app_classes_do_professor()
 RETURNS SETOF bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id FROM classe c WHERE c.professor_id = auth.uid()
$function$;
REVOKE ALL ON FUNCTION app_classes_do_professor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_classes_do_professor() TO authenticated;
GRANT EXECUTE ON FUNCTION app_classes_do_professor() TO service_role;

CREATE OR REPLACE FUNCTION public.app_desafio_aposta_fator(p_dificuldade text)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE lower(COALESCE(p_dificuldade, ''))
           WHEN 'dificil' THEN public.fn_app_config_num('desafio_aposta_fator_dificil', 2.0)
           WHEN 'normal'  THEN public.fn_app_config_num('desafio_aposta_fator_normal', 1.0)
           ELSE 1
         END;
$function$;
REVOKE ALL ON FUNCTION app_desafio_aposta_fator(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_desafio_aposta_fator(text) TO anon;
GRANT EXECUTE ON FUNCTION app_desafio_aposta_fator(text) TO authenticated;
GRANT EXECUTE ON FUNCTION app_desafio_aposta_fator(text) TO service_role;

CREATE OR REPLACE FUNCTION public.app_prazo_atraso_fator()
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_bruto text;
  v_fator numeric;
BEGIN
  SELECT valor INTO v_bruto
    FROM public.app_config
   WHERE chave = 'prazo_atraso_fator';

  IF v_bruto IS NULL THEN
    RETURN 1;
  END IF;

  BEGIN
    -- ATENCAO: o idioma das outras chaves e `[^0-9]`, que APAGA o ponto
    -- decimal -- '0.5' viraria '05', isto e, 5. Aqui o ponto fica, e a virgula
    -- de quem edita a linha na mao vira ponto antes.
    v_fator := NULLIF(
      regexp_replace(translate(v_bruto, ',', '.'), '[^0-9.]', '', 'g'),
      ''
    )::numeric;
  EXCEPTION WHEN others THEN
    -- Falha para o lado de NAO punir. O contrario zeraria a pontuacao de todo
    -- mundo por causa de um caractere errado numa linha de configuracao.
    RETURN 1;
  END;

  IF v_fator IS NULL THEN
    RETURN 1;
  END IF;

  -- Acima de 1 pagaria MAIS por atrasar. Abaixo de 0 tiraria ponto, e errar
  -- nunca anda para tras aqui.
  RETURN LEAST(1, GREATEST(0, v_fator));
END;
$function$;
REVOKE ALL ON FUNCTION app_prazo_atraso_fator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_prazo_atraso_fator() TO authenticated;
GRANT EXECUTE ON FUNCTION app_prazo_atraso_fator() TO service_role;

CREATE OR REPLACE FUNCTION public.app_ranqueada_piso_pontos()
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.fn_app_config_num('ranqueada_piso_pontos', 0);
$function$;
REVOKE ALL ON FUNCTION app_ranqueada_piso_pontos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_ranqueada_piso_pontos() TO anon;
GRANT EXECUTE ON FUNCTION app_ranqueada_piso_pontos() TO authenticated;
GRANT EXECUTE ON FUNCTION app_ranqueada_piso_pontos() TO service_role;

CREATE OR REPLACE FUNCTION public.arena_convite_responder(p_desafio_id uuid, p_aceitar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_estado text := CASE WHEN p_aceitar THEN 'aceito' ELSE 'recusado' END;
  v_fim jsonb;
BEGIN
  UPDATE public.desafio_participantes p
     SET estado = v_estado, respondido_em = now()
    FROM public.guilda_desafios d
   WHERE d.id = p.desafio_id
     AND p.desafio_id = p_desafio_id
     AND p.aluno_id = auth.uid()
     AND p.estado = 'convidado'
     AND d.status = 'aberto';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'arena_convite_indisponivel';
  END IF;
  IF p_aceitar THEN
    -- 20261105_15 (#154): duelo de evento so com o evento aberto e quem aceita inscrito.
    PERFORM public.fn_evento_duelo_cobrar(p_desafio_id, auth.uid());
    -- 20261021_19 (decisão 5): aceitar é o que torna a partida real; é aqui que o limite trava.
    PERFORM public.fn_arena_cobrar_limite_diario(p_desafio_id, auth.uid());
    RETURN jsonb_build_object('estado', v_estado);
  END IF;

  -- 20261021_19 (decisão 4): recusa fecha na hora, sem esperar a varredura, quando
  --   - a equipe 2 ficou sem ninguem (todos recusaram): `sem_adversario`, sem Elo; ou
  --   - nao sobrou convite e todo aceito ja respondeu tudo: o resultado normal.
  IF NOT EXISTS (
       SELECT 1 FROM public.desafio_participantes p
        WHERE p.desafio_id = p_desafio_id AND p.equipe = 2 AND p.estado <> 'recusado'
     )
     OR (
       NOT EXISTS (SELECT 1 FROM public.desafio_participantes p
                    WHERE p.desafio_id = p_desafio_id AND p.estado = 'convidado')
       AND NOT EXISTS (
         SELECT 1 FROM public.desafio_participantes p
          WHERE p.desafio_id = p_desafio_id AND p.estado = 'aceito'
            AND (SELECT count(*) FROM public.guilda_desafio_respostas r
                  WHERE r.desafio_id = p_desafio_id AND r.aluno_id = p.aluno_id)
              < (SELECT count(*) FROM public.guilda_desafio_questoes q
                  WHERE q.desafio_id = p_desafio_id)
       )
     ) THEN
    v_fim := public.fn_desafio_encerrar(p_desafio_id);
  END IF;
  RETURN jsonb_build_object('estado', v_estado, 'encerrou', v_fim IS NOT NULL,
                            'resultado', v_fim->>'resultado');
END
$function$;
REVOKE ALL ON FUNCTION arena_convite_responder(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION arena_convite_responder(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION arena_convite_responder(uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.arena_desafio(p_desafio_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id', d.id,
    'formato', d.formato,
    'modo', d.modo,
    'status', d.status,
    'dificuldade', d.dificuldade,
    'consequencia', d.consequencia,
    -- `fn_desafio_params_efetivos` nao tem EXECUTE para `authenticated` (fase 7): quem
    -- traduz o preset para o cliente tem de ser outra funcao, e e esta.
    'params', public.fn_desafio_params_efetivos(d.dificuldade),
    'meu_estado', me.estado,
    'minha_equipe', me.equipe,
    -- 20261021_19: com equipe 2 responde-se por `arena_responder`; sem, por
    -- `guilda_desafio_responder`. A tela le daqui, nao adivinha.
    'competitivo', EXISTS (SELECT 1 FROM public.desafio_participantes c
                            WHERE c.desafio_id = d.id AND c.equipe = 2),
    -- 20261021_19 (decisão 10): a variação de Elo de quem pergunta, e só a dele.
    'meu_elo', (SELECT jsonb_build_object('delta', ep.delta,
                                          'rating_antes', ep.rating_antes,
                                          'rating_depois', ep.rating_depois)
                  FROM public.ranqueada_elo_partida ep
                 WHERE ep.desafio_id = d.id AND ep.aluno_id = auth.uid()),
    'questoes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'ordem', dq.ordem,
               'questao_id', dq.questao_id,
               'enunciado', q.enunciado,
               'tipo', q.tipo,
               'alternativas', q.alternativas,
               'midia_url', q.midia_url,
               'minha_resposta', r.resposta,
               'correta', r.correta,
               'tempo_ms', r.tempo_ms,
               'resposta_correta',
                 CASE WHEN r.questao_id IS NULL THEN NULL
                      ELSE q.resposta_correta END
             ) ORDER BY dq.ordem)
        FROM public.guilda_desafio_questoes dq
        JOIN public.questoes q ON q.id = dq.questao_id
        LEFT JOIN public.guilda_desafio_respostas r
               ON r.desafio_id = dq.desafio_id
              AND r.questao_id = dq.questao_id
              AND r.aluno_id = auth.uid()
       WHERE dq.desafio_id = d.id
    ), '[]'::jsonb)
  )
  FROM public.guilda_desafios d
  JOIN public.desafio_participantes me
    ON me.desafio_id = d.id AND me.aluno_id = auth.uid()
 WHERE d.id = p_desafio_id AND me.estado = 'aceito';
$function$;
REVOKE ALL ON FUNCTION arena_desafio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION arena_desafio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION arena_desafio(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.arena_desafio_criar(p_classe_id bigint, p_formato text DEFAULT 'solo'::text, p_modo text DEFAULT 'precisao'::text, p_quantidade integer DEFAULT 5, p_guilda_id uuid DEFAULT NULL::uuid, p_aliado uuid DEFAULT NULL::uuid, p_adversarios uuid[] DEFAULT NULL::uuid[], p_guilda_rival uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me      uuid := auth.uid();
  v_formato text := lower(btrim(COALESCE(p_formato, '')));
  v_modo    text := lower(btrim(COALESCE(p_modo, '')));
  v_adv     uuid[] := COALESCE(p_adversarios, ARRAY[]::uuid[]);
  v_n_adv   integer;
  v_qtd     integer := GREATEST(1, LEAST(COALESCE(p_quantidade, 5), 10));
  v_convocados uuid[];
  v_alvo    uuid;
  v_id      uuid;
  v_q       record;
  v_i       integer := 0;
  v_rivais  integer := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'arena_sem_sessao';
  END IF;
  IF NOT public.guilda_e_colega(v_me, p_classe_id) THEN
    RAISE EXCEPTION 'arena_sem_permissao';
  END IF;
  IF v_formato NOT IN ('guilda', 'dupla', 'solo') THEN
    RAISE EXCEPTION 'arena_formato_invalido';
  END IF;
  IF v_modo NOT IN ('todos', 'velocidade', 'precisao') THEN
    RAISE EXCEPTION 'arena_modo_invalido';
  END IF;

  v_n_adv := COALESCE(array_length(v_adv, 1), 0);

  IF v_formato = 'guilda' THEN
    IF p_guilda_id IS NULL OR p_aliado IS NOT NULL OR v_n_adv > 0 THEN
      RAISE EXCEPTION 'arena_formato_invalido';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.guilda_membros m
       WHERE m.guilda_id = p_guilda_id AND m.aluno_id = v_me
         AND m.left_at IS NULL
    ) THEN
      RAISE EXCEPTION 'arena_sem_permissao';
    END IF;
    IF p_guilda_rival IS NOT NULL THEN
      IF p_guilda_rival = p_guilda_id THEN
        RAISE EXCEPTION 'arena_rival_invalida';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.guildas g
         WHERE g.id = p_guilda_rival AND g.ativa
           AND g.classe_id = p_classe_id
      ) THEN
        RAISE EXCEPTION 'arena_rival_invalida';
      END IF;
      SELECT count(*) INTO v_rivais
        FROM public.guilda_membros m
       WHERE m.guilda_id = p_guilda_rival AND m.left_at IS NULL
         AND m.aluno_id IS NOT NULL;
      IF v_rivais = 0 THEN
        RAISE EXCEPTION 'arena_rival_sem_membros';
      END IF;
    END IF;
    v_convocados := ARRAY[]::uuid[];
  ELSIF v_formato = 'dupla' THEN
    IF p_guilda_id IS NOT NULL OR p_guilda_rival IS NOT NULL
       OR p_aliado IS NULL OR v_n_adv <> 2 THEN
      RAISE EXCEPTION 'arena_formato_invalido';
    END IF;
    v_convocados := ARRAY[p_aliado] || v_adv;
  ELSE
    IF p_guilda_id IS NOT NULL OR p_guilda_rival IS NOT NULL
       OR p_aliado IS NOT NULL OR v_n_adv <> 1 THEN
      RAISE EXCEPTION 'arena_formato_invalido';
    END IF;
    v_convocados := v_adv;
  END IF;

  IF v_me = ANY(v_convocados) THEN
    RAISE EXCEPTION 'arena_participante_invalido';
  END IF;
  IF COALESCE(array_length(v_convocados, 1), 0)
     IS DISTINCT FROM (SELECT count(DISTINCT x)::integer FROM unnest(v_convocados) x) THEN
    RAISE EXCEPTION 'arena_participante_repetido';
  END IF;
  FOREACH v_alvo IN ARRAY v_convocados LOOP
    IF NOT public.guilda_e_colega(v_alvo, p_classe_id) THEN
      RAISE EXCEPTION 'arena_participante_fora_da_turma';
    END IF;
    IF public.guilda_bloqueio_ativo(v_me, v_alvo) THEN
      RAISE EXCEPTION 'arena_participante_bloqueado';
    END IF;
  END LOOP;

  INSERT INTO public.guilda_desafios
         (guilda_id, guilda_rival_id, classe_id, criado_por,
          modo, formato, titulo, configuracao)
  VALUES (CASE WHEN v_formato = 'guilda' THEN p_guilda_id ELSE NULL END,
          CASE WHEN v_formato = 'guilda' THEN p_guilda_rival ELSE NULL END,
          p_classe_id, v_me, v_modo, v_formato,
          'Desafio em ' || v_formato,
          jsonb_build_object('quantidade', v_qtd))
  RETURNING id INTO v_id;

  IF v_formato = 'guilda' THEN
    INSERT INTO public.desafio_participantes
           (desafio_id, aluno_id, equipe, estado, respondido_em)
    SELECT v_id, m.aluno_id, 1, 'aceito', now()
      FROM public.guilda_membros m
     WHERE m.guilda_id = p_guilda_id AND m.left_at IS NULL
       AND m.aluno_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    IF p_guilda_rival IS NOT NULL THEN
      INSERT INTO public.desafio_participantes
             (desafio_id, aluno_id, equipe, estado)
      SELECT v_id, m.aluno_id, 2, 'convidado'
        FROM public.guilda_membros m
       WHERE m.guilda_id = p_guilda_rival AND m.left_at IS NULL
         AND m.aluno_id IS NOT NULL
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    INSERT INTO public.desafio_participantes
           (desafio_id, aluno_id, equipe, estado, respondido_em)
    VALUES (v_id, v_me, 1, 'aceito', now());
    IF v_formato = 'dupla' THEN
      INSERT INTO public.desafio_participantes
             (desafio_id, aluno_id, equipe, estado)
      VALUES (v_id, p_aliado, 1, 'convidado');
    END IF;
    FOREACH v_alvo IN ARRAY v_adv LOOP
      INSERT INTO public.desafio_participantes
             (desafio_id, aluno_id, equipe, estado)
      VALUES (v_id, v_alvo, 2, 'convidado');
    END LOOP;
  END IF;

  -- 20261021_19 (decisão 5): limite diário contra o mesmo adversário. A exceção desfaz o
  -- desafio inteiro.
  PERFORM public.fn_arena_cobrar_limite_diario(v_id);

  FOR v_q IN
    SELECT q.id
      FROM public.questoes q
      JOIN public.atividades a ON a.id = q.atividade_id
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE t.classe_id = p_classe_id
       AND NOT EXISTS (
         SELECT 1 FROM public.desafio_participantes dp
          WHERE dp.desafio_id = v_id
            AND NOT public.fn_questao_liberada_para(dp.aluno_id, q.id)
       )
     ORDER BY random()
     LIMIT v_qtd
  LOOP
    v_i := v_i + 1;
    INSERT INTO public.guilda_desafio_questoes (desafio_id, questao_id, ordem)
    VALUES (v_id, v_q.id, v_i);
  END LOOP;

  IF v_i = 0 THEN
    RAISE EXCEPTION 'arena_sem_questoes_liberadas';
  END IF;

  UPDATE public.guilda_desafios
     SET configuracao = jsonb_build_object('quantidade', v_i)
   WHERE id = v_id;

  IF v_formato = 'guilda' THEN
    INSERT INTO public.guilda_mensagens
           (guilda_id, classe_id, autor_id, tipo, texto, conteudo)
    VALUES (p_guilda_id, p_classe_id, v_me, 'desafio',
            'Um novo desafio foi lancado!',
            jsonb_build_object('id', v_id, 'modo', v_modo,
                               'formato', v_formato, 'quantidade', v_i));
    IF p_guilda_rival IS NOT NULL THEN
      INSERT INTO public.guilda_mensagens
             (guilda_id, classe_id, autor_id, tipo, texto, conteudo)
      VALUES (p_guilda_rival, p_classe_id, v_me, 'desafio',
              'Sua guilda foi desafiada!',
              jsonb_build_object('id', v_id, 'modo', v_modo,
                                 'formato', v_formato, 'quantidade', v_i));
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'formato', v_formato,
                            'modo', v_modo, 'quantidade', v_i,
                            'rivais_convidados', v_rivais);
END
$function$;
REVOKE ALL ON FUNCTION arena_desafio_criar(bigint,text,text,integer,uuid,uuid,uuid[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION arena_desafio_criar(bigint,text,text,integer,uuid,uuid,uuid[],uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION arena_desafio_criar(bigint,text,text,integer,uuid,uuid,uuid[],uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.arena_encerrar(p_desafio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.desafio_participantes
     WHERE desafio_id = p_desafio_id AND aluno_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'arena_sem_permissao';
  END IF;

  RETURN public.fn_desafio_encerrar(p_desafio_id);
END
$function$;
REVOKE ALL ON FUNCTION arena_encerrar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION arena_encerrar(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.arena_listar(p_classe_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_agg(s.item ORDER BY s.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT d.created_at,
           jsonb_build_object(
             'id', d.id,
             'classe_id', d.classe_id,
             'formato', d.formato,
             'modo', d.modo,
             'status', d.status,
             'resultado', d.resultado,
             'titulo', d.titulo,
             'guilda_id', d.guilda_id,
             'guilda_nome', g.nome,
             'guilda_rival_id', d.guilda_rival_id,
             'guilda_rival_nome', gr.nome,
             'criado_por', d.criado_por,
             'sou_criador', d.criado_por = auth.uid(),
             'created_at', d.created_at,
             'encerrado_em', d.encerrado_em,
             'vencedor_equipe', d.vencedor_equipe,
             'questoes', (SELECT count(*) FROM public.guilda_desafio_questoes q
                           WHERE q.desafio_id = d.id),
             'meu_estado', me.estado,
             'minha_equipe', me.equipe,
             'minhas_respostas', (SELECT count(*)
                                    FROM public.guilda_desafio_respostas r
                                   WHERE r.desafio_id = d.id
                                     AND r.aluno_id = auth.uid()),
             -- 20261021_19 (decisão 10): a variação de Elo de quem pergunta, e só a dele.
             'meu_elo', (SELECT jsonb_build_object('delta', ep.delta,
                                                   'rating_antes', ep.rating_antes,
                                                   'rating_depois', ep.rating_depois)
                           FROM public.ranqueada_elo_partida ep
                          WHERE ep.desafio_id = d.id AND ep.aluno_id = auth.uid()),
             'participantes', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'aluno_id', pl.aluno_id, 'nome', a.nome,
                        'apelido', a.apelido, 'foto_url', a.foto_url,
                        'perfil_ativo', a.perfil_ativo,
                        'equipe', pl.equipe, 'estado', pl.estado,
                        'acertos', pl.acertos,
                        'respondidas', pl.respondidas,
                        'tempo_ms', pl.tempo_total_ms
                      ) ORDER BY pl.equipe, a.nome)
                 FROM public.fn_arena_placar(d.id) pl
                 JOIN public.alunos a ON a.id = pl.aluno_id
             ), '[]'::jsonb),
             'equipes', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'equipe', e.equipe, 'pontos', e.pontos,
                        'tempo_ms', e.tempo_ms, 'integrantes', e.integrantes
                      ) ORDER BY e.equipe)
                 FROM public.fn_arena_equipes(d.id) e
             ), '[]'::jsonb)
           ) AS item
      FROM public.guilda_desafios d
      JOIN public.desafio_participantes me
        ON me.desafio_id = d.id AND me.aluno_id = auth.uid()
      LEFT JOIN public.guildas g  ON g.id  = d.guilda_id
      LEFT JOIN public.guildas gr ON gr.id = d.guilda_rival_id
     WHERE d.classe_id = p_classe_id
       AND public.guilda_e_colega(auth.uid(), p_classe_id)
     ORDER BY d.created_at DESC
     LIMIT 40
  ) s;
$function$;
REVOKE ALL ON FUNCTION arena_listar(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION arena_listar(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION arena_listar(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.arena_professor_resumo(p_classe_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'duelos', COALESCE((
      SELECT jsonb_agg(x.item ORDER BY x.created_at DESC)
      FROM (
        SELECT d.created_at,
               jsonb_build_object(
                 'id', d.id,
                 'titulo', d.titulo,
                 'formato', d.formato,
                 'modo', d.modo,
                 'dificuldade', d.dificuldade,
                 'consequencia', d.consequencia,
                 'evento_id', d.evento_id,
                 'status', d.status,
                 'resultado', d.resultado,
                 'vencedor_equipe', d.vencedor_equipe,
                 'guilda_id', d.guilda_id,
                 'guilda_nome', g.nome,
                 'guilda_rival_id', d.guilda_rival_id,
                 'guilda_rival_nome', gr.nome,
                 'created_at', d.created_at,
                 'encerrado_em', d.encerrado_em,
                 'aceitaram', (SELECT count(*) FROM public.desafio_participantes p
                                WHERE p.desafio_id = d.id AND p.estado = 'aceito'),
                 'equipes', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                            'equipe', e.equipe, 'pontos', e.pontos, 'integrantes', e.integrantes
                          ) ORDER BY e.equipe)
                   FROM public.fn_arena_equipes(d.id) e
                 ), '[]'::jsonb)
               ) AS item
        FROM public.guilda_desafios d
        LEFT JOIN public.guildas g ON g.id = d.guilda_id
        LEFT JOIN public.guildas gr ON gr.id = d.guilda_rival_id
        WHERE d.classe_id = p_classe_id
        ORDER BY d.created_at DESC
        LIMIT 40
      ) x
    ), '[]'::jsonb),
    'ranking', COALESCE((
      SELECT jsonb_agg(r.item ORDER BY r.vitorias DESC, r.empates DESC, r.duelos ASC, r.nome)
      FROM (
        SELECT t.guilda_id, g.nome,
               count(*) FILTER (WHERE t.desfecho = 'vitoria')::integer AS vitorias,
               count(*) FILTER (WHERE t.desfecho = 'empate')::integer AS empates,
               count(*)::integer AS duelos,
               jsonb_build_object(
                 'guilda_id', t.guilda_id,
                 'nome', g.nome,
                 'vitorias', count(*) FILTER (WHERE t.desfecho = 'vitoria'),
                 'empates', count(*) FILTER (WHERE t.desfecho = 'empate'),
                 'duelos', count(*)
               ) AS item
        FROM (
          SELECT d.guilda_id AS guilda_id,
                 CASE
                   WHEN d.resultado = 'empate' THEN 'empate'
                   WHEN d.guilda_rival_id IS NULL AND d.resultado = 'vitoria' THEN 'vitoria'
                   WHEN d.vencedor_equipe = 1 THEN 'vitoria'
                   ELSE 'outro'
                 END AS desfecho
          FROM public.guilda_desafios d
          WHERE d.classe_id = p_classe_id AND d.status = 'encerrado' AND d.formato = 'guilda'
            AND d.guilda_id IS NOT NULL AND d.resultado IS DISTINCT FROM 'sem_adversario'
          UNION ALL
          SELECT d.guilda_rival_id,
                 CASE
                   WHEN d.resultado = 'empate' THEN 'empate'
                   WHEN d.vencedor_equipe = 2 THEN 'vitoria'
                   ELSE 'outro'
                 END
          FROM public.guilda_desafios d
          WHERE d.classe_id = p_classe_id AND d.status = 'encerrado' AND d.formato = 'guilda'
            AND d.guilda_rival_id IS NOT NULL AND d.resultado IS DISTINCT FROM 'sem_adversario'
        ) t
        JOIN public.guildas g ON g.id = t.guilda_id
        GROUP BY t.guilda_id, g.nome
      ) r
    ), '[]'::jsonb)
  );
END
$function$;
REVOKE ALL ON FUNCTION arena_professor_resumo(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION arena_professor_resumo(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION arena_professor_resumo(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.arena_responder(p_desafio_id uuid, p_questao_id bigint, p_resposta text, p_tempo_ms integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me      uuid := auth.uid();
  v_q       public.questoes%ROWTYPE;
  v_correta boolean;
  v_tempo   integer;
  v_gravou  boolean := false;
  v_faltam  integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.desafio_participantes p
      JOIN public.guilda_desafios d ON d.id = p.desafio_id
     WHERE p.desafio_id = p_desafio_id AND p.aluno_id = v_me
       AND p.estado = 'aceito' AND d.status = 'aberto'
  ) THEN
    RAISE EXCEPTION 'arena_sem_permissao';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.guilda_desafio_questoes
     WHERE desafio_id = p_desafio_id AND questao_id = p_questao_id
  ) THEN
    RAISE EXCEPTION 'arena_questao_fora_do_desafio';
  END IF;
  -- 20261021_19: desafio sem equipe 2 e cooperativo, e cooperativo se responde por
  -- `guilda_desafio_responder` (tentativas do preset, fecha sem esperar convidado).
  IF NOT EXISTS (
    SELECT 1 FROM public.desafio_participantes p
     WHERE p.desafio_id = p_desafio_id AND p.equipe = 2
  ) THEN
    RAISE EXCEPTION 'arena_desafio_cooperativo' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_q FROM public.questoes WHERE id = p_questao_id;
  v_correta := lower(btrim(COALESCE(p_resposta, '')))
             = lower(btrim(COALESCE(v_q.resposta_correta, '')));

  v_tempo := LEAST(GREATEST(COALESCE(p_tempo_ms, 0), 0), 600000);

  INSERT INTO public.guilda_desafio_respostas
         (desafio_id, questao_id, aluno_id, resposta, correta, tempo_ms)
  VALUES (p_desafio_id, p_questao_id, v_me,
          COALESCE(p_resposta, ''), v_correta, v_tempo)
  ON CONFLICT (desafio_id, questao_id, aluno_id) DO NOTHING;
  GET DIAGNOSTICS v_faltam = ROW_COUNT;
  v_gravou := v_faltam > 0;

  SELECT count(*) INTO v_faltam
    FROM public.desafio_participantes p
    CROSS JOIN LATERAL (
      SELECT count(*) AS n FROM public.guilda_desafio_respostas r
       WHERE r.desafio_id = p.desafio_id AND r.aluno_id = p.aluno_id
    ) resp
   WHERE p.desafio_id = p_desafio_id
     AND p.estado = 'aceito'
     AND resp.n < (SELECT count(*) FROM public.guilda_desafio_questoes q
                    WHERE q.desafio_id = p_desafio_id);

  IF v_faltam = 0 AND NOT EXISTS (
    SELECT 1 FROM public.desafio_participantes p
     WHERE p.desafio_id = p_desafio_id AND p.estado = 'convidado'
  ) THEN
    PERFORM public.arena_encerrar(p_desafio_id);
  END IF;

  RETURN jsonb_build_object('correta', v_correta, 'registrada', v_gravou);
END
$function$;
REVOKE ALL ON FUNCTION arena_responder(uuid,bigint,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION arena_responder(uuid,bigint,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION arena_responder(uuid,bigint,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.desafio_responder(p_desafio_id uuid, p_questao_id bigint, p_resposta text, p_tempo_ms integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_competitivo boolean;
  v_saida       jsonb;
BEGIN
  -- O MESMO predicado das duas guardas (`arena_desafio_cooperativo` e
  -- `guilda_desafio_e_da_arena`). Não é uma terceira definição de "é da arena": é a única,
  -- agora com um só lugar para mudar.
  SELECT EXISTS (
    SELECT 1 FROM public.desafio_participantes dp
     WHERE dp.desafio_id = p_desafio_id AND dp.equipe = 2
  ) INTO v_competitivo;

  -- Sem checagem de permissão aqui de propósito: quem recusa é a função que de fato responde,
  -- com a mensagem dela. Duplicar a guarda criaria duas respostas possíveis para o mesmo "não".
  IF v_competitivo THEN
    v_saida := public.arena_responder(p_desafio_id, p_questao_id, p_resposta, p_tempo_ms);
  ELSE
    v_saida := public.guilda_desafio_responder(p_desafio_id, p_questao_id, p_resposta, p_tempo_ms);
  END IF;

  RETURN COALESCE(v_saida, '{}'::jsonb) || jsonb_build_object('competitivo', v_competitivo);
END
$function$;
REVOKE ALL ON FUNCTION desafio_responder(uuid,bigint,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION desafio_responder(uuid,bigint,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION desafio_responder(uuid,bigint,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_app_config_int(p_chave text, p_padrao integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
       FROM public.app_config WHERE chave = p_chave),
    p_padrao);
$function$;
REVOKE ALL ON FUNCTION fn_app_config_int(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_app_config_int(text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_app_config_num(p_chave text, p_padrao numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_bruto text;
  v_valor numeric;
BEGIN
  SELECT valor INTO v_bruto FROM public.app_config WHERE chave = p_chave;
  IF v_bruto IS NULL THEN
    RETURN p_padrao;
  END IF;

  BEGIN
    -- `-` por ultimo na classe para ser literal, nao faixa. A virgula de quem edita a linha
    -- na mao vira ponto antes.
    v_valor := NULLIF(regexp_replace(translate(v_bruto, ',', '.'), '[^0-9.-]', '', 'g'), '')::numeric;
  EXCEPTION WHEN others THEN
    -- Linha malformada cai no padrao. Levantar aqui quebraria o fluxo do aluno por causa de
    -- um caractere numa tabela de configuracao.
    RETURN p_padrao;
  END;

  RETURN COALESCE(v_valor, p_padrao);
END;
$function$;
REVOKE ALL ON FUNCTION fn_app_config_num(text,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_app_config_num(text,numeric) TO anon;
GRANT EXECUTE ON FUNCTION fn_app_config_num(text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_app_config_num(text,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_arena_cobrar_limite_diario(p_desafio_id uuid, p_aluno uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limite integer := public.fn_app_config_int('arena_limite_diario_mesmo_adversario', 3);
  v_inicio timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
                          AT TIME ZONE 'America/Sao_Paulo';
  v_par    record;
BEGIN
  IF v_limite <= 0 THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.guilda_desafios
                  WHERE id = p_desafio_id AND consequencia = 'ranqueada') THEN
    RETURN;
  END IF;

  SELECT x.aluno_id AS a, y.aluno_id AS b, n.partidas
    INTO v_par
    FROM public.desafio_participantes x
    JOIN public.desafio_participantes y
      ON y.desafio_id = x.desafio_id AND y.equipe <> x.equipe AND y.estado <> 'recusado'
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS partidas
        FROM public.guilda_desafios d
        JOIN public.desafio_participantes px
          ON px.desafio_id = d.id AND px.aluno_id = x.aluno_id AND px.estado = 'aceito'
        JOIN public.desafio_participantes py
          ON py.desafio_id = d.id AND py.aluno_id = y.aluno_id AND py.estado = 'aceito'
         AND py.equipe <> px.equipe
       WHERE d.id <> p_desafio_id
         AND d.consequencia = 'ranqueada'
         AND d.created_at >= v_inicio
         AND d.resultado IS DISTINCT FROM 'sem_adversario'
    ) n
   WHERE x.desafio_id = p_desafio_id
     AND x.estado <> 'recusado'
     AND (CASE WHEN p_aluno IS NULL THEN x.equipe = 1 ELSE x.aluno_id = p_aluno END)
     AND n.partidas >= v_limite
   ORDER BY n.partidas DESC
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'arena_limite_diario_adversario' USING
      ERRCODE = '22023',
      DETAIL = format('%s e %s já fizeram %s partidas ranqueadas hoje um contra o outro.',
                      (SELECT COALESCE(apelido, nome) FROM public.alunos WHERE id = v_par.a),
                      (SELECT COALESCE(apelido, nome) FROM public.alunos WHERE id = v_par.b),
                      v_par.partidas),
      HINT = v_limite::text;
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION fn_arena_cobrar_limite_diario(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_arena_cobrar_limite_diario(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_arena_equipes(p_desafio_id uuid)
 RETURNS TABLE(equipe smallint, pontos integer, tempo_ms bigint, integrantes integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH d AS (
    SELECT g.id, g.modo,
           (SELECT count(*) FROM public.guilda_desafio_questoes q
             WHERE q.desafio_id = g.id) AS total
      FROM public.guilda_desafios g
     WHERE g.id = p_desafio_id
  ), valido AS (
    SELECT pl.*
      FROM public.fn_arena_placar(p_desafio_id) pl
      CROSS JOIN d
     WHERE pl.estado = 'aceito'
       AND (d.modo <> 'todos' OR pl.respondidas >= d.total)
  )
  SELECT valido.equipe,
         COALESCE(sum(valido.acertos), 0)::integer,
         COALESCE(sum(valido.tempo_total_ms), 0)::bigint,
         count(*)::integer
    FROM valido
   GROUP BY valido.equipe;
$function$;
REVOKE ALL ON FUNCTION fn_arena_equipes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_arena_equipes(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_arena_placar(p_desafio_id uuid)
 RETURNS TABLE(aluno_id uuid, equipe smallint, estado text, acertos integer, respondidas integer, tempo_total_ms bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.aluno_id, p.equipe, p.estado,
         COALESCE(count(*) FILTER (WHERE r.correta), 0)::integer,
         COALESCE(count(r.questao_id), 0)::integer,
         COALESCE(sum(COALESCE(r.tempo_ms, 0)), 0)::bigint
    FROM public.desafio_participantes p
    LEFT JOIN public.guilda_desafio_respostas r
           ON r.desafio_id = p.desafio_id AND r.aluno_id = p.aluno_id
   WHERE p.desafio_id = p_desafio_id
   GROUP BY p.aluno_id, p.equipe, p.estado;
$function$;
REVOKE ALL ON FUNCTION fn_arena_placar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_arena_placar(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_desafio_encerrar(p_desafio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_d        public.guilda_desafios%ROWTYPE;
  v_p1 integer; v_p2 integer;
  v_t1 bigint;  v_t2 bigint;
  v_n1 integer; v_n2 integer;
  v_jog1 integer; v_jog2 integer;
  v_total    integer;
  v_cooperativo boolean;
  v_vencedor smallint;
  v_resultado text;
  v_ref      text;
  v_pagos    integer;
  v_elo      integer := 0;
BEGIN
  -- SEM checagem de auth.uid() de proposito: quem chama por cron nao tem sessao, e a
  -- checagem de participante levantaria `arena_sem_permissao` em toda varredura. A porta do
  -- cliente (`arena_encerrar`) mantem a checagem e delega para ca.
  SELECT * INTO v_d FROM public.guilda_desafios
   WHERE id = p_desafio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'arena_desafio_inexistente';
  END IF;
  IF v_d.status = 'encerrado' THEN
    RETURN jsonb_build_object('status', 'encerrado', 'novo', false,
                              'resultado', v_d.resultado,
                              'vencedor_equipe', v_d.vencedor_equipe,
                              'consequencia', v_d.consequencia,
                              'dificuldade', v_d.dificuldade);
  END IF;

  SELECT COALESCE(sum(pontos)      FILTER (WHERE equipe = 1), 0),
         COALESCE(sum(tempo_ms)    FILTER (WHERE equipe = 1), 0),
         COALESCE(sum(integrantes) FILTER (WHERE equipe = 1), 0),
         COALESCE(sum(pontos)      FILTER (WHERE equipe = 2), 0),
         COALESCE(sum(tempo_ms)    FILTER (WHERE equipe = 2), 0),
         COALESCE(sum(integrantes) FILTER (WHERE equipe = 2), 0)
    INTO v_p1, v_t1, v_n1, v_p2, v_t2, v_n2
    FROM public.fn_arena_equipes(p_desafio_id);

  SELECT count(*) FILTER (WHERE equipe = 1 AND estado = 'aceito' AND respondidas > 0),
         count(*) FILTER (WHERE equipe = 2 AND estado = 'aceito' AND respondidas > 0)
    INTO v_jog1, v_jog2
    FROM public.fn_arena_placar(p_desafio_id);

  SELECT count(*) INTO v_total
    FROM public.guilda_desafio_questoes WHERE desafio_id = p_desafio_id;

  -- Cooperativo e NAO EXISTIR equipe 2. `formato = 'guilda' AND rival IS NULL` nao servia:
  -- o duelo solo da arena tem equipe 2 e rival nulo, e solo/dupla/turma desta fase nao tem
  -- equipe nenhuma do outro lado -- cairiam em `sem_adversario` e nunca venceriam.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.desafio_participantes dp
     WHERE dp.desafio_id = p_desafio_id AND dp.equipe = 2
  ) INTO v_cooperativo;

  IF v_cooperativo THEN
    IF v_p1 * 2 >= v_total * GREATEST(v_n1, 1) THEN
      v_vencedor := 1; v_resultado := 'vitoria';
    ELSE
      v_vencedor := NULL; v_resultado := 'empate';
    END IF;
  ELSIF v_jog1 = 0 OR v_jog2 = 0 THEN
    v_vencedor := NULL; v_resultado := 'sem_adversario';
  ELSE
    IF v_n1 = 0 OR v_n2 = 0 THEN
      v_vencedor := CASE WHEN v_n1 > 0 THEN 1::smallint
                         WHEN v_n2 > 0 THEN 2::smallint
                         ELSE NULL END;
    ELSIF v_p1 * v_n2 > v_p2 * v_n1 THEN
      v_vencedor := 1;
    ELSIF v_p2 * v_n1 > v_p1 * v_n2 THEN
      v_vencedor := 2;
    ELSIF v_d.modo = 'velocidade' AND v_p1 > 0 AND v_t1 * v_n2 <> v_t2 * v_n1 THEN
      v_vencedor := CASE WHEN v_t1 * v_n2 < v_t2 * v_n1
                         THEN 1::smallint ELSE 2::smallint END;
    ELSE
      v_vencedor := NULL;
    END IF;
    v_resultado := CASE WHEN v_vencedor IS NULL THEN 'empate' ELSE 'vitoria' END;
  END IF;

  UPDATE public.guilda_desafios
     SET status = 'encerrado', encerrado_em = now(),
         vencedor_equipe = v_vencedor, resultado = v_resultado
   WHERE id = p_desafio_id;

  v_ref := 'classe' || ':' || v_d.classe_id::text
         || ':' || 'desafio' || ':' || p_desafio_id::text;

  v_pagos := 0;

  -- `treino` nao escreve NADA: nao pontua, nao move rank, nao paga moeda. O desafio e'
  -- encerrado e o placar e' devolvido do mesmo jeito -- treinar continua mostrando como foi.
  IF v_d.consequencia <> 'treino' THEN
    INSERT INTO public.eventos_aluno
           (aluno_id, tipo, referencia, valor, criado_em, idempotencia_key)
    SELECT pl.aluno_id, t.tipo, v_ref, 0, now(),
           md5(p_desafio_id::text || t.tipo || pl.aluno_id::text)::uuid
      FROM public.fn_arena_placar(p_desafio_id) pl
      CROSS JOIN LATERAL (
        SELECT unnest(
          ARRAY['desafio_participou']
          || CASE
               WHEN v_resultado = 'empate' THEN ARRAY['desafio_empate']
               WHEN v_resultado = 'vitoria' AND pl.equipe = v_vencedor
                 THEN ARRAY['desafio_vencido']
               -- A APOSTA. So' em `ranqueada`, e so' para quem jogou e PERDEU de alguem:
               -- `sem_adversario` nao e derrota, e `empate` ja saiu no ramo de cima.
               WHEN v_resultado = 'vitoria' AND v_d.consequencia = 'ranqueada'
                 THEN ARRAY['desafio_derrota']
               ELSE ARRAY[]::text[]
             END
        ) AS tipo
      ) t
     WHERE pl.estado = 'aceito' AND pl.respondidas > 0
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_pagos = ROW_COUNT;
  END IF;

  -- Elo (decisão de 2026-10-20). Só ranqueada com adversário de verdade: cooperativo não tem
  -- contra quem medir, e `sem_adversario` não é partida.
  IF v_d.consequencia = 'ranqueada' AND NOT v_cooperativo AND v_resultado IN ('vitoria', 'empate') THEN
    v_elo := public.fn_elo_aplicar(p_desafio_id, v_d.classe_id, v_vencedor);
  END IF;

  RETURN jsonb_build_object(
    'status', 'encerrado', 'novo', true,
    'resultado', v_resultado,
    'vencedor_equipe', v_vencedor,
    'cooperativo', v_cooperativo,
    'consequencia', v_d.consequencia,
    'dificuldade', v_d.dificuldade,
    'eventos', v_pagos,
    'elo_atualizados', v_elo,
    'equipe_1', jsonb_build_object('pontos', v_p1, 'tempo_ms', v_t1,
                                   'integrantes', v_n1, 'jogaram', v_jog1),
    'equipe_2', jsonb_build_object('pontos', v_p2, 'tempo_ms', v_t2,
                                   'integrantes', v_n2, 'jogaram', v_jog2)
  );
END
$function$;
REVOKE ALL ON FUNCTION fn_desafio_encerrar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_desafio_encerrar(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_desafio_params_efetivos(p_dificuldade text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'dificuldade', CASE lower(COALESCE(p_dificuldade, ''))
                     WHEN 'dificil' THEN 'dificil'
                     ELSE 'normal'
                   END,
    'tempo_seg', CASE lower(COALESCE(p_dificuldade, ''))
                   WHEN 'dificil' THEN public.fn_app_config_int('desafio_tempo_seg_dificil', 30)
                   ELSE public.fn_app_config_int('desafio_tempo_seg_normal', 60)
                 END,
    'tentativas', CASE lower(COALESCE(p_dificuldade, ''))
                    WHEN 'dificil' THEN public.fn_app_config_int('desafio_tentativas_dificil', 1)
                    ELSE public.fn_app_config_int('desafio_tentativas_normal', 2)
                  END,
    'aposta_fator', public.app_desafio_aposta_fator(p_dificuldade)
  );
$function$;
REVOKE ALL ON FUNCTION fn_desafio_params_efetivos(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_desafio_params_efetivos(text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_elo_aplicar(p_desafio_id uuid, p_classe_id bigint, p_vencedor smallint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Sem auth.uid() de propósito, como `fn_desafio_encerrar`: a varredura chama sem sessão. Por
  -- isso nenhum cliente tem EXECUTE.
  v_inicial  integer := public.fn_app_config_int('elo_inicial', 1000);
  v_k        integer := public.fn_app_config_int('elo_k', 32);
  v_kp       integer := public.fn_app_config_int('elo_k_provisorio', 40);
  v_np       integer := public.fn_app_config_int('elo_partidas_provisorias', 10);
  v_r1       numeric;
  v_r2       numeric;
  v_e1       numeric;
  v_s1       numeric;
  v_n        integer := 0;
  v_ids      uuid[];
  v_equipes  smallint[];
BEGIN
  -- Já aplicado para este desafio: nada a fazer.
  IF EXISTS (SELECT 1 FROM public.ranqueada_elo_partida WHERE desafio_id = p_desafio_id) THEN
    RETURN 0;
  END IF;

  -- Quem joga: aceito e respondeu, nas duas equipes. É o mesmo corte dos eventos do desafio.
  SELECT array_agg(pl.aluno_id ORDER BY pl.aluno_id), array_agg(pl.equipe ORDER BY pl.aluno_id)
    INTO v_ids, v_equipes
    FROM public.fn_arena_placar(p_desafio_id) pl
   WHERE pl.estado = 'aceito' AND pl.respondidas > 0 AND pl.equipe IN (1, 2);

  IF v_ids IS NULL OR NOT (1::smallint = ANY (v_equipes)) OR NOT (2::smallint = ANY (v_equipes)) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.ranqueada_elo (classe_id, aluno_id, rating)
  SELECT p_classe_id, j.aluno_id, v_inicial FROM unnest(v_ids, v_equipes) AS j(aluno_id, equipe)
  ON CONFLICT (classe_id, aluno_id) DO NOTHING;

  -- Trava em ordem fixa: dois desafios com jogadores em comum fechando juntos não se cruzam.
  PERFORM 1 FROM public.ranqueada_elo e
    JOIN unnest(v_ids, v_equipes) AS j(aluno_id, equipe) ON j.aluno_id = e.aluno_id
   WHERE e.classe_id = p_classe_id
   ORDER BY e.aluno_id
     FOR UPDATE OF e;

  SELECT avg(e.rating) FILTER (WHERE j.equipe = 1), avg(e.rating) FILTER (WHERE j.equipe = 2)
    INTO v_r1, v_r2
    FROM unnest(v_ids, v_equipes) AS j(aluno_id, equipe)
    JOIN public.ranqueada_elo e ON e.classe_id = p_classe_id AND e.aluno_id = j.aluno_id;

  v_e1 := 1 / (1 + power(10::numeric, (v_r2 - v_r1) / 400));
  v_s1 := CASE WHEN p_vencedor IS NULL THEN 0.5 WHEN p_vencedor = 1 THEN 1 ELSE 0 END;

  WITH conta AS (
    SELECT j.aluno_id, j.equipe, e.rating,
           CASE WHEN e.partidas < v_np THEN v_kp ELSE v_k END AS k,
           CASE WHEN j.equipe = 1 THEN v_s1 ELSE 1 - v_s1 END AS s,
           CASE WHEN j.equipe = 1 THEN v_e1 ELSE 1 - v_e1 END AS esperado
      FROM unnest(v_ids, v_equipes) AS j(aluno_id, equipe)
      JOIN public.ranqueada_elo e ON e.classe_id = p_classe_id AND e.aluno_id = j.aluno_id
  ), gravada AS (
    INSERT INTO public.ranqueada_elo_partida
      (desafio_id, aluno_id, classe_id, equipe, resultado, rating_antes, k, delta, rating_depois)
    SELECT p_desafio_id, c.aluno_id, p_classe_id, c.equipe,
           CASE WHEN c.s = 1 THEN 'vitoria' WHEN c.s = 0 THEN 'derrota' ELSE 'empate' END,
           c.rating, c.k,
           round(c.k * (c.s - c.esperado))::integer,
           c.rating + round(c.k * (c.s - c.esperado))::integer
      FROM conta c
    ON CONFLICT (desafio_id, aluno_id) DO NOTHING
    RETURNING aluno_id, resultado, rating_depois
  )
  UPDATE public.ranqueada_elo e
     SET rating = g.rating_depois,
         partidas = e.partidas + 1,
         vitorias = e.vitorias + (g.resultado = 'vitoria')::integer,
         empates = e.empates + (g.resultado = 'empate')::integer,
         derrotas = e.derrotas + (g.resultado = 'derrota')::integer,
         atualizado_em = now()
    FROM gravada g
   WHERE e.classe_id = p_classe_id AND e.aluno_id = g.aluno_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN v_n;
END
$function$;
REVOKE ALL ON FUNCTION fn_elo_aplicar(uuid,bigint,smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_elo_aplicar(uuid,bigint,smallint) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_evento_creditado(p_tipo text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(
    starts_with(lower(p_tipo), 'presenca')
    OR starts_with(lower(p_tipo), 'participacao')
    OR starts_with(lower(p_tipo), 'conquista')
    OR starts_with(lower(p_tipo), 'nota_professor')
    OR starts_with(lower(p_tipo), 'meta_atingida')
    OR starts_with(lower(p_tipo), 'evento_classe'),
    false
  );
$function$;
REVOKE ALL ON FUNCTION fn_evento_creditado(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_evento_creditado(text) TO anon;
GRANT EXECUTE ON FUNCTION fn_evento_creditado(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_evento_creditado(text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_evento_de_conclusao(p_tipo text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
          SELECT COALESCE(p_tipo, '') IN (
            'conteudo_concluido',
            'atividade_concluida',
            'atividade_acertada',
            -- Caminho personalizado. So' entra junto com a referencia `item:`,
            -- senao a dedup seria por topico e quatro acertos pagariam um.
            'topico_atividade_concluida',
            'topico_atividade_acertada'
          );
        $function$;
REVOKE ALL ON FUNCTION fn_evento_de_conclusao(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_evento_de_conclusao(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_evento_de_conclusao(text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_evento_duelo_cobrar(p_desafio_id uuid, p_aluno uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_evento uuid;
BEGIN
  SELECT d.evento_id INTO v_evento FROM public.guilda_desafios d WHERE d.id = p_desafio_id;
  IF v_evento IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.eventos_classe e
     WHERE e.id = v_evento AND e.status = 'aberto' AND e.inicio <= now() AND e.fim > now()
  ) THEN
    RAISE EXCEPTION 'evento_duelo_evento_fechado' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.evento_inscricoes i WHERE i.evento_id = v_evento AND i.aluno_id = p_aluno
  ) THEN
    RAISE EXCEPTION 'evento_duelo_sem_inscricao' USING ERRCODE = '22023';
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION fn_evento_duelo_cobrar(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_evento_duelo_cobrar(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_referencia_id(p_referencia text)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_referencia IS NULL THEN NULL
    WHEN btrim(p_referencia) ~ '^[0-9]+$' THEN btrim(p_referencia)::bigint
    WHEN btrim(p_referencia) ~ '^.*:[0-9]+$'
      THEN substring(btrim(p_referencia) FROM '([0-9]+)$')::bigint
    ELSE NULL
  END;
$function$;
REVOKE ALL ON FUNCTION fn_eventos_aluno_referencia_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_eventos_aluno_referencia_id(text) TO anon;
GRANT EXECUTE ON FUNCTION fn_eventos_aluno_referencia_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_eventos_aluno_referencia_id(text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_resolve_classe_id(p_tipo text, p_referencia text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
          WITH ref AS (
            SELECT public.fn_eventos_aluno_referencia_id(p_referencia) AS ref_id,
                   TRIM(BOTH FROM COALESCE(p_referencia, ''::text))    AS bruta
          ), alvo AS (
            SELECT ref.ref_id,
                   ref.bruta,
                   COALESCE(
                     CASE WHEN position(':' in ref.bruta) > 0 THEN
                       CASE lower(split_part(ref.bruta, ':', 1))
                         WHEN 'topico' THEN 'topico'
                         WHEN 'topic' THEN 'topico'
                         WHEN 'conteudo' THEN 'conteudo'
                         WHEN 'content' THEN 'conteudo'
                         WHEN 'atividade' THEN 'atividade'
                         WHEN 'activity' THEN 'atividade'
                         WHEN 'classe' THEN 'classe'
                         WHEN 'class' THEN 'classe'
                         WHEN 'conquista' THEN 'conquista'
                         -- `item:<topico_id>:<chave>` -- atividade personalizada,
                         -- que nao tem linha em `atividades`. Resolve a classe
                         -- pelo topico do segundo segmento.
                         WHEN 'item' THEN 'item'
                         ELSE NULL::text
                       END
                     END,
                     CASE
                       WHEN starts_with(lower(COALESCE(p_tipo, ''::text)), 'topico') THEN 'topico'
                       WHEN starts_with(lower(COALESCE(p_tipo, ''::text)), 'conteudo') THEN 'conteudo'
                       WHEN starts_with(lower(COALESCE(p_tipo, ''::text)), 'atividade') THEN 'atividade'
                       ELSE NULL::text
                     END
                   ) AS entidade
              FROM ref
          ), com_classe AS (
            -- `classe:<id>:<data>` e `item:<topico>:<chave>`: o id e' o SEGUNDO
            -- segmento, por construcao. Tirar os digitos do fim (que e' o que
            -- `fn_eventos_aluno_referencia_id` faz) devolveria a data ou a
            -- chave, e classe nula tira o evento do rank.
            SELECT alvo.*,
                   CASE
                     WHEN alvo.entidade IN ('classe', 'item') THEN
                       NULLIF(regexp_replace(split_part(alvo.bruta, ':', 2), '[^0-9]', '', 'g'), '')::bigint
                     ELSE alvo.ref_id
                   END AS id_alvo
              FROM alvo
          )
          SELECT COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, t_i.classe_id, cl.id)
          FROM com_classe
          LEFT JOIN public.topicos t    ON com_classe.entidade = 'topico'    AND t.id = com_classe.id_alvo
          LEFT JOIN public.conteudos c  ON com_classe.entidade = 'conteudo'  AND c.id = com_classe.id_alvo
          LEFT JOIN public.topicos t_c  ON t_c.id = c.topico_id
          LEFT JOIN public.atividades a ON com_classe.entidade = 'atividade' AND a.id = com_classe.id_alvo
          LEFT JOIN public.topicos t_a  ON t_a.id = a.topico_id
          LEFT JOIN public.topicos t_i  ON com_classe.entidade = 'item'      AND t_i.id = com_classe.id_alvo
          LEFT JOIN public.classe cl    ON com_classe.entidade = 'classe'    AND cl.id = com_classe.id_alvo;
        $function$;
REVOKE ALL ON FUNCTION fn_eventos_aluno_resolve_classe_id(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_eventos_aluno_resolve_classe_id(text,text) TO anon;
GRANT EXECUTE ON FUNCTION fn_eventos_aluno_resolve_classe_id(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_eventos_aluno_resolve_classe_id(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_fator_de_aposta(p_referencia text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id text;
  v_dificuldade text;
BEGIN
  v_id := NULLIF(
    substring(TRIM(BOTH FROM COALESCE(p_referencia, '')) from 'desafio:([0-9a-fA-F-]{36})$'),
    ''
  );
  IF v_id IS NULL THEN
    RETURN 1;
  END IF;

  -- Comparacao por texto, nao cast para uuid: 36 caracteres do alfabeto do uuid podem nao
  -- formar um uuid valido, e o cast levantaria dentro do gatilho de pontuacao.
  SELECT d.dificuldade INTO v_dificuldade
    FROM public.guilda_desafios d WHERE d.id::text = v_id;

  IF v_dificuldade IS NULL THEN
    RETURN 1;
  END IF;

  RETURN public.app_desafio_aposta_fator(v_dificuldade);
END;
$function$;
REVOKE ALL ON FUNCTION fn_fator_de_aposta(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_fator_de_aposta(text) TO anon;
GRANT EXECUTE ON FUNCTION fn_fator_de_aposta(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_fator_de_aposta(text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_fator_de_atraso(p_aluno uuid, p_referencia text, p_quando timestamp with time zone)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_atividade bigint;
  v_prazo timestamptz;
BEGIN
  -- Quem decide se ha prazo e a REFERENCIA, nao o tipo do evento. Conteudo,
  -- topico e o UUID do ciclo caem fora aqui e nem chegam a consultar
  -- `atividades`.
  v_atividade := NULLIF(
    substring(COALESCE(p_referencia, '') from '^atividade:([0-9]+)$'),
    ''
  )::bigint;

  IF v_atividade IS NULL THEN
    RETURN 1;
  END IF;

  v_prazo := public.fn_prazo_efetivo(p_aluno, v_atividade);

  -- Sem prazo marcado nao ha atraso -- que e o caso das 248 atividades desta
  -- base. Entregue dentro do prazo tambem paga cheio.
  IF v_prazo IS NULL OR p_quando IS NULL OR p_quando <= v_prazo THEN
    RETURN 1;
  END IF;

  RETURN public.app_prazo_atraso_fator();
END;
$function$;
REVOKE ALL ON FUNCTION fn_fator_de_atraso(uuid,text,timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_fator_de_atraso(uuid,text,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_fator_de_atraso(uuid,text,timestamp with time zone) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_levenshtein(p_a text, p_b text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_a text[] := regexp_split_to_array(p_a, '');
  v_b text[] := regexp_split_to_array(p_b, '');
  v_la integer := COALESCE(array_length(v_a, 1), 0);
  v_lb integer := COALESCE(array_length(v_b, 1), 0);
  v_ant integer[];
  v_atual integer[];
  i integer;
  j integer;
BEGIN
  IF p_a = p_b THEN RETURN 0; END IF;
  IF v_la = 0 THEN RETURN v_lb; END IF;
  IF v_lb = 0 THEN RETURN v_la; END IF;
  v_ant := ARRAY(SELECT generate_series(0, v_lb));
  FOR i IN 1 .. v_la LOOP
    v_atual := array_fill(0, ARRAY[v_lb + 1]);
    v_atual[1] := i;
    FOR j IN 1 .. v_lb LOOP
      v_atual[j + 1] := least(v_ant[j + 1] + 1, v_atual[j] + 1,
                              v_ant[j] + CASE WHEN v_a[i] = v_b[j] THEN 0 ELSE 1 END);
    END LOOP;
    v_ant := v_atual;
  END LOOP;
  RETURN v_ant[v_lb + 1];
END;
$function$;
REVOKE ALL ON FUNCTION fn_levenshtein(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_levenshtein(text,text) TO anon;
GRANT EXECUTE ON FUNCTION fn_levenshtein(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_levenshtein(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_pontos_do_evento(p_tipo text)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Tipo desconhecido vale zero: o evento fica registrado, mas nao pontua.
  SELECT COALESCE(
    (SELECT pontos FROM public.eventos_pontuacao WHERE tipo = p_tipo),
    0
  );
$function$;
REVOKE ALL ON FUNCTION fn_pontos_do_evento(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_pontos_do_evento(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_pontos_do_evento(text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_prazo_efetivo(p_aluno uuid, p_atividade bigint)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    p.prazo_efetivo,
    CASE WHEN a.data_entrega IS NOT NULL AND COALESCE(p.dias_extras, 0) > 0
         THEN a.data_entrega + make_interval(days => p.dias_extras) END,
    a.data_entrega
  )
    FROM public.atividades a
    LEFT JOIN public.atividade_prazo_aluno p
      ON p.atividade_id = a.id AND p.aluno_id = p_aluno
   WHERE a.id = p_atividade;
$function$;
REVOKE ALL ON FUNCTION fn_prazo_efetivo(uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_prazo_efetivo(uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_prazo_efetivo(uuid,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_questao_confere(p_questao_id bigint, p_resposta text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gabarito text; v_alts jsonb; v_tipo text; v_tipo_atividade text; v_resp text; v_gab text;
  v_i integer; v_texto text; v_aceitas text[]; v_dissertativa boolean;
  v_formato text; v_lacuna_rica boolean;
BEGIN
  SELECT g.resposta_correta, q.alternativas, q.tipo, lower(btrim(COALESCE(a.tipo::text, ''))),
         q.formato_texto
    INTO v_gabarito, v_alts, v_tipo, v_tipo_atividade, v_formato
    FROM public.questoes q
    LEFT JOIN public.questao_gabarito g ON g.questao_id = q.id
    LEFT JOIN public.atividades a ON a.id = q.atividade_id
   WHERE q.id = p_questao_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Múltipla escolha rica: pela posição (`20261108_03`). O texto comparável empata
  -- \ce{CO} com \ce{Co}.
  IF v_formato = 'rico' AND jsonb_typeof(v_alts) = 'array' AND jsonb_array_length(v_alts) > 0
     AND (public.fn_texto_comparavel(COALESCE(v_tipo, '')) IN ('multipla', 'multipla_escolha', 'multipla escolha', 'quiz')
          OR (v_tipo IS NULL AND v_tipo_atividade IN ('quiz', 'multipla', 'multipla_escolha'))) THEN
    RETURN public.fn_questao_posicao_rica(v_alts, p_resposta) IS NOT NULL
       AND public.fn_questao_posicao_rica(v_alts, p_resposta) = public.fn_questao_posicao_rica(v_alts, v_gabarito);
  END IF;

  -- Dissertativa e lacuna: a tolerância do app (`20261108_01`). O tipo vale da questão ou da
  -- atividade, como em QuestionActivity.
  v_dissertativa := lower(btrim(COALESCE(v_tipo, ''))) IN ('dissertativa', 'aberta', 'texto_livre', 'ensaio', 'essay', 'questao_aberta', 'questao aberta', 'open', 'open_ended', 'open-ended', 'open_text', 'open text')
                    OR v_tipo_atividade IN ('dissertativa', 'aberta', 'texto_livre', 'ensaio', 'essay', 'questao_aberta', 'questao aberta', 'open', 'open_ended', 'open-ended', 'open_text', 'open text');
  IF v_dissertativa
     OR lower(btrim(COALESCE(v_tipo, ''))) IN ('fill_blank', 'fili_blank', 'fill in the blank', 'fill-in-the-blank', 'fillblank', 'completar_lacuna', 'completar lacuna', 'lacuna')
     OR v_tipo_atividade IN ('fill_blank', 'fili_blank', 'fill in the blank', 'fill-in-the-blank', 'fillblank', 'completar_lacuna', 'completar lacuna', 'lacuna') THEN
    -- Lacuna rica (`20261108_03`): fn_texto_estrito tira todo símbolo, e a+b viraria a-b.
    v_lacuna_rica := v_formato = 'rico' AND NOT v_dissertativa;
    IF v_lacuna_rica THEN
      IF public.fn_texto_rico_comparavel(p_resposta) = '' THEN RETURN false; END IF;
      RETURN EXISTS (SELECT 1 FROM unnest(public.fn_questao_respostas_aceitas(v_gabarito)) AS x
                      WHERE public.fn_texto_rico_comparavel(x) <> ''
                        AND public.fn_texto_rico_comparavel(x) = public.fn_texto_rico_comparavel(p_resposta));
    END IF;
    IF public.fn_texto_estrito(p_resposta) = '' THEN RETURN false; END IF;
    v_aceitas := ARRAY(SELECT x FROM unnest(public.fn_questao_respostas_aceitas(v_gabarito)) AS x
                        WHERE public.fn_texto_estrito(x) <> '');
    -- Sem resposta esperada, o app aceita a dissertativa e recusa a lacuna.
    IF cardinality(v_aceitas) = 0 THEN RETURN v_dissertativa; END IF;
    RETURN EXISTS (SELECT 1 FROM unnest(v_aceitas) AS x WHERE public.fn_texto_parecido(p_resposta, x));
  END IF;

  -- Daqui para baixo, o corpo de produção de 07/11, com 'yes'/'no' a mais no V/F (como o app).
  IF v_gabarito IS NULL THEN RETURN false; END IF;
  IF public.fn_texto_comparavel(COALESCE(v_tipo,'')) IN ('associacao','ordenacao','multipla_resposta') THEN
    RETURN public.fn_questao_confere_lista(v_tipo, v_gabarito, p_resposta);
  END IF;
  v_resp := public.fn_texto_comparavel(p_resposta);
  IF v_resp = '' THEN RETURN false; END IF;
  v_gab := public.fn_texto_comparavel(v_gabarito);
  IF v_resp = v_gab THEN RETURN true; END IF;
  IF v_resp IN ('v','true','verdadeiro','sim','certo','yes') AND v_gab IN ('v','true','verdadeiro','sim','certo','yes') THEN RETURN true; END IF;
  IF v_resp IN ('f','false','falso','nao','errado','no') AND v_gab IN ('f','false','falso','nao','errado','no') THEN RETURN true; END IF;
  IF jsonb_typeof(v_alts) = 'array' THEN
    FOR v_i IN 0 .. jsonb_array_length(v_alts) - 1 LOOP
      v_texto := public.fn_texto_comparavel(v_alts ->> v_i);
      IF v_texto = '' THEN CONTINUE; END IF;
      IF v_resp = v_texto OR v_resp = v_i::text OR v_resp = lower(chr(65 + v_i)) THEN
        IF v_gab = v_texto OR v_gab = v_i::text OR v_gab = lower(chr(65 + v_i)) THEN RETURN true; END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$function$;
REVOKE ALL ON FUNCTION fn_questao_confere(bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_questao_confere(bigint,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_questao_confere_lista(p_tipo text, p_gabarito text, p_resposta text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gab text[] := public.fn_questao_resposta_em_lista(p_gabarito);
  v_resp text[] := public.fn_questao_resposta_em_lista(p_resposta);
  v_tipo text := public.fn_texto_comparavel(COALESCE(p_tipo, ''));
BEGIN
  IF cardinality(v_gab) = 0 OR cardinality(v_resp) = 0 THEN RETURN false; END IF;
  IF v_tipo = 'ordenacao' THEN RETURN v_gab = v_resp; END IF;
  RETURN cardinality(v_gab) = cardinality(v_resp)
     AND NOT EXISTS (SELECT unnest(v_gab) EXCEPT SELECT unnest(v_resp))
     AND NOT EXISTS (SELECT unnest(v_resp) EXCEPT SELECT unnest(v_gab));
END; $function$;
REVOKE ALL ON FUNCTION fn_questao_confere_lista(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_questao_confere_lista(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_questao_confere_lista(text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_questao_corrigida_por_ia(p_questao_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.fn_questao_e_dissertativa(p_questao_id)
      OR EXISTS (SELECT 1 FROM public.questoes q WHERE q.id = p_questao_id AND q.tipo = 'codigo');
$function$;
REVOKE ALL ON FUNCTION fn_questao_corrigida_por_ia(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_questao_corrigida_por_ia(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_questao_e_dissertativa(p_questao_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(bool_or(lower(btrim(COALESCE(q.tipo::text, ''))) IN ('dissertativa', 'aberta', 'texto_livre', 'ensaio', 'essay', 'questao_aberta', 'questao aberta', 'open', 'open_ended', 'open-ended', 'open_text', 'open text')
                          OR lower(btrim(COALESCE(a.tipo::text, ''))) IN ('dissertativa', 'aberta', 'texto_livre', 'ensaio', 'essay', 'questao_aberta', 'questao aberta', 'open', 'open_ended', 'open-ended', 'open_text', 'open text')), false)
    FROM public.questoes q
    LEFT JOIN public.atividades a ON a.id = q.atividade_id
   WHERE q.id = p_questao_id;
$function$;
REVOKE ALL ON FUNCTION fn_questao_e_dissertativa(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_questao_e_dissertativa(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_questao_liberada(p_questao_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.fn_questao_liberada_para(auth.uid(), p_questao_id);
$function$;
REVOKE ALL ON FUNCTION fn_questao_liberada(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_questao_liberada(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_questao_liberada(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_questao_liberada_para(p_aluno uuid, p_questao_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.questoes q
      JOIN public.atividades a ON a.id = q.atividade_id
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE q.id = p_questao_id
       AND EXISTS (
         SELECT 1 FROM public.classe_aluno ca
          WHERE ca.aluno_id = p_aluno AND ca.classe_id = t.classe_id
       )
       AND (
         EXISTS (
           SELECT 1 FROM public.questao_aluno qa
            WHERE qa.aluno_id = p_aluno AND qa.questao_id = q.id
         )
         OR EXISTS (
           SELECT 1 FROM public.atividade_aluno aa
            WHERE aa.aluno_id = p_aluno AND aa.atividade_id = a.id
              AND (COALESCE(aa.percentual_concluido, 0) > 0
                   OR lower(COALESCE(aa.status::text, ''))
                      IN ('em andamento', 'concluido', 'concluida'))
         )
         OR EXISTS (
           SELECT 1 FROM public.topico_aluno ta
            WHERE ta.aluno_id = p_aluno AND ta.topico_id = t.id
              AND (COALESCE(ta.percentual_concluido, 0) > 0
                   OR lower(COALESCE(ta.status::text, ''))
                      IN ('em andamento', 'concluido', 'concluida'))
         )
       )
  );
$function$;
REVOKE ALL ON FUNCTION fn_questao_liberada_para(uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_questao_liberada_para(uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_questao_liberada_para(uuid,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_questao_peso_dificuldade(p_nivel text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE lower(COALESCE(NULLIF(btrim(COALESCE(p_nivel, '')), ''), 'media'))
           WHEN 'facil'   THEN 1
           WHEN 'media'   THEN 2
           WHEN 'dificil' THEN 3
           -- Nivel desconhecido (coluna aberta por migracao futura) cai no meio pelo mesmo
           -- motivo do NULL: nao inventa ordem para o que nao sabe.
           ELSE 2
         END;
$function$;
REVOKE ALL ON FUNCTION fn_questao_peso_dificuldade(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_questao_peso_dificuldade(text) TO anon;
GRANT EXECUTE ON FUNCTION fn_questao_peso_dificuldade(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_questao_peso_dificuldade(text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_questao_posicao_rica(p_alts jsonb, p_valor text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_valor text := btrim(COALESCE(p_valor, ''));
  v_n integer := CASE WHEN jsonb_typeof(p_alts) = 'array' THEN jsonb_array_length(p_alts) ELSE 0 END;
  v_achadas integer[];
  i integer;
BEGIN
  IF v_valor = '' OR v_n = 0 THEN RETURN NULL; END IF;
  FOR i IN 0 .. v_n - 1 LOOP
    IF btrim(p_alts ->> i) = v_valor THEN RETURN i; END IF;
  END LOOP;
  IF v_valor ~* '^[a-z]$' AND ascii(lower(v_valor)) - 97 < v_n THEN
    RETURN ascii(lower(v_valor)) - 97;
  END IF;
  IF v_valor ~ '^[0-9]+$' AND length(v_valor) <= 4 AND v_valor::integer < v_n THEN
    RETURN v_valor::integer;
  END IF;
  v_achadas := ARRAY(
    SELECT k - 1 FROM generate_series(1, v_n) AS k
     WHERE public.fn_texto_comparavel(p_alts ->> (k - 1)) = public.fn_texto_comparavel(v_valor)
  );
  IF cardinality(v_achadas) = 1 THEN RETURN v_achadas[1]; END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION fn_questao_posicao_rica(jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_questao_posicao_rica(jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_questao_resposta_em_lista(p_valor text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_json jsonb; v_saida text[];
BEGIN
  IF p_valor IS NULL OR btrim(p_valor) = '' THEN RETURN ARRAY[]::text[]; END IF;
  BEGIN v_json := p_valor::jsonb; EXCEPTION WHEN OTHERS THEN v_json := NULL; END;
  IF v_json IS NOT NULL AND jsonb_typeof(v_json) = 'array' THEN
    SELECT array_agg(item ORDER BY ord) INTO v_saida FROM (
      SELECT ord, CASE
        WHEN jsonb_typeof(e.valor) = 'array' THEN
          public.fn_texto_comparavel(e.valor ->> 0) || '=>' || public.fn_texto_comparavel(e.valor ->> 1)
        WHEN jsonb_typeof(e.valor) = 'object' THEN
          public.fn_texto_comparavel(COALESCE(e.valor ->> 'termo', e.valor ->> 'esquerda', e.valor ->> 'chave'))
          || '=>' || public.fn_texto_comparavel(COALESCE(e.valor ->> 'definicao', e.valor ->> 'direita', e.valor ->> 'valor'))
        ELSE public.fn_texto_comparavel(e.valor #>> '{}') END AS item
        FROM jsonb_array_elements(v_json) WITH ORDINALITY AS e(valor, ord)) x
     WHERE x.item <> '' AND x.item <> '=>';
    RETURN COALESCE(v_saida, ARRAY[]::text[]);
  END IF;
  SELECT array_agg(public.fn_texto_comparavel(parte) ORDER BY ord) INTO v_saida FROM (
    SELECT parte, ord FROM regexp_split_to_table(p_valor, '\|') WITH ORDINALITY AS t(parte, ord)) y
   WHERE public.fn_texto_comparavel(parte) <> '';
  RETURN COALESCE(v_saida, ARRAY[]::text[]);
END; $function$;
REVOKE ALL ON FUNCTION fn_questao_resposta_em_lista(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_questao_resposta_em_lista(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_questao_resposta_em_lista(text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_questao_respostas_aceitas(p_gabarito text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_json jsonb;
  v_saida text[];
BEGIN
  IF p_gabarito IS NULL OR btrim(p_gabarito) = '' THEN RETURN ARRAY[]::text[]; END IF;
  BEGIN
    v_json := p_gabarito::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_json := NULL;
  END;
  IF v_json IS NOT NULL AND jsonb_typeof(v_json) IN ('array', 'object') THEN
    RETURN public.fn_questao_respostas_aceitas_json(v_json);
  END IF;
  SELECT COALESCE(array_agg(btrim(t.parte) ORDER BY t.ordem), ARRAY[]::text[])
    INTO v_saida
    FROM regexp_split_to_table(p_gabarito, '[|;\n]') WITH ORDINALITY AS t(parte, ordem)
   WHERE btrim(t.parte) <> '';
  RETURN v_saida;
END;
$function$;
REVOKE ALL ON FUNCTION fn_questao_respostas_aceitas(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_questao_respostas_aceitas(text) TO anon;
GRANT EXECUTE ON FUNCTION fn_questao_respostas_aceitas(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_questao_respostas_aceitas(text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_questao_respostas_aceitas_json(p_valor jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_saida text[] := ARRAY[]::text[];
  v_item jsonb;
BEGIN
  IF p_valor IS NULL THEN RETURN v_saida; END IF;
  CASE jsonb_typeof(p_valor)
    WHEN 'array' THEN
      FOR v_item IN SELECT e FROM jsonb_array_elements(p_valor) AS e LOOP
        v_saida := v_saida || public.fn_questao_respostas_aceitas_json(v_item);
      END LOOP;
      RETURN v_saida;
    WHEN 'object' THEN
      RETURN public.fn_questao_respostas_aceitas_json(COALESCE(
        p_valor -> 'acceptedAnswers', p_valor -> 'answers', p_valor -> 'respostas',
        p_valor -> 'alternativas', p_valor -> 'value'));
    WHEN 'null' THEN
      RETURN v_saida;
    ELSE
      RETURN public.fn_questao_respostas_aceitas(p_valor #>> '{}');
  END CASE;
END;
$function$;
REVOKE ALL ON FUNCTION fn_questao_respostas_aceitas_json(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_questao_respostas_aceitas_json(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION fn_questao_respostas_aceitas_json(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_questao_respostas_aceitas_json(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_texto_comparavel(p_texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT btrim(lower(translate(
    COALESCE(p_texto, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  )));
$function$;
REVOKE ALL ON FUNCTION fn_texto_comparavel(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_texto_comparavel(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_texto_comparavel(text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_texto_estrito(p_texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT btrim(regexp_replace(regexp_replace(
    translate(lower(COALESCE(p_texto, '')),
              'áàâãäåéèêëíìîïóòôõöúùûüçñý', 'aaaaaaeeeeiiiiooooouuuucny'),
    '[^a-z0-9[:space:]]', ' ', 'g'), '[[:space:]]+', ' ', 'g'));
$function$;
REVOKE ALL ON FUNCTION fn_texto_estrito(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_texto_estrito(text) TO anon;
GRANT EXECUTE ON FUNCTION fn_texto_estrito(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_texto_estrito(text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_texto_parecido(p_entrada text, p_esperado text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_e text := public.fn_texto_estrito(p_entrada);
  v_g text := public.fn_texto_estrito(p_esperado);
  v_le integer := char_length(v_e);
  v_lg integer := char_length(v_g);
  v_max integer := greatest(v_le, v_lg);
BEGIN
  IF v_e = '' OR v_g = '' THEN RETURN false; END IF;
  IF v_e = v_g THEN RETURN true; END IF;
  IF (strpos(v_e, v_g) > 0 OR strpos(v_g, v_e) > 0) AND least(v_le, v_lg) >= 4 THEN
    RETURN true;
  END IF;
  -- A distância é pelo menos a diferença de tamanho: se ela já passa do limite, nem calcula.
  IF 1 - abs(v_le - v_lg)::numeric / v_max < 0.82 THEN RETURN false; END IF;
  RETURN 1 - public.fn_levenshtein(v_e, v_g)::numeric / v_max >= 0.82;
END;
$function$;
REVOKE ALL ON FUNCTION fn_texto_parecido(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_texto_parecido(text,text) TO anon;
GRANT EXECUTE ON FUNCTION fn_texto_parecido(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_texto_parecido(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_texto_rico_comparavel(p_texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT regexp_replace(
    replace(replace(replace(replace(replace(COALESCE(p_texto, ''), '\(', ''), '\)', ''), '\[', ''), '\]', ''), '$', ''),
    '[[:space:]]+', '', 'g');
$function$;
REVOKE ALL ON FUNCTION fn_texto_rico_comparavel(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_texto_rico_comparavel(text) TO service_role;

CREATE OR REPLACE FUNCTION public.guilda_bloqueio_ativo(p_one uuid, p_two uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.social_relacionamentos
    WHERE aluno_a_id = LEAST(p_one,p_two) AND aluno_b_id = GREATEST(p_one,p_two) AND status = 'blocked')
$function$;
REVOKE ALL ON FUNCTION guilda_bloqueio_ativo(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guilda_bloqueio_ativo(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.guilda_desafio_criar(p_guilda_id uuid, p_modo text DEFAULT 'todos'::text, p_quantidade integer DEFAULT 3, p_dificuldade text DEFAULT 'normal'::text, p_consequencia text DEFAULT 'ranqueada'::text, p_formato text DEFAULT 'guilda'::text, p_aliado uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_g public.guildas%ROWTYPE;
  v_id uuid;
  v_qids bigint[];
  v_q bigint;
  v_i integer := 0;
  v_modo text := lower(btrim(COALESCE(p_modo, 'todos')));
  v_dif text := lower(btrim(COALESCE(p_dificuldade, 'normal')));
  v_cons text := lower(btrim(COALESCE(p_consequencia, 'ranqueada')));
  v_formato text := lower(btrim(COALESCE(p_formato, 'guilda')));
  v_params jsonb;
  v_jogadores integer;
BEGIN
  SELECT * INTO v_g
    FROM public.guildas
   WHERE id = p_guilda_id
     AND ativa
     AND EXISTS (
       SELECT 1 FROM public.guilda_membros
        WHERE guilda_id = p_guilda_id AND aluno_id = auth.uid() AND left_at IS NULL
     );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guilda_desafio_invalido';
  END IF;

  IF v_modo NOT IN ('todos', 'velocidade', 'precisao') THEN
    -- A lista e a da TABELA (`guilda_desafios_modo_check`). A da fase 7 incluia `duelo` e
    -- `duplo`, que a tabela recusa: pedi-los passava a validacao e estourava 23514 no INSERT.
    RAISE EXCEPTION 'guilda_desafio_invalido';
  END IF;
  IF v_formato NOT IN ('guilda', 'dupla', 'solo', 'turma') THEN
    RAISE EXCEPTION 'guilda_desafio_formato_invalido';
  END IF;
  IF v_formato = 'dupla' THEN
    -- Sem aliado, `dupla` seria `solo` com outro nome. Recusa alto em vez de criar errado.
    IF p_aliado IS NULL THEN
      RAISE EXCEPTION 'guilda_desafio_aliado_obrigatorio';
    END IF;
    IF p_aliado = auth.uid() THEN
      RAISE EXCEPTION 'guilda_desafio_aliado_invalido';
    END IF;
    IF NOT public.guilda_e_colega(p_aliado, v_g.classe_id) THEN
      RAISE EXCEPTION 'guilda_desafio_aliado_fora_da_turma';
    END IF;
  ELSIF p_aliado IS NOT NULL THEN
    -- Aliado em formato que nao o usa: recusa, para nao ser ignorado em silencio.
    RAISE EXCEPTION 'guilda_desafio_aliado_invalido';
  END IF;
  IF v_dif NOT IN ('normal', 'dificil') THEN
    RAISE EXCEPTION 'guilda_desafio_dificuldade_invalida';
  END IF;
  IF v_cons NOT IN ('treino', 'ranqueada', 'evento') THEN
    RAISE EXCEPTION 'guilda_desafio_consequencia_invalida';
  END IF;

  IF v_dif = 'dificil' THEN
    SELECT array_agg(s.id ORDER BY s.preferida DESC, random()) INTO v_qids
      FROM (
        SELECT q.id,
               public.fn_questao_peso_dificuldade(q.dificuldade)
                 >= public.fn_questao_peso_dificuldade(
                      (SELECT valor FROM public.app_config WHERE chave = 'desafio_dificuldade_min')
                    ) AS preferida
          FROM public.questoes q
          JOIN public.atividades a ON a.id = q.atividade_id
          JOIN public.topicos t ON t.id = a.topico_id
         WHERE t.classe_id = v_g.classe_id AND public.fn_questao_liberada(q.id)
      ) s;
  ELSE
    SELECT array_agg(id ORDER BY random()) INTO v_qids FROM (
      SELECT q.id FROM public.questoes q
        JOIN public.atividades a ON a.id = q.atividade_id
        JOIN public.topicos t ON t.id = a.topico_id
       WHERE t.classe_id = v_g.classe_id AND public.fn_questao_liberada(q.id) LIMIT 30) s;
  END IF;
  IF COALESCE(array_length(v_qids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'guilda_sem_questoes_liberadas';
  END IF;
  v_qids := v_qids[1:GREATEST(1, LEAST(p_quantidade, 10))];

  INSERT INTO public.guilda_desafios (
    guilda_id, classe_id, criado_por, formato, modo, titulo, configuracao,
    dificuldade, consequencia
  ) VALUES (
    -- `guilda_desafios_guilda_do_formato` exige `(formato = 'guilda') = (guilda_id IS NOT
    -- NULL)`: fora do formato guilda o desafio nasce SEM guilda, e ela fica sendo apenas o
    -- lugar de onde ele foi anunciado.
    CASE WHEN v_formato = 'guilda' THEN p_guilda_id ELSE NULL END,
    v_g.classe_id, auth.uid(), v_formato, v_modo,
    CASE v_formato WHEN 'guilda' THEN 'Desafio da guilda'
                   WHEN 'turma'  THEN 'Desafio da turma'
                   WHEN 'dupla'  THEN 'Desafio em dupla'
                   ELSE 'Desafio solo' END,
    jsonb_build_object('quantidade', array_length(v_qids, 1)),
    v_dif, v_cons
  ) RETURNING id INTO v_id;

  FOREACH v_q IN ARRAY v_qids LOOP
    v_i := v_i + 1;
    INSERT INTO public.guilda_desafio_questoes (desafio_id, questao_id, ordem)
    VALUES (v_id, v_q, v_i);
  END LOOP;

  -- Quem joga, por formato. Todos na EQUIPE 1 e `aceito`: nao existe fluxo de aceite no
  -- caminho vivo (`arena_convite_responder` nao e chamada por cliente nenhum), e com
  -- `convidado` o fechamento automatico da fase 8 -- que conta so `aceito` -- fecharia o
  -- desafio sem o parceiro.
  IF v_formato = 'guilda' THEN
    INSERT INTO public.desafio_participantes (desafio_id, aluno_id, equipe, estado, respondido_em)
    SELECT v_id, m.aluno_id, 1, 'aceito', now()
      FROM public.guilda_membros m
     WHERE m.guilda_id = p_guilda_id AND m.left_at IS NULL AND m.aluno_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  ELSIF v_formato = 'turma' THEN
    INSERT INTO public.desafio_participantes (desafio_id, aluno_id, equipe, estado, respondido_em)
    SELECT v_id, ca.aluno_id, 1, 'aceito', now()
      FROM public.classe_aluno ca
     WHERE ca.classe_id = v_g.classe_id AND ca.aluno_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  ELSIF v_formato = 'dupla' THEN
    INSERT INTO public.desafio_participantes (desafio_id, aluno_id, equipe, estado, respondido_em)
    VALUES (v_id, auth.uid(), 1, 'aceito', now()), (v_id, p_aliado, 1, 'aceito', now())
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.desafio_participantes (desafio_id, aluno_id, equipe, estado, respondido_em)
    VALUES (v_id, auth.uid(), 1, 'aceito', now())
    ON CONFLICT DO NOTHING;
  END IF;
  GET DIAGNOSTICS v_jogadores = ROW_COUNT;

  v_params := public.fn_desafio_params_efetivos(v_dif);

  INSERT INTO public.guilda_mensagens (guilda_id, classe_id, autor_id, tipo, texto, conteudo)
  VALUES (
    p_guilda_id, v_g.classe_id, auth.uid(), 'desafio', 'Um novo desafio foi lançado!',
    jsonb_build_object(
      'id', v_id, 'modo', v_modo, 'quantidade', array_length(v_qids, 1),
      'dificuldade', v_dif, 'consequencia', v_cons, 'params', v_params
    )
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'modo', v_modo,
    'formato', v_formato,
    'quantidade', array_length(v_qids, 1),
    'dificuldade', v_dif,
    'consequencia', v_cons,
    'jogadores', v_jogadores,
    'params', v_params
  );
END
$function$;
REVOKE ALL ON FUNCTION guilda_desafio_criar(uuid,text,integer,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guilda_desafio_criar(uuid,text,integer,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION guilda_desafio_criar(uuid,text,integer,text,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.guilda_desafio_responder(p_desafio_id uuid, p_questao_id bigint, p_resposta text, p_tempo_ms integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_q           public.questoes%ROWTYPE;
  v_d           public.guilda_desafios%ROWTYPE;
  v_tipo        text;
  v_correta     boolean;
  v_limite      integer;
  v_feitas      integer;
  v_tentativas  integer;
  v_total       integer;
  v_faltam      integer;
  v_fechou      jsonb := NULL;
BEGIN
  SELECT d.* INTO v_d
    FROM public.guilda_desafios d
    JOIN public.guilda_desafio_questoes dq ON dq.desafio_id = d.id
   WHERE d.id = p_desafio_id
     AND dq.questao_id = p_questao_id
     -- Participacao, nao pertencimento a guilda: `guilda_id` e NULL em solo, dupla e turma
     -- (`guilda_desafios_guilda_do_formato` obriga), e a guarda por guilda recusava os tres.
     -- Esta pergunta e a mesma que `fn_arena_placar` faz para contar e `fn_desafio_encerrar`
     -- para pagar, entao permissao e placar passam a coincidir.
     AND EXISTS (
       SELECT 1 FROM public.desafio_participantes dp
        WHERE dp.desafio_id = d.id
          AND dp.aluno_id = auth.uid()
          AND dp.estado = 'aceito'
     );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guilda_desafio_sem_permissao';
  END IF;

  -- 20261021_19: desafio com equipe 2 e da arena, e se responde por `arena_responder` (uma
  -- tentativa, espera o convidado). Respondido aqui, fecharia antes de o adversario aceitar.
  IF EXISTS (
    SELECT 1 FROM public.desafio_participantes dp
     WHERE dp.desafio_id = p_desafio_id AND dp.equipe = 2
  ) THEN
    RAISE EXCEPTION 'guilda_desafio_e_da_arena' USING ERRCODE = '22023';
  END IF;

  -- Desafio encerrado nao aceita resposta. Sem isto, responder depois do fechamento
  -- mudaria o placar de um desafio JA PAGO -- e `ON CONFLICT DO NOTHING` no pagamento
  -- impede o acerto de virar premio, entao o aluno perderia o que ganhou sem explicacao.
  IF v_d.status = 'encerrado' THEN
    RAISE EXCEPTION 'guilda_desafio_encerrado' USING ERRCODE = '22023';
  END IF;

  -- LIMITE DE TENTATIVA -- e aqui que `desafio_tentativas_dificil` deixa de ser enfeite do
  -- preset. Conta as tentativas JA feitas nesta questao antes de gravar a nova.
  v_limite := public.fn_app_config_int(
    CASE WHEN lower(COALESCE(v_d.dificuldade, 'normal')) = 'dificil'
         THEN 'desafio_tentativas_dificil' ELSE 'desafio_tentativas_normal' END,
    2);
  SELECT COALESCE(r.tentativas, 0) INTO v_feitas
    FROM public.guilda_desafio_respostas r
   WHERE r.desafio_id = p_desafio_id AND r.questao_id = p_questao_id
     AND r.aluno_id = auth.uid();
  IF COALESCE(v_feitas, 0) >= GREATEST(v_limite, 1) THEN
    RAISE EXCEPTION 'guilda_desafio_sem_tentativas' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_q FROM public.questoes WHERE id = p_questao_id;
  v_tipo := lower(btrim(COALESCE(v_q.tipo::text, '')));
  -- Os dois lados do CASE original eram identicos; a comparacao e a mesma para todo tipo.
  v_correta := lower(btrim(COALESCE(p_resposta, '')))
             = lower(btrim(COALESCE(v_q.resposta_correta::text, '')));

  INSERT INTO public.guilda_desafio_respostas
         (desafio_id, questao_id, aluno_id, resposta, correta, tempo_ms, tentativas)
  VALUES (p_desafio_id, p_questao_id, auth.uid(), p_resposta, v_correta,
          GREATEST(COALESCE(p_tempo_ms, 0), 0), 1)
  ON CONFLICT (desafio_id, questao_id, aluno_id) DO UPDATE
     SET resposta = EXCLUDED.resposta,
         correta = EXCLUDED.correta,
         -- O tempo ACUMULA entre tentativas: quem erra e tenta de novo gastou os dois.
         -- Substituir premiaria a ultima tentativa, que e sempre a mais rapida.
         tempo_ms = COALESCE(public.guilda_desafio_respostas.tempo_ms, 0)
                  + GREATEST(COALESCE(EXCLUDED.tempo_ms, 0), 0),
         tentativas = public.guilda_desafio_respostas.tentativas + 1,
         respondida_em = now()
  RETURNING tentativas INTO v_tentativas;

  -- FECHAMENTO AUTOMATICO: a ultima resposta fecha. Quem conta e o par
  -- (participante aceito x questao do desafio) -- participante que nao respondeu tudo
  -- mantem o desafio aberto, e e para isso que existe a varredura.
  SELECT count(*) INTO v_total
    FROM public.guilda_desafio_questoes WHERE desafio_id = p_desafio_id;

  -- Quem ainda PODE responder, nao quem ainda nao respondeu: a versao anterior fechava o
  -- desafio na primeira resposta de cada um, mesmo errada e com tentativa sobrando, e a
  -- tentativa seguinte batia em `guilda_desafio_encerrado`. Acerto fecha o par na hora.
  SELECT count(*) INTO v_faltam
    FROM public.desafio_participantes dp
    CROSS JOIN public.guilda_desafio_questoes dq
    LEFT JOIN public.guilda_desafio_respostas r
           ON r.desafio_id = p_desafio_id
          AND r.questao_id = dq.questao_id
          AND r.aluno_id = dp.aluno_id
   WHERE dp.desafio_id = p_desafio_id
     AND dq.desafio_id = p_desafio_id
     AND dp.estado = 'aceito'
     AND (
       r.questao_id IS NULL
       -- `v_limite` e o mesmo numero que recusa a tentativa a mais, 20 linhas acima.
       OR (NOT r.correta AND COALESCE(r.tentativas, 0) < GREATEST(v_limite, 1))
     );

  IF v_total > 0 AND v_faltam = 0 THEN
    v_fechou := public.fn_desafio_encerrar(p_desafio_id);
  END IF;

  RETURN jsonb_build_object(
    'correta', v_correta,
    'tentativas', v_tentativas,
    'tentativas_restantes', GREATEST(GREATEST(v_limite, 1) - COALESCE(v_tentativas, 1), 0),
    'faltam', v_faltam,
    'encerrou', v_fechou
  );
END
$function$;
REVOKE ALL ON FUNCTION guilda_desafio_responder(uuid,bigint,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guilda_desafio_responder(uuid,bigint,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION guilda_desafio_responder(uuid,bigint,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.guilda_e_colega(p_aluno uuid, p_classe bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.classe_aluno WHERE aluno_id = p_aluno AND classe_id = p_classe)
$function$;
REVOKE ALL ON FUNCTION guilda_e_colega(uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guilda_e_colega(uuid,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_valor_do_banco()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_piso      numeric;
  v_acumulado numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Resolvida uma vez, aqui. O que o cliente mandar nesta coluna e' ignorado.
    NEW.classe_id := public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia);
  ELSE
    -- Congelada. Nem exclusao de conteudo nem UPDATE do cliente a mudam -- e o
    -- cliente PODE dar UPDATE nos proprios eventos (`eventos_aluno_posse_upd`),
    -- entao sem esta linha ele moveria a pontuacao para a turma que quisesse.
    NEW.classe_id := OLD.classe_id;

    -- O TIPO congela junto, e ANTES do teste de creditado abaixo. E' o tipo que
    -- decide se o valor vem de quem concedeu ou de `fn_pontos_do_evento`, entao
    -- troca-lo no UPDATE era escolher a regra: `fn_evento_creditado` casa por
    -- prefixo, e um `SET tipo = 'participacao_extra', valor = 55555` saia
    -- pago. Restaurar depois do teste nao resolveria -- a linha ja teria
    -- retornado pelo atalho.
    NEW.tipo := OLD.tipo;

    -- Quem concedeu e para quem tambem sao historico: sem isto o aluno se
    -- declara concedido por um professor, ou passa o evento para outro.
    NEW.concedido_por := OLD.concedido_por;
    NEW.aluno_id := OLD.aluno_id;
    NEW.motivo := OLD.motivo;
  END IF;

  -- Creditado tem valor de quem concede: presenca e participacao vem da RPC,
  -- o premio de conquista vem de `conquistas.pontos_recompensa`.
  IF public.fn_evento_creditado(NEW.tipo) THEN
    -- ... e no UPDATE esse valor ja foi decidido, entao e' historico tambem.
    -- Este era o buraco: o atalho devolvia NEW com o `valor` do cliente, e o
    -- rank le exatamente esta coluna.
    IF TG_OP <> 'INSERT' THEN
      NEW.valor := OLD.valor;
    END IF;
    RETURN NEW;
  END IF;

  -- Para todo o resto, o que o cliente mandou em `valor` e' descartado.
  NEW.valor := public.fn_pontos_do_evento(NEW.tipo);

  IF public.fn_evento_de_conclusao(NEW.tipo) THEN
    -- Conclusao sem referencia nao pode ser atribuida a rank algum.
    IF NULLIF(TRIM(BOTH FROM COALESCE(NEW.referencia, '')), '') IS NULL THEN
      NEW.valor := 0;
      RETURN NEW;
    END IF;

    -- Concluir de novo nao paga de novo. A linha E gravada -- o cliente faz
    -- `.insert().select().single()` e um RETURN NULL o quebraria. No UPDATE a
    -- comparacao e' "existe linha ANTERIOR com a mesma chave": comparar por
    -- existencia acharia a propria vizinha e zeraria as duas.
    IF EXISTS (
      SELECT 1
        FROM public.eventos_aluno e
       WHERE e.aluno_id = NEW.aluno_id
         AND e.tipo = NEW.tipo
         AND e.referencia = NEW.referencia
         AND (
           TG_OP = 'INSERT'
           OR (COALESCE(e.criado_em, 'epoch'::timestamp), e.id)
              < (COALESCE(NEW.criado_em, 'epoch'::timestamp), NEW.id)
         )
    ) THEN
      NEW.valor := 0;
    END IF;
  END IF;

  -- Sem classe resolvida no INSERT, o evento nao chega a rank algum: pagar por
  -- ele inflaria o razao com pontos invisiveis. Agora e' leitura de coluna, nao
  -- consulta -- e no UPDATE le a classe CONGELADA, entao conteudo apagado depois
  -- nao tira os pontos de ninguem.
  --
  -- `conquista:<id>` nao entra aqui: e' creditado e ja retornou acima.
  IF COALESCE(NEW.valor, 0) > 0
     AND NEW.referencia IS NOT NULL
     AND NEW.classe_id IS NULL THEN
    NEW.valor := 0;
  END IF;

  -- APOSTA -- multiplicativo, e ANTES do atraso. E' propriedade do DESAFIO (a dificuldade
  -- com que ele foi criado), nao da entrega, entao nao se mistura com a conta de prazo.
  --
  -- A guarda e `<> 0`, nao `> 0` como a do atraso: a derrota ranqueada e o unico valor
  -- negativo do sistema, e e' exatamente ela que a aposta precisa alcancar. Com `> 0` a
  -- dificuldade dobraria o premio e deixaria o risco igual.
  IF COALESCE(NEW.valor, 0) <> 0 THEN
    NEW.valor := ROUND(NEW.valor * public.fn_fator_de_aposta(NEW.referencia));
  END IF;

  -- PISO -- so' para negativo, contra o saldo de DUELOS do aluno naquela turma: e' o que a
  -- derrota afeta, desde que o duelo saiu do XP (`20261103_15`). Sem ele uma sequencia de derrotas manda para o negativo justamente quem ja
  -- esta perdendo.
  IF COALESCE(NEW.valor, 0) < 0 THEN
    IF NEW.classe_id IS NULL THEN
      -- Evento sem classe nao chega a rank algum. O bloco acima ja zera os positivos nessa
      -- situacao; zerar o negativo e' a mesma regra, simetrica. Explicito de proposito: nao
      -- depender de `e.classe_id = NULL` nunca ser verdade.
      NEW.valor := 0;
    ELSE
      v_piso := public.app_ranqueada_piso_pontos();

      -- `e.id <> NEW.id` porque o gatilho tambem roda em UPDATE, e ali a propria linha ja
      -- esta na tabela com o valor antigo -- sem isto o UPDATE veria o proprio desconto
      -- como ja acumulado e o aplicaria de novo.
      SELECT COALESCE(sum(e.valor), 0) INTO v_acumulado
        FROM public.eventos_aluno e
       WHERE e.aluno_id = NEW.aluno_id
         AND e.classe_id = NEW.classe_id
         AND e.fora_do_xp
         AND e.id <> NEW.id;

      -- `LEAST(0, ...)` para o piso nunca VIRAR premio: aluno abaixo do piso (possivel se a
      -- chave for editada para cima) receberia um positivo sem ter ganhado nada.
      NEW.valor := LEAST(0, GREATEST(NEW.valor, v_piso - v_acumulado));
    END IF;
  END IF;

  -- ATRASO -- o ULTIMO passo, e multiplicativo. Zero vezes qualquer coisa
  -- continua zero, entao aplicar aqui nao desfaz nenhuma das regras acima:
  -- conclusao repetida, referencia vazia e classe nula continuam valendo 0.
  -- Com o fator em 1.0, que e como ele nasce, esta linha nao muda nada.
  --
  -- O instante julgado e o do EVENTO, nao o de agora: assim um UPDATE futuro
  -- nao transforma em atrasado o que foi entregue no prazo. `criado_em` e
  -- `timestamp without time zone` gravado por `now()` numa sessao UTC (conferido
  -- no banco), entao `AT TIME ZONE 'UTC'` o devolve ao instante certo.
  IF COALESCE(NEW.valor, 0) > 0 THEN
    NEW.valor := ROUND(
      NEW.valor * public.fn_fator_de_atraso(
        NEW.aluno_id,
        NEW.referencia,
        COALESCE(NEW.criado_em AT TIME ZONE 'UTC', now())
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION trg_eventos_aluno_valor_do_banco() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trg_eventos_aluno_valor_do_banco() TO service_role;

CREATE TRIGGER trg_eventos_aluno_valor_ins BEFORE INSERT ON public.eventos_aluno FOR EACH ROW EXECUTE FUNCTION trg_eventos_aluno_valor_do_banco();
CREATE TRIGGER trg_eventos_aluno_valor_upd BEFORE UPDATE ON public.eventos_aluno FOR EACH ROW EXECUTE FUNCTION trg_eventos_aluno_valor_do_banco();
INSERT INTO public.eventos_pontuacao SELECT * FROM jsonb_populate_record(NULL::public.eventos_pontuacao, '{"tipo": "desafio_derrota", "moedas": 0, "pontos": -6, "descricao": "Perdeu um desafio ranqueado da arena (a aposta).", "penalidade": true, "atualizado_em": "2026-10-19T16:22:28.916199+00:00"}') ON CONFLICT DO NOTHING;
INSERT INTO public.eventos_pontuacao SELECT * FROM jsonb_populate_record(NULL::public.eventos_pontuacao, '{"tipo": "desafio_empate", "moedas": 1, "pontos": 6, "descricao": "Empatou um desafio da arena", "penalidade": false, "atualizado_em": "2026-09-20T14:41:42.658994+00:00"}') ON CONFLICT DO NOTHING;
INSERT INTO public.eventos_pontuacao SELECT * FROM jsonb_populate_record(NULL::public.eventos_pontuacao, '{"tipo": "desafio_participou", "moedas": 0, "pontos": 3, "descricao": "Jogou um desafio da arena", "penalidade": false, "atualizado_em": "2026-09-20T14:41:42.658994+00:00"}') ON CONFLICT DO NOTHING;
INSERT INTO public.eventos_pontuacao SELECT * FROM jsonb_populate_record(NULL::public.eventos_pontuacao, '{"tipo": "desafio_vencido", "moedas": 3, "pontos": 12, "descricao": "Venceu um desafio da arena", "penalidade": false, "atualizado_em": "2026-09-20T14:41:42.658994+00:00"}') ON CONFLICT DO NOTHING;
