-- Base mínima explícita. Não é dump nem reconstrução do schema de produção.
-- auth.users/identities são criadas e administradas pelo GoTrue real.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE FUNCTION app_alunos_do_professor() RETURNS SETOF uuid LANGUAGE sql AS $$ SELECT NULL::uuid WHERE false $$;
CREATE TYPE modo_resposta_type AS ENUM ('imediato','pensante');
CREATE TABLE "modoOperacao" (id bigint PRIMARY KEY, nome text UNIQUE);
INSERT INTO "modoOperacao" VALUES (1,'Misto'),(2,'Prático'),(3,'Teórico');
CREATE TABLE perfil (id bigint PRIMARY KEY, nome text UNIQUE, descricao text, caracteristicas jsonb);
INSERT INTO perfil(id,nome) VALUES(1,'achiever'),(2,'conqueror'),(3,'daredevil'),(4,'mastermind'),(5,'seeker'),(6,'socializer'),(7,'survivor');
CREATE TABLE alunos (id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE, nome text, email text, apelido text, descricao text, modooperacao_id bigint REFERENCES "modoOperacao", modo_resposta modo_resposta_type, perfil_ativo text);
CREATE TABLE aluno_perfil (aluno_id uuid REFERENCES alunos ON DELETE CASCADE, perfil_id bigint REFERENCES perfil, afinidade numeric, criado_em timestamptz DEFAULT now(), atualizado_em timestamptz DEFAULT now(), PRIMARY KEY(aluno_id,perfil_id));
CREATE TABLE "iaDescricao" (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, aluno_id uuid REFERENCES alunos ON DELETE CASCADE, "modoOperacao" text, "perfisDetectados" jsonb, insights json, "recomendacaoTrilha" text);
CREATE TABLE aluno_nascimento (aluno_id uuid PRIMARY KEY REFERENCES alunos ON DELETE CASCADE, data_nascimento date, registrado_por uuid);
-- Resumo de consentimento não exercitado nesta jornada: fixture explicitamente vazio.
CREATE FUNCTION aluno_meu_consentimento() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE TABLE professor(id uuid PRIMARY KEY REFERENCES auth.users, liberado boolean);
CREATE TABLE classe_aluno(aluno_id uuid REFERENCES alunos, classe_id bigint, PRIMARY KEY(aluno_id,classe_id));
CREATE TABLE conteudo_personalizado(id bigint PRIMARY KEY, aluno_id uuid, classe_id bigint, topico_id bigint, conteudo_id bigint, brainhex_profile_key text, ciclo_id uuid, status text, source_hash text, formato_prioritario text, formatos_gerados text[], plano jsonb, materiais jsonb, ai_patch jsonb, gerado_em timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE cards_personalizados(id bigint PRIMARY KEY, aluno_id uuid, classe_id bigint, topico_id bigint, conteudo_id bigint, ciclo_id uuid, ordem int, titulo text, descricao text, icone text, dificuldade text, xp int, metadata jsonb);
GRANT SELECT ON "modoOperacao", perfil TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alunos,aluno_perfil,"iaDescricao",aluno_nascimento TO authenticated;
GRANT SELECT ON professor,classe_aluno,conteudo_personalizado,cards_personalizados TO authenticated;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;
CREATE POLICY self ON alunos TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
ALTER TABLE aluno_perfil ENABLE ROW LEVEL SECURITY;
CREATE POLICY self ON aluno_perfil TO authenticated USING(aluno_id=auth.uid()) WITH CHECK(aluno_id=auth.uid());
ALTER TABLE "iaDescricao" ENABLE ROW LEVEL SECURITY;
CREATE POLICY self ON "iaDescricao" TO authenticated USING(aluno_id=auth.uid()) WITH CHECK(aluno_id=auth.uid());
ALTER TABLE aluno_nascimento ENABLE ROW LEVEL SECURITY;
CREATE POLICY self ON aluno_nascimento TO authenticated USING(aluno_id=auth.uid()) WITH CHECK(aluno_id=auth.uid());
ALTER TABLE professor ENABLE ROW LEVEL SECURITY;
CREATE POLICY self ON professor TO authenticated USING(id=auth.uid());
ALTER TABLE classe_aluno ENABLE ROW LEVEL SECURITY;
CREATE POLICY self ON classe_aluno TO authenticated USING(aluno_id=auth.uid());
ALTER TABLE conteudo_personalizado ENABLE ROW LEVEL SECURITY;
CREATE POLICY enrolled ON conteudo_personalizado TO authenticated USING(
 EXISTS(SELECT 1 FROM classe_aluno c WHERE c.aluno_id=auth.uid() AND c.classe_id=conteudo_personalizado.classe_id));
ALTER TABLE cards_personalizados ENABLE ROW LEVEL SECURITY;
CREATE POLICY enrolled ON cards_personalizados TO authenticated USING(
 EXISTS(SELECT 1 FROM classe_aluno c WHERE c.aluno_id=auth.uid() AND c.classe_id=cards_personalizados.classe_id));
