"""O XP de concluir conteúdo do professor sai do banco, não da API (#45)

## O que estava errado

Concluir um conteúdo paga `conteudo_concluido` (10 pontos, 2 moedas). Mas o evento só nascia da telemetria:
o app grava `conteudo_aluno` direto no Supabase e manda `content_complete` para a API, que insere em
`eventos_aluno`. Quando a API está fora do ar, ou o sinal chega sem o id, o aluno conclui o conteúdo e fica
sem o XP. Em produção, 13 de 17 eventos `conteudo_concluido` tinham a referência nula, e conclusão sem
referência vale 0 (`fn_evento_de_conclusao`, `20261021_06`). É encanamento, e a regra de fronteira do
repositório manda para o banco.

## O que muda

`trg_conteudo_aluno_xp`, AFTER INSERT OR UPDATE OF status em `conteudo_aluno`: quando a linha **vira**
concluída, grava `conteudo_concluido` com a referência `conteudo:<id>`. O valor continua sendo decidido pelo
banco (`trg_eventos_aluno_valor_*`), então nada muda em quanto vale.

- **Só na transição.** O app faz upsert com `status = concluido` a cada visita (`registrarVisita`); sem olhar o
  `OLD`, o aluno que concluiu antes desta migration receberia o XP na próxima abertura. INSERT já concluído
  ou UPDATE de outro estado para concluído paga; UPDATE de concluído para concluído, não.
- **Não paga duas vezes com a API.** A dedup de conclusão (`fn_evento_de_conclusao`) já olha
  `(aluno, tipo, referencia)`: o evento da API que chegar depois sai com valor 0. Para não deixar uma linha
  repetida, o gatilho nem insere se já existe uma.
- **Sem retroativo.** Quem concluiu antes continua como está; só a próxima conclusão paga.
- **Nunca derruba a gravação do progresso.** Falha vira `WARNING`, como os outros gatilhos desse molde.
- **Só conteúdo do professor** (`conteudo_aluno`). O conteúdo personalizado vive em
  `personalizacao_item_progresso`, com a referência por item, e continua saindo pela telemetria.

Nada aplicado em produção.
"""

from __future__ import annotations

from alembic import op

revision = "20261105_21"
down_revision = "20261105_20"
branch_labels = None
depends_on = None

FUNCAO = r"""
CREATE OR REPLACE FUNCTION public.trg_conteudo_aluno_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_ref text;
BEGIN
  IF NEW.aluno_id IS NULL OR NEW.conteudo_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- So' a transicao: o app regrava `concluido` a cada visita.
  IF TG_OP = 'UPDATE' AND position('concl' IN lower(COALESCE(OLD.status::text, ''))) > 0 THEN
    RETURN NEW;
  END IF;

  v_ref := 'conteudo:' || NEW.conteudo_id::text;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public.eventos_aluno e
       WHERE e.aluno_id = NEW.aluno_id AND e.tipo = 'conteudo_concluido' AND e.referencia = v_ref
    ) THEN
      INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia)
      VALUES (NEW.aluno_id, 'conteudo_concluido', v_ref);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- O XP nunca pode derrubar a gravacao do progresso.
    RAISE WARNING 'xp do conteudo % do aluno % falhou: %', NEW.conteudo_id, NEW.aluno_id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_conteudo_aluno_xp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_conteudo_aluno_xp ON public.conteudo_aluno;
CREATE TRIGGER trg_conteudo_aluno_xp
  AFTER INSERT OR UPDATE OF status ON public.conteudo_aluno
  FOR EACH ROW
  WHEN (NEW.status::text = 'concluido')
  EXECUTE FUNCTION public.trg_conteudo_aluno_xp();
"""

SEM_FUNCAO = """
DROP TRIGGER IF EXISTS trg_conteudo_aluno_xp ON public.conteudo_aluno;
DROP FUNCTION IF EXISTS public.trg_conteudo_aluno_xp();
"""


def upgrade() -> None:
    op.execute(FUNCAO)


def downgrade() -> None:
    op.execute(SEM_FUNCAO)
