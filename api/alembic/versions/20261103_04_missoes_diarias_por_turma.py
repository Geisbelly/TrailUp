"""Gera metas diárias conforme os recursos da turma e concede recompensa."""

from __future__ import annotations

from alembic import op

revision = "20261103_04"
down_revision = "20261103_03"
branch_labels = None
depends_on = None


GERADOR = r"""
CREATE OR REPLACE FUNCTION public.fn_missao_diaria_gerar(p_dia date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_fuso text := 'America/Sao_Paulo';
  v_dia date := COALESCE(p_dia, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_inicio timestamptz := (v_dia::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim timestamptz := ((v_dia + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_min int := public.fn_app_config_int('missao_diaria_min', 2);
  v_max int := public.fn_app_config_int('missao_diaria_max', 3);
  v_minutos int := public.fn_app_config_int('missao_diaria_minutos', 10);
  v_ativ int;
  v_cont int;
  v_coorte record;
  v_moldes jsonb;
  v_quantos int;
  v_i int;
  v_slot int;
  v_base int;
  v_molde jsonb;
  v_total int := 0;
BEGIN
  FOR v_coorte IN
    SELECT DISTINCT ca.classe_id, NULL::text AS perfil
      FROM public.classe_aluno ca
     WHERE ca.classe_id IS NOT NULL AND ca.aluno_id IS NOT NULL
  LOOP
    SELECT count(*)::int INTO v_ativ
      FROM public.atividades a
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE t.classe_id = v_coorte.classe_id;

    SELECT count(DISTINCT (cp.topico_id, cp.conteudo_id))::int INTO v_cont
      FROM public.conteudo_personalizado cp
     WHERE cp.classe_id = v_coorte.classe_id
       AND cp.aluno_id IS NULL
       AND cp.status = 'pronto';

    v_moldes := jsonb_build_array(
      jsonb_build_object(
        'titulo','Seu tempo de estudo',
        'descricao','Estude por ' || v_minutos || ' minutos hoje.',
        'criterio',jsonb_build_object('metrica','minutos_no_dia','minutos',v_minutos,'dia',v_dia))
    );

    IF v_ativ > 0 THEN
      v_ativ := LEAST(v_ativ, GREATEST(public.fn_app_config_int('missao_diaria_atividades', 2), 1));
      v_moldes := v_moldes || jsonb_build_array(jsonb_build_object(
        'titulo','Atividades do dia',
        'descricao',CASE WHEN v_ativ = 1 THEN 'Conclua 1 atividade hoje.'
                         ELSE 'Conclua ' || v_ativ || ' atividades hoje.' END,
        'criterio',jsonb_build_object('metrica','eventos_no_dia','minimo',v_ativ,
                     'evento','atividade_concluida','dia',v_dia,'fuso',v_fuso)));
    END IF;

    IF v_cont > 0 THEN
      v_cont := LEAST(v_cont, GREATEST(public.fn_app_config_int('missao_diaria_conteudos', 1), 1));
      v_moldes := v_moldes || jsonb_build_array(jsonb_build_object(
        'titulo','Um conteúdo novo',
        'descricao',CASE WHEN v_cont = 1 THEN 'Conclua 1 conteúdo hoje.'
                         ELSE 'Conclua ' || v_cont || ' conteúdos hoje.' END,
        'criterio',jsonb_build_object('metrica','eventos_no_dia','minimo',v_cont,
                     'evento','conteudo_concluido','dia',v_dia,'fuso',v_fuso)));
    END IF;

    v_quantos := LEAST(jsonb_array_length(v_moldes),
      v_min + (abs(hashtext(v_coorte.classe_id::text || ':' || COALESCE(v_coorte.perfil, '') || ':' || v_dia::text))
               % GREATEST(v_max - v_min + 1, 1)));
    v_base := abs(hashtext(v_coorte.classe_id::text || ':' || COALESCE(v_coorte.perfil, '') || ':' || v_dia::text))
              % jsonb_array_length(v_moldes);

    FOR v_i IN 0 .. v_quantos - 1 LOOP
      v_slot := v_i + 1;
      v_molde := v_moldes -> ((v_base + v_i) % jsonb_array_length(v_moldes));
      INSERT INTO public.missoes (
        classe_id, origem, escopo, titulo, descricao, criterio, recompensa_tipo,
        janela_inicio, janela_fim, dia, slot, perfil_alvo, aprovacao, ativa
      ) VALUES (
        v_coorte.classe_id, 'sistema', 'aluno', v_molde ->> 'titulo', v_molde ->> 'descricao',
        v_molde -> 'criterio', 'missao_diaria_concluida', v_inicio, v_fim, v_dia, v_slot,
        v_coorte.perfil, 'nao_requer', true
      )
      ON CONFLICT (classe_id, coalesce(perfil_alvo, ''), dia, slot) WHERE dia IS NOT NULL
      DO NOTHING;
      IF FOUND THEN v_total := v_total + 1; END IF;
    END LOOP;
  END LOOP;
  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_diaria_gerar(date) FROM PUBLIC, anon, authenticated;

-- 10 pontos e 2 moedas por meta diária concluída: prêmio modesto, mas visível.
UPDATE public.eventos_pontuacao
   SET pontos = 10,
       moedas = 2,
       descricao = 'Concluiu uma missão diária.'
 WHERE tipo = 'missao_diaria_concluida';
"""


def upgrade() -> None:
    op.execute(GERADOR)
    # Remove do painel as missões de hoje que já haviam sido materializadas por perfil.
    # A migração do gerador não seria suficiente: `ON CONFLICT` preserva essas linhas.
    op.execute("""
      UPDATE public.missoes
         SET ativa = false
       WHERE origem = 'sistema'
         AND dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
         AND perfil_alvo IS NOT NULL
         AND ativa
    """)
    # Materializa imediatamente a versão por turma para o dia da implantação.
    op.execute("SELECT public.fn_missao_diaria_gerar((now() AT TIME ZONE 'America/Sao_Paulo')::date)")


def downgrade() -> None:
    # Reverte o gerador para a versão PT-BR anterior e restaura o prêmio sem pontuação.
    from importlib.util import module_from_spec, spec_from_file_location
    from pathlib import Path

    caminho = Path(__file__).with_name("20261103_03_missoes_diarias_pt_br.py")
    spec = spec_from_file_location("missoes_diarias_pt_br", caminho)
    assert spec and spec.loader
    modulo = module_from_spec(spec)
    spec.loader.exec_module(modulo)
    op.execute(modulo._gerador(moldes_pt_br=True))
    op.execute("UPDATE public.eventos_pontuacao SET pontos = 0, moedas = 0, descricao = 'Concluiu a missão do dia. Separado para o rank de constância.' WHERE tipo = 'missao_diaria_concluida'")
