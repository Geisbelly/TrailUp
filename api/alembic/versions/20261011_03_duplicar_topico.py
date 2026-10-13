"""duplicar_topico: copia um tópico e tudo que é dele numa transação só

Fase 1 do redesign da tela Trilhas (docs/frontend/redesign-fase-2/04-analise-trilhas.md,
seção 2). O protótipo pede "Duplicar tópico" no cartão do mapa; o código não tinha.
Pelo mesmo motivo de `duplicar_classe` (20261011_01) a cópia é uma função
transacional no banco, não dezenas de INSERT no console: falha no meio não deixa
tópico pela metade.

Copia: o tópico, seus conteúdos (com metadata), as atividades dele (pontuação,
prazo, regras), as questões (mídia e nota estabelecida), os vínculos
atividade↔conteúdo e os cards (cor, ordem; `conteudo_origem_id` é remapeado
quando aponta para um conteúdo do próprio tópico). NÃO copia progresso de aluno,
telemetria nem personalização — a cópia nasce sem histórico — e NÃO copia as
ligações next/depende: sequência e pré-requisito são decisão do professor sobre o
grafo, e a cópia ligada igual ao original duplicaria arestas sem que ele tenha
pedido (ela entra solta e ele a posiciona).

A ordem da cópia é a última da turma (max+1). O nome ganha "(cópia)", "(cópia 2)"…
dentro da turma. Posse conferida ANTES de ler qualquer linha, pelo mesmo helper
de excluir_classe/duplicar_classe. Triggers: como em duplicar_classe, o tópico
entra antes dos conteúdos para o class_delta coalescer num job só.

Os arquivos no Storage não são copiados; a cópia aponta para os mesmos caminhos.

Revision ID: 20261011_03
Revises: 20261011_02
Create Date: 2026-10-11
"""

from alembic import op

revision = "20261011_03"
down_revision = "20261011_02"
branch_labels = None
depends_on = None


SQL = r"""
CREATE OR REPLACE FUNCTION public.duplicar_topico(p_topico_id bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_professor uuid := auth.uid();
  v_origem    public.topicos%ROWTYPE;
  v_base      text;
  v_numero    integer;
  v_ordem     integer;
  v_novo      bigint;
  v_novo_id   bigint;
  v_conteudos jsonb := '{}'::jsonb;  -- id antigo -> id novo
  v_atividades jsonb := '{}'::jsonb;
  rc          record;
  r           record;
BEGIN
  SELECT * INTO v_origem FROM public.topicos WHERE id = p_topico_id FOR SHARE;
  -- Posse ANTES de copiar qualquer linha. NOT EXISTS (e não NOT IN) pelo NULL.
  IF v_professor IS NULL OR NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_origem.classe_id
  ) THEN
    RAISE EXCEPTION 'Tópico não encontrado ou sem permissão para duplicar.' USING ERRCODE = '42501';
  END IF;

  -- Duas duplicações simultâneas na mesma turma não escolhem a mesma numeração/ordem.
  PERFORM pg_advisory_xact_lock(hashtext('duplicar_topico:' || v_origem.classe_id::text));

  v_base := coalesce(nullif(btrim(v_origem.nome), ''), 'Tópico ' || p_topico_id);
  v_base := regexp_replace(v_base, '\s*\(cópia(\s+[0-9]+)?\)$', '');
  SELECT coalesce(max(n), 0) + 1 INTO v_numero
    FROM (
      SELECT CASE
               WHEN t.nome = v_base || ' (cópia)' THEN 1
               WHEN left(t.nome, length(v_base) + 8) = v_base || ' (cópia '
                    AND right(t.nome, 1) = ')'
                    AND substr(t.nome, length(v_base) + 9, length(t.nome) - length(v_base) - 9) ~ '^[0-9]{1,6}$'
                 THEN substr(t.nome, length(v_base) + 9, length(t.nome) - length(v_base) - 9)::integer
             END AS n
        FROM public.topicos t
       WHERE t.classe_id = v_origem.classe_id
    ) existentes;

  SELECT coalesce(max(ordem), 0) + 1 INTO v_ordem FROM public.topicos WHERE classe_id = v_origem.classe_id;

  INSERT INTO public.topicos (classe_id, nome, descricao, ordem, next, depende)
  VALUES (
    v_origem.classe_id,
    v_base || CASE WHEN v_numero = 1 THEN ' (cópia)' ELSE ' (cópia ' || v_numero || ')' END,
    v_origem.descricao,
    v_ordem,
    '[]'::json,
    '[]'::json
  )
  RETURNING id INTO v_novo;

  FOR rc IN SELECT c.* FROM public.conteudos c WHERE c.topico_id = p_topico_id ORDER BY c.ordem NULLS LAST, c.id LOOP
    INSERT INTO public.conteudos (topico_id, titulo, tipo, conteudo, ordem, metadata)
    VALUES (v_novo, rc.titulo, rc.tipo, rc.conteudo, rc.ordem, rc.metadata)
    RETURNING id INTO v_novo_id;
    v_conteudos := v_conteudos || jsonb_build_object(rc.id::text, v_novo_id);
  END LOOP;

  FOR r IN SELECT a.* FROM public.atividades a WHERE a.topico_id = p_topico_id ORDER BY a.id LOOP
    INSERT INTO public.atividades (topico_id, titulo, descricao, tipo, pontuacao_maxima, data_entrega, metadata)
    VALUES (v_novo, r.titulo, r.descricao, r.tipo, r.pontuacao_maxima, r.data_entrega, r.metadata)
    RETURNING id INTO v_novo_id;
    v_atividades := v_atividades || jsonb_build_object(r.id::text, v_novo_id);
  END LOOP;

  INSERT INTO public.questoes (atividade_id, enunciado, tipo, alternativas, resposta_correta, midia_url, nota_estabelecida)
  SELECT (v_atividades ->> q.atividade_id::text)::bigint, q.enunciado, q.tipo, q.alternativas,
         q.resposta_correta, q.midia_url, q.nota_estabelecida
    FROM public.questoes q
   WHERE v_atividades ? q.atividade_id::text
   ORDER BY q.atividade_id, q.id;

  INSERT INTO public.atividade_conteudos (atividade_id, conteudo_id)
  SELECT (v_atividades ->> ac.atividade_id::text)::bigint, (v_conteudos ->> ac.conteudo_id::text)::bigint
    FROM public.atividade_conteudos ac
   WHERE v_atividades ? ac.atividade_id::text AND v_conteudos ? ac.conteudo_id::text;

  INSERT INTO public.cards (conteudo_id, titulo, descricao, imagem_url, cor, ordem, conteudo_origem_id)
  SELECT (v_conteudos ->> k.conteudo_id::text)::bigint, k.titulo, k.descricao, k.imagem_url, k.cor, k.ordem,
         CASE WHEN k.conteudo_origem_id IS NOT NULL AND v_conteudos ? k.conteudo_origem_id::text
              THEN (v_conteudos ->> k.conteudo_origem_id::text)::bigint
              ELSE k.conteudo_origem_id END
    FROM public.cards k
   WHERE v_conteudos ? k.conteudo_id::text
   ORDER BY k.conteudo_id, k.ordem NULLS LAST, k.id;

  RETURN v_novo;
END;
$function$;
REVOKE ALL ON FUNCTION public.duplicar_topico(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicar_topico(bigint) TO authenticated;
NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.duplicar_topico(bigint)")
    op.execute("NOTIFY pgrst, 'reload schema'")
