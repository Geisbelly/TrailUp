"""O painel técnico avisa o dono quando um gatilho dispara, sem ele precisar abrir (#21)

## O que faltava

A #854 entrega o painel técnico, mas o alerta era **só visual**: o dono só vê um gatilho do §11 se
abrir a aba. A tarefa 4 da #21 pede o caminho de alerta, e o que ela aceitava ("e-mail, log, ou apenas
visual") não cobria o problema real: uma fila parada às 3 h da manhã só aparece quando alguém lembra de
olhar.

## O que muda

A cada 30 min o `pg_cron` roda `fn_painel_tecnico_avisar_dono()`, que lê o painel **pela própria
`painel_tecnico`** e, para cada gatilho em `alerta`, grava uma notificação para o dono em
`professor_notificacoes` (a caixa do sino do console, `20261102_17`). Nenhum caminho novo de entrega:
o aviso aparece no sino, com contador, e leva à aba Painel técnico.

- **Uma única regra de alerta.** O cron chama `painel_tecnico(168)`, então o que dispara o aviso é
  exatamente o que a aba mostra como "Atenção": não há segunda cópia da conta para divergir. Como a RPC
  confere `app_e_dono()`, a função põe o e-mail do dono nas claims **só dentro da transação** e devolve
  o que havia antes. É seguro porque a função não tem `EXECUTE` para ninguém além do dono do banco e do
  cron: nenhum cliente consegue chegar a esse atalho.
- **Um aviso por gatilho por dia** (`dedupe_key = tec:<gatilho>:<dia em Brasília>`). Rodar a cada 30 min
  não pode reabrir o aviso a cada 30 min: `fn_professor_notificar` soma e reabre quando o assunto se
  repete, e aqui isso viraria spam. O aviso é gravado só se a chave do dia ainda não existe; se o dono
  já leu, continua lido até o dia seguinte. Problema que persiste vira um lembrete por dia.
- **`sem_dado` não avisa**: é lacuna de medida, não alarme (o painel já diz isso na tela).
- **Quem é o dono** vem de `app_config.dono_email` cruzado com `auth.users`; sem dono cadastrado ou
  sem professor com esse e-mail, não faz nada (não é erro).
- **Nunca derruba o cron**: qualquer falha vira `WARNING` e a função devolve 0.
- `professor_notificacoes` ganha o tipo `gatilho_tecnico` e o destino `tecnico`.

Sem `pg_cron` (banco local, CI) a migration passa e nada é agendado, como `20261025_04`. Reagendar por
nome não duplica o job.
"""

from __future__ import annotations

from alembic import op

revision = "20261102_23"
down_revision = "20261102_22"
branch_labels = None
depends_on = None

JOB = "trailup_painel_tecnico_avisar_dono"
CRON = "*/30 * * * *"

TIPOS = """
ALTER TABLE public.professor_notificacoes DROP CONSTRAINT IF EXISTS professor_notificacoes_tipo_ck;
ALTER TABLE public.professor_notificacoes ADD CONSTRAINT professor_notificacoes_tipo_ck CHECK (
  tipo IN ('recomendacao_ia', 'entrega_para_avaliar', 'geracao_falhou', 'evento_encerrado', 'gatilho_tecnico')
);
ALTER TABLE public.professor_notificacoes DROP CONSTRAINT IF EXISTS professor_notificacoes_destino_ck;
ALTER TABLE public.professor_notificacoes ADD CONSTRAINT professor_notificacoes_destino_ck CHECK (
  destino IS NULL OR destino IN ('recomendacoes', 'notas', 'personalizacoes', 'eventos', 'tecnico')
);
"""

FUNCAO = """
CREATE OR REPLACE FUNCTION public.fn_painel_tecnico_avisar_dono()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_email  text;
  v_dono   uuid;
  v_painel jsonb;
  v_antes  text;
  v_hoje   text;
  v_chave  text;
  v_g      jsonb;
  v_novos  integer := 0;
BEGIN
  SELECT lower(btrim(c.valor)) INTO v_email FROM public.app_config c WHERE c.chave = 'dono_email';
  IF coalesce(v_email, '') = '' THEN
    RETURN 0;
  END IF;

  SELECT p.id INTO v_dono
    FROM public.professor p
    JOIN auth.users u ON u.id = p.id
   WHERE lower(u.email) = v_email
   LIMIT 1;
  IF v_dono IS NULL THEN
    RETURN 0;
  END IF;

  -- `painel_tecnico` confere `app_e_dono()` pelas claims da sessão. O cron não tem sessão: põe o e-mail do
  -- dono só na transação e devolve o que havia. Esta função não tem EXECUTE para cliente nenhum, então o
  -- atalho não é alcançável de fora.
  v_antes := current_setting('request.jwt.claims', true);
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('email', v_email)::text, true);
    v_painel := public.painel_tecnico(168);
    PERFORM set_config('request.jwt.claims', coalesce(v_antes, ''), true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claims', coalesce(v_antes, ''), true);
    RAISE WARNING 'painel_tecnico_avisar_dono: %', SQLERRM;
    RETURN 0;
  END;

  v_hoje := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD');
  FOR v_g IN SELECT e FROM jsonb_array_elements(coalesce(v_painel -> 'gatilhos', '[]'::jsonb)) AS e LOOP
    -- `sem_dado` é lacuna de medida, não alarme.
    CONTINUE WHEN (v_g ->> 'estado') IS DISTINCT FROM 'alerta';
    v_chave := 'tec:' || coalesce(v_g ->> 'id', '?') || ':' || v_hoje;
    -- Um aviso por gatilho por dia: `fn_professor_notificar` reabre o que já existe, e a cada 30 min isso seria spam.
    IF EXISTS (
      SELECT 1 FROM public.professor_notificacoes n WHERE n.professor_id = v_dono AND n.dedupe_key = v_chave
    ) THEN
      CONTINUE;
    END IF;
    PERFORM public.fn_professor_notificar(
      v_dono, NULL, 'gatilho_tecnico',
      left(coalesce(v_g ->> 'titulo', 'Gatilho técnico'), 160),
      left(coalesce(v_g ->> 'detalhe', ''), 500),
      'tecnico', v_chave);
    v_novos := v_novos + 1;
  END LOOP;
  RETURN v_novos;
EXCEPTION WHEN OTHERS THEN
  -- O aviso nunca pode derrubar o cron.
  RAISE WARNING 'painel_tecnico_avisar_dono: %', SQLERRM;
  RETURN 0;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_painel_tecnico_avisar_dono() FROM PUBLIC, anon, authenticated;
"""

AGENDAR = f"""
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
    PERFORM cron.schedule('{JOB}', '{CRON}', 'SELECT public.fn_painel_tecnico_avisar_dono()');
  END IF;
END
$cron$;
"""

DESAGENDAR = f"""
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
  END IF;
END
$cron$;
"""


def upgrade() -> None:
    op.execute(TIPOS)
    op.execute(FUNCAO)
    op.execute(AGENDAR)


def downgrade() -> None:
    op.execute(DESAGENDAR)
    op.execute("DROP FUNCTION IF EXISTS public.fn_painel_tecnico_avisar_dono()")
    op.execute("DELETE FROM public.professor_notificacoes WHERE tipo = 'gatilho_tecnico'")
    op.execute("ALTER TABLE public.professor_notificacoes DROP CONSTRAINT IF EXISTS professor_notificacoes_tipo_ck")
    op.execute(
        "ALTER TABLE public.professor_notificacoes ADD CONSTRAINT professor_notificacoes_tipo_ck CHECK ("
        "tipo IN ('recomendacao_ia', 'entrega_para_avaliar', 'geracao_falhou', 'evento_encerrado'))"
    )
    op.execute("ALTER TABLE public.professor_notificacoes DROP CONSTRAINT IF EXISTS professor_notificacoes_destino_ck")
    op.execute(
        "ALTER TABLE public.professor_notificacoes ADD CONSTRAINT professor_notificacoes_destino_ck CHECK ("
        "destino IS NULL OR destino IN ('recomendacoes', 'notas', 'personalizacoes', 'eventos'))"
    )
