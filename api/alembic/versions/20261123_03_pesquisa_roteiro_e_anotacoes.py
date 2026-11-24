"""Roteiro marcado e anotações do avaliador da pesquisa com professores

O avaliador usa duas contas (a de professor, no console, e a do aluno de teste, no app) e segue o
roteiro do vídeo "Passo a passo da pesquisa". Este arquivo guarda o que ele marcou como feito e as
anotações que ele escreve enquanto usa o sistema, para ler de novo na hora de responder à avaliação.
As duas contas enxergam o mesmo roteiro e as mesmas anotações: o que se anota no app aparece no
console, e vice-versa.

**Quem marca é o avaliador.** Nada aqui detecta sozinho que a tarefa foi feita: a cartilha promete
que a pesquisa só confere, na turma de demonstração, se o que a tarefa pedia ficou registrado. Seguir
o uso para marcar a etapa seria coletar mais do que o termo descreve.

**Anotação é do avaliador, não é dado da pesquisa.** Ninguém além das duas contas dele lê, nem o
dono: não há policy para `app_e_dono()`. O que importar para a pesquisa, ele passa para o formulário.
A interface diz isso.

**`pesquisa_meu_avaliador_id()`** devolve o avaliador da conta logada, seja ela a de professor ou a
do aluno de teste. É `SECURITY DEFINER` porque o aluno de teste não lê `pesquisa_avaliador` (a policy
de lá só deixa o professor e o dono), e é o DEFAULT de `avaliador_id`: o cliente nunca escolhe a
linha de quem grava.

**`pesquisa_meu_roteiro()`** é o que o app e o console chamam para saber se mostram o painel: NULL
para quem não é avaliador (a tela fica como sempre foi), e, para o avaliador, o papel da conta
(`professor` ou `aluno`), a turma e as etapas marcadas.

**Retenção.** As duas tabelas saem com a linha do avaliador (`avaliador_id` ON DELETE CASCADE), que
sai com a conta de professor. Ao fim da pesquisa, os acessos são apagados (cartilha).

**RLS.** As tabelas nascem com RLS e policy no mesmo commit. A escrita do cliente é limitada por
coluna: em `pesquisa_anotacao` só `etapa`, `plataforma` e `texto` entram no INSERT, e só `etapa` e
`texto` mudam no UPDATE; `avaliador_id`, `autor_id` e as datas são do banco.

Revision ID: 20261123_03
Revises: 20261123_02
Create Date: 2026-11-23
"""

from alembic import op

revision = "20261123_03"
down_revision = "20261123_02"
branch_labels = None
depends_on = None


SQL = r"""
CREATE OR REPLACE FUNCTION public.pesquisa_meu_avaliador_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
  SELECT pa.id
    FROM public.pesquisa_avaliador pa
   WHERE auth.uid() IS NOT NULL
     AND (pa.professor_id = auth.uid() OR pa.aluno_teste_id = auth.uid())
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.pesquisa_meu_avaliador_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pesquisa_meu_avaliador_id() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.pesquisa_roteiro_marca (
  avaliador_id bigint NOT NULL DEFAULT public.pesquisa_meu_avaliador_id()
    REFERENCES public.pesquisa_avaliador(id) ON DELETE CASCADE,
  etapa text NOT NULL,
  autor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  feita_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (avaliador_id, etapa),
  CONSTRAINT pesquisa_roteiro_marca_etapa_check CHECK (etapa ~ '^[a-z0-9-]{1,40}$')
);

CREATE TABLE IF NOT EXISTS public.pesquisa_anotacao (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  avaliador_id bigint NOT NULL DEFAULT public.pesquisa_meu_avaliador_id()
    REFERENCES public.pesquisa_avaliador(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plataforma text NOT NULL,
  etapa text,
  texto text NOT NULL,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pesquisa_anotacao_plataforma_check CHECK (plataforma IN ('console', 'app')),
  CONSTRAINT pesquisa_anotacao_etapa_check CHECK (etapa IS NULL OR etapa ~ '^[a-z0-9-]{1,40}$'),
  CONSTRAINT pesquisa_anotacao_texto_check CHECK (char_length(btrim(texto)) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS pesquisa_anotacao_avaliador_idx
  ON public.pesquisa_anotacao (avaliador_id, criada_em DESC);

COMMENT ON TABLE public.pesquisa_roteiro_marca IS
  'Etapas do roteiro da pesquisa com professores que o próprio avaliador marcou como feitas. '
  'Lida e escrita só pelas duas contas dele (professor e aluno de teste).';
COMMENT ON TABLE public.pesquisa_anotacao IS
  'Anotações do avaliador da pesquisa com professores, para reler ao responder. Não é dado da '
  'pesquisa: só as duas contas dele leem, nem o dono.';

-- Prazo de guarda (LGPD, #195): saem com a linha do avaliador (ON DELETE CASCADE), que sai com a
-- conta de professor. Ao fim da pesquisa, os acessos são apagados (cartilha).
INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo)
VALUES ('pesquisa_roteiro_marca', 'vida_da_conta', 'autor_id', 'vida_da_conta',
        'etapas marcadas pelo avaliador da pesquisa; saem com o avaliador, apagado ao fim da pesquisa'),
       ('pesquisa_anotacao', 'vida_da_conta', 'autor_id', 'vida_da_conta',
        'anotações do avaliador da pesquisa; saem com o avaliador, apagado ao fim da pesquisa')
ON CONFLICT (tabela, acao) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_pesquisa_anotacao_atualizada()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $function$
BEGIN
  NEW.atualizada_em := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pesquisa_anotacao_atualizada ON public.pesquisa_anotacao;
CREATE TRIGGER trg_pesquisa_anotacao_atualizada
  BEFORE UPDATE ON public.pesquisa_anotacao
  FOR EACH ROW EXECUTE FUNCTION public.fn_pesquisa_anotacao_atualizada();

ALTER TABLE public.pesquisa_roteiro_marca ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pesquisa_roteiro_marca FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.pesquisa_roteiro_marca TO authenticated;
GRANT INSERT (etapa) ON public.pesquisa_roteiro_marca TO authenticated;
GRANT ALL ON public.pesquisa_roteiro_marca TO service_role;

DROP POLICY IF EXISTS pesquisa_roteiro_marca_sel ON public.pesquisa_roteiro_marca;
CREATE POLICY pesquisa_roteiro_marca_sel ON public.pesquisa_roteiro_marca
  FOR SELECT TO authenticated
  USING (avaliador_id = public.pesquisa_meu_avaliador_id());

DROP POLICY IF EXISTS pesquisa_roteiro_marca_ins ON public.pesquisa_roteiro_marca;
CREATE POLICY pesquisa_roteiro_marca_ins ON public.pesquisa_roteiro_marca
  FOR INSERT TO authenticated
  WITH CHECK (avaliador_id = public.pesquisa_meu_avaliador_id() AND autor_id = auth.uid());

DROP POLICY IF EXISTS pesquisa_roteiro_marca_del ON public.pesquisa_roteiro_marca;
CREATE POLICY pesquisa_roteiro_marca_del ON public.pesquisa_roteiro_marca
  FOR DELETE TO authenticated
  USING (avaliador_id = public.pesquisa_meu_avaliador_id());

ALTER TABLE public.pesquisa_anotacao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pesquisa_anotacao FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.pesquisa_anotacao TO authenticated;
GRANT INSERT (etapa, plataforma, texto) ON public.pesquisa_anotacao TO authenticated;
GRANT UPDATE (etapa, texto) ON public.pesquisa_anotacao TO authenticated;
GRANT ALL ON public.pesquisa_anotacao TO service_role;

DROP POLICY IF EXISTS pesquisa_anotacao_sel ON public.pesquisa_anotacao;
CREATE POLICY pesquisa_anotacao_sel ON public.pesquisa_anotacao
  FOR SELECT TO authenticated
  USING (avaliador_id = public.pesquisa_meu_avaliador_id());

DROP POLICY IF EXISTS pesquisa_anotacao_ins ON public.pesquisa_anotacao;
CREATE POLICY pesquisa_anotacao_ins ON public.pesquisa_anotacao
  FOR INSERT TO authenticated
  WITH CHECK (avaliador_id = public.pesquisa_meu_avaliador_id() AND autor_id = auth.uid());

DROP POLICY IF EXISTS pesquisa_anotacao_upd ON public.pesquisa_anotacao;
CREATE POLICY pesquisa_anotacao_upd ON public.pesquisa_anotacao
  FOR UPDATE TO authenticated
  USING (avaliador_id = public.pesquisa_meu_avaliador_id())
  WITH CHECK (avaliador_id = public.pesquisa_meu_avaliador_id());

DROP POLICY IF EXISTS pesquisa_anotacao_del ON public.pesquisa_anotacao;
CREATE POLICY pesquisa_anotacao_del ON public.pesquisa_anotacao
  FOR DELETE TO authenticated
  USING (avaliador_id = public.pesquisa_meu_avaliador_id());

-- O painel do roteiro no console e no app. NULL para quem não é avaliador: a tela fica como era.
CREATE OR REPLACE FUNCTION public.pesquisa_meu_roteiro()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
  SELECT jsonb_build_object(
    'papel', CASE WHEN pa.professor_id = auth.uid() THEN 'professor' ELSE 'aluno' END,
    'classe_id', pa.classe_id,
    'marcas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('etapa', m.etapa, 'feita_em', m.feita_em) ORDER BY m.feita_em)
        FROM public.pesquisa_roteiro_marca m
       WHERE m.avaliador_id = pa.id
    ), '[]'::jsonb)
  )
  FROM public.pesquisa_avaliador pa
  WHERE auth.uid() IS NOT NULL
    AND (pa.professor_id = auth.uid() OR pa.aluno_teste_id = auth.uid())
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.pesquisa_meu_roteiro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pesquisa_meu_roteiro() TO authenticated;
"""


DOWNGRADE_SQL = r"""
DROP FUNCTION IF EXISTS public.pesquisa_meu_roteiro();
DROP TABLE IF EXISTS public.pesquisa_anotacao;
DROP TABLE IF EXISTS public.pesquisa_roteiro_marca;
DROP FUNCTION IF EXISTS public.fn_pesquisa_anotacao_atualizada();
DROP FUNCTION IF EXISTS public.pesquisa_meu_avaliador_id();
DELETE FROM public.retencao_politica WHERE tabela IN ('pesquisa_roteiro_marca', 'pesquisa_anotacao');
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
