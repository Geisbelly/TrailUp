"""Fase 5b: missão diária determinística, por coorte, sem LLM nenhum

Segunda metade da fase 5 de `docs/superpowers/specs/2026-10-19-eventos-missoes-ranks-modos-design.md`.

## O furo que esta fase tinha de resolver primeiro

As 12 métricas de `fn_conquista_metrica_suportada` são **acumuladas**: `minutos_totais` é a
soma de toda a vida, `dias_seguidos` é a maior sequência, `topicos_concluidos` é contagem
total. Missão **diária** sobre elas nasce cumprida para aluno ativo, ou pede um alvo de vida
inteira que não tem nada a ver com hoje.

A saída que **não** serve, e que parecia natural: alvo como "valor atual + delta",
fotografado por coorte na geração. A coorte é heterogênea, então um alvo derivado do agregado
dela fica inalcançável para quem está atrás e trivial para quem está à frente.

A saída certa são **métricas de delta**, e com elas o alvo não precisa de calibragem nenhuma:
"10 minutos hoje" é alcançável independente do progresso de vida. Dois ramos novos em
`fn_avaliar_metrica`, aditivos — nenhum ramo existente muda:

- `minutos_no_dia` — soma `aluno_atividade_diaria.tempo_uso_seg` do dia que vem no critério;
- `eventos_no_dia` — conta `eventos_aluno` não-creditados do dia, com filtro opcional de tipo.

## Fuso

`pg_cron` agenda em UTC, e o deslocamento de `America/Sao_Paulo` é -3 (conferido:
`now() - (now() AT TIME ZONE 'America/Sao_Paulo')` = 03:00:00). Então meia-noite de Brasília
é `0 3 * * *`. O cálculo usa o **nome** do fuso, não `-3`, para sobreviver à volta do horário
de verão.

Em `eventos_no_dia` a conversão é `criado_em AT TIME ZONE 'UTC' AT TIME ZONE <fuso>` — nessa
ordem. `criado_em` é `timestamp without time zone` gravado por `now()` numa sessão UTC (o
CLAUDE.md registra isso), e inverter a ordem desliza o dia em três horas.

> **Limite conhecido, medido:** `aluno_atividade_diaria` fecha o dia no fuso do aparelho, e há
> quatro em uso hoje — `America/Sao_Paulo`, `America/Araguaina`, `America/Fortaleza` e `UTC`.
> Os três primeiros são UTC-3 e coincidem com o dia da missão; só `UTC` divergiria, e ele é
> provavelmente o fallback de quem não reportou fuso. Para `minutos_no_dia` isso significa que
> o aluno em `UTC` pode ter a atividade do fim da noite contada no dia seguinte. Não tratei:
> re-bucketizar exigiria o timestamp cru, e a tabela guarda só o agregado do dia.

## Gerador

`fn_missao_diaria_gerar(p_dia)` percorre as coortes `(turma × perfil BrainHex presente nela)`
— hoje 11 em produção — e grava 2 a 3 missões por coorte. É o mesmo recorte que o CLAUDE.md
usa para material base, e o motivo de o custo de LLM da fase 6 cair de N alunos para N
perfis.

**Idempotente por construção:** `ON CONFLICT` sobre o índice parcial de `20261021_02`, com o
predicado repetido (`WHERE dia IS NOT NULL`) — o CLAUDE.md avisa que sem repetir o predicado
o Postgres não casa o índice parcial e levanta "no unique or exclusion constraint matching".
Rodar o cron duas vezes no mesmo dia não duplica.

**Quais 2–3:** escolha determinística por `hashtext(turma:perfil:dia)`, então varia de dia em
dia e de coorte em coorte, e repetir a geração dá o mesmo resultado. Sem `random()`, que
quebraria a idempotência.

**Janela:** `janela_inicio`/`janela_fim` recebem os limites do dia em Brasília. Sem isso o
laço da fase 5a avaliaria a missão de ontem para sempre, porque o filtro dele é
`janela_fim >= now()`.

`origem = 'sistema'`, `escopo = 'aluno'`, `aprovacao = 'nao_requer'`. A exigência de aprovação
vale só para `escopo = 'guilda'` (assunção registrada em `20261021_02`): se a diária
individual precisasse de aprovação, o desenho de meia-noite cairia por depender de alguém
acordado às 3h UTC.

## A guarda de `missoes` recusava as métricas de delta

`fn_missoes_guarda` (20261021_02) só aceita as 12 de `fn_conquista_metrica_suportada` mais
`atividade_especifica`. As duas de delta não estão lá — e não devem estar: conquista não é
"do dia". Sem esta correção, o primeiro INSERT do gerador levantava `22023 Metrica nao
suportada: minutos_no_dia`, e o cron das 0h abortaria inteiro toda noite, sem missão nenhuma.
Medido ao executar a cadeia inteira (02 → 05) numa transação abortada; a verificação anterior
desta fase tinha rodado sem a guarda da fase 2.

A guarda é recriada a partir do corpo da fase 2, trocando **só** a checagem de métrica (o teste
confere que o resto é idêntico), e passa a exigir `criterio.dia` nas duas de delta — sem ele o
avaliador compara com `NULL` e a missão nunca completa, em silêncio.

## Alvos em `app_config`

Quatro chaves, `publico = false`. São números de sensação de jogo e vão ser ajustados sem
deploy. Privadas porque `app_config_sel` é `USING (publico)` para `anon` e `authenticated`.

Revision ID: 20261021_05
Revises: 20261021_04
Create Date: 2026-10-19
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261021_05"
down_revision = "20261021_04"
branch_labels = None
depends_on = None


_CHECAGEM_DA_FASE_2 = """  IF v_metrica <> 'atividade_especifica'
     AND NOT public.fn_conquista_metrica_suportada(v_metrica) THEN"""

_CHECAGEM_COM_DELTA = """  -- Fase 5b: as de DELTA sao de missao, nao de conquista -- por isso ficam fora de
  -- `fn_conquista_metrica_suportada` e entram aqui pelo nome.
  IF v_metrica NOT IN ('atividade_especifica', 'minutos_no_dia', 'eventos_no_dia')
     AND NOT public.fn_conquista_metrica_suportada(v_metrica) THEN"""

_ANTES_DA_RECOMPENSA = "  -- Recompensa e chave de `eventos_pontuacao`, nao numero."

_EXIGE_DIA = """  -- Sem `dia` o avaliador compara com NULL e a missao nunca completa, em silencio.
  IF v_metrica IN ('minutos_no_dia', 'eventos_no_dia')
     AND NULLIF(btrim(COALESCE(NEW.criterio ->> 'dia', '')), '') IS NULL THEN
    RAISE EXCEPTION 'criterio.dia e obrigatorio em %.', v_metrica USING ERRCODE = '22023';
  END IF;

"""


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def guarda_da_fase_2() -> str:
    """`fn_missoes_guarda` como 20261021_02 a escreveu, recortada do próprio arquivo."""
    sql = _modulo("20261021_02_missoes_entidade.py").SQL
    inicio = sql.index("CREATE OR REPLACE FUNCTION public.fn_missoes_guarda()")
    fim = sql.index("REVOKE ALL ON FUNCTION public.fn_missoes_guarda()")
    return sql[inicio:fim]


def guarda() -> str:
    """A guarda da fase 2 com a checagem de métrica aceitando as de delta. Falha alto se o
    corpo da fase 2 mudar e a troca não casar, em vez de recriar a guarda sem a correção."""
    antiga = guarda_da_fase_2()
    if antiga.count(_CHECAGEM_DA_FASE_2) != 1 or antiga.count(_ANTES_DA_RECOMPENSA) != 1:
        raise RuntimeError("o corpo de fn_missoes_guarda da fase 2 mudou; revise a fase 5b")
    nova = antiga.replace(_CHECAGEM_DA_FASE_2, _CHECAGEM_COM_DELTA)
    nova = nova.replace(_ANTES_DA_RECOMPENSA, _EXIGE_DIA + _ANTES_DA_RECOMPENSA)
    return nova + "REVOKE ALL ON FUNCTION public.fn_missoes_guarda() FROM PUBLIC, anon, authenticated;\n"


AVALIADOR = r"""
CREATE OR REPLACE FUNCTION public.fn_avaliar_metrica(p_aluno uuid, p_agregados jsonb, p_criterio jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_metrica text := p_criterio ->> 'metrica';
  v_ok      boolean := false;
  v_ag      jsonb := COALESCE(p_agregados, '{}'::jsonb);
  v_contagem jsonb := COALESCE(v_ag -> 'contagem_por_tipo', '{}'::jsonb);
BEGIN
  IF v_metrica IS NULL THEN
    RETURN false;
  END IF;

  IF v_metrica = 'eventos_totais' THEN
    v_ok := COALESCE((v_ag ->> 'eventos_totais')::int, 0) >= COALESCE((p_criterio ->> 'minimo')::int, 0);

  ELSIF v_metrica = 'eventos_do_tipo' THEN
    v_ok := COALESCE((v_contagem ->> (p_criterio ->> 'evento'))::int, 0)
            >= COALESCE((p_criterio ->> 'minimo')::int, 0);

  ELSIF v_metrica = 'atividades_concluidas' THEN
    v_ok := COALESCE((v_contagem ->> 'atividade_concluida')::int, 0)
            >= COALESCE((p_criterio ->> 'minimo')::int, 0);

  ELSIF v_metrica = 'topicos_concluidos' THEN
    v_ok := COALESCE((v_ag ->> 'topicos_concluidos')::int, 0) >= COALESCE((p_criterio ->> 'minimo')::int, 0);

  ELSIF v_metrica = 'topicos_visitados' THEN
    IF p_criterio ->> 'visitados' = 'todos' THEN
      v_ok := COALESCE((v_ag ->> 'topicos_da_classe')::int, 0) > 0
              AND COALESCE((v_ag ->> 'topicos_visitados')::int, 0) >= COALESCE((v_ag ->> 'topicos_da_classe')::int, 0);
    ELSE
      v_ok := COALESCE((v_ag ->> 'topicos_visitados')::int, 0) >= COALESCE((p_criterio ->> 'visitados')::int, 0);
    END IF;

  ELSIF v_metrica = 'dias_seguidos' THEN
    v_ok := COALESCE((v_ag ->> 'dias_seguidos')::int, 0) >= COALESCE((p_criterio ->> 'dias_seguidos')::int, 0);

  ELSIF v_metrica = 'minutos_totais' THEN
    v_ok := COALESCE((v_ag ->> 'minutos_totais')::numeric, 0) >= COALESCE((p_criterio ->> 'minutos')::numeric, 0);

  ELSIF v_metrica = 'acertos_percentual' THEN
    v_ok := COALESCE((v_ag ->> 'melhor_acertos')::numeric, 0) >= COALESCE((p_criterio ->> 'percentual')::numeric, 0);

  ELSIF v_metrica = 'trilha_percentual' THEN
    v_ok := COALESCE((v_ag ->> 'melhor_trilha')::numeric, 0) >= COALESCE((p_criterio ->> 'percentual')::numeric, 0);

  ELSIF v_metrica = 'atividade_rapida' THEN
    -- Sentinela 999999 nos agregados: sem atividade concluida isto e' falso.
    v_ok := COALESCE((v_ag ->> 'menor_tempo')::numeric, 999999) <= COALESCE((p_criterio ->> 'max_tempo')::numeric, 0);

  ELSIF v_metrica = 'atividades_rapidas' THEN
    -- Depende de `max_tempo` do criterio, entao nao cabe num agregado fixo.
    SELECT count(*) >= COALESCE((p_criterio ->> 'minimo')::int, 0)
      INTO v_ok
      FROM public.atividade_aluno
     WHERE aluno_id = p_aluno
       AND tempo_gasto_min IS NOT NULL
       AND tempo_gasto_min <= COALESCE((p_criterio ->> 'max_tempo')::numeric, 0)
       AND position('concl' in lower(coalesce(status::text, ''))) > 0;

  ELSIF v_metrica = 'atividade_especifica' THEN
    -- Metrica da missao de entrega (fase 2). NAO entra em
    -- `fn_conquista_metrica_suportada`: o escopo de conquista e' o aluno, nao um item da trilha.
    SELECT count(*) > 0
      INTO v_ok
      FROM public.atividade_aluno aa
     WHERE aa.aluno_id = p_aluno
       AND aa.atividade_id = NULLIF(btrim(COALESCE(p_criterio ->> 'atividade_id', '')), '')::bigint
       AND position('concl' in lower(coalesce(aa.status::text, ''))) > 0;
  ELSIF v_metrica = 'minutos_no_dia' THEN
    -- Delta, nao acumulado. `aluno_atividade_diaria` tem UNIQUE (aluno_id, dia) e guarda o
    -- fuso em que o dia foi fechado; o `dia` vem no criterio, posto pelo gerador.
    SELECT COALESCE(sum(d.tempo_uso_seg), 0) / 60.0
             >= COALESCE((p_criterio ->> 'minutos')::numeric, 0)
      INTO v_ok
      FROM public.aluno_atividade_diaria d
     WHERE d.aluno_id = p_aluno
       AND d.dia = NULLIF(btrim(COALESCE(p_criterio ->> 'dia', '')), '')::date;

  ELSIF v_metrica = 'eventos_no_dia' THEN
    -- `criado_em` e' `timestamp without time zone` gravado por now() em sessao UTC, entao a
    -- conversao e' UTC primeiro e o fuso do dia depois -- na ordem inversa o dia desliza 3h.
    SELECT count(*) >= COALESCE((p_criterio ->> 'minimo')::int, 0)
      INTO v_ok
      FROM public.eventos_aluno e
     WHERE e.aluno_id = p_aluno
       AND NOT public.fn_evento_creditado(e.tipo)
       AND (p_criterio ->> 'evento' IS NULL OR e.tipo = p_criterio ->> 'evento')
       AND (e.criado_em AT TIME ZONE 'UTC'
              AT TIME ZONE COALESCE(NULLIF(p_criterio ->> 'fuso', ''), 'America/Sao_Paulo'))::date
           = NULLIF(btrim(COALESCE(p_criterio ->> 'dia', '')), '')::date;

  END IF;

  RETURN COALESCE(v_ok, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_avaliar_metrica(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
"""


GERADOR = r"""
CREATE OR REPLACE FUNCTION public.fn_missao_diaria_gerar(p_dia date DEFAULT NULL)
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
  -- Os moldes. Todos usam metrica de DELTA, entao o alvo nao precisa de calibragem por
  -- coorte -- e' o que torna o alvo fixo correto para aluno adiantado e atrasado igualmente.
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
  );

  FOR v_coorte IN
    SELECT ca.classe_id, lower(p.nome) AS perfil
      FROM public.classe_aluno ca
      JOIN public.aluno_perfil ap ON ap.aluno_id = ca.aluno_id
      JOIN public.perfil p ON p.id = ap.perfil_id
     WHERE ca.classe_id IS NOT NULL AND ca.aluno_id IS NOT NULL
     GROUP BY ca.classe_id, lower(p.nome)
  LOOP
    -- Determinístico: mesma coorte e mesmo dia dao sempre as mesmas missoes. `random()` aqui
    -- quebraria a idempotencia que o ON CONFLICT garante.
    v_quantos := v_min + (abs(hashtext(v_coorte.classe_id::text || ':' || v_coorte.perfil || ':' || v_dia::text))
                          % GREATEST(v_max - v_min + 1, 1));

    v_base := abs(hashtext(v_coorte.classe_id::text || ':' || v_coorte.perfil
                           || ':' || v_dia::text)) % jsonb_array_length(v_moldes);

    FOR v_i IN 0 .. v_quantos - 1 LOOP
      v_slot := v_i + 1;
      -- Offset da coorte + passo de 1, NAO modulo independente por slot: com modulo
      -- independente dois slots podiam cair no mesmo molde, e o spec pede para nao repetir
      -- metrica no mesmo dia (duas missoes da mesma metrica sao a mesma missao com outro
      -- texto). Com passo 1 e 4 moldes, 2 ou 3 slots sao sempre distintos.
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
      -- Predicado repetido: sem ele o Postgres nao casa o indice PARCIAL e levanta
      -- "no unique or exclusion constraint matching".
      ON CONFLICT (classe_id, coalesce(perfil_alvo, ''), dia, slot) WHERE dia IS NOT NULL
      DO NOTHING;

      IF FOUND THEN v_total := v_total + 1; END IF;
    END LOOP;
  END LOOP;

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_diaria_gerar(date) FROM PUBLIC, anon, authenticated;
"""


CONFIG = """
-- `fn_app_config_int` le a chave e cai no padrao quando ela nao existe ou nao e numero.
CREATE OR REPLACE FUNCTION public.fn_app_config_int(p_chave text, p_padrao integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
  SELECT COALESCE(
    (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
       FROM public.app_config WHERE chave = p_chave),
    p_padrao);
$function$;

REVOKE ALL ON FUNCTION public.fn_app_config_int(text, integer) FROM PUBLIC, anon, authenticated;

INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('missao_diaria_min',        '2',  'Minimo de missoes diarias por coorte.', false),
  ('missao_diaria_max',        '3',  'Maximo de missoes diarias por coorte.', false),
  ('missao_diaria_minutos',    '10', 'Alvo do molde de minutos no dia.', false),
  ('missao_diaria_acoes',      '5',  'Alvo do molde de acoes na trilha no dia.', false),
  ('missao_diaria_atividades', '2',  'Alvo do molde de atividades concluidas no dia.', false),
  ('missao_diaria_conteudos',  '1',  'Alvo do molde de conteudos concluidos no dia.', false)
ON CONFLICT (chave) DO NOTHING;
"""


CRON = """
-- Meia-noite de Brasilia em UTC. Os outros jobs do projeto tambem rodam nessa faixa
-- (17 3, 41 3), entao o minuto 0 nao colide com nenhum.
SELECT cron.unschedule('trailup_missao_diaria')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trailup_missao_diaria');

SELECT cron.schedule('trailup_missao_diaria', '0 3 * * *',
                     $$SELECT public.fn_missao_diaria_gerar()$$);
"""


def upgrade() -> None:
    op.execute(CONFIG)
    op.execute(AVALIADOR)
    op.execute(guarda())
    op.execute(GERADOR)
    op.execute(CRON)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(
        "SELECT cron.unschedule('trailup_missao_diaria') "
        "WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trailup_missao_diaria')"
    )
    op.execute("DROP FUNCTION IF EXISTS public.fn_missao_diaria_gerar(date)")
    op.execute(guarda_da_fase_2())
    # `fn_avaliar_metrica` volta ao corpo da fase 3 (sem os ramos de delta) reaplicando
    # 20261021_03; nao reescrevo aqui para nao ter duas copias do mesmo corpo divergindo.
    op.execute(
        "DELETE FROM public.app_config WHERE chave IN ("
        "'missao_diaria_min','missao_diaria_max','missao_diaria_minutos',"
        "'missao_diaria_acoes','missao_diaria_atividades','missao_diaria_conteudos')"
    )
    op.execute("DROP FUNCTION IF EXISTS public.fn_app_config_int(text, integer)")
    op.execute("NOTIFY pgrst, 'reload schema'")
