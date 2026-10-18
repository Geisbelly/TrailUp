"""eventos_classe: a entidade evento (por turma, com janela, peças, pontuação e recompensa)

Primeiro passo do banco da tela Eventos. Decisões da issue #152 que esta tabela aplica:
- **Evento é por classe**, com tópico opcional (`topico_id`). Autorização inteira por
  `app_classes_do_professor()` / `app_minhas_classes()`, como o resto do projeto.
- **Nome `eventos_classe`**, para não colidir com `eventos_aluno` (decisão de nomenclatura
  que a #141 deixou em aberto e a #152 mandou fechar). Arena, desafios e medalhas se
  penduram nela por `evento_id`.
- **Medalha é `conquista`** (escopo `evento`, issue #152): aqui só ficam as chaves que dizem
  se o evento concede medalha de participação e/ou de destaque — nenhuma tabela de medalha.

Estados `rascunho → aberto → encerrado`. A transição NÃO é escrita direta: o gatilho
`trg_eventos_classe_guarda` rejeita mudança de `status` fora das funções do banco
(`evento_classe_abrir` / `evento_classe_encerrar`, próxima migration), que ligam o sinal
`app.evento_transicao` na própria transação. Só o rascunho muda janela, peças e
modalidades; o evento aberto ainda aceita título e descrição.

Padrões PROVISÓRIOS (produto ainda não fechou; trocar aqui, sem refazer a tela):
`pecas` é uma lista de chaves entre missoes|metas|conquistas|desafios|arena, e pelo menos
uma é exigida ao abrir; `moedas` fica como número porque o modelo de crédito (#142) ainda
não existe — a tela já grava, o crédito não acontece.

RLS (a tabela nasce com `ensure_rls`, e sem policy seria invisível — criar a tabela e a policy
é o mesmo commit): professor lê e escreve o evento das turmas dele (exclui só rascunho);
aluno lê os eventos não-rascunho das turmas em que está matriculado.

Revision ID: 20261017_01
Revises: 20261016_05
Create Date: 2026-10-17
"""

from alembic import op

revision = "20261017_01"
down_revision = "20261016_05"
branch_labels = None
depends_on = None


SQL = r"""
CREATE TABLE IF NOT EXISTS public.eventos_classe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classe_id bigint NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  topico_id bigint REFERENCES public.topicos(id) ON DELETE SET NULL,
  titulo text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 3 AND 120),
  descricao text NOT NULL DEFAULT '' CHECK (char_length(descricao) <= 1000),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aberto', 'encerrado')),
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  modalidade_guilda boolean NOT NULL DEFAULT false,
  guilda_tamanho_max integer CHECK (guilda_tamanho_max IS NULL OR guilda_tamanho_max BETWEEN 2 AND 20),
  pecas jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pecas) = 'array'),
  pontos integer NOT NULL DEFAULT 0 CHECK (pontos >= 0),
  moedas integer NOT NULL DEFAULT 0 CHECK (moedas >= 0),
  medalha_participacao boolean NOT NULL DEFAULT true,
  medalha_destaque boolean NOT NULL DEFAULT false,
  recompensa text CHECK (recompensa IS NULL OR char_length(recompensa) <= 300),
  criado_por uuid DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  aberto_em timestamptz,
  encerrado_em timestamptz,
  CONSTRAINT eventos_classe_janela CHECK (fim > inicio),
  CONSTRAINT eventos_classe_destaque_com_participacao CHECK (NOT medalha_destaque OR medalha_participacao),
  CONSTRAINT eventos_classe_guilda_com_tamanho CHECK (modalidade_guilda OR guilda_tamanho_max IS NULL)
);

CREATE INDEX IF NOT EXISTS eventos_classe_classe_status_idx ON public.eventos_classe (classe_id, status, inicio DESC);

CREATE OR REPLACE FUNCTION public.fn_eventos_classe_guarda()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'rascunho';
    NEW.aberto_em := NULL;
    NEW.encerrado_em := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.aberto_em IS DISTINCT FROM OLD.aberto_em
     OR NEW.encerrado_em IS DISTINCT FROM OLD.encerrado_em THEN
    IF COALESCE(current_setting('app.evento_transicao', true), '') <> 'on' THEN
      RAISE EXCEPTION 'O estado do evento só muda ao abrir ou encerrar.' USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.status <> 'rascunho' AND (
    NEW.classe_id IS DISTINCT FROM OLD.classe_id OR NEW.topico_id IS DISTINCT FROM OLD.topico_id
    OR NEW.inicio IS DISTINCT FROM OLD.inicio OR NEW.fim IS DISTINCT FROM OLD.fim
    OR NEW.modalidade_guilda IS DISTINCT FROM OLD.modalidade_guilda
    OR NEW.guilda_tamanho_max IS DISTINCT FROM OLD.guilda_tamanho_max
    OR NEW.pecas IS DISTINCT FROM OLD.pecas OR NEW.pontos IS DISTINCT FROM OLD.pontos
    OR NEW.moedas IS DISTINCT FROM OLD.moedas
    OR NEW.medalha_participacao IS DISTINCT FROM OLD.medalha_participacao
    OR NEW.medalha_destaque IS DISTINCT FROM OLD.medalha_destaque
    OR NEW.recompensa IS DISTINCT FROM OLD.recompensa
  ) THEN
    RAISE EXCEPTION 'Depois de aberto, o evento só aceita título e descrição.' USING ERRCODE = '42501';
  END IF;

  NEW.atualizado_em := now();
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_eventos_classe_guarda ON public.eventos_classe;
CREATE TRIGGER trg_eventos_classe_guarda
  BEFORE INSERT OR UPDATE ON public.eventos_classe
  FOR EACH ROW EXECUTE FUNCTION public.fn_eventos_classe_guarda();

ALTER TABLE public.eventos_classe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eventos_classe_professor_sel ON public.eventos_classe;
CREATE POLICY eventos_classe_professor_sel ON public.eventos_classe FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = eventos_classe.classe_id));

DROP POLICY IF EXISTS eventos_classe_professor_ins ON public.eventos_classe;
CREATE POLICY eventos_classe_professor_ins ON public.eventos_classe FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = eventos_classe.classe_id));

DROP POLICY IF EXISTS eventos_classe_professor_upd ON public.eventos_classe;
CREATE POLICY eventos_classe_professor_upd ON public.eventos_classe FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = eventos_classe.classe_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = eventos_classe.classe_id));

DROP POLICY IF EXISTS eventos_classe_professor_del ON public.eventos_classe;
CREATE POLICY eventos_classe_professor_del ON public.eventos_classe FOR DELETE TO authenticated
  USING (
    status = 'rascunho'
    AND EXISTS (SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = eventos_classe.classe_id)
  );

DROP POLICY IF EXISTS eventos_classe_aluno_sel ON public.eventos_classe;
CREATE POLICY eventos_classe_aluno_sel ON public.eventos_classe FOR SELECT TO authenticated
  USING (
    status <> 'rascunho'
    AND EXISTS (SELECT 1 FROM public.app_minhas_classes() AS minha(id) WHERE minha.id = eventos_classe.classe_id)
  );

REVOKE ALL ON public.eventos_classe FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eventos_classe TO authenticated;
"""

DOWNGRADE_SQL = r"""
DROP TABLE IF EXISTS public.eventos_classe;
DROP FUNCTION IF EXISTS public.fn_eventos_classe_guarda();
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
