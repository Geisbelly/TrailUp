"""Progresso inicial dos alunos ao criar conteúdo/atividade roda como dono (#414)

Os gatilhos `conteudos_after_insert` e `atividades_after_insert` gravam uma linha de
progresso ('não iniciado', 0%) para cada aluno matriculado na turma do tópico, em
`conteudo_aluno` e `atividade_aluno`. Eles estavam no schema NÃO versionado e as
funções rodavam com a permissão de quem disparou o INSERT — o professor, pelo console.

As policies de INSERT dessas tabelas (`conteudo_aluno_posse_ins`,
`atividade_aluno_posse_ins`) só aceitam `aluno_id = auth.uid()`. Então, em turma com
pelo menos um aluno, o INSERT do gatilho era recusado (42501, "new row violates
row-level security policy for table conteudo_aluno") e, por ser a mesma transação, o
conteúdo do professor também voltava atrás. Em turma sem aluno o SELECT não devolvia
linha e nada quebrava — por isso o defeito passou despercebido. Medido no catálogo em
2026-10-17: as duas funções com `prosecdef = false`, dono `postgres`.

Correção: as mesmas funções, agora `SECURITY DEFINER` com `search_path` fixo, e
versionadas aqui (junto com os gatilhos, recriados de forma idempotente). É seguro
rodar como dono porque o gatilho só dispara num INSERT em `conteudos`/`atividades`, que
a RLS já restringe ao professor da turma; e a função só escreve a linha inicial de quem
está matriculado nessa turma, nunca altera linha existente (`NOT EXISTS`).

Função de gatilho não precisa de EXECUTE para disparar: o privilégio é revogado dos
papéis de cliente para ela não aparecer na superfície REST (mesmo critério de #328).

Revision ID: 20261017_04
Revises: 20261017_03
Create Date: 2026-10-17
"""

from alembic import op

revision = "20261017_04"
down_revision = "20261017_03"
branch_labels = None
depends_on = None


def _funcao_conteudos(security_definer: bool) -> str:
    seguranca = "SECURITY DEFINER\n" if security_definer else ""
    return f"""
CREATE OR REPLACE FUNCTION public.trg_conteudos_after_insert()
RETURNS trigger
LANGUAGE plpgsql
{seguranca}SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_classe_id bigint;
BEGIN
  SELECT t.classe_id INTO v_classe_id FROM public.topicos t WHERE t.id = NEW.topico_id;

  IF v_classe_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.conteudo_aluno (
    aluno_id, conteudo_id, status, percentual_concluido, tempo_gasto_min, ultima_visualizacao, updated_at
  )
  SELECT ca.aluno_id, NEW.id, 'não iniciado'::status_atividade, 0, 0, now(), now()
  FROM public.classe_aluno ca
  WHERE ca.classe_id = v_classe_id
    AND NOT EXISTS (
      SELECT 1 FROM public.conteudo_aluno cola
      WHERE cola.aluno_id = ca.aluno_id AND cola.conteudo_id = NEW.id
    );

  RETURN NEW;
END;
$fn$;
"""


def _funcao_atividades(security_definer: bool) -> str:
    seguranca = "SECURITY DEFINER\n" if security_definer else ""
    return f"""
CREATE OR REPLACE FUNCTION public.trg_atividades_after_insert()
RETURNS trigger
LANGUAGE plpgsql
{seguranca}SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_classe_id bigint;
BEGIN
  SELECT t.classe_id INTO v_classe_id FROM public.topicos t WHERE t.id = NEW.topico_id;

  IF v_classe_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.atividade_aluno (
    aluno_id, atividade_id, status, percentual_concluido, acertos_percentual, tempo_gasto_min,
    ultima_visualizacao, updated_at
  )
  SELECT ca.aluno_id, NEW.id, 'não iniciado'::status_atividade, 0, 0, 0, now(), now()
  FROM public.classe_aluno ca
  WHERE ca.classe_id = v_classe_id
    AND NOT EXISTS (
      SELECT 1 FROM public.atividade_aluno aa
      WHERE aa.aluno_id = ca.aluno_id AND aa.atividade_id = NEW.id
    );

  RETURN NEW;
END;
$fn$;
"""


_GATILHOS = """
DROP TRIGGER IF EXISTS conteudos_after_insert ON public.conteudos;
CREATE TRIGGER conteudos_after_insert
  AFTER INSERT ON public.conteudos
  FOR EACH ROW EXECUTE FUNCTION public.trg_conteudos_after_insert();

DROP TRIGGER IF EXISTS atividades_after_insert ON public.atividades;
CREATE TRIGGER atividades_after_insert
  AFTER INSERT ON public.atividades
  FOR EACH ROW EXECUTE FUNCTION public.trg_atividades_after_insert();
"""

_REVOGA = """
REVOKE ALL ON FUNCTION public.trg_conteudos_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_atividades_after_insert() FROM PUBLIC, anon, authenticated;
"""


def upgrade() -> None:
    op.execute(_funcao_conteudos(security_definer=True))
    op.execute(_funcao_atividades(security_definer=True))
    op.execute(_GATILHOS)
    op.execute(_REVOGA)


def downgrade() -> None:
    # Volta ao comportamento anterior (sem SECURITY DEFINER), que é o que recusava o
    # INSERT do professor em turma com aluno. Os gatilhos continuam existindo.
    op.execute(_funcao_conteudos(security_definer=False))
    op.execute(_funcao_atividades(security_definer=False))
    op.execute(_GATILHOS)
