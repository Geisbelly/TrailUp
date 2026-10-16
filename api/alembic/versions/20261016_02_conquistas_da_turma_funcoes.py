"""conquistas da turma: o professor cria, edita, desativa e lista pelas funções do banco

Segundo passo do banco da tela Conquistas. Hoje o catálogo de conquistas é dado de
sistema: `authenticated` só lê (`20260826_09`), e a API escreve como dona. O professor
não tem caminho de escrita, e abrir `INSERT/UPDATE` na tabela deixaria ele criar linha
com qualquer `classe_id`, `escopo` ou `criterio`. Então a escrita passa por funções
`SECURITY DEFINER` que conferem tudo antes — o mesmo molde de `registrar_presenca_da_turma`.

- `conquista_da_turma_salvar`: cria (p_id nulo) ou edita. Confere a **posse da turma antes
  de ler qualquer linha** (`NOT EXISTS` sobre `app_classes_do_professor()`, nunca `NOT IN`),
  o escopo (`perfil_alvo` só em escopo `perfil`, e um dos 7 perfis), nome/descrição, pontos
  (0 até `conquista_recompensa_maxima`, padrão 100) e que a métrica do critério é suportada
  (o CHECK da tabela é a segunda barreira). Criar respeita o teto `conquistas_por_turma_max`.
  Editar só mexe numa linha DESTA turma — nunca numa global.
- `conquista_da_turma_alternar`: ativa/desativa. Não apaga: a posse dos alunos fica.
- `conquistas_da_turma`: a lista da turma com quantos alunos já ganharam cada uma (a tela
  usa para o aviso de "alterar o critério não revoga quem já ganhou").

A `categoria` (desempenho | habito | perfil_brainhex | progresso) sai da métrica, para o
professor não ter de escolher algo que não entende.

**O gatilho que concede conquistas ainda não lê `ativa` nem filtra por turma** (ver
`20261016_01`): isso exige conferir a função ao vivo.

Revision ID: 20261016_02
Revises: 20261016_01
Create Date: 2026-10-16
"""

from alembic import op

revision = "20261016_02"
down_revision = "20261016_01"
branch_labels = None
depends_on = None


SQL = r"""
CREATE OR REPLACE FUNCTION public.conquista_da_turma_salvar(
  p_classe_id bigint,
  p_id        bigint,
  p_nome      text,
  p_descricao text,
  p_escopo    text,
  p_perfil_alvo text,
  p_criterio  jsonb,
  p_pontos    integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_professor uuid := auth.uid();
  v_nome      text := btrim(coalesce(p_nome, ''));
  v_descricao text := btrim(coalesce(p_descricao, ''));
  v_max_pontos integer;
  v_teto      integer;
  v_existentes integer;
  v_categoria text;
  v_id        bigint;
BEGIN
  IF v_professor IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  IF length(v_nome) < 3 OR length(v_nome) > 60 THEN
    RAISE EXCEPTION 'O nome precisa ter de 3 a 60 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(v_descricao) > 140 THEN
    RAISE EXCEPTION 'A descrição passa de 140 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF p_escopo NOT IN ('comum', 'perfil') THEN
    RAISE EXCEPTION 'Escopo inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_escopo = 'perfil' AND coalesce(p_perfil_alvo, '') NOT IN
     ('seeker', 'survivor', 'daredevil', 'mastermind', 'conqueror', 'socializer', 'achiever') THEN
    RAISE EXCEPTION 'Perfil inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_escopo = 'comum' AND p_perfil_alvo IS NOT NULL THEN
    RAISE EXCEPTION 'Conquista geral não tem perfil.' USING ERRCODE = '22023';
  END IF;

  IF p_criterio IS NULL OR jsonb_typeof(p_criterio) <> 'object'
     OR NOT public.fn_conquista_metrica_suportada(p_criterio ->> 'metrica') THEN
    RAISE EXCEPTION 'Métrica não suportada.' USING ERRCODE = '22023';
  END IF;

  v_max_pontos := coalesce(
    (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
       FROM public.app_config WHERE chave = 'conquista_recompensa_maxima'),
    100
  );
  IF p_pontos IS NULL OR p_pontos < 0 OR p_pontos > v_max_pontos THEN
    RAISE EXCEPTION 'Os pontos vão de 0 a %.', v_max_pontos USING ERRCODE = '22023';
  END IF;

  v_categoria := CASE
    WHEN p_escopo = 'perfil' THEN 'perfil_brainhex'
    WHEN p_criterio ->> 'metrica' IN ('dias_seguidos', 'minutos_totais') THEN 'habito'
    WHEN p_criterio ->> 'metrica' IN ('acertos_percentual', 'atividade_rapida') THEN 'desempenho'
    ELSE 'progresso'
  END;

  IF p_id IS NULL THEN
    -- Trava por turma para duas criações simultâneas não furarem o teto.
    PERFORM pg_advisory_xact_lock(hashtext('conquista_da_turma:' || p_classe_id::text));
    v_teto := coalesce(
      (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
         FROM public.app_config WHERE chave = 'conquistas_por_turma_max'),
      20
    );
    SELECT count(*) INTO v_existentes FROM public.conquistas WHERE classe_id = p_classe_id;
    IF v_existentes >= v_teto THEN
      RAISE EXCEPTION 'Esta turma já tem % conquistas (o teto).', v_teto USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.conquistas (nome, descricao, categoria, escopo, perfil_alvo, criterio, pontos_recompensa, classe_id, criado_por)
    VALUES (v_nome, nullif(v_descricao, ''), v_categoria, p_escopo, p_perfil_alvo, p_criterio, p_pontos, p_classe_id, v_professor)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.conquistas
       SET nome = v_nome, descricao = nullif(v_descricao, ''), categoria = v_categoria, escopo = p_escopo,
           perfil_alvo = p_perfil_alvo, criterio = p_criterio, pontos_recompensa = p_pontos
     WHERE id = p_id AND classe_id = p_classe_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Conquista não encontrada nesta turma.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.conquista_da_turma_alternar(p_id bigint, p_ativa boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_classe bigint;
BEGIN
  SELECT classe_id INTO v_classe FROM public.conquistas WHERE id = p_id;
  IF auth.uid() IS NULL OR v_classe IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_classe
  ) THEN
    RAISE EXCEPTION 'Conquista não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.conquistas SET ativa = coalesce(p_ativa, true) WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.conquistas_da_turma(p_classe_id bigint)
RETURNS TABLE (
  id bigint,
  nome text,
  descricao text,
  escopo text,
  perfil_alvo text,
  criterio jsonb,
  pontos_recompensa integer,
  ativa boolean,
  concedidas bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id::bigint, c.nome::text, c.descricao::text, c.escopo::text, c.perfil_alvo::text, c.criterio::jsonb,
         c.pontos_recompensa::integer, c.ativa,
         (SELECT count(*) FROM public.conquistas_aluno ca WHERE ca.conquista_id = c.id AND ca.concluida IS TRUE)
    FROM public.conquistas c
   WHERE c.classe_id = p_classe_id
   ORDER BY c.created_at, c.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.conquista_da_turma_salvar(bigint, bigint, text, text, text, text, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conquista_da_turma_salvar(bigint, bigint, text, text, text, text, jsonb, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.conquista_da_turma_alternar(bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conquista_da_turma_alternar(bigint, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.conquistas_da_turma(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conquistas_da_turma(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.conquistas_da_turma(bigint)")
    op.execute("DROP FUNCTION IF EXISTS public.conquista_da_turma_alternar(bigint, boolean)")
    op.execute(
        "DROP FUNCTION IF EXISTS public.conquista_da_turma_salvar(bigint, bigint, text, text, text, text, jsonb, integer)"
    )
    op.execute("NOTIFY pgrst, 'reload schema'")
