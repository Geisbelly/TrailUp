"""Ajusta os moldes das missões diárias ao português brasileiro.

Os moldes são o fallback quando a IA não reescreve uma missão. Eles também precisam ter
acentuação, concordância e unidades escritas de forma natural.
"""

from __future__ import annotations

from alembic import op

revision = "20261103_03"
down_revision = "20261103_02"
branch_labels = None
depends_on = None


def _gerador(moldes_pt_br: bool) -> str:
    if moldes_pt_br:
        moldes = """
  v_moldes := jsonb_build_array(
    jsonb_build_object(
      'titulo', 'Seu tempo de estudo',
      'descricao', 'Estude por ' || v_minutos || ' minutos hoje.',
      'criterio', jsonb_build_object('metrica','minutos_no_dia','minutos',v_minutos,'dia',v_dia)),
    jsonb_build_object(
      'titulo', 'Atividades do dia',
      'descricao', CASE WHEN v_ativ = 1 THEN 'Conclua 1 atividade hoje.'
                        ELSE 'Conclua ' || v_ativ || ' atividades hoje.' END,
      'criterio', jsonb_build_object('metrica','eventos_no_dia','minimo',v_ativ,
                                     'evento','atividade_concluida','dia',v_dia,'fuso',v_fuso)),
    jsonb_build_object(
      'titulo', 'Um conteúdo novo',
      'descricao', CASE WHEN v_cont = 1 THEN 'Conclua 1 conteúdo hoje.'
                        ELSE 'Conclua ' || v_cont || ' conteúdos hoje.' END,
      'criterio', jsonb_build_object('metrica','eventos_no_dia','minimo',v_cont,
                                     'evento','conteudo_concluido','dia',v_dia,'fuso',v_fuso)),
    jsonb_build_object(
      'titulo', 'Avance na trilha',
      'descricao', CASE WHEN v_acoes = 1 THEN 'Faça 1 ação na trilha hoje.'
                        ELSE 'Faça ' || v_acoes || ' ações na trilha hoje.' END,
      'criterio', jsonb_build_object('metrica','eventos_no_dia','minimo',v_acoes,
                                     'dia',v_dia,'fuso',v_fuso))
  );"""
    else:
        moldes = """
  v_moldes := jsonb_build_array(
    jsonb_build_object(
      'titulo', 'Dez minutos hoje',
      'descricao', 'Passe pelo menos ' || v_minutos || ' minutos estudando hoje.',
      'criterio', jsonb_build_object('metrica','minutos_no_dia','minutos',v_minutos,'dia',v_dia)),
    jsonb_build_object(
      'titulo', 'Conclua atividades',
      'descricao', 'Conclua ' || v_ativ || ' atividade(s) hoje.',
      'criterio', jsonb_build_object('metrica','eventos_no_dia','minimo',v_ativ,
                                     'evento','atividade_concluida','dia',v_dia,'fuso',v_fuso)),
    jsonb_build_object(
      'titulo', 'Feche um conteudo',
      'descricao', 'Conclua ' || v_cont || ' conteudo(s) hoje.',
      'criterio', jsonb_build_object('metrica','eventos_no_dia','minimo',v_cont,
                                     'evento','conteudo_concluido','dia',v_dia,'fuso',v_fuso)),
    jsonb_build_object(
      'titulo', 'Mexa na trilha',
      'descricao', 'Faca ' || v_acoes || ' acoes na trilha hoje.',
      'criterio', jsonb_build_object('metrica','eventos_no_dia','minimo',v_acoes,
                                     'dia',v_dia,'fuso',v_fuso))
  );"""

    return f"""
-- A assinatura e' (date, uuid) desde 20261102_14. Recriar so' (date) deixaria as duas e toda
-- chamada com uma data ficaria ambigua (derrubou a subida da API em 03/11). Uma (date) que
-- tenha sobrado sai antes.
DROP FUNCTION IF EXISTS public.fn_missao_diaria_gerar(date);
CREATE OR REPLACE FUNCTION public.fn_missao_diaria_gerar(p_dia date DEFAULT NULL, p_aluno uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_fuso     text := 'America/Sao_Paulo';
  v_dia      date := COALESCE(p_dia, (now() AT TIME ZONE v_fuso)::date);
  v_inicio   timestamptz := (v_dia::text || ' 00:00:00')::timestamp AT TIME ZONE v_fuso;
  v_fim      timestamptz := ((v_dia + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE v_fuso;
  v_min      int := public.fn_app_config_int('missao_diaria_min', 2);
  v_max      int := public.fn_app_config_int('missao_diaria_max', 3);
  v_minutos  int := public.fn_app_config_int('missao_diaria_minutos', 10);
  v_acoes    int := public.fn_app_config_int('missao_diaria_acoes', 5);
  v_ativ     int := public.fn_app_config_int('missao_diaria_atividades', 2);
  v_cont     int := public.fn_app_config_int('missao_diaria_conteudos', 1);
  v_coorte   record;
  v_moldes   jsonb;
  v_quantos  int;
  v_i        int;
  v_slot     int;
  v_base     int;
  v_molde    jsonb;
  v_total    int := 0;
BEGIN
{moldes}

  FOR v_coorte IN
    SELECT ca.classe_id, lower(p.nome) AS perfil
      FROM public.classe_aluno ca
      JOIN public.aluno_perfil ap ON ap.aluno_id = ca.aluno_id
      JOIN public.perfil p ON p.id = ap.perfil_id
     WHERE ca.classe_id IS NOT NULL AND ca.aluno_id IS NOT NULL
       AND (p_aluno IS NULL OR ca.aluno_id = p_aluno)  -- troca de perfil (20261102_14)
     GROUP BY ca.classe_id, lower(p.nome)
  LOOP
    v_quantos := v_min + (abs(hashtext(v_coorte.classe_id::text || ':' || v_coorte.perfil || ':' || v_dia::text))
                          % GREATEST(v_max - v_min + 1, 1));

    v_base := abs(hashtext(v_coorte.classe_id::text || ':' || v_coorte.perfil
                           || ':' || v_dia::text)) % jsonb_array_length(v_moldes);

    FOR v_i IN 0 .. v_quantos - 1 LOOP
      v_slot := v_i + 1;
      v_molde := v_moldes -> ((v_base + v_i) % jsonb_array_length(v_moldes));

      INSERT INTO public.missoes (
        classe_id, origem, escopo, titulo, descricao, criterio, recompensa_tipo,
        janela_inicio, janela_fim, dia, slot, perfil_alvo, aprovacao, ativa
      ) VALUES (
        v_coorte.classe_id, 'sistema', 'aluno',
        v_molde ->> 'titulo', v_molde ->> 'descricao', v_molde -> 'criterio',
        'missao_diaria_concluida', v_inicio, v_fim, v_dia, v_slot, v_coorte.perfil,
        'nao_requer', true
      )
      ON CONFLICT (classe_id, coalesce(perfil_alvo, ''), dia, slot) WHERE dia IS NOT NULL
      DO NOTHING;

      IF FOUND THEN v_total := v_total + 1; END IF;
    END LOOP;
  END LOOP;

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_diaria_gerar(date, uuid) FROM PUBLIC, anon, authenticated;
"""


def upgrade() -> None:
    op.execute(_gerador(moldes_pt_br=True))


def downgrade() -> None:
    op.execute(_gerador(moldes_pt_br=False))
