"""economia: moeda de conclusão só sai quando o professor aprova

Até aqui, marcar `atividade_aluno.status = 'concluido'` pagava as moedas de
conclusão na hora, e quem escreve essa coluna é o próprio aluno (policy
`atividade_aluno_posse_upd`). O evento `atividade_concluida`, que o app também
insere sozinho, pagava as moedas do evento. As duas portas eram autodeclaração.

**O que muda**

- O trigger `trg_atividade_aluno_moedas_conclusao` sai: concluir não paga mais.
  O evento `atividade_concluida` continua valendo PONTOS (rank), mas não paga
  moeda; os demais eventos seguem como estavam.
- `avaliar_entrega` passa a pagar a conclusão quando a nota aprova (a mesma
  régua da moeda de aprovação: nota >= 60% da máxima). O valor é o da
  atividade, senão o do tópico (`economia_config_escopo.moedas_conclusao`),
  senão o valor do evento `atividade_concluida` da turma ou o global. Uma vez
  por aluno e atividade (índice único do ganho); quem já recebeu pelo evento
  antigo não recebe de novo. A matrícula continua exigida.
- Nova tabela `atividade_aprovacao` (aluno, atividade, nota, máxima, aprovada,
  quem e quando), escrita só por `avaliar_entrega` (SECURITY DEFINER; o cliente
  só lê, aluno o seu e professor o da turma). É a fonte de verdade das metas:
  - `atividades_concluidas` conta só atividades **aprovadas** pelo professor;
  - `nota_minima` lê a última nota do professor daqui. O evento `nota_professor`
    tem o valor congelado no UPDATE (`trg_eventos_aluno_valor_do_banco`), então
    uma reavaliação não chegava às metas.
  Preenchida a partir dos eventos `nota_professor` já gravados.
- A trava de reentrada de `economia_avaliar_metas_de` era um `set_config` local
  à transação que nunca voltava: depois da primeira avaliação, qualquer outra
  na mesma transação devolvia 0. Agora ela é solta no fim.

Crédito já dado não é recalculado nem estornado. Aprovação feita antes desta
migration não paga conclusão retroativamente.

Revision ID: 20261020_05
Revises: 20261020_04
Create Date: 2026-10-19
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261020_05"
down_revision = "20261020_04"
branch_labels = None
depends_on = None


TABELA = r"""
CREATE TABLE IF NOT EXISTS public.atividade_aprovacao (
  aluno_id      uuid    NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  atividade_id  bigint  NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  classe_id     bigint  NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  nota          numeric NOT NULL CHECK (nota >= 0),
  nota_maxima   numeric NOT NULL CHECK (nota_maxima > 0),
  aprovada      boolean NOT NULL,
  avaliado_por  uuid    NULL,
  avaliado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, atividade_id)
);

COMMENT ON TABLE public.atividade_aprovacao IS
  'Última avaliação do professor por aluno e atividade. Escrita só por avaliar_entrega; fonte das metas.';

CREATE INDEX IF NOT EXISTS atividade_aprovacao_classe_idx
  ON public.atividade_aprovacao (aluno_id, classe_id) WHERE aprovada;

ALTER TABLE public.atividade_aprovacao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atividade_aprovacao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.atividade_aprovacao TO authenticated;

DROP POLICY IF EXISTS atividade_aprovacao_sel ON public.atividade_aprovacao;
CREATE POLICY atividade_aprovacao_sel ON public.atividade_aprovacao
  FOR SELECT TO authenticated
  USING (
    aluno_id = auth.uid()
    OR aluno_id IN (SELECT public.app_alunos_do_professor())
  );

-- Notas que o professor já deu: viram a primeira linha de cada aluno.
INSERT INTO public.atividade_aprovacao
  (aluno_id, atividade_id, classe_id, nota, nota_maxima, aprovada, avaliado_por, avaliado_em)
SELECT e.aluno_id, a.id, t.classe_id, e.valor,
       COALESCE(aa.pontuacao_maxima, a.pontuacao_maxima),
       e.valor >= COALESCE(aa.pontuacao_maxima, a.pontuacao_maxima) * 0.6,
       e.concedido_por, COALESCE(e.criado_em AT TIME ZONE 'UTC', now())
  FROM (
    -- CASE e não AND: o Postgres não garante a ordem dos predicados, e o cast
    -- de uma referência fora do padrão estouraria.
    SELECT ev.*,
           CASE WHEN ev.referencia ~ '^classe:[0-9]+:nota:[0-9]+$'
                THEN split_part(ev.referencia, ':', 2)::bigint END AS ref_classe,
           CASE WHEN ev.referencia ~ '^classe:[0-9]+:nota:[0-9]+$'
                THEN split_part(ev.referencia, ':', 4)::bigint END AS ref_atividade
      FROM public.eventos_aluno ev
     WHERE ev.tipo = 'nota_professor'
  ) e
  JOIN public.atividades a ON a.id = e.ref_atividade
  JOIN public.topicos t ON t.id = a.topico_id AND t.classe_id = e.ref_classe
  JOIN public.alunos al ON al.id = e.aluno_id
  LEFT JOIN public.atividade_aluno aa
    ON aa.aluno_id = e.aluno_id AND aa.atividade_id = a.id
 WHERE e.concedido_por IS NOT NULL
   AND e.valor IS NOT NULL AND e.valor >= 0
   AND COALESCE(aa.pontuacao_maxima, a.pontuacao_maxima, 0) > 0
ON CONFLICT (aluno_id, atividade_id) DO NOTHING;
"""

SEM_GATILHO = r"""
DROP TRIGGER IF EXISTS trg_atividade_aluno_moedas_conclusao ON public.atividade_aluno;
"""

GATILHO_ANTES = r"""
DROP TRIGGER IF EXISTS trg_atividade_aluno_moedas_conclusao ON public.atividade_aluno;
CREATE TRIGGER trg_atividade_aluno_moedas_conclusao
  AFTER INSERT OR UPDATE OF status ON public.atividade_aluno
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_atividade_aluno_moedas_conclusao();
"""

EVENTOS = r"""
CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_paga_moeda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_classe_id bigint;
  v_moedas    numeric;
BEGIN
  IF NEW.aluno_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_classe_id := public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia);

  IF v_classe_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.classe_aluno ca
     WHERE ca.classe_id = v_classe_id AND ca.aluno_id = NEW.aluno_id
  ) THEN
    RETURN NEW;
  END IF;

  -- Concluir atividade é autodeclarado pelo app: a moeda da conclusão sai
  -- em `avaliar_entrega`, quando o professor aprova. O ponto continua.
  IF NEW.tipo <> 'atividade_concluida' THEN
    v_moedas := public.fn_moedas_do_evento(NEW.tipo, v_classe_id);

    IF v_moedas > 0 THEN
      INSERT INTO public.moedas_ledger
        (aluno_id, delta, motivo, evento_tipo, referencia, classe_id)
      VALUES
        (NEW.aluno_id, v_moedas, 'evento', NEW.tipo, NEW.referencia, v_classe_id)
      ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento'
      DO NOTHING;
    END IF;
  END IF;

  IF v_classe_id IS NOT NULL THEN
    PERFORM public.economia_avaliar_metas_de(NEW.aluno_id, v_classe_id);
  END IF;

  RETURN NEW;
END;
$fn$;
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
  v_conclusao numeric;
  v_aprovada  boolean;
BEGIN
  SELECT t.classe_id, a.topico_id, a.pontuacao_maxima,
         COALESCE(
           (SELECT s.moedas_aprovacao FROM public.economia_config_escopo s
             WHERE s.escopo = 'atividade' AND s.alvo_id = a.id AND s.classe_id = t.classe_id),
           (SELECT s.moedas_aprovacao FROM public.economia_config_escopo s
             WHERE s.escopo = 'topico' AND s.alvo_id = a.topico_id AND s.classe_id = t.classe_id),
           CASE WHEN a.metadata ->> 'moedas' ~ '^[0-9]+$'
                THEN (a.metadata ->> 'moedas')::numeric ELSE 0 END
         ),
         COALESCE(
           (SELECT s.moedas_conclusao FROM public.economia_config_escopo s
             WHERE s.escopo = 'atividade' AND s.alvo_id = a.id AND s.classe_id = t.classe_id),
           (SELECT s.moedas_conclusao FROM public.economia_config_escopo s
             WHERE s.escopo = 'topico' AND s.alvo_id = a.topico_id AND s.classe_id = t.classe_id),
           public.fn_moedas_do_evento('atividade_concluida', t.classe_id)
         )
    INTO v_classe, v_topico, v_max_ativ, v_moedas, v_conclusao
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

  v_aprovada := p_nota >= v_max * 0.6;

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

  -- Antes do evento: o trigger do evento avalia as metas, e elas leem daqui.
  INSERT INTO public.atividade_aprovacao
    (aluno_id, atividade_id, classe_id, nota, nota_maxima, aprovada, avaliado_por, avaliado_em)
  VALUES
    (p_aluno_id, p_atividade_id, v_classe, p_nota, v_max, v_aprovada, v_professor, now())
  ON CONFLICT (aluno_id, atividade_id) DO UPDATE SET
    classe_id = EXCLUDED.classe_id,
    nota = EXCLUDED.nota,
    nota_maxima = EXCLUDED.nota_maxima,
    aprovada = EXCLUDED.aprovada,
    avaliado_por = EXCLUDED.avaliado_por,
    avaliado_em = EXCLUDED.avaliado_em;

  INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em, concedido_por)
  VALUES (p_aluno_id, 'nota_professor', 'classe:' || v_classe::text || ':nota:' || p_atividade_id::text, p_nota, now(), v_professor)
  ON CONFLICT (aluno_id, tipo, referencia)
    WHERE tipo IN ('presenca_aula', 'participacao_aula', 'conquista_desbloqueada', 'nota_professor')
    DO UPDATE SET valor = EXCLUDED.valor, concedido_por = EXCLUDED.concedido_por;

  IF v_aprovada THEN
    IF v_moedas > 0 THEN
      INSERT INTO public.moedas_ledger (aluno_id, delta, motivo, evento_tipo, referencia, classe_id)
      VALUES (p_aluno_id, v_moedas, 'evento', 'atividade_aprovada', 'atividade:' || p_atividade_id::text, v_classe)
      ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento' DO NOTHING;
    END IF;

    -- Conclusão: uma vez por aluno e atividade. Quem já recebeu pelo evento
    -- antigo (`atividade_concluida`) não recebe de novo.
    IF COALESCE(v_conclusao, 0) > 0 AND NOT EXISTS (
      SELECT 1 FROM public.moedas_ledger l
       WHERE l.aluno_id = p_aluno_id AND l.motivo = 'evento'
         AND l.evento_tipo = 'atividade_concluida'
         AND l.referencia = 'atividade:' || p_atividade_id::text
    ) THEN
      INSERT INTO public.moedas_ledger (aluno_id, delta, motivo, evento_tipo, referencia, classe_id)
      VALUES (p_aluno_id, v_conclusao, 'evento', 'atividade_conclusao_config',
              'atividade:' || p_atividade_id::text, v_classe)
      ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento' DO NOTHING;
    END IF;
  END IF;

  -- Reavaliação não dispara o trigger de INSERT do evento: avalia aqui.
  PERFORM public.economia_avaliar_metas_de(p_aluno_id, v_classe);

  RETURN p_nota;
END;
$function$;
"""

METAS = r"""
CREATE OR REPLACE FUNCTION public.economia_avaliar_metas_de(p_aluno uuid, p_classe bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  IF NOT EXISTS (
    SELECT 1 FROM public.classe_aluno ca
     WHERE ca.classe_id = p_classe AND ca.aluno_id = p_aluno
  ) THEN
    RETURN 0;
  END IF;

  -- Trava de reentrada (meta paga evento, evento avalia meta). Solta no fim.
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
      -- Só conta o que o professor aprovou: concluir é autodeclarado.
      SELECT count(*) INTO v_progresso
        FROM public.atividade_aprovacao ap
        JOIN public.atividades a ON a.id = ap.atividade_id
       WHERE ap.aluno_id = p_aluno
         AND ap.classe_id = p_classe
         AND ap.aprovada
         AND (
           v_meta.escopo = 'classe'
           OR (v_meta.escopo = 'topico' AND a.topico_id = v_meta.alvo_id)
           OR (v_meta.escopo = 'atividade' AND a.id = v_meta.alvo_id)
         );

    ELSIF v_meta.criterio = 'nota_minima' AND v_meta.escopo = 'atividade' THEN
      -- A última nota do professor (o evento congela o valor na reavaliação).
      SELECT 100.0 * ap.nota / ap.nota_maxima
        INTO v_progresso
        FROM public.atividade_aprovacao ap
       WHERE ap.aluno_id = p_aluno
         AND ap.atividade_id = v_meta.alvo_id
         AND ap.classe_id = p_classe;

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

  PERFORM set_config('trailup.avaliando_meta', '0', true);
  RETURN v_creditos;
END;
$fn$;

REVOKE ALL ON FUNCTION public.economia_avaliar_metas_de(uuid, bigint)
  FROM PUBLIC, anon, authenticated;
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(METAS)
    op.execute(EVENTOS)
    op.execute(AVALIAR)
    op.execute(SEM_GATILHO)
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
    # Volta às funções de 20261020_04/03 e religa o trigger de conclusão.
    # `atividade_aprovacao` FICA, com os dados: apagá-la perderia o histórico
    # das avaliações. Crédito já dado continua no razão.
    correcoes = _modulo("20261020_04_economia_correcoes_e2e.py")
    economia = _modulo("20261020_03_economia_metas_extrato_auditoria.py")
    op.execute(economia.AVALIAR)
    op.execute(correcoes.EVENTOS)
    op.execute(correcoes.METAS)
    op.execute(correcoes.CONCLUSAO)
    op.execute(GATILHO_ANTES)
    op.execute("NOTIFY pgrst, 'reload schema';")
