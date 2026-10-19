"""tempo_gasto_min passa a ser derivado da telemetria, por trigger

Fecha a lacuna que a `20260927_01` so remendou: o tempo deixa de ser
acumulado por chamada de RPC e passa a ser DERIVADO da telemetria, que e
o que o CLAUDE.md ja descrevia e o banco nao fazia.

## O que havia

`trailup_registrar_intervalo_estudo` acumulava intervalo a intervalo e
saia cedo quando o intervalo ja existia:

    INSERT INTO estudo_intervalos(...) ON CONFLICT (id) DO NOTHING
      RETURNING id INTO v_id;
    IF v_id IS NULL THEN RETURN; END IF;

Uma chamada que falhava perdia o intervalo para sempre -- e elas
falhavam, com `57014 statement timeout`. Pior: o valor acumulado nao
tinha lastro. Para o aluno de demonstracao,

    topico_aluno.tempo_gasto_min somado        114.01 min
    estudo_intervalos, TODAS as datas           41.44 min
    telemetria scope='topic' (active_sec)       24.74 min

114 minutos nao podem sair de 41. O gravado era 2,75x a propria fonte.

## A semantica escolhida

"Tempo gasto" passa a significar ESTUDO ATIVO: `active_sec` da
telemetria, e nao presenca com o app aberto. `estudo_intervalos` grava 1
minuto por minuto de app aberto (cadencia verificada: 05:40, 05:41,
05:43, ... 06:14) -- isso e presenca, nao estudo.

A consequencia e deliberada e precisa ser dita: o numero que o aluno ve
CAI. No topico 131, de 82,02 para 6,10. Era inflado.

## Como

`trailup_sync_tempo_da_telemetria()` recalcula as tres tabelas para as
entidades tocadas, usando `trailup_tempo_telemetria_min`. Dispara por
STATEMENT (nao por linha) com transition tables, porque a telemetria
chega em lote: um lote de 200 entries faz UM recalculo, nao 200.

Os indices parciais de que o recalculo precisa JA existem -- 
`telemetria_tme_{conteudo,atividade,topico}_id_tempo_idx` sobre
`(aluno_id, scope, <id>)` -- e casam exatamente com o WHERE da funcao de
agregacao. Nao ha indice novo a criar, e o recalculo e indexado.

## Guarda contra zerar quem nao tem telemetria

O UPDATE so alcanca entidade que TEM pelo menos uma entry. Sem isso,
aluno que recusou a coleta de desempenho (`telemetryPreferences.
performanceEnabled = false` no app) nao gera telemetria, e derivar
cegamente zeraria o tempo dele. Quem nao tem telemetria fica como esta.

Revision ID: 20260927_02
Revises: 20260927_01
Create Date: 2026-09-27
"""

from alembic import op

revision = "20260927_02"
down_revision = "20260927_01"
branch_labels = None
depends_on = None


SYNC_FUNCTION = """
CREATE OR REPLACE FUNCTION public.trailup_sync_tempo_da_telemetria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.conteudo_aluno ca
     SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
           ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL)
   WHERE (ca.aluno_id, ca.conteudo_id) IN (
           SELECT DISTINCT t.aluno_id, t.conteudo_id
             FROM afetadas t
            WHERE t.conteudo_id IS NOT NULL AND t.aluno_id IS NOT NULL);

  UPDATE public.atividade_aluno aa
     SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
           aa.aluno_id, 'activity', NULL, NULL, aa.atividade_id)
   WHERE (aa.aluno_id, aa.atividade_id) IN (
           SELECT DISTINCT t.aluno_id, t.atividade_id
             FROM afetadas t
            WHERE t.atividade_id IS NOT NULL AND t.aluno_id IS NOT NULL);

  UPDATE public.topico_aluno ta
     SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
           ta.aluno_id, 'topic', ta.topico_id, NULL, NULL)
   WHERE (ta.aluno_id, ta.topico_id) IN (
           SELECT DISTINCT t.aluno_id, t.topico_id
             FROM afetadas t
            WHERE t.topico_id IS NOT NULL AND t.aluno_id IS NOT NULL);

  RETURN NULL;
END;
$function$;
"""


def upgrade() -> None:
    op.execute(SYNC_FUNCTION)

    # Um trigger por operacao: INSERT/UPDATE leem NEW TABLE, DELETE le OLD
    # TABLE. Nao da para juntar tudo num so com transition table.
    op.execute(
        """
        CREATE TRIGGER trg_tme_sync_tempo_ins
          AFTER INSERT ON public.telemetria_time_metric_entries
          REFERENCING NEW TABLE AS afetadas
          FOR EACH STATEMENT EXECUTE FUNCTION public.trailup_sync_tempo_da_telemetria();
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_tme_sync_tempo_upd
          AFTER UPDATE ON public.telemetria_time_metric_entries
          REFERENCING NEW TABLE AS afetadas
          FOR EACH STATEMENT EXECUTE FUNCTION public.trailup_sync_tempo_da_telemetria();
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_tme_sync_tempo_del
          AFTER DELETE ON public.telemetria_time_metric_entries
          REFERENCING OLD TABLE AS afetadas
          FOR EACH STATEMENT EXECUTE FUNCTION public.trailup_sync_tempo_da_telemetria();
        """
    )

    # Realinhamento inicial. So entidade COM telemetria -- ver a guarda
    # explicada no docstring. Aqui o valor pode CAIR, e deve.
    op.execute(
        """
        UPDATE public.conteudo_aluno ca
           SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
                 ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL)
         WHERE EXISTS (SELECT 1 FROM public.telemetria_time_metric_entries e
                        WHERE e.aluno_id = ca.aluno_id
                          AND e.scope = 'content'
                          AND e.conteudo_id = ca.conteudo_id);
        """
    )
    op.execute(
        """
        UPDATE public.atividade_aluno aa
           SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
                 aa.aluno_id, 'activity', NULL, NULL, aa.atividade_id)
         WHERE EXISTS (SELECT 1 FROM public.telemetria_time_metric_entries e
                        WHERE e.aluno_id = aa.aluno_id
                          AND e.scope = 'activity'
                          AND e.atividade_id = aa.atividade_id);
        """
    )
    op.execute(
        """
        UPDATE public.topico_aluno ta
           SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
                 ta.aluno_id, 'topic', ta.topico_id, NULL, NULL)
         WHERE EXISTS (SELECT 1 FROM public.telemetria_time_metric_entries e
                        WHERE e.aluno_id = ta.aluno_id
                          AND e.scope = 'topic'
                          AND e.topico_id = ta.topico_id);
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_tme_sync_tempo_del ON public.telemetria_time_metric_entries;")
    op.execute("DROP TRIGGER IF EXISTS trg_tme_sync_tempo_upd ON public.telemetria_time_metric_entries;")
    op.execute("DROP TRIGGER IF EXISTS trg_tme_sync_tempo_ins ON public.telemetria_time_metric_entries;")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_sync_tempo_da_telemetria();")
    # Os valores realinhados NAO voltam: o anterior era o inflado, e nao ha
    # onde recupera-lo. Reverter o trigger devolve o comportamento antigo,
    # nao os numeros antigos.
