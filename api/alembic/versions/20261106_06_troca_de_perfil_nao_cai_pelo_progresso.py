"""Trocar de perfil não falha por causa do recálculo de progresso.

## O defeito

O aluno troca o perfil BrainHex no app (`UPDATE alunos SET perfil_ativo`) e recebe "Não foi
possível trocar o perfil". Três gatilhos rodam nesse UPDATE (lido em produção em 2026-11-06):

| Gatilho | Protegido? |
| --- | --- |
| `trg_alunos_missao_diaria_perfil` | sim: `EXCEPTION WHEN OTHERS` → `WARNING` |
| `trg_alunos_notificacoes_rotinas` | sim: `EXCEPTION WHEN OTHERS` → `WARNING` |
| `trg_alunos_progresso_perfil` (`trailup_progresso_after_perfil`, `20260920_08`) | **não** |

O terceiro recalcula, dentro da mesma transação do UPDATE, TODOS os tópicos e TODAS as matrículas
do aluno. Qualquer erro em `trailup_recalcular_topico_aluno` ou `trailup_recalcular_classe_aluno`
(função regravada várias vezes, inclusive por SQL manual em `docs/mobile/sql`) desfaz a troca.

**Não medido:** qual erro exato o aluno recebeu. A leitura do log de produção não foi feita nesta
correção. Se a causa for o `statement_timeout` de 8 s do papel `authenticated` (laço longo), a
proteção abaixo não basta: `query_canceled` não é capturado por `WHEN OTHERS`, e o certo seria tirar
o recálculo da transação. Ao reabrir o defeito, confira o código do erro (`57014` = timeout).

## O que muda

Cada recálculo roda no próprio bloco `BEGIN … EXCEPTION WHEN OTHERS`, com `WARNING` (mesmo padrão
dos outros dois gatilhos). Um tópico que falha não leva os outros nem a troca de perfil junto; o
progresso dele fica como estava até o próximo evento que o recalcula (conteúdo, atividade ou item
personalizado — os gatilhos de `topico_aluno` continuam os mesmos).
"""

from alembic import op

revision = "20261106_06"
down_revision = "20261106_05"
branch_labels = None
depends_on = None


FUNCAO = """
CREATE OR REPLACE FUNCTION public.trailup_progresso_after_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE r record;
BEGIN
  FOR r IN SELECT t.id FROM public.topicos t JOIN public.classe_aluno ca
    ON ca.classe_id = t.classe_id WHERE ca.aluno_id = NEW.id
  LOOP
    BEGIN
      PERFORM public.trailup_recalcular_topico_aluno(NEW.id, r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'progresso do topico % do aluno % na troca de perfil falhou: %', r.id, NEW.id, SQLERRM;
    END;
  END LOOP;
  FOR r IN SELECT classe_id FROM public.classe_aluno WHERE aluno_id = NEW.id LOOP
    BEGIN
      PERFORM public.trailup_recalcular_classe_aluno(NEW.id, r.classe_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'progresso da turma % do aluno % na troca de perfil falhou: %', r.classe_id, NEW.id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END;
$fn$;
"""


def upgrade() -> None:
    op.execute(FUNCAO)


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: voltar a falha do recálculo a desfazer a troca de perfil não é desejado")
