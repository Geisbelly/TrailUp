"""Os exemplos da turma de demonstração passam a gravar de verdade

A `20261124_01` não gravou exemplo nenhum, em banco nenhum. Rodada num Postgres com o esqueleto de
produção e todas as migrations anteriores, a semeadura devolveu as sete abas em `falhas`:

- `v_feitos := v_feitos || 'missoes'`, com `v_feitos text[]`: o Postgres lê `'missoes'` como literal
  de ARRAY, e não como elemento, e levanta `malformed array literal`. Esse erro vinha no fim de cada
  bloco, depois dos INSERT e das RPCs. A subtransação do bloco desfazia tudo, e o `EXCEPTION` só
  anotava a falha. Agora é `array_append`.
- O evento pedia a primeira atividade da trilha como missão, mas `evento_classe_definir_missoes` só
  aceita atividade com `tipo = 'missao'` (o resto vem da trilha comum). Agora a semeadura pega a
  primeira missão da trilha. Sem missão, o evento entra sem missão própria, em vez de não entrar.

Como a semeadura devolvia normalmente (com as falhas no retorno), a preparação e o backfill marcaram
`exemplos_em` em quem não recebeu nada. Por isso o `upgrade` semeia de novo **todo** avaliador com
turma: nenhum deles tem exemplo gravado pela `_01`, então não há risco de duplicar.

O backfill continua no mesmo molde da `_01`: cada turma na própria subtransação, erro vira
`WARNING`. A API aplica esta migration ao subir, e um erro solto aqui a derrubaria.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261124_02"
down_revision = "20261124_01"
branch_labels = None
depends_on = None


def _modulo(arquivo: str):
    caminho = Path(__file__).resolve().parent / arquivo
    spec = importlib.util.spec_from_file_location(f"m_{arquivo[:11]}", caminho)
    assert spec and spec.loader
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M01 = _modulo("20261124_01_pesquisa_exemplos_na_turma.py")

_ATIVIDADE_ANTES = """  SELECT a.id INTO v_atividade
    FROM public.atividades a JOIN public.topicos t ON t.id = a.topico_id
   WHERE t.classe_id = p_classe_id
   ORDER BY"""
_ATIVIDADE_DEPOIS = """  SELECT a.id INTO v_atividade
    FROM public.atividades a JOIN public.topicos t ON t.id = a.topico_id
   WHERE t.classe_id = p_classe_id AND a.tipo = 'missao'
   ORDER BY"""

_EXEMPLOS = ("missoes", "desafios", "conquistas", "economia", "fundo", "guildas", "evento")


def _corrigir(sql: str) -> str:
    assert sql.count(_ATIVIDADE_ANTES) == 1
    sql = sql.replace(_ATIVIDADE_ANTES, _ATIVIDADE_DEPOIS)
    for exemplo in _EXEMPLOS:
        antes = f"v_feitos := v_feitos || '{exemplo}';"
        assert sql.count(antes) == 1, exemplo
        sql = sql.replace(antes, f"v_feitos := array_append(v_feitos, '{exemplo}');")
    assert "v_feitos ||" not in sql
    return sql


SEMEAR = _corrigir(M01.SEMEAR)

# Todo avaliador com turma: a `_01` marcou `exemplos_em` sem ter gravado nada.
BACKFILL = """
DO $do$
DECLARE
  r record;
  v_ret jsonb;
BEGIN
  FOR r IN SELECT pa.id, pa.classe_id, pa.professor_id
             FROM public.pesquisa_avaliador pa
             JOIN public.classe c ON c.id = pa.classe_id AND c.professor_id = pa.professor_id
  LOOP
    BEGIN
      v_ret := public.fn_pesquisa_semear_exemplos(r.classe_id, r.professor_id);
      UPDATE public.pesquisa_avaliador SET exemplos_em = now() WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Exemplos da turma % não entraram: %', r.classe_id, SQLERRM;
    END;
  END LOOP;
END;
$do$;
"""


def upgrade() -> None:
    op.execute(SEMEAR)
    op.execute(BACKFILL)


def downgrade() -> None:
    op.execute(M01.SEMEAR)
