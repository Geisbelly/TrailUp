"""PR1 e PR2 por plataforma de uso do aluno: a plataforma deixa de ser misturada em silêncio (#30)

Até aqui a plataforma só aparecia como cobertura (`lotes_por_plataforma`) e a RPC declarava que PR1 e
PR2 não podiam ser comparados por ela: o aluno na web não tem câmera, a telemetria muda, e misturar os
dois no mesmo número é uma variável de confusão silenciosa na avaliação (critério 3 da #30).

## Atribuição

A plataforma é um atributo do **aluno**, não do evento: PR2 (conclusão, entrega, acerto) não carrega
plataforma por linha, e um estrato que valesse só para o tempo ativo não fecharia a conta com os
desfechos. `estudo_plataforma_do_aluno` classifica o aluno pelos lotes de telemetria dele na turma,
`payload -> 'cliente' ->> 'plataforma'`:

- `web`: só lotes da web;
- `app`: só lotes de `ios`/`android`;
- `misto`: os dois;
- `sem_cliente`: nenhum lote com plataforma (builds antigos não mandavam `cliente`).

Só entram lotes **anteriores ao corte**. Estrato é covariável: medido depois do corte, a própria
personalização poderia empurrar o aluno de uma plataforma para outra e o recorte passaria a medir o
efeito que se quer isolar. Efeito colateral aceito: quem só começou a usar o app depois do corte cai
em `sem_cliente`.

## Conta única

Mesmo desenho da `20261105_12` (`p_perfil`): o recorte entra por um parâmetro opcional novo em
`estudo_indicadores_janela` (`p_plataforma`, padrão NULL). A conta é uma só, então o número de um
estrato não diverge do total. A função de 6 argumentos sai e entra a de 7; quem chama com 5 ou 6
(`metricas_estudo_coortes`, `metricas_estudo_longitudinal`) continua igual pelo padrão. A troca de
texto falha alto se o trecho mudou, como na `20261104_04`.

## Saída e supressão

`metricas_estudo_coortes` ganha `coortes[].por_plataforma`: por estrato, `pre` e `pos` com os mesmos
indicadores de `pre`/`pos`. Estrato com menos pareados que `n_minimo` já voltaria nulo, mas então o
total menos os estratos visíveis devolveria o número do pequeno. Por isso, se **qualquer** estrato não
vazio ficar abaixo de `n_minimo`, **todos** voltam `{"amostra_insuficiente": true}`, sem pareados.

Fora de escopo: diferença-em-diferenças e série semanal por plataforma, e o nível braço da
`metricas_estudo_longitudinal`. Isso fica dito em `limitacoes`.

Revision ID: 20261106_02
Revises: 20261106_01
Create Date: 2026-11-06
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261106_02"
down_revision = "20261106_01"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

JANELA_6 = "public.estudo_indicadores_janela(bigint, date, date, date, text, text)"
JANELA_7 = "public.estudo_indicadores_janela(bigint, date, date, date, text, text, text)"
HELPER = "public.estudo_plataforma_do_aluno(bigint, uuid, date, text)"

ESTRATOS = "ARRAY['web', 'app', 'misto', 'sem_cliente']"


def _load(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_06_02", AQUI.with_name(nome))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _trocar(texto: str, trocas: tuple[tuple[str, str], ...], nome: str) -> str:
    for antigo, novo in trocas:
        if texto.count(antigo) != 1:
            raise RuntimeError(f"{nome} mudou de forma; revise a 20261106_02")
        texto = texto.replace(antigo, novo)
    return texto


def _longitudinal():
    return _load("20261105_12_metricas_estudo_longitudinal.py")


HELPER_SQL = r"""
-- Estrato de plataforma do aluno na turma, só com lotes anteriores ao corte (covariável pré-tratamento).
CREATE OR REPLACE FUNCTION public.estudo_plataforma_do_aluno(
  p_classe_id bigint,
  p_aluno_id uuid,
  p_corte date,
  p_timezone text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
SELECT CASE
  WHEN count(*) FILTER (WHERE x.plataforma = 'web') > 0
   AND count(*) FILTER (WHERE x.plataforma IN ('ios', 'android')) > 0 THEN 'misto'
  WHEN count(*) FILTER (WHERE x.plataforma = 'web') > 0 THEN 'web'
  WHEN count(*) FILTER (WHERE x.plataforma IN ('ios', 'android')) > 0 THEN 'app'
  ELSE 'sem_cliente'
END
FROM (
  SELECT lower(btrim(l.payload -> 'cliente' ->> 'plataforma')) AS plataforma
    FROM public.telemetria_lotes l
   WHERE l.classe_id = p_classe_id
     AND l.aluno_id = p_aluno_id
     AND l.captured_at < (p_corte::timestamp AT TIME ZONE p_timezone)
) x;
$fn$;
"""

FILTRO_PERFIL = (
    "     AND (p_perfil IS NULL OR p_perfil = "
    + "(SELECT lower(pf.nome) FROM public.aluno_perfil ap JOIN public.perfil pf ON pf.id = ap.perfil_id"
    " WHERE ap.aluno_id = ca.aluno_id AND pf.nome IS NOT NULL"
    " ORDER BY ap.afinidade DESC NULLS LAST, lower(pf.nome) LIMIT 1))\n"
)
FILTRO_PLATAFORMA = (
    "     AND (p_plataforma IS NULL OR p_plataforma = "
    "public.estudo_plataforma_do_aluno(ca.classe_id, ca.aluno_id, p_corte, p_timezone))\n"
)

TROCAS_JANELA = (
    ("  p_perfil text DEFAULT NULL\n)\n", "  p_perfil text DEFAULT NULL,\n  p_plataforma text DEFAULT NULL\n)\n"),
    (FILTRO_PERFIL, FILTRO_PERFIL + FILTRO_PLATAFORMA),
)


def janela_anterior() -> str:
    """`estudo_indicadores_janela` (6 argumentos) como a `20261105_12` a deixou."""
    return _longitudinal().janela_nova()


def janela_nova() -> str:
    return _trocar(janela_anterior(), TROCAS_JANELA, "estudo_indicadores_janela")


def rpc_anterior() -> str:
    """`metricas_estudo_coortes` como a `20261105_29` a deixou."""
    return _load("20261105_29_limitacao_plataforma_coortes.py").rpc_nova()


ESTRATOS_SQL = f"""    -- Recorte por plataforma do aluno (#30): a mesma conta da janela, filtrada por estrato.
    v_estratos := '{{}}'::jsonb;
    v_estrato_pequeno := false;
    FOREACH v_estrato IN ARRAY {ESTRATOS} LOOP
      v_e_pre := CASE WHEN v_pre IS NULL THEN NULL
                      ELSE public.estudo_indicadores_janela(
                             c.classe_id, c.baseline_inicio, LEAST(c.corte - 1, v_hoje), c.corte, c.timezone,
                             NULL, v_estrato)
                 END;
      v_e_pos := CASE WHEN v_pos IS NULL THEN NULL
                      ELSE public.estudo_indicadores_janela(
                             c.classe_id, c.corte, v_ultimo, c.corte, c.timezone, NULL, v_estrato)
                 END;
      v_n_estrato := COALESCE((COALESCE(v_e_pre, v_e_pos) ->> 'pareados')::integer, 0);
      v_estrato_pequeno := v_estrato_pequeno OR (v_n_estrato > 0 AND v_n_estrato < v_n_min);
      v_estratos := v_estratos || jsonb_build_object(
        v_estrato, jsonb_build_object('pre', v_e_pre, 'pos', v_e_pos));
    END LOOP;
    -- Um estrato pequeno suprimido sozinho sairia por subtração (total menos os visíveis):
    -- se algum estrato não vazio fica abaixo de n_minimo, nenhum é publicado.
    v_estratos := COALESCE((
      SELECT jsonb_object_agg(
               e.key,
               CASE WHEN v_estrato_pequeno THEN jsonb_build_object('amostra_insuficiente', true)
                    ELSE jsonb_build_object(
                           'pre', public.estudo_indicadores_publicos(NULLIF(e.value -> 'pre', 'null'::jsonb), v_n_min),
                           'pos', public.estudo_indicadores_publicos(NULLIF(e.value -> 'pos', 'null'::jsonb), v_n_min))
               END)
        FROM jsonb_each(v_estratos) AS e
    ), '{{}}'::jsonb);

"""

LIMITACAO_ANTIGA = (
    "      'a plataforma muda a disponibilidade de sinais; lotes_por_plataforma informa cobertura, "
    "mas PR1 e PR2 continuam agregados e nao permitem comparar resultados por plataforma (issue 30)',\n"
)
LIMITACAO_NOVA = (
    "      'a plataforma muda a disponibilidade de sinais (web sem camera); por_plataforma recorta pre e pos "
    "pelo estrato do aluno medido antes do corte, mas a diferenca-em-diferencas, a serie semanal e o nivel "
    "braco continuam agregados (issue 30)',\n"
    "      'estrato de plataforma e do aluno antes do corte: quem so passou a usar o app depois dele fica em "
    "sem_cliente; com algum estrato abaixo de n_minimo nenhum e publicado',\n"
)
DEFINICAO_ANTIGA = "      'semana', 'relativa ao corte, negativa no baseline'\n"
DEFINICAO_NOVA = (
    "      'semana', 'relativa ao corte, negativa no baseline',\n"
    "      'plataforma', 'web, app (ios ou android), misto ou sem_cliente, pelos lotes do aluno anteriores ao corte'\n"
)

TROCAS_RPC = (
    ("  v_pos jsonb;\n", "  v_pos jsonb;\n  v_estrato text;\n  v_e_pre jsonb;\n  v_e_pos jsonb;\n"
     "  v_n_estrato integer;\n  v_estratos jsonb;\n  v_estrato_pequeno boolean;\n"),
    (
        "    IF v_pre IS NOT NULL THEN\n      v_brutos := v_brutos || jsonb_build_object('braco', c.braco, 'fase', 'pre', 'bruto', v_pre);\n",
        ESTRATOS_SQL
        + "    IF v_pre IS NOT NULL THEN\n      v_brutos := v_brutos || jsonb_build_object('braco', c.braco, 'fase', 'pre', 'bruto', v_pre);\n",
    ),
    (
        "      'pos', public.estudo_indicadores_publicos(v_pos, v_n_min),\n",
        "      'pos', public.estudo_indicadores_publicos(v_pos, v_n_min),\n      'por_plataforma', v_estratos,\n",
    ),
    (DEFINICAO_ANTIGA, DEFINICAO_NOVA),
    (LIMITACAO_ANTIGA, LIMITACAO_NOVA),
)


def rpc_nova() -> str:
    return _trocar(rpc_anterior(), TROCAS_RPC, "metricas_estudo_coortes")


def upgrade() -> None:
    op.execute(f"DROP FUNCTION IF EXISTS {JANELA_6};")
    op.execute(HELPER_SQL)
    op.execute(f"REVOKE ALL ON FUNCTION {HELPER} FROM PUBLIC, anon, authenticated;")
    op.execute(janela_nova())
    op.execute(f"REVOKE ALL ON FUNCTION {JANELA_7} FROM PUBLIC, anon, authenticated;")
    op.execute(rpc_nova())


def downgrade() -> None:
    op.execute(rpc_anterior())
    op.execute(f"DROP FUNCTION IF EXISTS {JANELA_7};")
    op.execute(janela_anterior())
    op.execute(f"REVOKE ALL ON FUNCTION {JANELA_6} FROM PUBLIC, anon, authenticated;")
    op.execute(f"DROP FUNCTION IF EXISTS {HELPER};")
    op.execute("NOTIFY pgrst, 'reload schema';")
