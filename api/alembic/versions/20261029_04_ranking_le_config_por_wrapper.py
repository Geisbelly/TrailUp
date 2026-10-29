"""F1 (segurança): o ranking lê a config por wrapper dedicado, sem abrir `fn_app_config_int`

## O que quebrou

`vw_rank_posicoes_por_classe_todas` chamava `public.fn_app_config_int(...)` duas vezes: o rating
inicial do Elo (`20261021_18`) e o mínimo de participantes do percentual (`20261025_02`). Essa função
teve o EXECUTE retirado do cliente, e com razão: ela lê QUALQUER chave de `app_config`, inclusive os
tetos anti-abuso (`credito_extra_maximo`, `conquista_recompensa_maxima`, `contato_envios_por_hora`),
que a `20260909_02` mantém `publico = false` porque saber o teto ajuda a burlá-lo. O efeito colateral
foi `42501` para todo aluno que lia o ranking, e o mobile caía num cálculo local que expunha a turma
inteira (Task 4).

## O que muda

Reabrir `fn_app_config_int` seria desfazer a proteção. Em vez disso, um wrapper por chave, no molde de
`app_rank_limite_visivel()` (`20260909_02`):

- `public.app_elo_inicial()` -> `elo_inicial`, padrão 1000;
- `public.app_rank_progresso_min_participantes()` -> `rank_progresso_min_participantes`, padrão 8.

Cada um é `SECURITY DEFINER` com `search_path = ''`, executável só por `authenticated` (sem `anon`) e lê
UMA chave: o cliente descobre dois parâmetros de UI/cálculo que o ranking já mostra pelo resultado, e
nenhum teto. A conversão é a de `fn_app_config_int` (só os dígitos; ausente ou não numérica cai no
padrão), para o valor não mudar com a troca.

A view é recortada da `20261025_02` (`view_nova()`) e as duas chamadas são trocadas com `_troca`, que
falha alto se o trecho mudar de forma. `fn_app_config_int` não é tocada: continua sem nenhum GRANT.

## I10

A invariante I10 da F0 (`20261029_03`) media `has_function_privilege('authenticated',
'fn_app_config_int', 'EXECUTE')`, ou seja, exigia o GRANT que não deve existir. Passa a olhar o que
importa: toda função de usuário de que `vw_rank_posicoes_por_classe` e `vw_rank_posicoes_por_classe_todas`
dependem (`pg_depend` sobre as regras de reescrita das duas views) e que `authenticated` não executa. Cada
uma devolvida é um `42501` esperando o aluno: a view antiga (cita `fn_app_config_int`), um wrapper que
perdeu o GRANT, um helper fechado novo, ou a view filtrada passando a chamar função fechada. Vazia =
o ranking é legível.

## Downgrade

Volta a view da `20261025_02` (que chama `fn_app_config_int`), restaura a I10 com o corpo da
`20261029_03` (recortado do módulo dela) e só então derruba os wrappers.

Revision ID: 20261029_04
Revises: 20261029_03
Create Date: 2026-10-29
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261029_04"
down_revision = "20261029_03"
branch_labels = None
depends_on = None


def _load(nome: str):
    path = Path(__file__).with_name(nome)
    spec = importlib.util.spec_from_file_location(nome, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _troca(texto: str, antigo: str, novo: str, onde: str) -> str:
    if texto.count(antigo) != 1:
        raise RuntimeError(f"o trecho de {onde} mudou de forma; revise a 20261029_04")
    return texto.replace(antigo, novo, 1)


# Dois CREATE literais, e não um gerador por nome: assim o `grep` acha cada função onde ela nasce.
WRAPPERS = """
CREATE OR REPLACE FUNCTION public.app_elo_inicial()
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $function$
  SELECT COALESCE(
    (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
       FROM public.app_config WHERE chave = 'elo_inicial'),
    1000);
$function$;

REVOKE ALL ON FUNCTION public.app_elo_inicial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_elo_inicial() TO authenticated;

CREATE OR REPLACE FUNCTION public.app_rank_progresso_min_participantes()
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $function$
  SELECT COALESCE(
    (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
       FROM public.app_config WHERE chave = 'rank_progresso_min_participantes'),
    8);
$function$;

REVOKE ALL ON FUNCTION public.app_rank_progresso_min_participantes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_rank_progresso_min_participantes() TO authenticated;
"""

DROP_WRAPPERS = (
    "DROP FUNCTION IF EXISTS public.app_elo_inicial();\n"
    "DROP FUNCTION IF EXISTS public.app_rank_progresso_min_participantes();\n"
)


def view_anterior() -> str:
    """`vw_rank_posicoes_por_classe_todas` como a `20261025_02` a deixa (a última que a redefine)."""
    return _load("20261025_02_periodo_e_progresso_do_rank.py").view_nova()


def view_nova() -> str:
    sql = view_anterior()
    sql = _troca(
        sql,
        "public.fn_app_config_int('elo_inicial', 1000)",
        "public.app_elo_inicial()",
        "rating inicial do Elo",
    )
    sql = _troca(
        sql,
        "public.fn_app_config_int('rank_progresso_min_participantes', 8)",
        "public.app_rank_progresso_min_participantes()",
        "mínimo de participantes do percentual",
    )
    return sql


# I10: o cliente consegue ler o ranking. Devolve toda função de usuário de que as DUAS views do ranking
# dependem (as regras de reescrita, via pg_depend) e que `authenticated` não pode executar: é isso que
# vira `42501` para o aluno. Cobre wrapper que perdeu o GRANT, helper fechado novo e a view filtrada
# passando a chamar função fechada, sem depender de grep no texto da definição.
CORPO_I10 = """
    SELECT p.oid::regprocedure::text
      FROM pg_catalog.pg_depend d
      JOIN pg_catalog.pg_rewrite r ON r.oid = d.objid
      JOIN pg_catalog.pg_proc p ON p.oid = d.refobjid
     WHERE d.classid = 'pg_catalog.pg_rewrite'::regclass AND d.refclassid = 'pg_catalog.pg_proc'::regclass
       AND r.ev_class IN ('public.vw_rank_posicoes_por_classe'::regclass,
                          'public.vw_rank_posicoes_por_classe_todas'::regclass)
       AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')"""


def _i10(corpo: str) -> str:
    return _load("20261029_03_invariantes_das_metricas.py")._funcao_invariante("10", corpo)


def i10_nova() -> str:
    return _i10(CORPO_I10)


def i10_anterior() -> str:
    """O corpo da F0, recortado do módulo dela: nunca copiado à mão."""
    return _i10(_load("20261029_03_invariantes_das_metricas.py").INVARIANTES["10"])


RELOAD = "NOTIFY pgrst, 'reload schema';"


def upgrade() -> None:
    op.execute(WRAPPERS)
    op.execute(view_nova())
    op.execute(i10_nova())
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(view_anterior())
    op.execute(i10_anterior())
    op.execute(DROP_WRAPPERS)
    op.execute(RELOAD)
