"""duplicar_classe: copia a trilha de uma turma numa transação só

Fase 5 do redesign da tela Turmas (docs/frontend/redesign-fase-2/03-analise-turmas.md,
seção 2.3-6). A duplicação era feita no console, com dezenas de INSERT
separados e sem transação: uma falha no meio deixava uma turma pela metade.
E copiava menos colunas do que existem — a cópia perdia os arquivos anexados
(conteudos.metadata), a pontuação e as regras das atividades
(atividades.pontuacao_maxima, metadata), a mídia das questões
(questoes.midia_url) e a cor/ordem dos cards.

A função confere a posse ANTES de ler qualquer coisa (mesmo padrão de
excluir_classe, 20260920_06) e copia só a TRILHA: tópicos, conteúdos,
atividades, questões, vínculos atividade↔conteúdo e cards. Matrículas,
progresso, telemetria, guildas, ranking e personalizações não vão — a cópia é
uma turma nova, sem alunos e sem histórico.

Efeitos dos triggers, conferidos no banco:
- INSERT em classe dispara o job de tema (trg_classe_mapa_tema_job): a cópia
  ganha o tema dela, como qualquer turma nova;
- INSERT/UPDATE nas tabelas da trilha dispara fn_enqueue_class_delta_job, que
  trava o job pending da classe (FOR UPDATE) e funde nele: dentro desta
  transação a primeira linha cria o job e as outras só o atualizam — um job
  para a cópia inteira, não um por linha;
- os triggers *_after_insert provisionam progresso para os matriculados da
  classe — a cópia não tem nenhum, então não fazem nada;
- trg_questoes_espelha_gabarito grava o gabarito das questões novas em
  questao_gabarito, como numa questão criada pelo console.

Os arquivos em si (Storage) NÃO são copiados — SQL não copia objeto. A cópia
aponta para os MESMOS caminhos; o console passa a não apagar arquivo que
outro conteúdo ainda usa (classDeletion.ts / ContentFileUpload.tsx).

Revision ID: 20261011_01
Revises: 20261003_10
Create Date: 2026-09-30
"""

from alembic import op

revision = "20261011_01"
down_revision = "20261003_10"
branch_labels = None
depends_on = None


SQL = r"""
CREATE OR REPLACE FUNCTION public.duplicar_classe(p_classe_id bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_professor uuid := auth.uid();
  v_origem    public.classe%ROWTYPE;
  v_base      text;
  v_numero    integer;
  v_nova      bigint;
  v_novo_id   bigint;
  v_novo_conteudo bigint;
  v_topicos   jsonb := '{}'::jsonb;  -- id antigo -> id novo
  v_conteudos jsonb := '{}'::jsonb;
  v_atividades jsonb := '{}'::jsonb;
  r           record;
  rc          record;
BEGIN
  -- Posse ANTES de ler qualquer linha da trilha; sem chave de serviço no console.
  -- NOT EXISTS, e não NOT IN: um NULL na lista faria o NOT IN dar NULL e o IF
  -- deixaria passar.
  IF v_professor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão para duplicar.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_origem FROM public.classe WHERE id = p_classe_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão para duplicar.' USING ERRCODE = '42501';
  END IF;

  -- Duas duplicações simultâneas do mesmo professor não podem escolher o
  -- mesmo número de cópia.
  PERFORM pg_advisory_xact_lock(hashtext('duplicar_classe:' || v_professor::text));

  -- "<nome> (cópia)", "(cópia 2)", "(cópia 3)"… Duplicar uma cópia continua a
  -- numeração do original, em vez de empilhar "(cópia) (cópia)".
  v_base := coalesce(nullif(btrim(v_origem.descricao), ''), 'Turma ' || p_classe_id);
  v_base := regexp_replace(v_base, '\s*\(cópia(\s+[0-9]+)?\)$', '');
  SELECT coalesce(max(n), 0) + 1 INTO v_numero
    FROM (
      SELECT CASE
               WHEN c.descricao = v_base || ' (cópia)' THEN 1
               WHEN left(c.descricao, length(v_base) + 8) = v_base || ' (cópia '
                    AND right(c.descricao, 1) = ')'
                    AND substr(c.descricao, length(v_base) + 9, length(c.descricao) - length(v_base) - 9) ~ '^[0-9]{1,6}$'
                 THEN substr(c.descricao, length(v_base) + 9, length(c.descricao) - length(v_base) - 9)::integer
             END AS n
        FROM public.classe c
       WHERE c.professor_id = v_professor
    ) existentes;

  INSERT INTO public.classe (materia_id, professor_id, descricao)
  VALUES (
    v_origem.materia_id,
    v_professor,
    v_base || CASE WHEN v_numero = 1 THEN ' (cópia)' ELSE ' (cópia ' || v_numero || ')' END
  )
  RETURNING id INTO v_nova;

  -- Cada tópico entra JÁ com os seus conteúdos (com metadata: arquivos
  -- anexados, marcas de arquivo perdido). A ordem importa por causa do
  -- class_delta: todo evento reemite um alvo "tópico sem conteúdo" para cada
  -- tópico do job que ainda não tem conteúdo, e uq_job_target_base não
  -- deduplica conteudo_id NULL. Inserir todos os tópicos antes dos conteúdos
  -- multiplicava esses alvos; assim sobra um por tópico (o do próprio INSERT).
  FOR r IN SELECT * FROM public.topicos WHERE classe_id = p_classe_id ORDER BY ordem NULLS LAST, id LOOP
    INSERT INTO public.topicos (classe_id, nome, descricao, ordem)
    VALUES (v_nova, r.nome, r.descricao, r.ordem)
    RETURNING id INTO v_novo_id;
    v_topicos := v_topicos || jsonb_build_object(r.id::text, v_novo_id);

    FOR rc IN SELECT c.* FROM public.conteudos c WHERE c.topico_id = r.id ORDER BY c.ordem NULLS LAST, c.id LOOP
      INSERT INTO public.conteudos (topico_id, titulo, tipo, conteudo, ordem, metadata)
      VALUES (v_novo_id, rc.titulo, rc.tipo, rc.conteudo, rc.ordem, rc.metadata)
      RETURNING id INTO v_novo_conteudo;
      v_conteudos := v_conteudos || jsonb_build_object(rc.id::text, v_novo_conteudo);
    END LOOP;
  END LOOP;

  -- next/depende só agora: apontam para tópicos que só existem depois do laço,
  -- e com os conteúdos já copiados o UPDATE não gera alvo "sem conteúdo".
  -- Id que não é da própria trilha sai: tópico não depende de outra turma.
  FOR r IN SELECT id, next, depende FROM public.topicos WHERE classe_id = p_classe_id LOOP
    UPDATE public.topicos SET
      next = CASE WHEN r.next IS NULL OR json_typeof(r.next) <> 'array' THEN r.next ELSE (
        SELECT coalesce(json_agg((v_topicos ->> e)::bigint), '[]'::json)
          FROM json_array_elements_text(r.next) e WHERE v_topicos ? e) END,
      depende = CASE WHEN r.depende IS NULL OR json_typeof(r.depende) <> 'array' THEN r.depende ELSE (
        SELECT coalesce(json_agg((v_topicos ->> e)::bigint), '[]'::json)
          FROM json_array_elements_text(r.depende) e WHERE v_topicos ? e) END
    WHERE id = (v_topicos ->> r.id::text)::bigint;
  END LOOP;

  -- Atividades, com pontuação máxima, prazo e metadata (regras de correção).
  FOR r IN
    SELECT a.* FROM public.atividades a
     WHERE a.topico_id IN (SELECT t.id FROM public.topicos t WHERE t.classe_id = p_classe_id)
     ORDER BY a.topico_id, a.id
  LOOP
    INSERT INTO public.atividades (topico_id, titulo, descricao, tipo, pontuacao_maxima, data_entrega, metadata)
    VALUES ((v_topicos ->> r.topico_id::text)::bigint, r.titulo, r.descricao, r.tipo, r.pontuacao_maxima, r.data_entrega, r.metadata)
    RETURNING id INTO v_novo_id;
    v_atividades := v_atividades || jsonb_build_object(r.id::text, v_novo_id);
  END LOOP;

  -- Questões, com mídia e nota estabelecida.
  INSERT INTO public.questoes (atividade_id, enunciado, tipo, alternativas, resposta_correta, midia_url, nota_estabelecida)
  SELECT (v_atividades ->> q.atividade_id::text)::bigint, q.enunciado, q.tipo, q.alternativas,
         q.resposta_correta, q.midia_url, q.nota_estabelecida
    FROM public.questoes q
   WHERE v_atividades ? q.atividade_id::text
   ORDER BY q.atividade_id, q.id;

  -- Vínculos atividade <-> conteúdo, só quando os dois lados são da trilha.
  INSERT INTO public.atividade_conteudos (atividade_id, conteudo_id)
  SELECT (v_atividades ->> ac.atividade_id::text)::bigint, (v_conteudos ->> ac.conteudo_id::text)::bigint
    FROM public.atividade_conteudos ac
   WHERE v_atividades ? ac.atividade_id::text AND v_conteudos ? ac.conteudo_id::text;

  -- Cards, com cor e ordem; a origem é remapeada quando é da própria trilha.
  INSERT INTO public.cards (conteudo_id, titulo, descricao, imagem_url, cor, ordem, conteudo_origem_id)
  SELECT (v_conteudos ->> k.conteudo_id::text)::bigint, k.titulo, k.descricao, k.imagem_url, k.cor, k.ordem,
         CASE WHEN k.conteudo_origem_id IS NOT NULL AND v_conteudos ? k.conteudo_origem_id::text
              THEN (v_conteudos ->> k.conteudo_origem_id::text)::bigint
              ELSE k.conteudo_origem_id END
    FROM public.cards k
   WHERE v_conteudos ? k.conteudo_id::text
   ORDER BY k.conteudo_id, k.ordem NULLS LAST, k.id;

  RETURN v_nova;
END;
$function$;
REVOKE ALL ON FUNCTION public.duplicar_classe(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicar_classe(bigint) TO authenticated;
NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.duplicar_classe(bigint)")
    op.execute("NOTIFY pgrst, 'reload schema'")
