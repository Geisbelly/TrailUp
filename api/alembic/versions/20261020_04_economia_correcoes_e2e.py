"""economia: prazo comprado vale no atraso, meta de nota só com nota do professor

Quatro defeitos achados no teste ponta a ponta contra um banco migrado, com a
RLS agindo (`api/tests/test_e2e_economia_banco.py`):

1. **Mais prazo não valia no cálculo de atraso.** `fn_prazo_efetivo` (schema
   não versionado, ver `docs/architecture/schema-nao-versionado.md`) devolvia
   só `atividades.data_entrega`. O aluno pagava o prazo extra e o
   `fn_fator_de_atraso` continuava multando a entrega feita dentro do prazo
   comprado. Agora ela lê `atividade_prazo_aluno`: o `prazo_efetivo` gravado ou,
   se a atividade ganhou data depois, `data_entrega + dias_extras`.
2. **Meta de nota mínima pagava nota escrita pelo aluno.** O critério lia
   `atividade_aluno.pontuacao_obtida`, e a policy `atividade_aluno_posse_upd`
   deixa o aluno escrever essa coluna. Bastava `UPDATE ... SET
   pontuacao_obtida = 10` e chamar `economia_avaliar_metas`. Agora o critério lê
   o evento `nota_professor` — creditado, o cliente não insere e o trigger
   congela `valor` no UPDATE — sobre a pontuação máxima da ATIVIDADE (a do
   aluno também é escrevível por ele).
3. **Ganho pagava atividade de turma alheia.** Nem o trigger de conclusão nem o
   de eventos conferiam matrícula: um aluno da turma B inseria
   `atividade_aluno` (ou um evento `atividade_concluida`) de uma atividade da
   turma A e recebia as moedas da turma A — e o saldo é um só, então gastava
   em B. Agora os dois (e a avaliação de metas) exigem matrícula na turma que
   paga. Evento sem turma resolvida segue a regra antiga.
4. **Excluir a turma quebrava depois do primeiro uso de item.** `excluir_classe`
   confia nas cascatas, e `loja_compras` cai em cascata com a turma, mas
   `loja_uso_log.compra_id` e `loja_dica_liberada.compra_id` apontavam para ela
   sem `ON DELETE`. Viram `CASCADE`: a posse some com a turma, e o razão
   (`moedas_ledger`, sem FK de compra) e a auditoria ficam.

Revision ID: 20261020_04
Revises: 20261020_03
Create Date: 2026-10-19
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261020_04"
down_revision = "20261020_03"
branch_labels = None
depends_on = None


PRAZO = r"""
CREATE OR REPLACE FUNCTION public.fn_prazo_efetivo(p_aluno uuid, p_atividade bigint)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
$fn$;
"""

# O corpo de produção, para o downgrade (não existe em migration nenhuma).
PRAZO_ANTES = r"""
CREATE OR REPLACE FUNCTION public.fn_prazo_efetivo(p_aluno uuid, p_atividade bigint)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT a.data_entrega
    FROM public.atividades a
   WHERE a.id = p_atividade;
$fn$;
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

  -- Meta só para quem está na turma.
  IF NOT EXISTS (
    SELECT 1 FROM public.classe_aluno ca
     WHERE ca.classe_id = p_classe AND ca.aluno_id = p_aluno
  ) THEN
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
      -- Só a nota do professor: o evento `nota_professor` é creditado (o
      -- cliente não insere) e o trigger congela o valor no UPDATE. A nota em
      -- `atividade_aluno` o próprio aluno escreve, então não serve aqui.
      SELECT CASE
               WHEN COALESCE(a.pontuacao_maxima, 0) <= 0 THEN 0
               ELSE 100.0 * COALESCE(e.valor, 0) / a.pontuacao_maxima
             END
        INTO v_progresso
        FROM public.atividades a
        JOIN public.topicos t ON t.id = a.topico_id
        JOIN public.eventos_aluno e
          ON e.aluno_id = p_aluno
         AND e.tipo = 'nota_professor'
         AND e.referencia = 'classe:' || t.classe_id::text || ':nota:' || a.id::text
         AND e.concedido_por IS NOT NULL
       WHERE a.id = v_meta.alvo_id AND t.classe_id = p_classe;

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
"""

CONCLUSAO = r"""
CREATE OR REPLACE FUNCTION public.fn_atividade_aluno_moedas_conclusao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
      ON ea.escopo = 'atividade' AND ea.alvo_id = a.id AND ea.classe_id = t.classe_id
    LEFT JOIN public.economia_config_escopo et
      ON et.escopo = 'topico' AND et.alvo_id = a.topico_id AND et.classe_id = t.classe_id
   WHERE a.id = NEW.atividade_id;

  -- Concluir atividade de turma em que não está matriculado não paga nada.
  IF v_classe IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.classe_aluno ca
     WHERE ca.classe_id = v_classe AND ca.aluno_id = NEW.aluno_id
  ) THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_moedas, 0) > 0 THEN
    INSERT INTO public.moedas_ledger
      (aluno_id, delta, motivo, evento_tipo, referencia, classe_id)
    VALUES
      (NEW.aluno_id, v_moedas, 'evento', 'atividade_conclusao_config',
       'atividade:' || NEW.atividade_id::text, v_classe)
    ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento'
    DO NOTHING;
  END IF;

  PERFORM public.economia_avaliar_metas_de(NEW.aluno_id, v_classe);

  RETURN NEW;
END;
$fn$;
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

  -- Turma resolvida e aluno fora dela: o evento fica, a moeda não sai.
  IF v_classe_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.classe_aluno ca
     WHERE ca.classe_id = v_classe_id AND ca.aluno_id = NEW.aluno_id
  ) THEN
    RETURN NEW;
  END IF;

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
"""

FKS = r"""
ALTER TABLE public.loja_uso_log
  DROP CONSTRAINT IF EXISTS loja_uso_log_compra_id_fkey,
  ADD CONSTRAINT loja_uso_log_compra_id_fkey
    FOREIGN KEY (compra_id) REFERENCES public.loja_compras(id) ON DELETE CASCADE;

ALTER TABLE public.loja_dica_liberada
  DROP CONSTRAINT IF EXISTS loja_dica_liberada_compra_id_fkey,
  ADD CONSTRAINT loja_dica_liberada_compra_id_fkey
    FOREIGN KEY (compra_id) REFERENCES public.loja_compras(id) ON DELETE CASCADE;
"""

FKS_ANTES = r"""
ALTER TABLE public.loja_uso_log
  DROP CONSTRAINT IF EXISTS loja_uso_log_compra_id_fkey,
  ADD CONSTRAINT loja_uso_log_compra_id_fkey
    FOREIGN KEY (compra_id) REFERENCES public.loja_compras(id);

ALTER TABLE public.loja_dica_liberada
  DROP CONSTRAINT IF EXISTS loja_dica_liberada_compra_id_fkey,
  ADD CONSTRAINT loja_dica_liberada_compra_id_fkey
    FOREIGN KEY (compra_id) REFERENCES public.loja_compras(id);
"""


def upgrade() -> None:
    op.execute(PRAZO)
    op.execute(METAS)
    op.execute(CONCLUSAO)
    op.execute(EVENTOS)
    op.execute(FKS)
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
    # Volta às versões de 20261020_03 e ao corpo de produção do prazo. Nenhum
    # dado é apagado: crédito já dado e posse continuam onde estão.
    anterior = _modulo("20261020_03_economia_metas_extrato_auditoria.py")
    op.execute(FKS_ANTES)
    op.execute(anterior.GANHO)
    op.execute(anterior.METAS)
    op.execute(PRAZO_ANTES)
    op.execute("NOTIFY pgrst, 'reload schema';")
