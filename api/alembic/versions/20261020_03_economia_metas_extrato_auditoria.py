"""metas, extrato filtrado, configuração auditada e a checagem de consistência

O razão continua sendo a única fonte de saldo. Meta e conclusão configurada
entram por ele, com o mesmo índice único do ganho. O extrato que o aluno e o
professor leem é uma função: a policy já recorta, e a função ainda recusa
aluno de outra turma. A leitura da trilha de auditoria e a checagem de
consistência ficam no painel admin da API. O cliente autenticado não executa
`economia_consistencia` nem lê `economia_auditoria`.

Revision ID: 20261020_03
Revises: 20261020_02
Create Date: 2026-10-19
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261020_03"
down_revision = "20261020_02"
branch_labels = None
depends_on = None


CREDITADO = """
CREATE OR REPLACE FUNCTION public.fn_evento_creditado(p_tipo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT COALESCE(
    starts_with(lower(p_tipo), 'presenca')
    OR starts_with(lower(p_tipo), 'participacao')
    OR starts_with(lower(p_tipo), 'conquista')
    OR starts_with(lower(p_tipo), 'nota_professor')
    OR starts_with(lower(p_tipo), 'meta_atingida'),
    false
  );
$fn$;

CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_meta_unico
  ON public.eventos_aluno (aluno_id, tipo, referencia)
  WHERE tipo = 'meta_atingida';
"""


METAS = r"""
CREATE OR REPLACE FUNCTION public.economia_avaliar_metas_de(
  p_aluno uuid,
  p_classe bigint
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_meta     public.economia_meta%ROWTYPE;
  v_progresso numeric;
  v_creditos integer := 0;
  v_novas    integer;
BEGIN
  IF p_aluno IS NULL OR p_classe IS NULL THEN
    RETURN 0;
  END IF;

  IF current_setting('trailup.avaliando_meta', true) = '1' THEN
    RETURN 0;
  END IF;
  PERFORM set_config('trailup.avaliando_meta', '1', true);

  FOR v_meta IN
    SELECT * FROM public.economia_meta
     WHERE classe_id = p_classe AND ativa
       AND moedas + pontos > 0
  LOOP
    v_progresso := 0;

    IF v_meta.criterio = 'atividades_concluidas' THEN
      SELECT count(*) INTO v_progresso
        FROM public.atividade_aluno aa
        JOIN public.atividades a ON a.id = aa.atividade_id
        JOIN public.topicos t ON t.id = a.topico_id
       WHERE aa.aluno_id = p_aluno
         AND aa.status::text = 'concluido'
         AND t.classe_id = p_classe
         AND (
           v_meta.escopo = 'classe'
           OR (v_meta.escopo = 'topico' AND a.topico_id = v_meta.alvo_id)
           OR (v_meta.escopo = 'atividade' AND a.id = v_meta.alvo_id)
         );

    ELSIF v_meta.criterio = 'nota_minima' AND v_meta.escopo = 'atividade' THEN
      SELECT CASE
               WHEN COALESCE(aa.pontuacao_maxima, a.pontuacao_maxima, 0) <= 0 THEN 0
               ELSE 100.0 * COALESCE(aa.pontuacao_obtida, 0)
                    / COALESCE(aa.pontuacao_maxima, a.pontuacao_maxima)
             END
        INTO v_progresso
        FROM public.atividade_aluno aa
        JOIN public.atividades a ON a.id = aa.atividade_id
       WHERE aa.aluno_id = p_aluno AND aa.atividade_id = v_meta.alvo_id;

    ELSIF v_meta.criterio = 'acertos' AND v_meta.escopo = 'classe' THEN
      SELECT count(*) INTO v_progresso
        FROM public.eventos_aluno e
       WHERE e.aluno_id = p_aluno
         AND e.tipo = 'atividade_acertada'
         AND public.fn_eventos_aluno_resolve_classe_id(e.tipo, e.referencia) = p_classe;

    ELSIF v_meta.criterio = 'presencas' AND v_meta.escopo = 'classe' THEN
      SELECT count(*) INTO v_progresso
        FROM public.eventos_aluno e
       WHERE e.aluno_id = p_aluno
         AND e.tipo = 'presenca_aula'
         AND e.referencia LIKE 'classe:' || p_classe::text || ':%';
    END IF;

    IF COALESCE(v_progresso, 0) < v_meta.limiar THEN
      CONTINUE;
    END IF;

    IF v_meta.moedas > 0 THEN
      INSERT INTO public.moedas_ledger
        (aluno_id, delta, motivo, evento_tipo, referencia, classe_id)
      VALUES
        (p_aluno, v_meta.moedas, 'evento', 'meta_atingida',
         'meta:' || v_meta.id::text, p_classe)
      ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento'
      DO NOTHING;
      GET DIAGNOSTICS v_novas = ROW_COUNT;
      v_creditos := v_creditos + v_novas;
    END IF;

    IF v_meta.pontos > 0 THEN
      INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)
      VALUES (p_aluno, 'meta_atingida', 'meta:' || v_meta.id::text, v_meta.pontos, now())
      ON CONFLICT (aluno_id, tipo, referencia) WHERE tipo = 'meta_atingida'
      DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_creditos;
END;
$fn$;

REVOKE ALL ON FUNCTION public.economia_avaliar_metas_de(uuid, bigint)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.economia_avaliar_metas(p_classe_id bigint DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_aluno uuid := auth.uid();
  v_classe bigint;
  v_total integer := 0;
  v_parte integer;
BEGIN
  IF v_aluno IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_classe IN
    SELECT id FROM public.app_classes_do_aluno() AS turma(id)
     WHERE p_classe_id IS NULL OR id = p_classe_id
  LOOP
    v_parte := public.economia_avaliar_metas_de(v_aluno, v_classe);
    v_total := v_total + COALESCE(v_parte, 0);
  END LOOP;

  RETURN v_total;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.economia_avaliar_metas(bigint) TO authenticated;
"""


GANHO = r"""
CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_paga_moeda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_classe_id bigint;
  v_moedas    numeric;
BEGIN
  IF NEW.aluno_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_classe_id := public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia);
  v_moedas := public.fn_moedas_do_evento(NEW.tipo, v_classe_id);

  IF v_moedas > 0 THEN
    INSERT INTO public.moedas_ledger
      (aluno_id, delta, motivo, evento_tipo, referencia, classe_id)
    VALUES
      (NEW.aluno_id, v_moedas, 'evento', NEW.tipo, NEW.referencia, v_classe_id)
    ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento'
    DO NOTHING;
  END IF;

  IF v_classe_id IS NOT NULL THEN
    PERFORM public.economia_avaliar_metas_de(NEW.aluno_id, v_classe_id);
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_atividade_aluno_moedas_conclusao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_classe bigint;
  v_moedas numeric;
BEGIN
  IF NEW.status::text IS DISTINCT FROM 'concluido' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = 'concluido' THEN
    RETURN NEW;
  END IF;

  SELECT t.classe_id,
         COALESCE(ea.moedas_conclusao, et.moedas_conclusao)
    INTO v_classe, v_moedas
    FROM public.atividades a
    JOIN public.topicos t ON t.id = a.topico_id
    LEFT JOIN public.economia_config_escopo ea
      ON ea.escopo = 'atividade' AND ea.alvo_id = a.id
    LEFT JOIN public.economia_config_escopo et
      ON et.escopo = 'topico' AND et.alvo_id = a.topico_id AND et.classe_id = t.classe_id
   WHERE a.id = NEW.atividade_id;

  IF COALESCE(v_moedas, 0) > 0 THEN
    INSERT INTO public.moedas_ledger
      (aluno_id, delta, motivo, evento_tipo, referencia, classe_id)
    VALUES
      (NEW.aluno_id, v_moedas, 'evento', 'atividade_conclusao_config',
       'atividade:' || NEW.atividade_id::text, v_classe)
    ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento'
    DO NOTHING;
  END IF;

  IF v_classe IS NOT NULL THEN
    PERFORM public.economia_avaliar_metas_de(NEW.aluno_id, v_classe);
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_atividade_aluno_moedas_conclusao ON public.atividade_aluno;
CREATE TRIGGER trg_atividade_aluno_moedas_conclusao
  AFTER INSERT OR UPDATE OF status ON public.atividade_aluno
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_atividade_aluno_moedas_conclusao();
"""


AVALIAR = r"""
CREATE OR REPLACE FUNCTION public.avaliar_entrega(
  p_atividade_id bigint,
  p_aluno_id     uuid,
  p_nota         numeric,
  p_feedback     text DEFAULT NULL
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_professor uuid := auth.uid();
  v_classe    bigint;
  v_topico    bigint;
  v_max_ativ  numeric;
  v_max_aluno numeric;
  v_max       numeric;
  v_antes     numeric;
  v_meta      jsonb;
  v_feedback  text := nullif(btrim(coalesce(p_feedback, '')), '');
  v_moedas    numeric;
BEGIN
  SELECT t.classe_id, a.topico_id, a.pontuacao_maxima,
         COALESCE(
           (SELECT s.moedas_aprovacao FROM public.economia_config_escopo s
             WHERE s.escopo = 'atividade' AND s.alvo_id = a.id AND s.classe_id = t.classe_id),
           (SELECT s.moedas_aprovacao FROM public.economia_config_escopo s
             WHERE s.escopo = 'topico' AND s.alvo_id = a.topico_id AND s.classe_id = t.classe_id),
           CASE WHEN a.metadata ->> 'moedas' ~ '^[0-9]+$'
                THEN (a.metadata ->> 'moedas')::numeric ELSE 0 END
         )
    INTO v_classe, v_topico, v_max_ativ, v_moedas
    FROM public.atividades a
    JOIN public.topicos t ON t.id = a.topico_id
   WHERE a.id = p_atividade_id;

  IF v_professor IS NULL OR v_classe IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_classe
  ) THEN
    RAISE EXCEPTION 'Atividade não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.classe_aluno ca WHERE ca.classe_id = v_classe AND ca.aluno_id = p_aluno_id
  ) THEN
    RAISE EXCEPTION 'O aluno não está nesta turma.' USING ERRCODE = '42501';
  END IF;

  SELECT aa.pontuacao_maxima, aa.pontuacao_obtida, coalesce(aa.avaliacao_metadata, '{}'::jsonb)
    INTO v_max_aluno, v_antes, v_meta
    FROM public.atividade_aluno aa
   WHERE aa.aluno_id = p_aluno_id AND aa.atividade_id = p_atividade_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O aluno ainda não tem registro nesta atividade.' USING ERRCODE = '22023';
  END IF;

  v_max := coalesce(v_max_aluno, v_max_ativ);
  IF v_max IS NULL OR v_max <= 0 THEN
    RAISE EXCEPTION 'A atividade não tem pontuação máxima definida.' USING ERRCODE = '22023';
  END IF;
  IF p_nota IS NULL OR p_nota < 0 OR p_nota > v_max THEN
    RAISE EXCEPTION 'A nota vai de 0 a %.', v_max USING ERRCODE = '22023';
  END IF;
  IF v_feedback IS NOT NULL AND length(v_feedback) > 2000 THEN
    RAISE EXCEPTION 'O feedback passa de 2000 caracteres.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.atividade_aluno
     SET pontuacao_obtida = p_nota,
         pontuacao_maxima = v_max,
         avaliacao_metadata = v_meta || jsonb_build_object(
           'professor', jsonb_build_object(
             'avaliado_por', v_professor,
             'avaliado_em', now(),
             'feedback', v_feedback,
             'nota_anterior', v_antes
           )
         )
   WHERE aluno_id = p_aluno_id AND atividade_id = p_atividade_id;

  INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em, concedido_por)
  VALUES (p_aluno_id, 'nota_professor', 'classe:' || v_classe::text || ':nota:' || p_atividade_id::text, p_nota, now(), v_professor)
  ON CONFLICT (aluno_id, tipo, referencia)
    WHERE tipo IN ('presenca_aula', 'participacao_aula', 'conquista_desbloqueada', 'nota_professor')
    DO UPDATE SET valor = EXCLUDED.valor, concedido_por = EXCLUDED.concedido_por;

  IF v_moedas > 0 AND p_nota >= v_max * 0.6 THEN
    INSERT INTO public.moedas_ledger (aluno_id, delta, motivo, evento_tipo, referencia, classe_id)
    VALUES (p_aluno_id, v_moedas, 'evento', 'atividade_aprovada', 'atividade:' || p_atividade_id::text, v_classe)
    ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento' DO NOTHING;
  END IF;

  RETURN p_nota;
END;
$function$;
"""


CONFIG = r"""
CREATE OR REPLACE FUNCTION public.economia_salvar_config_classe(
  p_classe_id bigint,
  p_prazo_max_dias_total integer,
  p_prazo_max_por_ativ integer,
  p_retry_max_por_topico integer,
  p_prazo_extensao_min_dias integer,
  p_prazo_extensao_max_dias integer,
  p_tempo_extra_min_minutos integer,
  p_tempo_extra_max_minutos integer,
  p_tempo_max_por_ativ integer,
  p_itens_desligados text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_antes jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_classe_id NOT IN (SELECT public.app_classes_do_professor()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;

  IF p_prazo_max_dias_total NOT BETWEEN 0 AND 14
     OR p_prazo_max_por_ativ NOT BETWEEN 0 AND 14
     OR p_retry_max_por_topico NOT BETWEEN 0 AND 5
     OR p_prazo_extensao_min_dias NOT BETWEEN 0 AND 14
     OR p_prazo_extensao_max_dias NOT BETWEEN 0 AND 14
     OR p_prazo_extensao_min_dias > p_prazo_extensao_max_dias
     OR p_prazo_extensao_max_dias > p_prazo_max_por_ativ
     OR p_prazo_max_por_ativ > p_prazo_max_dias_total
     OR p_tempo_extra_min_minutos NOT BETWEEN 0 AND 180
     OR p_tempo_extra_max_minutos NOT BETWEEN 0 AND 180
     OR p_tempo_extra_min_minutos > p_tempo_extra_max_minutos
     OR p_tempo_max_por_ativ NOT BETWEEN 0 AND 600
     OR p_tempo_extra_max_minutos > p_tempo_max_por_ativ THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'faixa_invalida');
  END IF;

  SELECT to_jsonb(c) INTO v_antes
    FROM public.loja_config_classe c WHERE c.classe_id = p_classe_id;

  INSERT INTO public.loja_config_classe (
    classe_id, prazo_max_dias_total, prazo_max_por_ativ, retry_max_por_topico,
    prazo_extensao_min_dias, prazo_extensao_max_dias,
    tempo_extra_min_minutos, tempo_extra_max_minutos, tempo_max_por_ativ,
    itens_desligados, atualizado_em
  ) VALUES (
    p_classe_id, p_prazo_max_dias_total, p_prazo_max_por_ativ, p_retry_max_por_topico,
    p_prazo_extensao_min_dias, p_prazo_extensao_max_dias,
    p_tempo_extra_min_minutos, p_tempo_extra_max_minutos, p_tempo_max_por_ativ,
    COALESCE(p_itens_desligados, '{}'::text[]), now()
  )
  ON CONFLICT (classe_id) DO UPDATE SET
    prazo_max_dias_total = EXCLUDED.prazo_max_dias_total,
    prazo_max_por_ativ = EXCLUDED.prazo_max_por_ativ,
    retry_max_por_topico = EXCLUDED.retry_max_por_topico,
    prazo_extensao_min_dias = EXCLUDED.prazo_extensao_min_dias,
    prazo_extensao_max_dias = EXCLUDED.prazo_extensao_max_dias,
    tempo_extra_min_minutos = EXCLUDED.tempo_extra_min_minutos,
    tempo_extra_max_minutos = EXCLUDED.tempo_extra_max_minutos,
    tempo_max_por_ativ = EXCLUDED.tempo_max_por_ativ,
    itens_desligados = EXCLUDED.itens_desligados,
    atualizado_em = now();

  PERFORM public.economia_auditar(
    'config_classe', 'loja_config_classe', p_classe_id::text, p_classe_id, NULL,
    v_antes,
    jsonb_build_object(
      'prazo_max_dias_total', p_prazo_max_dias_total,
      'prazo_max_por_ativ', p_prazo_max_por_ativ,
      'prazo_extensao_min_dias', p_prazo_extensao_min_dias,
      'prazo_extensao_max_dias', p_prazo_extensao_max_dias,
      'tempo_extra_min_minutos', p_tempo_extra_min_minutos,
      'tempo_extra_max_minutos', p_tempo_extra_max_minutos,
      'tempo_max_por_ativ', p_tempo_max_por_ativ,
      'retry_max_por_topico', p_retry_max_por_topico
    )
  );

  RETURN jsonb_build_object('ok', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.economia_salvar_preco_classe(
  p_classe_id bigint,
  p_item text,
  p_preco_base numeric,
  p_estoque integer,
  p_uso_max_por_aluno integer,
  p_ativo boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_antes jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_classe_id NOT IN (SELECT public.app_classes_do_professor()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.loja_itens WHERE codigo = p_item) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'item_indisponivel');
  END IF;

  IF (p_preco_base IS NOT NULL AND p_preco_base <= 0)
     OR (p_estoque IS NOT NULL AND p_estoque < 0)
     OR (p_uso_max_por_aluno IS NOT NULL AND p_uso_max_por_aluno < 0) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'faixa_invalida');
  END IF;

  SELECT to_jsonb(p) INTO v_antes
    FROM public.loja_preco_classe p
   WHERE p.classe_id = p_classe_id AND p.item_codigo = p_item;

  IF p_preco_base IS NULL AND p_estoque IS NULL AND p_uso_max_por_aluno IS NULL AND p_ativo IS NULL THEN
    DELETE FROM public.loja_preco_classe
     WHERE classe_id = p_classe_id AND item_codigo = p_item;
  ELSE
    INSERT INTO public.loja_preco_classe
      (classe_id, item_codigo, preco_base, estoque, uso_max_por_aluno, ativo, atualizado_em)
    VALUES
      (p_classe_id, p_item, p_preco_base, p_estoque, p_uso_max_por_aluno, p_ativo, now())
    ON CONFLICT (classe_id, item_codigo) DO UPDATE SET
      preco_base = EXCLUDED.preco_base,
      estoque = EXCLUDED.estoque,
      uso_max_por_aluno = EXCLUDED.uso_max_por_aluno,
      ativo = EXCLUDED.ativo,
      atualizado_em = now();
  END IF;

  PERFORM public.economia_auditar(
    'config_preco', 'loja_preco_classe', p_classe_id::text || ':' || p_item,
    p_classe_id, NULL, v_antes,
    jsonb_build_object(
      'preco_base', p_preco_base, 'estoque', p_estoque,
      'uso_max_por_aluno', p_uso_max_por_aluno, 'ativo', p_ativo
    )
  );

  RETURN jsonb_build_object('ok', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.economia_salvar_dotacao(
  p_classe_id bigint,
  p_item text,
  p_quantidade integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_antes integer;
BEGIN
  IF auth.uid() IS NULL OR p_classe_id NOT IN (SELECT public.app_classes_do_professor()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'faixa_invalida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.loja_itens WHERE codigo = p_item) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'item_indisponivel');
  END IF;

  SELECT quantidade INTO v_antes
    FROM public.loja_dotacao
   WHERE classe_id = p_classe_id AND item_codigo = p_item;

  INSERT INTO public.loja_dotacao (classe_id, item_codigo, quantidade)
  VALUES (p_classe_id, p_item, p_quantidade)
  ON CONFLICT (classe_id, item_codigo) DO UPDATE SET quantidade = EXCLUDED.quantidade;

  PERFORM public.economia_auditar(
    'config_dotacao', 'loja_dotacao', p_classe_id::text || ':' || p_item,
    p_classe_id, NULL,
    jsonb_build_object('quantidade', v_antes),
    jsonb_build_object('quantidade', p_quantidade)
  );
  RETURN jsonb_build_object('ok', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.economia_salvar_valores_evento(
  p_classe_id bigint,
  p_tipo text,
  p_pontos numeric,
  p_moedas numeric
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_antes jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_classe_id NOT IN (SELECT public.app_classes_do_professor()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.eventos_pontuacao WHERE tipo = p_tipo) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'tipo_desconhecido');
  END IF;
  IF (p_pontos IS NOT NULL AND p_pontos < 0) OR (p_moedas IS NOT NULL AND p_moedas < 0) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'faixa_invalida');
  END IF;

  SELECT to_jsonb(e) INTO v_antes
    FROM public.eventos_pontuacao_classe e
   WHERE e.classe_id = p_classe_id AND e.tipo = p_tipo;

  IF p_pontos IS NULL AND p_moedas IS NULL THEN
    DELETE FROM public.eventos_pontuacao_classe
     WHERE classe_id = p_classe_id AND tipo = p_tipo;
  ELSE
    INSERT INTO public.eventos_pontuacao_classe (classe_id, tipo, pontos, moedas)
    VALUES (p_classe_id, p_tipo, p_pontos, p_moedas)
    ON CONFLICT (classe_id, tipo) DO UPDATE
      SET pontos = EXCLUDED.pontos, moedas = EXCLUDED.moedas;
  END IF;

  PERFORM public.economia_auditar(
    'config_valores', 'eventos_pontuacao_classe', p_classe_id::text || ':' || p_tipo,
    p_classe_id, NULL, v_antes,
    jsonb_build_object('pontos', p_pontos, 'moedas', p_moedas)
  );
  RETURN jsonb_build_object('ok', true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.economia_salvar_config_classe(
  bigint, integer, integer, integer, integer, integer, integer, integer, integer, text[]
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.economia_salvar_preco_classe(bigint, text, numeric, integer, integer, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.economia_salvar_dotacao(bigint, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.economia_salvar_valores_evento(bigint, text, numeric, numeric) TO authenticated;
"""


ESCOPO_E_META = r"""
CREATE OR REPLACE FUNCTION public.economia_salvar_escopo(
  p_classe_id bigint,
  p_escopo text,
  p_alvo_id bigint,
  p_moedas_conclusao numeric,
  p_moedas_aprovacao numeric,
  p_pontos numeric,
  p_prazo_extensao_min_dias integer,
  p_prazo_extensao_max_dias integer,
  p_prazo_max_por_ativ integer,
  p_tempo_extra_min_minutos integer,
  p_tempo_extra_max_minutos integer,
  p_tempo_max_por_ativ integer,
  p_uso_max_prazo integer,
  p_uso_max_tempo integer,
  p_uso_max_retry integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_antes jsonb;
  v_id bigint;
BEGIN
  IF auth.uid() IS NULL OR p_classe_id NOT IN (SELECT public.app_classes_do_professor()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;
  IF p_escopo NOT IN ('topico', 'atividade') OR p_alvo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'alvo_invalido');
  END IF;

  IF p_escopo = 'topico' AND NOT EXISTS (
    SELECT 1 FROM public.topicos t WHERE t.id = p_alvo_id AND t.classe_id = p_classe_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'alvo_de_outra_turma');
  END IF;
  IF p_escopo = 'atividade' AND NOT EXISTS (
    SELECT 1 FROM public.atividades a
    JOIN public.topicos t ON t.id = a.topico_id
    WHERE a.id = p_alvo_id AND t.classe_id = p_classe_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'alvo_de_outra_turma');
  END IF;

  IF (p_moedas_conclusao IS NOT NULL AND p_moedas_conclusao < 0)
     OR (p_moedas_aprovacao IS NOT NULL AND p_moedas_aprovacao < 0)
     OR (p_pontos IS NOT NULL AND p_pontos < 0)
     OR (p_prazo_extensao_min_dias IS NOT NULL AND p_prazo_extensao_max_dias IS NOT NULL
         AND p_prazo_extensao_min_dias > p_prazo_extensao_max_dias)
     OR (p_tempo_extra_min_minutos IS NOT NULL AND p_tempo_extra_max_minutos IS NOT NULL
         AND p_tempo_extra_min_minutos > p_tempo_extra_max_minutos)
     OR (p_uso_max_retry IS NOT NULL AND p_uso_max_retry NOT BETWEEN 0 AND 5) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'faixa_invalida');
  END IF;

  SELECT to_jsonb(s), s.id INTO v_antes, v_id
    FROM public.economia_config_escopo s
   WHERE s.escopo = p_escopo AND s.alvo_id = p_alvo_id;

  INSERT INTO public.economia_config_escopo (
    classe_id, escopo, alvo_id, moedas_conclusao, moedas_aprovacao, pontos,
    prazo_extensao_min_dias, prazo_extensao_max_dias, prazo_max_por_ativ,
    tempo_extra_min_minutos, tempo_extra_max_minutos, tempo_max_por_ativ,
    uso_max_prazo, uso_max_tempo, uso_max_retry, atualizado_em
  ) VALUES (
    p_classe_id, p_escopo, p_alvo_id, p_moedas_conclusao, p_moedas_aprovacao, p_pontos,
    p_prazo_extensao_min_dias, p_prazo_extensao_max_dias, p_prazo_max_por_ativ,
    p_tempo_extra_min_minutos, p_tempo_extra_max_minutos, p_tempo_max_por_ativ,
    p_uso_max_prazo, p_uso_max_tempo, p_uso_max_retry, now()
  )
  ON CONFLICT (escopo, alvo_id) DO UPDATE SET
    classe_id = EXCLUDED.classe_id,
    moedas_conclusao = EXCLUDED.moedas_conclusao,
    moedas_aprovacao = EXCLUDED.moedas_aprovacao,
    pontos = EXCLUDED.pontos,
    prazo_extensao_min_dias = EXCLUDED.prazo_extensao_min_dias,
    prazo_extensao_max_dias = EXCLUDED.prazo_extensao_max_dias,
    prazo_max_por_ativ = EXCLUDED.prazo_max_por_ativ,
    tempo_extra_min_minutos = EXCLUDED.tempo_extra_min_minutos,
    tempo_extra_max_minutos = EXCLUDED.tempo_extra_max_minutos,
    tempo_max_por_ativ = EXCLUDED.tempo_max_por_ativ,
    uso_max_prazo = EXCLUDED.uso_max_prazo,
    uso_max_tempo = EXCLUDED.uso_max_tempo,
    uso_max_retry = EXCLUDED.uso_max_retry,
    atualizado_em = now();

  PERFORM public.economia_auditar(
    'config_escopo', 'economia_config_escopo', p_escopo || ':' || p_alvo_id::text,
    p_classe_id, NULL, v_antes,
    jsonb_build_object(
      'moedas_conclusao', p_moedas_conclusao,
      'moedas_aprovacao', p_moedas_aprovacao,
      'pontos', p_pontos,
      'prazo_extensao_min_dias', p_prazo_extensao_min_dias,
      'prazo_extensao_max_dias', p_prazo_extensao_max_dias
    )
  );
  RETURN jsonb_build_object('ok', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.economia_salvar_meta(
  p_id bigint,
  p_classe_id bigint,
  p_escopo text,
  p_alvo_id bigint,
  p_titulo text,
  p_criterio text,
  p_limiar numeric,
  p_moedas numeric,
  p_pontos numeric
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_antes jsonb;
  v_id bigint;
  v_titulo text := btrim(coalesce(p_titulo, ''));
BEGIN
  IF auth.uid() IS NULL OR p_classe_id NOT IN (SELECT public.app_classes_do_professor()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;
  IF p_escopo NOT IN ('classe', 'topico', 'atividade')
     OR char_length(v_titulo) NOT BETWEEN 1 AND 120
     OR p_criterio NOT IN ('atividades_concluidas', 'nota_minima', 'acertos', 'presencas')
     OR p_limiar IS NULL OR p_limiar <= 0
     OR COALESCE(p_moedas, 0) < 0 OR COALESCE(p_pontos, 0) < 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'faixa_invalida');
  END IF;
  IF p_criterio = 'nota_minima' AND p_escopo IS DISTINCT FROM 'atividade' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nota_minima_exige_atividade');
  END IF;
  IF p_criterio IN ('acertos', 'presencas') AND p_escopo IS DISTINCT FROM 'classe' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'criterio_exige_turma');
  END IF;
  IF p_escopo <> 'classe' AND p_alvo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'alvo_invalido');
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT to_jsonb(m) INTO v_antes
      FROM public.economia_meta m
     WHERE m.id = p_id AND m.classe_id = p_classe_id;
    IF v_antes IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'meta_nao_encontrada');
    END IF;
    UPDATE public.economia_meta
       SET escopo = p_escopo, alvo_id = p_alvo_id, titulo = v_titulo,
           criterio = p_criterio, limiar = p_limiar,
           moedas = COALESCE(p_moedas, 0), pontos = COALESCE(p_pontos, 0),
           atualizado_em = now()
     WHERE id = p_id;
    v_id := p_id;
  ELSE
    INSERT INTO public.economia_meta
      (classe_id, escopo, alvo_id, titulo, criterio, limiar, moedas, pontos)
    VALUES
      (p_classe_id, p_escopo, p_alvo_id, v_titulo, p_criterio, p_limiar,
       COALESCE(p_moedas, 0), COALESCE(p_pontos, 0))
    RETURNING id INTO v_id;
  END IF;

  PERFORM public.economia_auditar(
    'config_meta', 'economia_meta', v_id::text, p_classe_id, NULL, v_antes,
    jsonb_build_object(
      'titulo', v_titulo, 'criterio', p_criterio, 'limiar', p_limiar,
      'moedas', p_moedas, 'pontos', p_pontos, 'escopo', p_escopo
    )
  );
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.economia_arquivar_meta(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_classe bigint;
BEGIN
  SELECT classe_id INTO v_classe FROM public.economia_meta WHERE id = p_id;
  IF v_classe IS NULL OR v_classe NOT IN (SELECT public.app_classes_do_professor()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;
  UPDATE public.economia_meta SET ativa = false, atualizado_em = now() WHERE id = p_id;
  PERFORM public.economia_auditar(
    'arquivar_meta', 'economia_meta', p_id::text, v_classe, NULL,
    jsonb_build_object('ativa', true), jsonb_build_object('ativa', false)
  );
  RETURN jsonb_build_object('ok', true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.economia_salvar_escopo(
  bigint, text, bigint, numeric, numeric, numeric, integer, integer, integer,
  integer, integer, integer, integer, integer, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.economia_salvar_meta(
  bigint, bigint, text, bigint, text, text, numeric, numeric, numeric
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.economia_arquivar_meta(bigint) TO authenticated;
"""


EXTRATO = r"""
CREATE OR REPLACE FUNCTION public.economia_extrato(
  p_aluno_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_desde timestamptz DEFAULT NULL,
  p_ate timestamptz DEFAULT NULL,
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  criado_em timestamptz,
  delta numeric,
  motivo text,
  evento_tipo text,
  referencia text,
  classe_id bigint,
  compra_id bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_aluno uuid := COALESCE(p_aluno_id, auth.uid());
BEGIN
  IF auth.uid() IS NULL OR v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem permissao' USING ERRCODE = '42501';
  END IF;

  IF v_aluno IS DISTINCT FROM auth.uid()
     AND v_aluno NOT IN (SELECT public.app_alunos_do_professor())
     AND NOT public.app_e_dev() THEN
    RAISE EXCEPTION 'sem permissao' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT l.id, l.criado_em, l.delta, l.motivo, l.evento_tipo, l.referencia, l.classe_id, l.compra_id
    FROM public.moedas_ledger l
   WHERE l.aluno_id = v_aluno
     AND (p_motivo IS NULL OR l.motivo = p_motivo)
     AND (p_desde IS NULL OR l.criado_em >= p_desde)
     AND (p_ate IS NULL OR l.criado_em < p_ate)
   ORDER BY l.criado_em DESC, l.id DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 50), 200))
   OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.economia_extrato(uuid, text, timestamptz, timestamptz, integer, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.economia_consistencia()
RETURNS TABLE (
  aluno_id uuid,
  saldo numeric,
  saldo_negativo boolean,
  compras_sem_debito bigint,
  estornos_sem_credito bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  -- Sem JWT e sem GRANT para authenticated: só o papel do banco, pela API.
  RETURN QUERY
  SELECT
    a.id,
    COALESCE(SUM(l.delta), 0) AS saldo,
    COALESCE(SUM(l.delta), 0) < 0 AS saldo_negativo,
    (
      SELECT count(*) FROM public.loja_compras c
       WHERE c.aluno_id = a.id
         AND c.origem = 'compra'
         AND c.preco_pago > 0
         AND c.status <> 'estornada'
         AND NOT EXISTS (
           SELECT 1 FROM public.moedas_ledger m
            WHERE m.compra_id = c.id AND m.motivo = 'compra' AND m.delta = -c.preco_pago
         )
    ) AS compras_sem_debito,
    (
      SELECT count(*) FROM public.loja_compras c
       WHERE c.aluno_id = a.id
         AND c.status = 'estornada'
         AND c.preco_pago > 0
         AND NOT EXISTS (
           SELECT 1 FROM public.moedas_ledger m
            WHERE m.compra_id = c.id AND m.motivo = 'estorno' AND m.delta = c.preco_pago
         )
    ) AS estornos_sem_credito
  FROM public.alunos a
  LEFT JOIN public.moedas_ledger l ON l.aluno_id = a.id
  GROUP BY a.id
  HAVING COALESCE(SUM(l.delta), 0) < 0
      OR EXISTS (
        SELECT 1 FROM public.loja_compras c
         WHERE c.aluno_id = a.id AND c.origem = 'compra' AND c.preco_pago > 0
           AND c.status <> 'estornada'
           AND NOT EXISTS (
             SELECT 1 FROM public.moedas_ledger m
              WHERE m.compra_id = c.id AND m.motivo = 'compra' AND m.delta = -c.preco_pago
           )
      )
      OR EXISTS (
        SELECT 1 FROM public.loja_compras c
         WHERE c.aluno_id = a.id AND c.status = 'estornada' AND c.preco_pago > 0
           AND NOT EXISTS (
             SELECT 1 FROM public.moedas_ledger m
              WHERE m.compra_id = c.id AND m.motivo = 'estorno' AND m.delta = c.preco_pago
           )
      );
END;
$fn$;

REVOKE ALL ON FUNCTION public.economia_consistencia() FROM PUBLIC, anon, authenticated;
"""


def upgrade() -> None:
    op.execute(CREDITADO)
    op.execute(METAS)
    op.execute(GANHO)
    op.execute(AVALIAR)
    op.execute(CONFIG)
    op.execute(ESCOPO_E_META)
    op.execute(EXTRATO)
    op.execute("NOTIFY pgrst, 'reload schema';")


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo} para restaurar o downgrade")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def downgrade() -> None:
    # Só o que esta migration substituiu. Meta, extrato, conclusão configurada
    # e o índice de meta_atingida ficam: apagá-los perderia crédito já dado
    # e a configuração que o professor gravou. Não há UPDATE em eventos_aluno:
    # o ponto de meta já gravado continua no valor que foi concedido.
    creditado = _modulo("20261016_03_nota_professor_evento_creditado.py")
    op.execute(creditado._funcao(creditado.PREFIXOS_DEPOIS))
    op.execute(_modulo("20260912_02_ganho_de_moedas.py").GATILHO)
    op.execute(_modulo("20261017_07_avaliar_entrega_moedas.py").SQL)
