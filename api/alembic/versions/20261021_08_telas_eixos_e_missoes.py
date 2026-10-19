"""Fase 7: o cliente passa a enxergar eixos, params do desafio, rank de missões e resumo diário

Primeira fatia de UI do stack. O banco já tinha consequencia/dificuldade (fase 1) e a
missão diária (5b/6); o que faltava era:

1. A RPC que CRIA o desafio aceitar os eixos (sem isso o seletor do mobile gravaria
   só o default).
2. Uma RPC autenticada que devolve tempo/tentativas/aposta efetivos — as chaves de
   `app_config` são privadas (fase 1), então o cliente não as lê direto.
3. `arena_professor_resumo` devolver os eixos, senão o console não tem o que mostrar.
4. Critério `missoes` no CASE da view + linha em `rank_tipo` — a lição do #540: tipo
   sem CASE ranqueia todo mundo em zero.
5. `missoes_diarias_resumo` — painel do professor com as missões do dia e quantos
   alunos já cumpriram, sem o console montar a conta à mão.

Revision ID: 20261021_08
Revises: 20261021_07
Create Date: 2026-10-19
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261021_08"
down_revision = "20261021_07"
branch_labels = None
depends_on = None


def _load(nome: str):
    path = Path(__file__).with_name(nome)
    spec = importlib.util.spec_from_file_location(nome, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _view_com_missoes() -> str:
    """Parte da view da fase 4 e acrescenta o critério `missoes` (constância)."""
    sql = _load("20261021_06_aposta_e_pontuacao_ranqueada.py")._view(True)

    ancora = (
        "WHERE d.consequencia = 'ranqueada'::text AND e.classe_id IS NOT NULL\n"
        "          GROUP BY e.aluno_id, e.classe_id\n"
        "        ), base AS ("
    )
    cte = (
        "WHERE d.consequencia = 'ranqueada'::text AND e.classe_id IS NOT NULL\n"
        "          GROUP BY e.aluno_id, e.classe_id\n"
        "        ), missoes_concluidas AS (\n"
        "         -- Rank de constância: missões cumpridas (diária e de professor), por turma.\n"
        "         SELECT ma.aluno_id,\n"
        "            m.classe_id,\n"
        "            count(*)::numeric AS pontuacao\n"
        "           FROM missao_aluno ma\n"
        "             JOIN missoes m ON m.id = ma.missao_id\n"
        "          WHERE ma.status = 'concluida'::text\n"
        "          GROUP BY ma.aluno_id, m.classe_id\n"
        "        ), base AS ("
    )
    if ancora not in sql:
        raise RuntimeError("âncora da view da fase 4 não encontrada — a fase 7 não pode patchar no escuro")
    sql = sql.replace(ancora, cte, 1)

    ramo = "WHEN 'ranqueada'::text THEN COALESCE(erq.pontuacao, 0::numeric)\n"
    ramo_novo = (
        "WHEN 'ranqueada'::text THEN COALESCE(erq.pontuacao, 0::numeric)\n"
        "                    WHEN 'missoes'::text THEN COALESCE(mc.pontuacao, 0::numeric)\n"
    )
    if ramo not in sql:
        raise RuntimeError("ramo ranqueada não encontrado na view")
    sql = sql.replace(ramo, ramo_novo, 1)

    join = (
        "LEFT JOIN eventos_ranqueada erq ON erq.classe_id = r.classe_id "
        "AND erq.aluno_id = ca.aluno_id"
    )
    join_novo = (
        join
        + "\n             LEFT JOIN missoes_concluidas mc ON mc.classe_id = r.classe_id "
        "AND mc.aluno_id = ca.aluno_id"
    )
    if join not in sql:
        raise RuntimeError("join ranqueada não encontrado na view")
    sql = sql.replace(join, join_novo, 1)
    return sql


PARAMS = r"""
-- Valores efetivos do preset de dificuldade. As chaves são privadas; o cliente recebe o jsonb
-- pelo retorno de guilda_desafio_criar, não por app_config. Só outra função chama esta:
-- DEFINER sem conferir a sessão fica sem EXECUTE para authenticated/anon (portão do #534).
CREATE OR REPLACE FUNCTION public.fn_desafio_params_efetivos(p_dificuldade text DEFAULT 'normal')
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'dificuldade', CASE lower(COALESCE(p_dificuldade, ''))
                     WHEN 'dificil' THEN 'dificil'
                     ELSE 'normal'
                   END,
    'tempo_seg', CASE lower(COALESCE(p_dificuldade, ''))
                   WHEN 'dificil' THEN public.fn_app_config_int('desafio_tempo_seg_dificil', 30)
                   ELSE public.fn_app_config_int('desafio_tempo_seg_normal', 60)
                 END,
    'tentativas', CASE lower(COALESCE(p_dificuldade, ''))
                    WHEN 'dificil' THEN public.fn_app_config_int('desafio_tentativas_dificil', 1)
                    ELSE public.fn_app_config_int('desafio_tentativas_normal', 2)
                  END,
    'aposta_fator', public.app_desafio_aposta_fator(p_dificuldade)
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_desafio_params_efetivos(text) FROM PUBLIC, anon, authenticated;
"""


CRIAR = r"""
-- Assinatura nova: os dois eixos entram com default que preserva o comportamento medido
-- (ranqueada + normal). DROP da antiga: Postgres não troca default de parâmetro no meio.
DROP FUNCTION IF EXISTS public.guilda_desafio_criar(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.guilda_desafio_criar(
  p_guilda_id uuid,
  p_modo text DEFAULT 'todos',
  p_quantidade integer DEFAULT 3,
  p_dificuldade text DEFAULT 'normal',
  p_consequencia text DEFAULT 'ranqueada'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_g public.guildas%ROWTYPE;
  v_id uuid;
  v_qids bigint[];
  v_q bigint;
  v_i integer := 0;
  v_modo text := lower(btrim(COALESCE(p_modo, 'todos')));
  v_dif text := lower(btrim(COALESCE(p_dificuldade, 'normal')));
  v_cons text := lower(btrim(COALESCE(p_consequencia, 'ranqueada')));
  v_params jsonb;
BEGIN
  SELECT * INTO v_g
    FROM public.guildas
   WHERE id = p_guilda_id
     AND ativa
     AND EXISTS (
       SELECT 1 FROM public.guilda_membros
        WHERE guilda_id = p_guilda_id AND aluno_id = auth.uid() AND left_at IS NULL
     );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guilda_desafio_invalido';
  END IF;

  IF v_modo NOT IN ('todos', 'velocidade', 'precisao', 'duelo', 'duplo') THEN
    RAISE EXCEPTION 'guilda_desafio_invalido';
  END IF;
  IF v_dif NOT IN ('normal', 'dificil') THEN
    RAISE EXCEPTION 'guilda_desafio_dificuldade_invalida';
  END IF;
  IF v_cons NOT IN ('treino', 'ranqueada', 'evento') THEN
    RAISE EXCEPTION 'guilda_desafio_consequencia_invalida';
  END IF;

  SELECT array_agg(id ORDER BY random()) INTO v_qids
    FROM (
      SELECT q.id
        FROM public.questoes q
        JOIN public.atividades a ON a.id = q.atividade_id
        JOIN public.topicos t ON t.id = a.topico_id
       WHERE t.classe_id = v_g.classe_id
         AND public.fn_questao_liberada(q.id)
       LIMIT 30
    ) s;
  IF COALESCE(array_length(v_qids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'guilda_sem_questoes_liberadas';
  END IF;
  v_qids := v_qids[1:GREATEST(1, LEAST(p_quantidade, 10))];

  INSERT INTO public.guilda_desafios (
    guilda_id, classe_id, criado_por, formato, modo, titulo, configuracao,
    dificuldade, consequencia
  ) VALUES (
    p_guilda_id, v_g.classe_id, auth.uid(), 'guilda', v_modo, 'Desafio da guilda',
    jsonb_build_object('quantidade', array_length(v_qids, 1)),
    v_dif, v_cons
  ) RETURNING id INTO v_id;

  FOREACH v_q IN ARRAY v_qids LOOP
    v_i := v_i + 1;
    INSERT INTO public.guilda_desafio_questoes (desafio_id, questao_id, ordem)
    VALUES (v_id, v_q, v_i);
  END LOOP;

  v_params := public.fn_desafio_params_efetivos(v_dif);

  INSERT INTO public.guilda_mensagens (guilda_id, classe_id, autor_id, tipo, texto, conteudo)
  VALUES (
    p_guilda_id, v_g.classe_id, auth.uid(), 'desafio', 'Um novo desafio foi lançado!',
    jsonb_build_object(
      'id', v_id, 'modo', v_modo, 'quantidade', array_length(v_qids, 1),
      'dificuldade', v_dif, 'consequencia', v_cons, 'params', v_params
    )
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'modo', v_modo,
    'quantidade', array_length(v_qids, 1),
    'dificuldade', v_dif,
    'consequencia', v_cons,
    'params', v_params
  );
END
$function$;

REVOKE ALL ON FUNCTION public.guilda_desafio_criar(uuid, text, integer, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_desafio_criar(uuid, text, integer, text, text)
  TO authenticated;
"""


RESUMO_ARENA = r"""
CREATE OR REPLACE FUNCTION public.arena_professor_resumo(p_classe_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'duelos', COALESCE((
      SELECT jsonb_agg(x.item ORDER BY x.created_at DESC)
      FROM (
        SELECT d.created_at,
               jsonb_build_object(
                 'id', d.id,
                 'titulo', d.titulo,
                 'formato', d.formato,
                 'modo', d.modo,
                 'dificuldade', d.dificuldade,
                 'consequencia', d.consequencia,
                 'status', d.status,
                 'resultado', d.resultado,
                 'vencedor_equipe', d.vencedor_equipe,
                 'guilda_id', d.guilda_id,
                 'guilda_nome', g.nome,
                 'guilda_rival_id', d.guilda_rival_id,
                 'guilda_rival_nome', gr.nome,
                 'created_at', d.created_at,
                 'encerrado_em', d.encerrado_em,
                 'aceitaram', (SELECT count(*) FROM public.desafio_participantes p
                                WHERE p.desafio_id = d.id AND p.estado = 'aceito'),
                 'equipes', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                            'equipe', e.equipe, 'pontos', e.pontos, 'integrantes', e.integrantes
                          ) ORDER BY e.equipe)
                   FROM public.fn_arena_equipes(d.id) e
                 ), '[]'::jsonb)
               ) AS item
        FROM public.guilda_desafios d
        LEFT JOIN public.guildas g ON g.id = d.guilda_id
        LEFT JOIN public.guildas gr ON gr.id = d.guilda_rival_id
        WHERE d.classe_id = p_classe_id
        ORDER BY d.created_at DESC
        LIMIT 40
      ) x
    ), '[]'::jsonb),
    'ranking', COALESCE((
      SELECT jsonb_agg(r.item ORDER BY r.vitorias DESC, r.empates DESC, r.duelos ASC, r.nome)
      FROM (
        SELECT t.guilda_id, g.nome,
               count(*) FILTER (WHERE t.desfecho = 'vitoria')::integer AS vitorias,
               count(*) FILTER (WHERE t.desfecho = 'empate')::integer AS empates,
               count(*)::integer AS duelos,
               jsonb_build_object(
                 'guilda_id', t.guilda_id,
                 'nome', g.nome,
                 'vitorias', count(*) FILTER (WHERE t.desfecho = 'vitoria'),
                 'empates', count(*) FILTER (WHERE t.desfecho = 'empate'),
                 'duelos', count(*)
               ) AS item
        FROM (
          SELECT d.guilda_id AS guilda_id,
                 CASE
                   WHEN d.resultado = 'empate' THEN 'empate'
                   WHEN d.guilda_rival_id IS NULL AND d.resultado = 'vitoria' THEN 'vitoria'
                   WHEN d.vencedor_equipe = 1 THEN 'vitoria'
                   ELSE 'outro'
                 END AS desfecho
          FROM public.guilda_desafios d
          WHERE d.classe_id = p_classe_id AND d.status = 'encerrado' AND d.formato = 'guilda'
            AND d.guilda_id IS NOT NULL AND d.resultado IS DISTINCT FROM 'sem_adversario'
          UNION ALL
          SELECT d.guilda_rival_id,
                 CASE
                   WHEN d.resultado = 'empate' THEN 'empate'
                   WHEN d.vencedor_equipe = 2 THEN 'vitoria'
                   ELSE 'outro'
                 END
          FROM public.guilda_desafios d
          WHERE d.classe_id = p_classe_id AND d.status = 'encerrado' AND d.formato = 'guilda'
            AND d.guilda_rival_id IS NOT NULL AND d.resultado IS DISTINCT FROM 'sem_adversario'
        ) t
        JOIN public.guildas g ON g.id = t.guilda_id
        GROUP BY t.guilda_id, g.nome
      ) r
    ), '[]'::jsonb)
  );
END
$function$;
"""


RESUMO_MISSOES = r"""
-- Painel do professor: missões do dia (origem sistema) da turma, com quantos cumpriram.
CREATE OR REPLACE FUNCTION public.missoes_diarias_resumo(p_classe_id bigint, p_dia date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_dia date := COALESCE(p_dia, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
BEGIN
  IF auth.uid() IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'dia', v_dia,
    'missoes', COALESCE((
      SELECT jsonb_agg(x.item ORDER BY x.perfil, x.slot)
      FROM (
        SELECT m.perfil_alvo AS perfil, m.slot,
               jsonb_build_object(
                 'id', m.id,
                 'titulo', m.titulo,
                 'descricao', m.descricao,
                 'perfil_alvo', m.perfil_alvo,
                 'slot', m.slot,
                 'criterio', m.criterio,
                 'cumpriram', (
                   SELECT count(*)::integer FROM public.missao_aluno ma
                    WHERE ma.missao_id = m.id AND ma.status = 'concluida'
                 ),
                 'alunos_do_perfil', (
                   SELECT count(DISTINCT ca.aluno_id)::integer
                     FROM public.classe_aluno ca
                     JOIN public.aluno_perfil ap ON ap.aluno_id = ca.aluno_id
                     JOIN public.perfil p ON p.id = ap.perfil_id
                    WHERE ca.classe_id = m.classe_id
                      AND (m.perfil_alvo IS NULL OR lower(p.nome) = lower(m.perfil_alvo))
                 )
               ) AS item
          FROM public.missoes m
         WHERE m.classe_id = p_classe_id
           AND m.origem = 'sistema'
           AND m.dia = v_dia
           AND m.ativa
      ) x
    ), '[]'::jsonb)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.missoes_diarias_resumo(bigint, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.missoes_diarias_resumo(bigint, date) TO authenticated;
"""


RANK_TIPO = """
INSERT INTO public.rank_tipo (nome, descricao, criterio)
SELECT 'Missões', 'Missões cumpridas (diárias e do professor) — o rank de constância.', 'missoes'
 WHERE NOT EXISTS (SELECT 1 FROM public.rank_tipo WHERE criterio = 'missoes');
"""


def upgrade() -> None:
    op.execute(PARAMS)
    op.execute(CRIAR)
    op.execute(RESUMO_ARENA)
    op.execute(RESUMO_MISSOES)
    op.execute(_view_com_missoes())
    op.execute(RANK_TIPO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(
        "DELETE FROM public.ranks WHERE tipo_id IN "
        "(SELECT id FROM public.rank_tipo WHERE criterio = 'missoes');"
        "DELETE FROM public.rank_tipo WHERE criterio = 'missoes';"
    )
    # Volta a view da fase 4 (com ranqueada/acertos, sem missoes).
    op.execute(_load("20261021_06_aposta_e_pontuacao_ranqueada.py")._view(True))
    op.execute("DROP FUNCTION IF EXISTS public.missoes_diarias_resumo(bigint, date)")

    sql_05 = Path(__file__).with_name("20261017_05_arena_professor_resumo.py").read_text(encoding="utf-8")
    inicio = sql_05.find("CREATE OR REPLACE FUNCTION public.arena_professor_resumo")
    fim = sql_05.find("$function$;", inicio)
    if inicio < 0 or fim < 0:
        raise RuntimeError("não achei arena_professor_resumo na 20261017_05")
    op.execute(sql_05[inicio : fim + len("$function$;")])

    op.execute("DROP FUNCTION IF EXISTS public.guilda_desafio_criar(uuid, text, integer, text, text)")
    sql_criar = (
        Path(__file__).resolve().parents[3]
        / "docs"
        / "mobile"
        / "sql"
        / "20260913_02_social_chat_desafios_presenca.sql"
    )
    texto = sql_criar.read_text(encoding="utf-8")
    i = texto.find("CREATE OR REPLACE FUNCTION public.guilda_desafio_criar")
    j = texto.find("$$;", i)
    if i < 0 or j < 0:
        raise RuntimeError("não achei guilda_desafio_criar no SQL versionado")
    op.execute(texto[i : j + 3])
    op.execute(
        "GRANT EXECUTE ON FUNCTION public.guilda_desafio_criar(uuid, text, integer) TO authenticated"
    )
    op.execute("DROP FUNCTION IF EXISTS public.fn_desafio_params_efetivos(text)")
    op.execute("NOTIFY pgrst, 'reload schema'")
