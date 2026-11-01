"""O aluno só grava telemetria na própria sessão (e, na métrica de tempo, no próprio lote)

Fecha a brecha que a F2 (`20261029_07`) mediu e contornou só no fechamento da sessão.

## O que estava errado

As policies de INSERT das tabelas filhas de `telemetria_sessoes` (`_insert_own`, da `20260831_01`)
conferem só `aluno_id = auth.uid()` na linha nova. Nenhuma confere a quem pertence a sessão para a qual
a linha aponta:

| Tabela | Aponta para | Policy de INSERT/UPDATE do aluno |
| --- | --- | --- |
| `telemetria_lotes` | `sessao_id` | `_insert_own` (`aluno_id = auth.uid()`) |
| `telemetria_eventos_app` | `sessao_id` | `_insert_own` e `_update_own` (o upsert de `client_event_id`) |
| `telemetria_time_metric_entries` | `sessao_id` e `lote_id` | `_insert_own` |

A FK é conferida pelo dono da tabela, não pela RLS, então ela só prova que a sessão existe. Um aluno B
grava como B, com o próprio `aluno_id`, um lote, um evento ou uma métrica de tempo pendurados na sessão
de A. Isso polui a telemetria de A (tudo que agrega por `sessao_id` passa a contar o que B mandou) e faz
a I17 (`20261029_03`) acusar a sessão de A. A F2 mediu o caso no lote
(`test_lote_com_sessao_de_outro_aluno_nao_fecha`) e fez o gatilho de fechamento ignorar o lote alheio,
mas o lote continuava entrando.

Medido em produção (29/10, só leitura): as policies das quatro tabelas são as da fonte Alembic
(`_insert_own`, `_update_own` em sessões e eventos, `_consentimento_ins/_upd` RESTRICTIVE, `_select_own`,
`_professor_sel/_del`), nenhuma com `FORCE ROW LEVEL SECURITY`. Nenhuma linha cruzada hoje: 156 lotes,
952 eventos e 498 métricas de tempo, todos com o `aluno_id` igual ao da sessão (e, na métrica, ao do
lote e com a mesma sessão do lote). A regra nova não recusa nada do que o app grava de verdade.

## O que muda

Policies RESTRICTIVE `<tabela>_sessao_propria_ins/_upd` nas três tabelas filhas, perguntando a dois
helpers novos:

- `app_minha_sessao_de_telemetria(uuid)`: a sessão existe e é de `auth.uid()`;
- `app_meu_lote_de_telemetria(uuid)`: o lote existe e é de `auth.uid()` (só a métrica de tempo aponta
  para lote).

### Por que RESTRICTIVE, e não trocar o `WITH CHECK` da `_insert_own`

RESTRICTIVE soma com AND a toda policy PERMISSIVE da tabela, a de hoje e as que vierem. Trocar o
predicado da `_insert_own` fecharia esta brecha, mas a próxima policy PERMISSIVE de INSERT (de professor,
de importação, de qualquer coisa) reabriria em silêncio, porque PERMISSIVE soma com OR. É o mesmo desenho
do consentimento (`20261024_02`). E deixa a `_insert_own` intocada, então o downgrade é um `DROP`.

A `_upd` entra nas três, embora só `telemetria_eventos_app` tenha UPDATE para o aluno hoje: o upsert por
`client_event_id` poderia mover um evento próprio para a sessão de outro. Em lote e métrica (append-only,
sem `_update_own`) ela não muda nada agora, e impede que um `_update_own` futuro reabra a brecha.

### Por que helper `SECURITY DEFINER`

O padrão do repo para predicado de posse que lê outra tabela (`app_classes_do_professor()` e os demais):
a policy não depende da RLS de `telemetria_sessoes`/`telemetria_lotes` para enxergar a linha-mãe, então
uma mudança futura nas policies de SELECT delas não muda o que esta regra decide. `SET search_path = ''`,
tudo qualificado. Os helpers só respondem sim/não sobre a própria posse do chamador, para um id que ele
já tem; não revelam nada de outra pessoa. Como as policies os chamam no papel de quem escreve,
`authenticated` precisa de EXECUTE; `anon` e `PUBLIC` não. Dependem de o dono (`postgres`) passar pela
RLS das tabelas-mãe, o que vale enquanto elas não tiverem `FORCE ROW LEVEL SECURITY` (mesma premissa da
`20261029_07`).

### O caminho da API não muda

A API conecta como `postgres` (dono das tabelas) e o `service_role` tem `BYPASSRLS`: nenhuma policy se
aplica a eles. As policies novas são `TO authenticated`.

## Downgrade

Derruba as seis policies e os dois helpers. As `_insert_own/_update_own` nunca foram tocadas.

Revision ID: 20261029_08
Revises: 20261029_07
Create Date: 2026-10-29
"""

from alembic import op

revision = "20261029_08"
down_revision = "20261029_07"
branch_labels = None
depends_on = None

# Tabela -> predicado de posse da linha-mãe. Só a métrica de tempo aponta também para o lote.
TABELAS = {
    "telemetria_lotes": "public.app_minha_sessao_de_telemetria(sessao_id)",
    "telemetria_eventos_app": "public.app_minha_sessao_de_telemetria(sessao_id)",
    "telemetria_time_metric_entries": (
        "public.app_minha_sessao_de_telemetria(sessao_id) AND public.app_meu_lote_de_telemetria(lote_id)"
    ),
}

HELPERS = """
CREATE OR REPLACE FUNCTION public.app_minha_sessao_de_telemetria(p_sessao_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.telemetria_sessoes s
     WHERE s.id = p_sessao_id AND s.aluno_id = auth.uid()
  )
$function$;

CREATE OR REPLACE FUNCTION public.app_meu_lote_de_telemetria(p_lote_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.telemetria_lotes l
     WHERE l.id = p_lote_id AND l.aluno_id = auth.uid()
  )
$function$;

REVOKE ALL ON FUNCTION public.app_minha_sessao_de_telemetria(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_meu_lote_de_telemetria(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_minha_sessao_de_telemetria(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_meu_lote_de_telemetria(uuid) TO authenticated, service_role;
"""


def _policies() -> list[str]:
    comandos: list[str] = []
    for tabela, predicado in TABELAS.items():
        comandos += [
            f"DROP POLICY IF EXISTS {tabela}_sessao_propria_ins ON public.{tabela}",
            f"DROP POLICY IF EXISTS {tabela}_sessao_propria_upd ON public.{tabela}",
            f"""
            CREATE POLICY {tabela}_sessao_propria_ins
              ON public.{tabela}
              AS RESTRICTIVE
              FOR INSERT TO authenticated
              WITH CHECK ({predicado})
            """,
            f"""
            CREATE POLICY {tabela}_sessao_propria_upd
              ON public.{tabela}
              AS RESTRICTIVE
              FOR UPDATE TO authenticated
              USING ({predicado})
              WITH CHECK ({predicado})
            """,
        ]
    return comandos


def upgrade() -> None:
    op.execute(HELPERS)
    for sql in _policies():
        op.execute(sql)


def downgrade() -> None:
    for tabela in TABELAS:
        op.execute(f"DROP POLICY IF EXISTS {tabela}_sessao_propria_ins ON public.{tabela}")
        op.execute(f"DROP POLICY IF EXISTS {tabela}_sessao_propria_upd ON public.{tabela}")
    op.execute("DROP FUNCTION IF EXISTS public.app_meu_lote_de_telemetria(uuid)")
    op.execute("DROP FUNCTION IF EXISTS public.app_minha_sessao_de_telemetria(uuid)")
