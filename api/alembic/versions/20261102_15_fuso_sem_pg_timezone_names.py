"""Validar o fuso sem ler `pg_timezone_names` a cada chamada

## Por quê

Medido em produção (02/11, só leitura), ao investigar a lentidão na abertura do app (#832):

- `trailup_resumo_presenca` é chamada na abertura (`mobile/src/services/studyPresence.ts`): 2105
  chamadas, média de 1,16 s e máximo de 7,9 s. O `statement_timeout` do `authenticated` é 8 s.
- Só a checagem `SELECT 1 FROM pg_timezone_names WHERE name = p_timezone` custa ~784 ms
  (EXPLAIN ANALYZE). A view não tem índice nem cache: ela abre e lê do disco **todos** os arquivos de
  fuso (1196 em produção) a cada chamada. No `pg_stat_statements`, 913 chamadas, média de 873 ms.

A mesma checagem está em `metricas_engajamento_turma` (console) e em `estudo_coorte_registrar`.

## O que entra

`trailup_fuso_valido(text)`, chamada pelas três no lugar da consulta à view. Cada função continua
com a mesma exceção de antes: `fuso_invalido` em `trailup_resumo_presenca`, `timezone_invalido`
(22023) nas outras duas. NULL continua inválido nas três.

## Por que não basta `now() AT TIME ZONE p_timezone`

Medido no Postgres 17: `AT TIME ZONE` aceita muito mais que nome de zona. Aceita abreviação (`BRT`,
`PST`, `Z`), offset (`-03`, `-3`, `+03:00`) e regra POSIX (`UTC+3`, `XYZ+3`, `<-03>3`). Os offsets
e as regras POSIX usam o sinal POSIX, invertido em relação ao ISO: `'-03'` é **UTC+3**. Um cliente
que mandasse `-03` querendo dizer Brasília teria os dias deslocados em seis horas, sem erro. Em
`estudo_coorte_registrar` o valor é **gravado** e decide a janela do estudo e a trava.

## A decisão: aceitar o mesmo conjunto de antes

`trailup_fuso_valido` aceita o fuso quando:

1. tem forma de nome IANA: letras, dígitos, `_`, `+`, `-`, segmentos separados por `/`, começando
   por letra. Os 1196 nomes de produção têm essa forma (medido). Recusa `-03`, `+03:00`, `<-03>3`;
2. sem `/`, é um dos 45 nomes sem barra que `pg_timezone_names` lista em produção (`UTC`, `GMT`,
   `EST5EDT`...). Comparação exata, como era. Recusa `BRT`, `PST`, `Z`, `UTC+3`, `utc`. A lista é a
   área "backward" do tzdata, que não ganha nome novo; zona nova sempre vem com `/`;
3. o Postgres consegue usá-la (`AT TIME ZONE` sem `invalid_parameter_value`). Depois da primeira
   vez, o arquivo do fuso fica em cache no processo.

A única diferença em relação a antes: nome **com** `/` em outra caixa (`america/sao_paulo`) passa,
porque o Postgres acha o arquivo sem olhar a caixa. É o mesmo fuso, e as três funções já o usavam
assim no corpo. Nada que era aceito passa a ser recusado (o e2e confere isso nome a nome).

## Os corpos

Cada corpo vem da última migration que o define (`20260920_10`, `20261031_06`, `20261102_02`), com
a checagem trocada e nada mais. Conferido em 02/11: o `prosrc` de produção é igual ao dessas três.
O `upgrade` refaz essa conferência (md5 do `prosrc`) e falha se a função existir com outro corpo,
em vez de sobrescrever uma mudança que não passou por aqui.

Sem `%` no SQL (o SQL offline do Alembic o dobra).

## Downgrade

Volta aos três corpos anteriores e derruba `trailup_fuso_valido`.

Revision ID: 20261102_15
Revises: 20261102_14
Create Date: 2026-11-02
"""

import hashlib
import importlib.util
from pathlib import Path

from alembic import op

revision = "20261102_15"
down_revision = "20261102_14"
branch_labels = None
depends_on = None

# `SELECT name FROM pg_timezone_names WHERE name !~ '/'` em produção, 02/11/2026 (PG 17.6).
FUSOS_SEM_BARRA = (
    "CET", "CST6CDT", "Cuba", "EET", "EST", "EST5EDT", "Egypt", "Eire", "Factory", "GB", "GB-Eire",
    "GMT", "GMT+0", "GMT-0", "GMT0", "Greenwich", "HST", "Hongkong", "Iceland", "Iran", "Israel",
    "Jamaica", "Japan", "Kwajalein", "Libya", "MET", "MST", "MST7MDT", "NZ", "NZ-CHAT", "Navajo",
    "PRC", "PST8PDT", "Poland", "Portugal", "ROC", "ROK", "Singapore", "Turkey", "UCT", "UTC",
    "Universal", "W-SU", "WET", "Zulu",
)

FORMA_IANA = "^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)*$"

VALIDADOR = rf"""
CREATE OR REPLACE FUNCTION public.trailup_fuso_valido(p_timezone text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  -- Só nome de zona. AT TIME ZONE também aceita abreviação, offset e regra POSIX, e nestes dois
  -- o sinal é invertido: '-03' é UTC+3 (20261102_15).
  IF p_timezone IS NULL
     OR p_timezone !~ '{FORMA_IANA}'
     OR (strpos(p_timezone, '/') = 0
         AND NOT p_timezone = ANY (ARRAY[{", ".join(f"'{n}'" for n in FUSOS_SEM_BARRA)}]::text[])) THEN
    RETURN false;
  END IF;
  PERFORM now() AT TIME ZONE p_timezone;
  RETURN true;
EXCEPTION WHEN invalid_parameter_value THEN
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION public.trailup_fuso_valido(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_fuso_valido(text) TO authenticated;
"""

CHECAGEM_PRESENCA_ANTIGA = "  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN\n"
CHECAGEM_PRESENCA_NOVA = "  IF NOT public.trailup_fuso_valido(p_timezone) THEN\n"

CHECAGEM_ANTIGA = """  IF p_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_timezone
  ) THEN
"""
CHECAGEM_NOVA = "  IF NOT public.trailup_fuso_valido(p_timezone) THEN\n"

GRANTS_COORTE = """
REVOKE ALL ON FUNCTION public.estudo_coorte_registrar(bigint, text, text, text, date, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estudo_coorte_registrar(bigint, text, text, text, date, date, date, text) TO authenticated;
"""


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _troca(texto: str, antes: str, depois: str, nome: str) -> str:
    if texto.count(antes) != 1:
        raise RuntimeError(f"{nome} mudou de forma; revise a 20261102_15")
    return texto.replace(antes, depois, 1)


def corpo(sql: str, nome: str) -> str:
    """O que fica entre os `$fn$` de `nome`: é o que o Postgres guarda em `prosrc`."""
    inicio = sql.index("$fn$", sql.index(f"FUNCTION public.{nome}(")) + len("$fn$")
    return sql[inicio : sql.index("$fn$", inicio)]


def presenca_anterior() -> str:
    """`20260920_10` inteira (função, GRANTs e NOTIFY), com `CREATE OR REPLACE` para poder voltar."""
    sql = _modulo("20260920_10_study_presence.py").SQL
    return _troca(
        sql,
        "CREATE FUNCTION public.trailup_resumo_presenca(",
        "CREATE OR REPLACE FUNCTION public.trailup_resumo_presenca(",
        "trailup_resumo_presenca",
    )


def presenca_nova() -> str:
    return _troca(presenca_anterior(), CHECAGEM_PRESENCA_ANTIGA, CHECAGEM_PRESENCA_NOVA, "trailup_resumo_presenca")


def metricas_anterior() -> str:
    """`FUNCAO` da `20261031_06` (a função e os GRANTs dela)."""
    return _modulo("20261031_06_kpis_por_topico.py").FUNCAO


def metricas_nova() -> str:
    return _troca(metricas_anterior(), CHECAGEM_ANTIGA, CHECAGEM_NOVA, "metricas_engajamento_turma")


def coorte_anterior() -> str:
    """Só `estudo_coorte_registrar` da `20261102_02`, sem as outras RPCs do mesmo bloco."""
    rpcs = _modulo("20261102_02_estudo_coorte_e_marcos.py").RPCS
    inicio = rpcs.index("CREATE OR REPLACE FUNCTION public.estudo_coorte_registrar(")
    fim = rpcs.index("$fn$;", rpcs.index("AS $fn$", inicio) + len("AS $fn$")) + len("$fn$;")
    return rpcs[inicio:fim] + "\n" + GRANTS_COORTE


def coorte_nova() -> str:
    return _troca(coorte_anterior(), CHECAGEM_ANTIGA, CHECAGEM_NOVA, "estudo_coorte_registrar")


def guarda() -> str:
    """Falha se alguma das três existir com corpo diferente do que esta migration parte."""
    esperado = {
        "trailup_resumo_presenca(text)": corpo(presenca_anterior(), "trailup_resumo_presenca"),
        "metricas_engajamento_turma(bigint, date, date, text)": corpo(
            metricas_anterior(), "metricas_engajamento_turma"
        ),
        "estudo_coorte_registrar(bigint, text, text, text, date, date, date, text)": corpo(
            coorte_anterior(), "estudo_coorte_registrar"
        ),
    }
    checagens = "\n".join(
        f"""  IF to_regprocedure('public.{assinatura}') IS NOT NULL
     AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.{assinatura}'))
         <> '{hashlib.md5(texto.encode("utf-8")).hexdigest()}' THEN
    RAISE EXCEPTION 'public.{assinatura} mudou desde a última migration que a define: revise a 20261102_15';
  END IF;"""
        for assinatura, texto in esperado.items()
    )
    return f"DO $guarda$\nBEGIN\n{checagens}\nEND\n$guarda$;"


def upgrade() -> None:
    op.execute(guarda())
    op.execute(VALIDADOR)
    op.execute(presenca_nova())
    op.execute(metricas_nova())
    op.execute(coorte_nova())
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(presenca_anterior())
    op.execute(metricas_anterior())
    op.execute(coorte_anterior())
    op.execute("DROP FUNCTION IF EXISTS public.trailup_fuso_valido(text)")
    op.execute("NOTIFY pgrst, 'reload schema'")
