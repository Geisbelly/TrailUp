"""eventos_classe_missoes + evento_classe_definir_missoes(): as missões que fazem parte de um evento

Primeira "peça" do evento com conteúdo de verdade (o protótipo V9: "O que este evento inclui").
Uma missão é uma `atividade` de `tipo = 'missao'` (issue #150); o evento a liga por
`eventos_classe_missoes (evento_id, atividade_id)`.

A escrita passa só por `evento_classe_definir_missoes(evento, lista)`: troca a lista inteira numa
transação, e a tabela não tem policy de escrita para o cliente. A função confere a **posse da
turma antes de ler**, exige o evento em **rascunho** (depois de aberto as regras travam, como em
`fn_eventos_classe_guarda`), aceita no máximo 20 missões e recusa qualquer id que não seja uma
missão **da mesma turma** do evento.

RLS (a tabela nasce com `ensure_rls`; criar a tabela e a policy é o mesmo commit): professor lê as
ligações do evento das turmas dele; aluno lê as de evento NÃO-rascunho das turmas em que está
matriculado.

Padrão PROVISÓRIO: ligar a missão não muda a apuração — o resultado continua somando tudo o que o
aluno fez na janela do evento (`fn_evento_classe_apurar`). A ligação diz ao aluno e ao professor
quais missões o evento destaca.

Revision ID: 20261017_10
Revises: 20261017_09
Create Date: 2026-10-17
"""

from alembic import op

revision = "20261017_10"
down_revision = "20261017_09"
branch_labels = None
depends_on = None


SQL = r"""
CREATE TABLE IF NOT EXISTS public.eventos_classe_missoes (
  evento_id uuid NOT NULL REFERENCES public.eventos_classe(id) ON DELETE CASCADE,
  atividade_id bigint NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, atividade_id)
);

CREATE INDEX IF NOT EXISTS eventos_classe_missoes_atividade_idx ON public.eventos_classe_missoes (atividade_id);

ALTER TABLE public.eventos_classe_missoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eventos_classe_missoes_professor_sel ON public.eventos_classe_missoes;
CREATE POLICY eventos_classe_missoes_professor_sel ON public.eventos_classe_missoes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.eventos_classe e
    JOIN public.app_classes_do_professor() AS minha(id) ON minha.id = e.classe_id
    WHERE e.id = eventos_classe_missoes.evento_id
  ));

DROP POLICY IF EXISTS eventos_classe_missoes_aluno_sel ON public.eventos_classe_missoes;
CREATE POLICY eventos_classe_missoes_aluno_sel ON public.eventos_classe_missoes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.eventos_classe e
    JOIN public.app_minhas_classes() AS minha(id) ON minha.id = e.classe_id
    WHERE e.id = eventos_classe_missoes.evento_id AND e.status <> 'rascunho'
  ));

REVOKE ALL ON public.eventos_classe_missoes FROM anon, authenticated;
GRANT SELECT ON public.eventos_classe_missoes TO authenticated;

CREATE OR REPLACE FUNCTION public.evento_classe_definir_missoes(p_evento_id uuid, p_atividades bigint[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_evento public.eventos_classe%ROWTYPE;
  v_ids bigint[];
  v_validas integer;
BEGIN
  SELECT * INTO v_evento FROM public.eventos_classe WHERE id = p_evento_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_evento.classe_id
  ) THEN
    RAISE EXCEPTION 'Evento não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF v_evento.status <> 'rascunho' THEN
    RAISE EXCEPTION 'Depois de aberto, as missões do evento não mudam.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), '{}'::bigint[]) INTO v_ids
  FROM unnest(COALESCE(p_atividades, '{}'::bigint[])) AS x
  WHERE x IS NOT NULL;

  IF cardinality(v_ids) > 20 THEN
    RAISE EXCEPTION 'Um evento aceita no máximo 20 missões.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_validas
  FROM public.atividades a
  JOIN public.topicos t ON t.id = a.topico_id
  WHERE a.id = ANY (v_ids) AND a.tipo = 'missao' AND t.classe_id = v_evento.classe_id;
  IF v_validas <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Só missões desta turma podem entrar no evento.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.eventos_classe_missoes WHERE evento_id = p_evento_id;
  INSERT INTO public.eventos_classe_missoes (evento_id, atividade_id)
  SELECT p_evento_id, x FROM unnest(v_ids) AS x;

  RETURN cardinality(v_ids);
END
$function$;

REVOKE ALL ON FUNCTION public.evento_classe_definir_missoes(uuid, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evento_classe_definir_missoes(uuid, bigint[]) TO authenticated;
"""

DOWNGRADE_SQL = r"""
DROP FUNCTION IF EXISTS public.evento_classe_definir_missoes(uuid, bigint[]);
DROP TABLE IF EXISTS public.eventos_classe_missoes;
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
