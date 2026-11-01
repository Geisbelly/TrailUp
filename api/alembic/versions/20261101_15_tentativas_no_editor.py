"""Tentativas no editor de atividade e a regra do cronômetro visível ao professor (#136, fase 3)

## Por quê

A fase 1 criou `atividades.tentativas_max` e o cronômetro, e a fase 2 pôs os dois no app. Falta o
professor: configurar o limite de tentativas no editor e ver, por aluno, o que aconteceu. Duas coisas
no banco impedem isso.

**1. A regra do cronômetro é privada.** `cronometro_atividade_padrao_seg` e
`cronometro_tolerancia_seg` nasceram `publico = false`, e `app_config_sel` é `USING (publico)`: o
console não consegue mostrar a regra. Elas não são teto anti-abuso como `credito_extra_maximo`: o app
já mostra a duração na tela da atividade, e o limite que vale é o que a RPC grava em cada tentativa.
Marcá-las públicas abre a leitura também para `anon`, que é como `app_config_sel` funciona.

**2. Salvar só o limite regeraria a personalização.** `trg_atividades_class_delta_job` é
`UPDATE OF titulo, descricao, tipo, ...`, e `UPDATE OF` dispara quando a coluna está no `SET`, não
quando o valor muda. O editor manda título, descrição, tipo e prazo em todo salvamento, então mudar
só `tentativas_max` enfileirava um `class_delta`. O gatilho de UPDATE passa a ter um `WHEN` que compara
os valores dessas colunas. INSERT e DELETE não têm `OLD` e `NEW` ao mesmo tempo, então vão para um
gatilho próprio, com a mesma função.

O de UPDATE mantém o nome, porque `trailup_gatilhos_de_regeracao` (`20261024_11`) liga e desliga os
gatilhos de regeração pelo nome, e a reescrita de URLs que ela protege só faz UPDATE.

Efeito colateral: salvar uma atividade sem mudar nada também deixa de enfileirar. Não havia o que
regenerar.

A "alteração do professor" (`20261101_12`) já compara antes e depois só nos campos dela, e
`tentativas_max` não está entre eles: mudar o limite não marca a atividade para os alunos.

Revision ID: 20261101_15
Revises: 20261101_14
Create Date: 2026-11-01
"""

from alembic import op

revision = "20261101_15"
down_revision = "20261101_14"
branch_labels = None
depends_on = None

CHAVES_PUBLICAS = ("cronometro_atividade_padrao_seg", "cronometro_tolerancia_seg")

# As colunas de `UPDATE OF` do gatilho de 20260827_03, na mesma ordem.
COLUNAS_DA_REGERACAO = ("titulo", "descricao", "tipo", "pontuacao_maxima", "data_entrega", "metadata", "topico_id")

_COLUNAS = ", ".join(COLUNAS_DA_REGERACAO)
_ANTES = ", ".join(f"OLD.{c}" for c in COLUNAS_DA_REGERACAO)
_DEPOIS = ", ".join(f"NEW.{c}" for c in COLUNAS_DA_REGERACAO)
_CHAVES = ", ".join(f"'{c}'" for c in CHAVES_PUBLICAS)

GATILHOS = f"""
DROP TRIGGER IF EXISTS trg_atividades_class_delta_job ON public.atividades;
DROP TRIGGER IF EXISTS trg_atividades_class_delta_job_ins_del ON public.atividades;

CREATE TRIGGER trg_atividades_class_delta_job
  AFTER UPDATE OF {_COLUNAS}
  ON public.atividades
  FOR EACH ROW
  WHEN (({_ANTES}) IS DISTINCT FROM ({_DEPOIS}))
  EXECUTE FUNCTION public.fn_enqueue_class_delta_job();

CREATE TRIGGER trg_atividades_class_delta_job_ins_del
  AFTER INSERT OR DELETE
  ON public.atividades
  FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_class_delta_job();
"""

GATILHO_ANTERIOR = f"""
DROP TRIGGER IF EXISTS trg_atividades_class_delta_job_ins_del ON public.atividades;
DROP TRIGGER IF EXISTS trg_atividades_class_delta_job ON public.atividades;

CREATE TRIGGER trg_atividades_class_delta_job
  AFTER INSERT OR DELETE OR UPDATE OF {_COLUNAS}
  ON public.atividades
  FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_class_delta_job();
"""


def upgrade() -> None:
    op.execute(f"UPDATE public.app_config SET publico = true WHERE chave IN ({_CHAVES})")
    op.execute(GATILHOS)


def downgrade() -> None:
    op.execute(GATILHO_ANTERIOR)
    op.execute(f"UPDATE public.app_config SET publico = false WHERE chave IN ({_CHAVES})")
