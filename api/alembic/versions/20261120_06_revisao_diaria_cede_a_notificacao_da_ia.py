"""A revisão diária não sai no dia em que a IA já escreveu a notificação diária do aluno

A API passou a pedir à IA uma notificação por aluno a cada 20 horas, com o tópico em andamento
(`agente_notificacao`, motivo `engajamento`, `contexto.diaria = true`). A sugestão vira pendente própria
em `notificacoes_ia_promover`, com status `promovida`. A revisão diária só aproveita sugestão em status
`sugerida` (`notificacoes_processar_rotinas`, 20260826_14), então as duas sairiam no mesmo dia: a da
IA no horário do hábito do aluno e a da rotina no horário dela.

Agora, quando a pendente da `revisao_diaria` entra na fila e o aluno já tem, para o mesmo dia local,
uma notificação diária da IA pendente ou entregue, a revisão entra como `suprimida`, com
`contexto.suprimida_por = 'notificacao_diaria_da_ia'`. A chave de dedupe do dia fica ocupada, então a
rotina não tenta de novo naquele dia, e o horário da rotina avança como sempre.

Só a revisão diária cede. Retomada no login e pausa saudável são de outro momento e continuam saindo.
Se a notificação da IA for suprimida depois (teto, silêncio, expiração), a revisão daquele dia já foi:
o aluno fica com uma notificação a menos naquele dia, nunca com duas.

**Por que um gatilho, e não mexer em `notificacoes_processar_rotinas`:** a função tem 5,7 mil
caracteres e foi redefinida por várias migrações; copiá-la para acrescentar três linhas seria colar cópia
velha por cima de quem a mexeu depois. O gatilho age só na inserção da pendente da rotina.

Ordem dos gatilhos BEFORE INSERT da fila: o Postgres os roda em ordem alfabética.
`trg_notificacoes_pendentes_revisao_cede` roda antes de `trg_notificacoes_pendentes_texto`, que
continua escrevendo o texto (a linha suprimida fica com o texto que teria saído, para a análise).

Nunca derruba quem escreve: falha vira `WARNING` e a revisão segue como antes.

Revision ID: 20261120_06
Revises: 20261120_03
Create Date: 2026-11-20
"""

from alembic import op

revision = "20261120_06"
down_revision = "20261120_03"
branch_labels = None
depends_on = None

FUNCAO = """
CREATE OR REPLACE FUNCTION public.notificacoes_revisao_cede_a_ia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF NEW.aluno_id IS NULL OR NEW.tipo <> 'revisao_diaria' OR NEW.sugestao_id IS NOT NULL
     OR NEW.status <> 'pendente' OR NEW.contexto->>'dia' IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    IF EXISTS (
      SELECT 1
        FROM notificacoes_pendentes p
       WHERE p.aluno_id = NEW.aluno_id
         AND p.sugestao_id IS NOT NULL
         AND p.contexto->>'diaria' = 'true'
         AND p.contexto->>'dia' = NEW.contexto->>'dia'
         AND p.status IN ('pendente', 'entregue')
    ) THEN
      NEW.status := 'suprimida';
      NEW.contexto := NEW.contexto || jsonb_build_object('suprimida_por', 'notificacao_diaria_da_ia');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING USING MESSAGE = 'notificacoes_revisao_cede_a_ia: revisao mantida: ' || SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notificacoes_revisao_cede_a_ia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notificacoes_pendentes_revisao_cede ON public.notificacoes_pendentes;
CREATE TRIGGER trg_notificacoes_pendentes_revisao_cede
  BEFORE INSERT ON public.notificacoes_pendentes
  FOR EACH ROW EXECUTE FUNCTION public.notificacoes_revisao_cede_a_ia();
"""


def upgrade() -> None:
    op.execute(FUNCAO)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_notificacoes_pendentes_revisao_cede ON public.notificacoes_pendentes")
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_revisao_cede_a_ia()")
