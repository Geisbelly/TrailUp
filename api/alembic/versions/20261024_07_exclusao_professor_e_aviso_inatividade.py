"""Exclusão da conta de professor e aviso de conta inativa por e-mail (#195)

## 1. Professor pode excluir a própria conta

Antes: o console mostrava "ainda não está disponível" e o banco também
segurava (`classe_professor_id_fkey` e `professor_id_fkey` em NO ACTION;
`trailup_retencao` e o worker nunca apagavam professor).

Agora, `fn_excluir_minha_conta_professor()` (RPC, sessão obrigatória):

- recusa quem não é professor e recusa o dono do app (`app_e_dono()`);
- apaga JÁ a linha de `professor` (nome, descrição, instituição, disciplina) e,
  se existir, a linha de `alunos` da mesma pessoa, com a cascata dela;
- enfileira o usuário do Auth (e-mail, login) em `retencao_fila_externa`
  (`motivo = exclusao_professor`); o worker da API apaga pela API admin;
- registra o pedido em `exclusao_conta_professor` (só id, datas e contagens;
  5 anos) e devolve `{ok, turmas_apagadas, alunos_afetados}`.

As turmas do professor SOMEM, com tudo o que depende delas: o gatilho
`trg_professor_removido_apaga_turmas` (BEFORE DELETE em `professor`, vale
para qualquer caminho: RPC, dono pelo console ou cascata do Auth) chama
`trailup_apagar_turma_inteira(classe)` para cada turma. Ela segue a ordem do
`excluir_classe` (20260920_06) e vai além dele:

- enfileira os arquivos da turma (Storage e R2) para o worker: caminhos em
  `conteudos.conteudo`/`metadata.files`, `midias.url`, `questoes.midia_url`,
  `cards.imagem_url`, fontes do professor e `conteudo_personalizado.materiais`
  (materiais gerados, fontes do aluno, OpenAI e telemetria já têm gatilho);
- apaga as tabelas que guardam `classe_id`/`topico_id`/... SEM FK (ficariam
  órfãs), as linhas da turma em FK SET NULL (`moedas_ledger`,
  `eventos_aluno`, `telemetria_eventos_app`, `ia_decision_logs`) e as que
  seguram o DELETE (NO ACTION/RESTRICT), incluindo as cópias da mochila;
- apaga a turma; o resto sai pela cascata.

`classe_professor_id_fkey` passa a ON DELETE CASCADE (rede de segurança).
Ficam: contas e perfis dos alunos, BrainHex, consentimentos e a prova mínima
de consentimento.

## 2. Aviso de conta inativa por e-mail

`retencao_avisos_inatividade` ganha o estado do e-mail. `retencao_avisos_email()`
(chamada por `trailup_retencao()`, pelo cron `trailup_retencao_avisos` a cada
30 min e pelo worker da API) confere as respostas do pg_net dos pedidos
anteriores e manda os pendentes pela Brevo (chave `brevo_api_key` do Vault, o
mesmo padrão de `fn_enviar_contato_publico`). Sem e-mail válido, sem chave ou
com erro: registra o motivo e tenta de novo depois. O prazo de exclusão
(30 dias) conta a partir do e-mail ACEITO pela Brevo: sem e-mail, a conta não
é apagada. Voltar a entrar apaga o aviso (como já era). Em `simular`, nada é
enviado nem apagado; o resultado relata quem seria avisado e removido.

O esquema não guarda e-mail do responsável (`consentimento_responsavel` só tem
nome e relação), então o aviso vai para o e-mail da conta, com uma linha
pedindo ao menor que mostre ao responsável.

Revision ID: 20261024_07
Revises: 20261024_06
Create Date: 2026-10-24
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

from alembic import op

revision = "20261024_07"
down_revision = "20261024_06"
branch_labels = None
depends_on = None

_JOB_AVISOS = "trailup_retencao_avisos"

FKS_SQL = r"""-- classe.professor_id: NO ACTION -> CASCADE; professor.id -> auth.users:
-- NO ACTION -> CASCADE. Antes, apagar o usuario do Auth de um professor
-- falhava (professor_id_fkey) e, mesmo apagando a linha do professor, a turma
-- segurava (classe_professor_id_fkey). A limpeza de verdade e o gatilho
-- `trg_professor_removido_apaga_turmas` (abaixo); o CASCADE e a rede de
-- seguranca: turma de professor apagado nunca fica no banco.
DO $fk$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tabela
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND ((c.conrelid = 'public.classe'::regclass AND c.confrelid = 'public.professor'::regclass)
         OR (c.conrelid = 'public.professor'::regclass AND c.confrelid = 'auth.users'::regclass))
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabela, r.conname);
  END LOOP;
  ALTER TABLE public.classe ADD CONSTRAINT classe_professor_id_fkey
    FOREIGN KEY (professor_id) REFERENCES public.professor (id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE public.professor ADD CONSTRAINT professor_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID;
  BEGIN
    ALTER TABLE public.classe VALIDATE CONSTRAINT classe_professor_id_fkey;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE WARNING 'classe_professor_id_fkey fica NOT VALID: ha linha orfa';
  END;
  BEGIN
    ALTER TABLE public.professor VALIDATE CONSTRAINT professor_id_fkey;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE WARNING 'professor_id_fkey fica NOT VALID: ha linha orfa';
  END;
END $fk$;
"""

PROFESSOR_SQL = r"""-- Pedido de exclusao feito pelo proprio professor. So o id (pseudonimo),
-- datas e contagens: e a prova de que o pedido existiu e o que libera o worker
-- a apagar o usuario do Auth.
CREATE TABLE IF NOT EXISTS public.exclusao_conta_professor (
  professor_id      uuid PRIMARY KEY,
  pedido_em         timestamptz NOT NULL DEFAULT now(),
  turmas_apagadas   integer NOT NULL DEFAULT 0,
  alunos_afetados   integer NOT NULL DEFAULT 0
);
ALTER TABLE public.exclusao_conta_professor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exclusao_conta_professor FROM PUBLIC, anon, authenticated;

INSERT INTO public.retencao_politica
  (tabela, acao, coluna_aluno, coluna_tempo, dias, ordem, categoria, motivo)
VALUES
  ('exclusao_conta_professor', 'apagar', 'professor_id', 'pedido_em', 1826, 110, 'direitos_titular',
   'prova de que o pedido de exclusao do professor foi atendido (5 anos, so o id)')
ON CONFLICT (tabela, acao) DO NOTHING;

-- Caminho de arquivo (Storage/R2) gravado num campo de conteudo: caminho
-- puro ("<uid>/<topico>/<arquivo>"), URL publica/assinada do bucket
-- `conteudos` ou URL do gateway storage-redirect (?path=). Texto comum -> NULL.
CREATE OR REPLACE FUNCTION public.trailup_caminho_arquivo(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN NULL
    WHEN p ~* '^https?://' THEN coalesce(
      substring(p from '/storage/v1/object/(?:public|sign|authenticated)/conteudos/([^?#]+)'),
      substring(p from 'storage-redirect[?](?:[^#]*&)?path=([^&#]+)'))
    WHEN p ~ '\s' OR length(p) > 1024 OR strpos(p, '/') = 0 THEN NULL
    ELSE btrim(p)
  END
$function$;
REVOKE EXECUTE ON FUNCTION public.trailup_caminho_arquivo(text) FROM PUBLIC, anon, authenticated;

-- Apaga UMA turma inteira, com tudo o que depende dela. Interna (sem grant):
-- so o gatilho de exclusao do professor chama. Mesma ordem do
-- `excluir_classe` (20260920_06), mais o que la ficava: copias da mochila,
-- moedas e eventos da turma (FK SET NULL), tabelas sem FK que guardam
-- classe_id/topico_id/... e os arquivos fora do banco (fila do worker).
-- Devolve quantos alunos estavam matriculados.
CREATE OR REPLACE FUNCTION public.trailup_apagar_turma_inteira(p_classe_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_topicos    bigint[];
  v_conteudos  bigint[];
  v_atividades bigint[];
  v_questoes   bigint[];
  v_cps        bigint[];
  v_alunos     integer;
BEGIN
  PERFORM 1 FROM public.classe WHERE id = p_classe_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  SELECT coalesce(array_agg(id), ARRAY[]::bigint[]) INTO v_topicos
    FROM public.topicos WHERE classe_id = p_classe_id;
  SELECT coalesce(array_agg(id), ARRAY[]::bigint[]) INTO v_conteudos
    FROM public.conteudos WHERE topico_id = ANY (v_topicos);
  SELECT coalesce(array_agg(id), ARRAY[]::bigint[]) INTO v_atividades
    FROM public.atividades WHERE topico_id = ANY (v_topicos);
  SELECT coalesce(array_agg(id), ARRAY[]::bigint[]) INTO v_questoes
    FROM public.questoes WHERE atividade_id = ANY (v_atividades);
  SELECT coalesce(array_agg(id), ARRAY[]::bigint[]) INTO v_cps
    FROM public.conteudo_personalizado
   WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos) OR conteudo_id = ANY (v_conteudos);
  SELECT count(DISTINCT aluno_id) INTO v_alunos FROM public.classe_aluno WHERE classe_id = p_classe_id;

  -- 1. Arquivos fora do Postgres (Storage e R2, mesma chave). O worker so
  --    apaga depois do commit e, antes, confere se outra linha (uma turma
  --    duplicada) ainda aponta para o arquivo. materiais_gerados, fontes do
  --    aluno, rag_openai_files e telemetria ja tem gatilho proprio (20261024_03).
  INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref)
  SELECT DISTINCT d.destino, CASE WHEN d.destino = 'storage' THEN a.bucket ELSE '' END, a.caminho,
         jsonb_build_object('tabela', a.tabela, 'motivo', 'exclusao_professor')
    FROM (
      SELECT 'conteudos' AS tabela, 'conteudos' AS bucket, public.trailup_caminho_arquivo(c.conteudo) AS caminho
        FROM public.conteudos c WHERE c.id = ANY (v_conteudos)
      UNION ALL
      SELECT 'conteudos', 'conteudos', public.trailup_caminho_arquivo(f ->> 'path')
        FROM public.conteudos c,
             LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.metadata -> 'files') = 'array'
                                               THEN c.metadata -> 'files' ELSE '[]'::jsonb END) AS f
       WHERE c.id = ANY (v_conteudos)
      UNION ALL
      SELECT 'midias', 'conteudos', public.trailup_caminho_arquivo(m.url)
        FROM public.midias m WHERE m.conteudo_id = ANY (v_conteudos)
      UNION ALL
      SELECT 'questoes', 'conteudos', public.trailup_caminho_arquivo(q.midia_url)
        FROM public.questoes q WHERE q.id = ANY (v_questoes)
      UNION ALL
      SELECT 'cards', 'conteudos', public.trailup_caminho_arquivo(k.imagem_url)
        FROM public.cards k WHERE k.conteudo_id = ANY (v_conteudos)
      UNION ALL
      SELECT 'fontes_personalizacao', coalesce(fp.metadata ->> 'bucket', 'conteudos'), fp.storage_path
        FROM public.fontes_personalizacao fp
       WHERE fp.aluno_id IS NULL
         AND (fp.classe_id = p_classe_id OR fp.topico_id = ANY (v_topicos) OR fp.conteudo_id = ANY (v_conteudos))
      UNION ALL
      SELECT 'conteudo_personalizado', 'conteudo_aluno', e.v ->> 'storage_path'
        FROM public.conteudo_personalizado cp,
             LATERAL jsonb_each(CASE WHEN jsonb_typeof(cp.materiais) = 'object'
                                     THEN cp.materiais ELSE '{}'::jsonb END) AS e (k, v)
       WHERE cp.id = ANY (v_cps) AND jsonb_typeof(e.v) = 'object'
      UNION ALL
      SELECT 'conteudo_personalizado', 'conteudo_aluno', parte ->> 'storage_path'
        FROM public.conteudo_personalizado cp,
             LATERAL jsonb_each(CASE WHEN jsonb_typeof(cp.materiais) = 'object'
                                     THEN cp.materiais ELSE '{}'::jsonb END) AS e (k, v),
             LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.v -> 'partes') = 'array'
                                               THEN e.v -> 'partes' ELSE '[]'::jsonb END) AS parte
       WHERE cp.id = ANY (v_cps)
    ) AS a
   CROSS JOIN (VALUES ('storage'), ('r2')) AS d (destino)
   WHERE a.caminho IS NOT NULL AND a.caminho !~* '^https?://'
  ON CONFLICT DO NOTHING;

  -- 2. Matriculas primeiro: o gatilho de classe_aluno limpa o dado de cada aluno.
  DELETE FROM public.classe_aluno WHERE classe_id = p_classe_id;

  -- 3. Tabelas SEM FK para a turma/topico/conteudo/atividade/questao: ficariam orfas.
  DELETE FROM public.personalizacao_percurso WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos);
  DELETE FROM public.personalizacao_item_progresso WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos);
  DELETE FROM public.personalizacao_sugestao_log
   WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos) OR conteudo_id = ANY (v_conteudos);
  DELETE FROM public.personalizacao_sugestao
   WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos) OR conteudo_id = ANY (v_conteudos);
  DELETE FROM public.professor_intervencoes_passo WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos);
  DELETE FROM public.intervencoes WHERE classe_id = p_classe_id;
  DELETE FROM public.economia_auditoria WHERE classe_id = p_classe_id;
  DELETE FROM public.rag_chunks
   WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos) OR conteudo_id = ANY (v_conteudos);
  DELETE FROM public.rag_openai_files WHERE classe_id = p_classe_id;
  DELETE FROM public.loja_uso_log
   WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos)
      OR atividade_id = ANY (v_atividades) OR questao_id = ANY (v_questoes);
  DELETE FROM public.loja_formato_escolhido WHERE topico_id = ANY (v_topicos);
  DELETE FROM public.loja_dica_liberada WHERE questao_id = ANY (v_questoes);
  DELETE FROM public.questao_gabarito_revelado WHERE questao_id = ANY (v_questoes);
  DELETE FROM public.telemetria_agregado_turma_dia WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos);
  DELETE FROM public.telemetria_lotes
   WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos)
      OR conteudo_id = ANY (v_conteudos) OR atividade_id = ANY (v_atividades);
  DELETE FROM public.telemetria_time_metric_entries
   WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos) OR conteudo_id = ANY (v_conteudos)
      OR atividade_id = ANY (v_atividades) OR questao_id = ANY (v_questoes);

  -- 4. FK SET NULL: a linha ficaria solta, sem turma, mas e da turma.
  DELETE FROM public.moedas_ledger WHERE classe_id = p_classe_id;
  DELETE FROM public.eventos_aluno WHERE classe_id = p_classe_id;
  DELETE FROM public.telemetria_eventos_app
   WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos) OR conteudo_id = ANY (v_conteudos)
      OR atividade_id = ANY (v_atividades) OR questao_id = ANY (v_questoes);
  DELETE FROM public.ia_decision_logs
   WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos)
      OR conteudo_id = ANY (v_conteudos) OR atividade_id = ANY (v_atividades);

  -- 5. FK NO ACTION/RESTRICT: seguram o DELETE da turma se ficarem.
  DELETE FROM public.bag_itens
   WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos) OR conteudo_id = ANY (v_conteudos);
  DELETE FROM public.guilda_evento_snapshot
   WHERE classe_id = p_classe_id OR guilda_id IN (SELECT g.id FROM public.guildas g WHERE g.classe_id = p_classe_id);
  DELETE FROM public.classe_perfil_summary WHERE classe_id = p_classe_id;
  DELETE FROM public.cards_personalizados
   WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos) OR conteudo_id = ANY (v_conteudos);
  DELETE FROM public.fontes_personalizacao
   WHERE classe_id = p_classe_id OR topico_id = ANY (v_topicos) OR conteudo_id = ANY (v_conteudos);
  DELETE FROM public.materiais_gerados WHERE conteudo_id = ANY (v_conteudos) OR personalizacao_id = ANY (v_cps);
  DELETE FROM public.conteudo_personalizado WHERE id = ANY (v_cps);
  DELETE FROM public.atividade_conteudos WHERE atividade_id = ANY (v_atividades) OR conteudo_id = ANY (v_conteudos);
  DELETE FROM public.questao_aluno WHERE atividade_id = ANY (v_atividades) OR questao_id = ANY (v_questoes);
  DELETE FROM public.trilha_aluno
   WHERE classe_id = p_classe_id
      OR trilha_modelo_id IN (SELECT t.id FROM public.trilha_modelo t WHERE t.classe_id = p_classe_id);

  -- 6. A turma. O resto (topicos, atividades, questoes, notas, respostas,
  --    entregas, guildas, convites, missoes, loja, economia, ranking,
  --    telemetria, trilhas, jobs) sai pela cascata das FKs.
  DELETE FROM public.classe WHERE id = p_classe_id;
  -- Registro de saida da turma (sem FK): nao ha mais turma para reter.
  DELETE FROM public.classe_aluno_saidas WHERE classe_id = p_classe_id;
  RETURN v_alunos;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.trailup_apagar_turma_inteira(bigint) FROM PUBLIC, anon, authenticated;

-- Quem apagar a linha do professor (ele mesmo pela RPC, o dono pelo console
-- ou a cascata do Auth) apaga as turmas dele, com tudo o que depende delas.
CREATE OR REPLACE FUNCTION public.trg_professor_removido_apaga_turmas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT c.id FROM public.classe c WHERE c.professor_id = OLD.id ORDER BY c.id LOOP
    PERFORM public.trailup_apagar_turma_inteira(r.id);
  END LOOP;

  -- Fonte do professor fora de turma (FK SET NULL em professor_id) e os
  -- passos de intervencao dele (sem FK).
  INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref)
  SELECT DISTINCT d.destino,
         CASE WHEN d.destino = 'storage' THEN coalesce(fp.metadata ->> 'bucket', 'conteudos') ELSE '' END,
         fp.storage_path, jsonb_build_object('tabela', 'fontes_personalizacao', 'motivo', 'exclusao_professor')
    FROM public.fontes_personalizacao fp
   CROSS JOIN (VALUES ('storage'), ('r2')) AS d (destino)
   WHERE fp.professor_id = OLD.id AND fp.aluno_id IS NULL
     AND fp.storage_path IS NOT NULL AND fp.storage_path !~* '^https?://'
  ON CONFLICT DO NOTHING;
  DELETE FROM public.fontes_personalizacao WHERE professor_id = OLD.id AND aluno_id IS NULL;
  DELETE FROM public.professor_intervencoes_passo WHERE professor_id = OLD.id;

  -- Arquivo enviado pelo professor e que nao ficou ligado a nenhum conteudo:
  -- o upload do console grava em conteudos/<uid>/...
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref)
      SELECT d.destino, CASE WHEN d.destino = 'storage' THEN 'conteudos' ELSE '' END, o.name,
             jsonb_build_object('tabela', 'storage.objects', 'motivo', 'exclusao_professor')
        FROM storage.objects o
       CROSS JOIN (VALUES ('storage'), ('r2')) AS d (destino)
       WHERE o.bucket_id = 'conteudos' AND o.name LIKE $1
      ON CONFLICT DO NOTHING
    $q$ USING OLD.id::text || '/%';
  END IF;
  RETURN OLD;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.trg_professor_removido_apaga_turmas() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_professor_removido_apaga_turmas ON public.professor;
CREATE TRIGGER trg_professor_removido_apaga_turmas
  BEFORE DELETE ON public.professor
  FOR EACH ROW EXECUTE FUNCTION public.trg_professor_removido_apaga_turmas();

-- O professor exclui a propria conta.
CREATE OR REPLACE FUNCTION public.fn_excluir_minha_conta_professor()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_turmas integer;
  v_alunos integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'exclusao_conta: sem sessao';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professor p WHERE p.id = v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'exclusao_conta: so professor';
  END IF;
  -- A conta do dono do app administra o app inteiro: nao sai por aqui.
  IF public.app_e_dono() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'exclusao_conta: a conta do dono do app nao pode ser excluida por aqui';
  END IF;

  SELECT count(*) INTO v_turmas FROM public.classe c WHERE c.professor_id = v_uid;
  SELECT count(DISTINCT ca.aluno_id) INTO v_alunos
    FROM public.classe_aluno ca JOIN public.classe c ON c.id = ca.classe_id
   WHERE c.professor_id = v_uid AND ca.aluno_id <> v_uid;

  INSERT INTO public.exclusao_conta_professor (professor_id, turmas_apagadas, alunos_afetados)
  VALUES (v_uid, v_turmas, v_alunos)
  ON CONFLICT (professor_id) DO UPDATE
    SET pedido_em = now(), turmas_apagadas = EXCLUDED.turmas_apagadas, alunos_afetados = EXCLUDED.alunos_afetados;

  -- Dado pessoal do professor sai agora: a linha dele (o gatilho apaga as
  -- turmas, com tudo o que depende delas) e, se ele tambem tiver perfil de
  -- aluno, a linha de aluno com a cascata dela.
  DELETE FROM public.professor WHERE id = v_uid;
  DELETE FROM public.alunos WHERE id = v_uid;

  -- O usuario do Auth (e-mail, login) sai pelo worker da fila externa.
  INSERT INTO public.retencao_fila_externa (destino, caminho, ref)
  VALUES ('auth_user', v_uid::text, jsonb_build_object('motivo', 'exclusao_professor'))
  ON CONFLICT (destino, bucket, caminho) DO UPDATE
    SET ref = EXCLUDED.ref, processado_em = NULL, resultado = NULL, tentativas = 0,
        proxima_tentativa_em = now(), ultimo_erro = NULL;

  RETURN jsonb_build_object('ok', true, 'turmas_apagadas', v_turmas, 'alunos_afetados', v_alunos);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_excluir_minha_conta_professor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_excluir_minha_conta_professor() TO authenticated;
"""

AVISOS_SQL = r"""ALTER TABLE public.retencao_avisos_inatividade
  ADD COLUMN IF NOT EXISTS email_enviado_em           timestamptz,
  ADD COLUMN IF NOT EXISTS email_request_id           bigint,
  ADD COLUMN IF NOT EXISTS email_solicitado_em        timestamptz,
  ADD COLUMN IF NOT EXISTS email_tentativas           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS email_ultimo_erro          text;
COMMENT ON COLUMN public.retencao_avisos_inatividade.email_enviado_em IS
  'Quando a Brevo aceitou o e-mail de aviso (2xx). O prazo de exclusao conta daqui; sem isto, a conta nao sai.';

INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('retencao_aviso_link', 'https://trailup.vercel.app',
   'Link para entrar no app, no e-mail de aviso de conta inativa (#195).', false),
  ('retencao_aviso_email_lote', '100',
   'Teto de e-mails de aviso de conta inativa por execucao.', false),
  ('retencao_aviso_email_max_tentativas', '10',
   'Tentativas de envio do aviso antes de parar (a conta nao e apagada sem aviso).', false)
ON CONFLICT (chave) DO NOTHING;
"""

EMAIL_SQL = r"""CREATE OR REPLACE FUNCTION public.retencao_avisos_email(p_aplicar boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault', 'pg_temp'
AS $function$
DECLARE
  v_aplicar     boolean;
  v_aviso       integer;
  v_lote        integer;
  v_max_tent    integer;
  v_espera_seg  integer;
  v_link        text;
  v_remetente   text;
  v_api_key     text;
  v_tem_net     boolean := to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NOT NULL;
  v_tem_resp    boolean := to_regclass('net._http_response') IS NOT NULL;
  v_confirmados bigint := 0;
  v_falhas      bigint := 0;
  v_enviados    bigint := 0;
  v_sem_email   bigint := 0;
  v_pendentes   bigint := 0;
  v_aguardando  bigint := 0;
  v_esgotados   bigint := 0;
  v_erro_cfg    text;
  v_n_sem_resposta bigint;
  v_prazo       text;
  v_req_id      bigint;
  v_texto       text;
  v_html        text;
  v_nl          text := chr(10);
  r             record;
BEGIN
  v_aplicar := coalesce(
    p_aplicar,
    (SELECT valor = 'aplicar' FROM public.app_config WHERE chave = 'retencao_modo'),
    false);
  v_aviso      := public.retencao_config_int('retencao_conta_aviso_dias', 30);
  v_lote       := greatest(public.retencao_config_int('retencao_aviso_email_lote', 100), 1);
  v_max_tent   := greatest(public.retencao_config_int('retencao_aviso_email_max_tentativas', 10), 1);
  v_espera_seg := 6 * 3600; -- o pg_net guarda a resposta por 6 horas

  SELECT count(*) FILTER (WHERE v.email_request_id IS NOT NULL),
         count(*) FILTER (WHERE v.email_request_id IS NULL AND v.email_tentativas >= v_max_tent),
         count(*) FILTER (WHERE v.email_request_id IS NULL AND v.email_tentativas < v_max_tent
                            AND v.email_proxima_tentativa_em <= now())
    INTO v_aguardando, v_esgotados, v_pendentes
    FROM public.retencao_avisos_inatividade v
   WHERE v.email_enviado_em IS NULL AND v.exclusao_enfileirada_em IS NULL;

  IF NOT v_aplicar THEN
    RETURN jsonb_build_object(
      'modo', 'simular', 'enviaria', v_pendentes, 'aguardando_resposta', v_aguardando,
      'esgotados', v_esgotados);
  END IF;

  -- Duas execucoes ao mesmo tempo (cron + worker) nao mandam o mesmo e-mail.
  IF NOT pg_try_advisory_xact_lock(hashtext('retencao_avisos_email')) THEN
    RETURN jsonb_build_object('pulado', 'outra execucao em andamento');
  END IF;

  -- 1) Confere os pedidos ja feitos ao pg_net (assincrono: a resposta chega
  --    depois do COMMIT de quem pediu).
  IF v_tem_resp THEN
    WITH resp AS (
      SELECT v.aluno_id, hr.status_code, hr.timed_out, hr.error_msg, hr.created
        FROM public.retencao_avisos_inatividade v
        JOIN net._http_response hr ON hr.id = v.email_request_id
       WHERE v.email_request_id IS NOT NULL AND v.email_enviado_em IS NULL),
    ok AS (
      UPDATE public.retencao_avisos_inatividade v
         SET email_enviado_em = coalesce(resp.created, now()),
             email_request_id = NULL, email_ultimo_erro = NULL
        FROM resp
       WHERE resp.aluno_id = v.aluno_id
         AND resp.status_code BETWEEN 200 AND 299
         AND NOT coalesce(resp.timed_out, false)
      RETURNING 1),
    falhou AS (
      UPDATE public.retencao_avisos_inatividade v
         SET email_request_id = NULL,
             email_ultimo_erro = left(coalesce('HTTP ' || resp.status_code::text, '')
                                      || CASE WHEN resp.timed_out THEN ' timeout' ELSE '' END
                                      || coalesce(' ' || resp.error_msg, ''), 300),
             email_proxima_tentativa_em = now() + make_interval(
               secs => least(900 * (2 ^ greatest(v.email_tentativas - 1, 0))::integer, 86400))
        FROM resp
       WHERE resp.aluno_id = v.aluno_id
         AND NOT (resp.status_code BETWEEN 200 AND 299 AND NOT coalesce(resp.timed_out, false))
      RETURNING 1)
    SELECT (SELECT count(*) FROM ok), (SELECT count(*) FROM falhou) INTO v_confirmados, v_falhas;
  END IF;

  -- Pedido sem resposta depois do prazo do pg_net: conta como falha e tenta de novo.
  UPDATE public.retencao_avisos_inatividade v
     SET email_request_id = NULL,
         email_ultimo_erro = 'sem resposta do pg_net',
         email_proxima_tentativa_em = now()
   WHERE v.email_request_id IS NOT NULL AND v.email_enviado_em IS NULL
     AND v.email_solicitado_em < now() - make_interval(secs => v_espera_seg);
  GET DIAGNOSTICS v_n_sem_resposta = ROW_COUNT;
  v_falhas := v_falhas + v_n_sem_resposta;

  -- 2) Configuracao. Faltando algo, nada e enviado e o motivo fica na linha.
  v_link := coalesce(nullif(btrim((SELECT valor FROM public.app_config WHERE chave = 'retencao_aviso_link')), ''),
                     'https://trailup.vercel.app');
  v_remetente := nullif(btrim(coalesce(
    (SELECT valor FROM public.app_config WHERE chave = 'retencao_aviso_remetente'),
    (SELECT valor FROM public.app_config WHERE chave = 'contato_email_destino'),
    (SELECT valor FROM public.app_config WHERE chave = 'dono_email'),
    '')), '');
  IF NOT v_tem_net THEN
    v_erro_cfg := 'pg_net ausente';
  ELSIF v_remetente IS NULL THEN
    v_erro_cfg := 'remetente nao configurado em app_config';
  ELSE
    BEGIN
      SELECT decrypted_secret INTO v_api_key FROM vault.decrypted_secrets WHERE name = 'brevo_api_key';
    EXCEPTION WHEN undefined_table OR invalid_schema_name OR insufficient_privilege THEN
      v_api_key := NULL;
    END;
    IF v_api_key IS NULL THEN
      v_erro_cfg := 'segredo brevo_api_key ausente no Vault';
    END IF;
  END IF;

  -- 3) Envia os pendentes.
  FOR r IN
    SELECT v.aluno_id,
           nullif(btrim(coalesce(u.email, a.email, '')), '') AS email
      FROM public.retencao_avisos_inatividade v
      LEFT JOIN auth.users u ON u.id = v.aluno_id
      LEFT JOIN public.alunos a ON a.id = v.aluno_id
     WHERE v.email_enviado_em IS NULL
       AND v.email_request_id IS NULL
       AND v.exclusao_enfileirada_em IS NULL
       AND v.email_tentativas < v_max_tent
       AND v.email_proxima_tentativa_em <= now()
     ORDER BY v.avisado_em
     LIMIT v_lote
     FOR UPDATE OF v SKIP LOCKED
  LOOP
    IF r.email IS NULL OR char_length(r.email) > 254 OR r.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      -- Sem e-mail valido: nao conta tentativa; olha de novo amanha (o titular
      -- pode cadastrar um). A conta NAO e apagada enquanto isso.
      UPDATE public.retencao_avisos_inatividade
         SET email_ultimo_erro = 'sem_email', email_proxima_tentativa_em = now() + interval '1 day'
       WHERE aluno_id = r.aluno_id;
      v_sem_email := v_sem_email + 1;
      CONTINUE;
    END IF;
    IF v_erro_cfg IS NOT NULL THEN
      UPDATE public.retencao_avisos_inatividade
         SET email_ultimo_erro = v_erro_cfg, email_proxima_tentativa_em = now() + interval '1 hour'
       WHERE aluno_id = r.aluno_id;
      v_falhas := v_falhas + 1;
      CONTINUE;
    END IF;

    v_prazo := to_char((now() + make_interval(days => v_aviso)) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
    v_texto := 'Olá!' || v_nl || v_nl
      || 'Faz mais de dois anos que você não entra no TrailUp. Pela nossa política de privacidade, '
      || 'contas paradas por tanto tempo são apagadas.' || v_nl || v_nl
      || 'Quer manter a sua conta? É só entrar até ' || v_prazo || ':' || v_nl
      || v_link || v_nl || v_nl
      || 'Se você não entrar até essa data, a conta e os dados dela serão apagados de vez.' || v_nl || v_nl
      || 'Se você tem menos de 18 anos, mostre este e-mail ao seu responsável.' || v_nl || v_nl
      || 'Equipe TrailUp';
    v_html := '<p>Olá!</p>'
      || '<p>Faz mais de dois anos que você não entra no TrailUp. Pela nossa política de privacidade, '
      || 'contas paradas por tanto tempo são apagadas.</p>'
      || '<p>Quer manter a sua conta? É só entrar até <strong>' || v_prazo || '</strong>:</p>'
      || '<p><a href="' || replace(v_link, '"', '%22') || '">Entrar no TrailUp</a></p>'
      || '<p>Se você não entrar até essa data, a conta e os dados dela serão apagados de vez.</p>'
      || '<p>Se você tem menos de 18 anos, mostre este e-mail ao seu responsável.</p>'
      || '<p>Equipe TrailUp</p>';

    BEGIN
      v_req_id := net.http_post(
        url := 'https://api.brevo.com/v3/smtp/email',
        body := jsonb_build_object(
          'sender', jsonb_build_object('email', v_remetente, 'name', 'TrailUp'),
          'to', jsonb_build_array(jsonb_build_object('email', r.email)),
          'subject', 'Sua conta no TrailUp será apagada se você não entrar até ' || v_prazo,
          'textContent', v_texto,
          'htmlContent', v_html,
          'tags', jsonb_build_array('retencao_conta_inativa')
        ),
        params := '{}'::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json', 'api-key', v_api_key),
        timeout_milliseconds := 10000
      );
      UPDATE public.retencao_avisos_inatividade
         SET email_request_id = v_req_id, email_solicitado_em = now(),
             email_tentativas = email_tentativas + 1, email_ultimo_erro = NULL
       WHERE aluno_id = r.aluno_id;
      v_enviados := v_enviados + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.retencao_avisos_inatividade
         SET email_tentativas = email_tentativas + 1,
             email_ultimo_erro = left(SQLERRM, 300),
             email_proxima_tentativa_em = now() + interval '1 hour'
       WHERE aluno_id = r.aluno_id;
      v_falhas := v_falhas + 1;
    END;
  END LOOP;

  IF v_falhas > 0 OR v_sem_email > 0 THEN
    RAISE LOG 'retencao_avisos_email: % falha(s), % sem e-mail', v_falhas, v_sem_email;
  END IF;

  RETURN jsonb_build_object(
    'modo', 'aplicar', 'confirmados', v_confirmados, 'enviados', v_enviados,
    'falhas', v_falhas, 'sem_email', v_sem_email, 'esgotados', v_esgotados,
    'erro_configuracao', v_erro_cfg);
END;
$function$;
REVOKE ALL ON FUNCTION public.retencao_avisos_email(boolean) FROM PUBLIC, anon, authenticated;
"""

RETENCAO_SQL = r"""CREATE OR REPLACE FUNCTION public.trailup_retencao(p_aplicar boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inicio    timestamptz := clock_timestamp();
  v_aplicar   boolean;
  v_lote      integer;
  v_pol       public.retencao_politica;
  v_pred      text;
  v_alvo      text;
  v_n         bigint;
  v_tabelas   jsonb := '[]'::jsonb;
  v_contas    jsonb;
  v_inativa   integer;
  v_aviso     integer;
  v_max       integer;
  v_voltaram  bigint;
  v_avisos    bigint;
  v_exclusoes bigint;
  v_retidas   bigint;
  v_avisaria  jsonb;
  v_removeria jsonb;
  v_emails    jsonb;
  v_fila      bigint := 0;
  v_resultado jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('trailup_retencao')) THEN
    RETURN jsonb_build_object('pulado', 'outra execucao em andamento');
  END IF;

  v_aplicar := coalesce(
    p_aplicar,
    (SELECT valor = 'aplicar' FROM public.app_config WHERE chave = 'retencao_modo'),
    false);
  v_lote := greatest(public.retencao_config_int('retencao_lote_max', 50000), 1);

  -- Quem pode ficar no prazo longo. Calculado uma vez por execucao.
  CREATE TEMP TABLE IF NOT EXISTS retencao_pesquisa (aluno_id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE pg_temp.retencao_pesquisa;
  IF to_regclass('public.consentimento_pesquisa') IS NOT NULL THEN
    INSERT INTO pg_temp.retencao_pesquisa (aluno_id)
    SELECT DISTINCT cp.aluno_id
      FROM public.consentimento_pesquisa cp
     WHERE cp.aluno_id IS NOT NULL
       AND public.aluno_finalidade_permitida(cp.aluno_id, 'pesquisa');
  END IF;

  FOR v_pol IN
    SELECT * FROM public.retencao_politica
     WHERE ativo AND acao IN ('apagar', 'redigir', 'agregar_e_apagar', 'saida_turma')
     ORDER BY ordem, tabela, acao
  LOOP
    BEGIN
      IF to_regclass(format('public.%I', v_pol.tabela)) IS NULL THEN
        v_tabelas := v_tabelas || jsonb_build_object(
          'tabela', v_pol.tabela, 'acao', v_pol.acao, 'erro', 'tabela inexistente');
        CONTINUE;
      END IF;
      v_pred := public.retencao_predicado(v_pol);
      v_alvo := format(
        't.ctid = ANY (ARRAY(SELECT t.ctid FROM public.%I t WHERE %s LIMIT %s))',
        v_pol.tabela, v_pred, v_lote);

      IF NOT v_aplicar THEN
        EXECUTE format('SELECT count(*) FROM public.%I t WHERE %s', v_pol.tabela, v_pred) INTO v_n;
      ELSIF v_pol.acao = 'redigir' THEN
        EXECUTE format('UPDATE public.%I t SET %s WHERE %s', v_pol.tabela, v_pol.ajuste, v_alvo);
        GET DIAGNOSTICS v_n = ROW_COUNT;
      ELSIF v_pol.acao = 'agregar_e_apagar' THEN
        EXECUTE format(
          'WITH saiu AS (DELETE FROM public.%I t WHERE %s'
          ' RETURNING t.classe_id, t.topico_id, t.scope, t.captured_at, t.visits, t.dwell_sec,'
          ' t.active_sec, t.idle_sec, t.touch_count),'
          ' somou AS (INSERT INTO public.telemetria_agregado_turma_dia AS a'
          ' (classe_id, topico_id, scope, dia, entradas, visits, dwell_sec, active_sec, idle_sec, touch_count)'
          ' SELECT classe_id, topico_id, scope, (captured_at AT TIME ZONE ''America/Sao_Paulo'')::date,'
          ' count(*), sum(visits), sum(dwell_sec), sum(active_sec), sum(idle_sec), sum(touch_count)'
          ' FROM saiu GROUP BY 1, 2, 3, 4'
          ' ON CONFLICT (classe_id, (coalesce(topico_id, 0)), scope, dia) DO UPDATE SET'
          ' entradas = a.entradas + EXCLUDED.entradas, visits = a.visits + EXCLUDED.visits,'
          ' dwell_sec = a.dwell_sec + EXCLUDED.dwell_sec, active_sec = a.active_sec + EXCLUDED.active_sec,'
          ' idle_sec = a.idle_sec + EXCLUDED.idle_sec, touch_count = a.touch_count + EXCLUDED.touch_count'
          ' RETURNING 1)'
          ' SELECT count(*) FROM saiu',
          v_pol.tabela, v_alvo) INTO v_n;
      ELSE
        EXECUTE format('DELETE FROM public.%I t WHERE %s', v_pol.tabela, v_alvo);
        GET DIAGNOSTICS v_n = ROW_COUNT;
      END IF;

      v_tabelas := v_tabelas || jsonb_build_object(
        'tabela', v_pol.tabela, 'acao', v_pol.acao, 'linhas', v_n);
    EXCEPTION WHEN OTHERS THEN
      -- Uma tabela com problema nao segura as outras; o erro fica no registro.
      v_tabelas := v_tabelas || jsonb_build_object(
        'tabela', v_pol.tabela, 'acao', v_pol.acao, 'erro', SQLERRM);
    END;
  END LOOP;

  -- Conta inativa (20261024_07): 24 meses sem acesso -> aviso (notificacao no
  -- app + e-mail pela Brevo); a conta so sai v_aviso dias DEPOIS do e-mail
  -- aceito pela Brevo, se continuar sem acesso. Sem e-mail entregue, nao ha
  -- exclusao: a linha fica esperando um novo envio. Voltar a entrar apaga o
  -- aviso e cancela o prazo.
  v_inativa := public.retencao_config_int('retencao_conta_inativa_dias', 730);
  v_aviso := public.retencao_config_int('retencao_conta_aviso_dias', 30);
  v_max := public.retencao_config_int('retencao_conta_max_exclusoes', 20);

  CREATE TEMP TABLE IF NOT EXISTS retencao_ultimo_acesso (
    aluno_id uuid PRIMARY KEY, ultimo timestamptz) ON COMMIT DROP;
  TRUNCATE pg_temp.retencao_ultimo_acesso;
  INSERT INTO pg_temp.retencao_ultimo_acesso (aluno_id, ultimo)
  SELECT a.id, greatest(u.created_at, u.last_sign_in_at, d.ultimo)
    FROM public.alunos a
    JOIN auth.users u ON u.id = a.id
    LEFT JOIN (
      SELECT aluno_id, max(coalesce(ultimo_acesso_em, atualizado_em)) AS ultimo
        FROM public.aluno_atividade_diaria GROUP BY aluno_id) d ON d.aluno_id = a.id
   WHERE NOT EXISTS (SELECT 1 FROM public.professor p WHERE p.id = a.id);

  SELECT count(*) INTO v_voltaram
    FROM public.retencao_avisos_inatividade v
    JOIN pg_temp.retencao_ultimo_acesso ua ON ua.aluno_id = v.aluno_id
   WHERE v.exclusao_enfileirada_em IS NULL AND ua.ultimo > v.avisado_em;

  SELECT count(*), coalesce(jsonb_agg(x.aluno_id) FILTER (WHERE x.n <= 50), '[]'::jsonb)
    INTO v_avisos, v_avisaria
    FROM (
      SELECT ua.aluno_id, row_number() OVER (ORDER BY ua.ultimo) AS n
        FROM pg_temp.retencao_ultimo_acesso ua
       WHERE ua.ultimo < now() - make_interval(days => v_inativa)
         AND NOT EXISTS (SELECT 1 FROM public.retencao_avisos_inatividade v WHERE v.aluno_id = ua.aluno_id)) x;

  SELECT count(*), coalesce(jsonb_agg(x.aluno_id), '[]'::jsonb)
    INTO v_exclusoes, v_removeria
    FROM (
      SELECT v.aluno_id
        FROM public.retencao_avisos_inatividade v
        JOIN pg_temp.retencao_ultimo_acesso ua ON ua.aluno_id = v.aluno_id
       WHERE v.exclusao_enfileirada_em IS NULL
         AND v.email_enviado_em IS NOT NULL
         AND v.email_enviado_em < now() - make_interval(days => v_aviso)
         AND ua.ultimo <= v.avisado_em
       ORDER BY v.email_enviado_em
       LIMIT v_max) x;

  -- Prazo vencido, mas o e-mail nunca saiu: fica retida (nao apaga sem aviso).
  SELECT count(*) INTO v_retidas
    FROM public.retencao_avisos_inatividade v
    JOIN pg_temp.retencao_ultimo_acesso ua ON ua.aluno_id = v.aluno_id
   WHERE v.exclusao_enfileirada_em IS NULL
     AND v.email_enviado_em IS NULL
     AND v.avisado_em < now() - make_interval(days => v_aviso)
     AND ua.ultimo <= v.avisado_em;

  IF v_aplicar THEN
    DELETE FROM public.retencao_avisos_inatividade v
     USING pg_temp.retencao_ultimo_acesso ua
     WHERE ua.aluno_id = v.aluno_id AND v.exclusao_enfileirada_em IS NULL
       AND ua.ultimo > v.avisado_em;

    WITH alvo AS (
      SELECT v.aluno_id
        FROM public.retencao_avisos_inatividade v
        JOIN pg_temp.retencao_ultimo_acesso ua ON ua.aluno_id = v.aluno_id
       WHERE v.exclusao_enfileirada_em IS NULL
         AND v.email_enviado_em IS NOT NULL
         AND v.email_enviado_em < now() - make_interval(days => v_aviso)
         AND ua.ultimo <= v.avisado_em
       ORDER BY v.email_enviado_em
       LIMIT v_max),
    fila AS (
      INSERT INTO public.retencao_fila_externa (destino, caminho, ref)
      SELECT 'auth_user', alvo.aluno_id::text, jsonb_build_object('motivo', 'conta_inativa')
        FROM alvo
      ON CONFLICT DO NOTHING)
    UPDATE public.retencao_avisos_inatividade v
       SET exclusao_enfileirada_em = now()
      FROM alvo WHERE alvo.aluno_id = v.aluno_id;

    WITH novos AS (
      INSERT INTO public.retencao_avisos_inatividade (aluno_id, ultimo_acesso_em)
      SELECT ua.aluno_id, ua.ultimo
        FROM pg_temp.retencao_ultimo_acesso ua
       WHERE ua.ultimo < now() - make_interval(days => v_inativa)
      ON CONFLICT (aluno_id) DO NOTHING
      RETURNING aluno_id)
    INSERT INTO public.notificacoes (aluno_id, titulo, corpo, tipo, origem, contexto)
    SELECT novos.aluno_id,
           'Sua conta vai ser apagada',
           'Você não entra no TrailUp há mais de dois anos. Enviamos um e-mail com o aviso: se não '
             || 'entrar nos ' || v_aviso::text || ' dias seguintes a ele, a conta e os dados dela serão apagados.',
           'sistema', 'retencao', jsonb_build_object('motivo', 'conta_inativa')
      FROM novos;

    DELETE FROM public.retencao_fila_externa
     WHERE processado_em < now() - make_interval(days => public.retencao_config_int('retencao_fila_dias', 30));
    GET DIAGNOSTICS v_fila = ROW_COUNT;
    DELETE FROM public.retencao_execucoes WHERE iniciado_em < now() - interval '400 days';
  END IF;

  -- E-mails de aviso: confere os pedidos anteriores e envia os pendentes. Em
  -- simular, so conta.
  v_emails := public.retencao_avisos_email(v_aplicar);

  v_contas := jsonb_build_object(
    'voltaram', v_voltaram, 'avisos', v_avisos, 'exclusoes', v_exclusoes,
    'retidas_sem_email', v_retidas, 'email', v_emails,
    'inativa_dias', v_inativa, 'aviso_dias', v_aviso);
  IF NOT v_aplicar THEN
    -- Simulacao relata QUEM (ids, ate 50 avisos e v_max exclusoes); nada muda.
    v_contas := v_contas || jsonb_build_object('avisaria', v_avisaria, 'removeria', v_removeria);
  END IF;
  v_resultado := jsonb_build_object(
    'modo', CASE WHEN v_aplicar THEN 'aplicar' ELSE 'simular' END,
    'tabelas', v_tabelas,
    'contas_inativas', v_contas,
    'fila_externa_limpa', v_fila,
    'lote_max', v_lote);
  INSERT INTO public.retencao_execucoes (modo, iniciado_em, resultado)
  VALUES (CASE WHEN v_aplicar THEN 'aplicar' ELSE 'simular' END, v_inicio, v_resultado);
  RETURN v_resultado;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trailup_retencao(boolean) FROM PUBLIC, anon, authenticated;
"""

CRON_SQL = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{_JOB_AVISOS}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{_JOB_AVISOS}');
    PERFORM cron.schedule('{_JOB_AVISOS}', '*/30 * * * *', 'SELECT public.retencao_avisos_email()');
  END IF;
END $$
"""


def upgrade() -> None:
    op.execute(FKS_SQL)
    op.execute(PROFESSOR_SQL)
    op.execute(AVISOS_SQL)
    op.execute(EMAIL_SQL)
    op.execute(RETENCAO_SQL)
    op.execute(CRON_SQL)


def _retencao_da_03() -> str:
    """O `trailup_retencao` como a 20261024_03 deixou (o downgrade volta a ele)."""
    arquivo = Path(__file__).with_name("20261024_03_retencao_e_expurgo.py")
    spec = importlib.util.spec_from_file_location("retencao_03_para_07", arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    m = re.search(r"CREATE OR REPLACE FUNCTION public\.trailup_retencao\(.*?\$function\$;", modulo.FUNCOES_SQL, re.S)
    if m is None:
        raise RuntimeError("trailup_retencao da 20261024_03 nao encontrado")
    return m.group(0)


def downgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
            PERFORM cron.unschedule('{_JOB_AVISOS}')
              WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{_JOB_AVISOS}');
          END IF;
        END $$
        """
    )
    op.execute(_retencao_da_03())
    op.execute("REVOKE EXECUTE ON FUNCTION public.trailup_retencao(boolean) FROM PUBLIC, anon, authenticated")
    op.execute("DROP FUNCTION IF EXISTS public.retencao_avisos_email(boolean)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_excluir_minha_conta_professor()")
    op.execute("DROP TRIGGER IF EXISTS trg_professor_removido_apaga_turmas ON public.professor")
    op.execute("DROP FUNCTION IF EXISTS public.trg_professor_removido_apaga_turmas()")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_apagar_turma_inteira(bigint)")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_caminho_arquivo(text)")
    # Sem o gatilho, o CASCADE esbarraria nas FKs NO ACTION: volta ao NO ACTION
    # de antes (professor com turma nao sai, como antes desta migracao).
    op.execute(
        """
        ALTER TABLE public.classe DROP CONSTRAINT IF EXISTS classe_professor_id_fkey;
        ALTER TABLE public.classe ADD CONSTRAINT classe_professor_id_fkey
          FOREIGN KEY (professor_id) REFERENCES public.professor (id) NOT VALID;
        """
    )
    op.execute("DELETE FROM public.retencao_politica WHERE tabela = 'exclusao_conta_professor'")
    op.execute("DROP TABLE IF EXISTS public.exclusao_conta_professor")
    op.execute(
        "DELETE FROM public.app_config WHERE chave IN "
        "('retencao_aviso_link', 'retencao_aviso_email_lote', 'retencao_aviso_email_max_tentativas')"
    )
    op.execute(
        """
        ALTER TABLE public.retencao_avisos_inatividade
          DROP COLUMN IF EXISTS email_enviado_em,
          DROP COLUMN IF EXISTS email_request_id,
          DROP COLUMN IF EXISTS email_solicitado_em,
          DROP COLUMN IF EXISTS email_tentativas,
          DROP COLUMN IF EXISTS email_proxima_tentativa_em,
          DROP COLUMN IF EXISTS email_ultimo_erro
        """
    )
    # Fica, de proposito: professor_id_fkey em CASCADE (voltar a NO ACTION so
    # reabriria o bloqueio da exclusao do usuario do Auth).
