"""Permite editar o texto das missões diárias sem mudar seus critérios.

O professor pode alterar título e descrição de uma diária da própria turma. Métrica, alvo,
perfil, slot, data, escopo e recompensa continuam imutáveis.
"""

from __future__ import annotations

from alembic import op

revision = "20261103_02"
down_revision = "20261102_26"
branch_labels = None
depends_on = None


def _funcao(permitir_texto_diario: bool) -> str:
    texto_protegido = "OLD.dia IS NULL" if permitir_texto_diario else "TRUE"
    return f"""
CREATE OR REPLACE FUNCTION public.fn_missoes_guarda()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
DECLARE
  v_metrica text;
  v_texto_llm boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.texto_molde          := NULL;
    NEW.texto_enriquecido_em := NULL;
    NEW.texto_modelo         := NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.classe_id   := OLD.classe_id;
    NEW.origem      := OLD.origem;
    NEW.criado_por  := OLD.criado_por;
    NEW.dia         := OLD.dia;
    NEW.slot        := OLD.slot;
    NEW.perfil_alvo := OLD.perfil_alvo;
    NEW.criado_em   := OLD.criado_em;

    v_texto_llm := COALESCE(current_setting('app.missao_texto_llm', true), '') = 'on'
                   AND current_user NOT IN ('authenticated', 'anon')
                   AND OLD.origem = 'sistema'
                   AND OLD.dia IS NOT NULL;

    IF OLD.origem = 'sistema' THEN
      IF ({texto_protegido}) AND NOT v_texto_llm THEN
        NEW.titulo   := OLD.titulo;
        NEW.descricao := OLD.descricao;
      END IF;
      IF OLD.dia IS NULL THEN
        NEW.criterio := OLD.criterio;
      END IF;
      NEW.recompensa_tipo := OLD.recompensa_tipo;
      NEW.janela_inicio   := OLD.janela_inicio;
      NEW.janela_fim      := OLD.janela_fim;
      NEW.escopo          := OLD.escopo;
      NEW.atividade_origem_id := OLD.atividade_origem_id;
    END IF;

    IF NOT v_texto_llm THEN
      NEW.texto_molde          := OLD.texto_molde;
      NEW.texto_enriquecido_em := OLD.texto_enriquecido_em;
      NEW.texto_modelo         := OLD.texto_modelo;
    END IF;

    NEW.atualizado_em := now();
  END IF;

  v_metrica := NEW.criterio ->> 'metrica';
  IF v_metrica IS NULL THEN
    RAISE EXCEPTION 'A missao precisa de criterio.metrica.' USING ERRCODE = '22023';
  END IF;
  IF v_metrica NOT IN ('atividade_especifica', 'minutos_no_dia', 'eventos_no_dia')
     AND NOT public.fn_conquista_metrica_suportada(v_metrica) THEN
    RAISE EXCEPTION 'Metrica nao suportada: %.', v_metrica USING ERRCODE = '22023';
  END IF;
  IF v_metrica = 'atividade_especifica'
     AND NULLIF(btrim(COALESCE(NEW.criterio ->> 'atividade_id', '')), '') IS NULL THEN
    RAISE EXCEPTION 'criterio.atividade_id e obrigatorio em atividade_especifica.' USING ERRCODE = '22023';
  END IF;
  IF v_metrica IN ('minutos_no_dia', 'eventos_no_dia')
     AND NULLIF(btrim(COALESCE(NEW.criterio ->> 'dia', '')), '') IS NULL THEN
    RAISE EXCEPTION 'criterio.dia e obrigatorio em %.', v_metrica USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.eventos_pontuacao ep WHERE ep.tipo = NEW.recompensa_tipo) THEN
    RAISE EXCEPTION 'recompensa_tipo % nao existe em eventos_pontuacao.', NEW.recompensa_tipo
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;
"""


def upgrade() -> None:
    op.execute(_funcao(permitir_texto_diario=True))


def downgrade() -> None:
    op.execute(_funcao(permitir_texto_diario=False))
