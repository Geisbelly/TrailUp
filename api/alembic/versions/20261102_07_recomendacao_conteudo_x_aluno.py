"""Recomendação de material: o que o conteúdo pede, leitura pelo app e revisão marcada pelo banco

Três coisas que o motor de sugestão (`sugestao_material.py`) precisava e não tinha. Medido em
produção em 01/11: 1 sugestão desde 25/08, 0 revisões no log.

## 1. `conteudo_demanda_formato`: o formato que cada conteúdo pede

Uma linha por conteúdo, com o nível (`essencial`, `ajuda`, `indiferente`) de cada dimensão
(`visual`, `escrito`, `sonoro`, `pratica`). Quem grava é o worker da fila
(`app/services/demanda_formato.py`). Ele usa o modelo uma vez por tópico, e a regra fixa quando
o modelo não responde, marcada em `origem`. `origem = 'professor'` fica reservada a uma decisão
manual futura: o worker nunca a sobrescreve.

Sem coluna de pessoa, então não entra em `retencao_politica`. Sai pela FK com o conteúdo, o
tópico ou a turma.

RLS: só SELECT, para o professor dono (`app_classes_do_professor()`). O aluno não lê esta
tabela: o que chega a ele é a ordem da sugestão. Nenhuma policy de escrita.

## 2. O aluno lê a própria sugestão direto do Supabase

As duas tabelas de sugestão estavam com RLS ligada e NENHUMA policy: só `service_role` lia, e o
app dependia da API para saber a ordem. Com a API fora do ar, ele caía na ordem canônica.
Agora:

- o aluno lê `personalizacao_sugestao` onde `aluno_id = auth.uid()`;
- o professor dono lê a sugestão e o log da turma (`app_classes_do_professor()`);
- a trava do estudo (`estudo_trava_sel`, a mesma da `20261102_05`) também vale aqui. A ordem
  sugerida é decisão da IA para o aluno, e a turma retida não a vê;
- ninguém escreve pelo cliente.

## 3. A revisão é marcada pelo banco

A revisão só rodava no ciclo da telemetria, e só se o lote trouxesse material do mesmo tópico.
Atividade concluída não revisava nada, e a regra de dificuldade (DAT-21) nunca disparou. Agora
dois gatilhos marcam `revisao_pendente` e `revisao_motivo`, e a API revisa a sugestão marcada na
próxima leitura ou no próximo ciclo:

- `atividade_aluno` concluída, ou com o acerto alterado, marca a sugestão do aluno naquele
  tópico (`atividade_concluida`);
- análise nova ou alterada em `conteudo_demanda_formato` marca as sugestões do tópico
  (`demanda_do_conteudo`).

Decidir a ordem continua na API (é decisão adaptativa); o banco só registra que há o que decidir.
Os dois gatilhos são `SECURITY DEFINER`, porque quem dispara é o aluno e ele não escreve em
`personalizacao_sugestao`. Também nunca derrubam a escrita que os disparou: falha vira WARNING.
O de `atividade_aluno` não escreve em `atividade_aluno`.

Revision ID: 20261102_07
Revises: 20261102_06
Create Date: 2026-11-02
"""

from alembic import op

revision = "20261102_07"
down_revision = "20261102_06"
branch_labels = None
depends_on = None

POLICY_DEMANDA = "conteudo_demanda_formato_professor_sel"
POLICY_SUGESTAO_ALUNO = "personalizacao_sugestao_aluno_sel"
POLICY_SUGESTAO_PROFESSOR = "personalizacao_sugestao_professor_sel"
POLICY_LOG_PROFESSOR = "personalizacao_sugestao_log_professor_sel"
POLICY_TRAVA = "estudo_trava_sel"

MOTIVOS_REVISAO = ("atividade_concluida", "demanda_do_conteudo")

TABELA = r"""
CREATE TABLE IF NOT EXISTS public.conteudo_demanda_formato (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  classe_id    bigint      NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  topico_id    bigint      NOT NULL REFERENCES public.topicos(id) ON DELETE CASCADE,
  conteudo_id  bigint      NOT NULL UNIQUE REFERENCES public.conteudos(id) ON DELETE CASCADE,
  demanda      jsonb       NOT NULL CHECK (jsonb_typeof(demanda) = 'object'),
  origem       text        NOT NULL CHECK (origem IN ('modelo', 'heuristica', 'professor')),
  source_hash  text        NOT NULL,
  versao       text        NOT NULL,
  gerado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conteudo_demanda_formato_topico_idx
  ON public.conteudo_demanda_formato (topico_id);

ALTER TABLE public.conteudo_demanda_formato ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conteudo_demanda_formato FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.conteudo_demanda_formato FROM authenticated;
GRANT SELECT ON public.conteudo_demanda_formato TO authenticated;
"""

COLUNAS = r"""
ALTER TABLE public.personalizacao_sugestao
  ADD COLUMN IF NOT EXISTS revisao_pendente    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revisao_motivo      text        NULL,
  ADD COLUMN IF NOT EXISTS revisao_pendente_em timestamptz NULL;

ALTER TABLE public.personalizacao_sugestao
  DROP CONSTRAINT IF EXISTS personalizacao_sugestao_revisao_motivo_check;
ALTER TABLE public.personalizacao_sugestao
  ADD CONSTRAINT personalizacao_sugestao_revisao_motivo_check
  CHECK (revisao_motivo IS NULL OR revisao_motivo IN ('atividade_concluida', 'demanda_do_conteudo'));

CREATE INDEX IF NOT EXISTS personalizacao_sugestao_pendente_idx
  ON public.personalizacao_sugestao (aluno_id, topico_id)
  WHERE revisao_pendente;
"""

RLS = rf"""
DROP POLICY IF EXISTS {POLICY_DEMANDA} ON public.conteudo_demanda_formato;
CREATE POLICY {POLICY_DEMANDA} ON public.conteudo_demanda_formato
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()));

-- Produção já tem RLS ligada nas duas (event trigger `ensure_rls`); explícito aqui para não
-- depender de schema não versionado.
ALTER TABLE public.personalizacao_sugestao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalizacao_sugestao_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.personalizacao_sugestao FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.personalizacao_sugestao FROM authenticated;
GRANT SELECT ON public.personalizacao_sugestao TO authenticated;

DROP POLICY IF EXISTS {POLICY_SUGESTAO_ALUNO} ON public.personalizacao_sugestao;
CREATE POLICY {POLICY_SUGESTAO_ALUNO} ON public.personalizacao_sugestao
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid());

DROP POLICY IF EXISTS {POLICY_SUGESTAO_PROFESSOR} ON public.personalizacao_sugestao;
CREATE POLICY {POLICY_SUGESTAO_PROFESSOR} ON public.personalizacao_sugestao
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()));

-- A mesma trava da 20261102_05, com o mesmo nome: a ordem sugerida é decisão da IA para o aluno.
DROP POLICY IF EXISTS {POLICY_TRAVA} ON public.personalizacao_sugestao;
CREATE POLICY {POLICY_TRAVA} ON public.personalizacao_sugestao
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    classe_id IS NULL
    OR classe_id IN (SELECT public.app_classes_do_professor())
    OR NOT (classe_id IN (SELECT public.app_classes_retidas_do_aluno()))
  );
COMMENT ON POLICY {POLICY_TRAVA} ON public.personalizacao_sugestao IS
  'Trava do estudo (#13, 20261102_05/07): aluno de turma com personalizacao retida nao le. Restritiva: so estreita as outras.';

-- O log é do professor e da métrica de efetividade; o aluno não precisa dele.
REVOKE ALL ON public.personalizacao_sugestao_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.personalizacao_sugestao_log FROM authenticated;
GRANT SELECT ON public.personalizacao_sugestao_log TO authenticated;

DROP POLICY IF EXISTS {POLICY_LOG_PROFESSOR} ON public.personalizacao_sugestao_log;
CREATE POLICY {POLICY_LOG_PROFESSOR} ON public.personalizacao_sugestao_log
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()));
"""

GATILHOS = r"""
CREATE OR REPLACE FUNCTION public.fn_sugestao_revisar_por_atividade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NEW.status::text <> 'concluido' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status::text = 'concluido'
     AND OLD.acertos_percentual IS NOT DISTINCT FROM NEW.acertos_percentual THEN
    RETURN NULL;
  END IF;

  BEGIN
    UPDATE public.personalizacao_sugestao s
       SET revisao_pendente = true,
           revisao_motivo = 'atividade_concluida',
           revisao_pendente_em = now()
     WHERE s.aluno_id = NEW.aluno_id
       AND s.topico_id = (SELECT a.topico_id FROM public.atividades a WHERE a.id = NEW.atividade_id);
  EXCEPTION WHEN OTHERS THEN
    -- A sugestão é camada de consumo: falhar aqui não pode desfazer a conclusão da atividade.
    RAISE WARNING USING MESSAGE = 'fn_sugestao_revisar_por_atividade: ' || SQLERRM;
  END;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_sugestao_revisar_por_atividade() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_atividade_aluno_sugestao_revisar ON public.atividade_aluno;
CREATE TRIGGER trg_atividade_aluno_sugestao_revisar
  AFTER INSERT OR UPDATE OF status, acertos_percentual ON public.atividade_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_sugestao_revisar_por_atividade();

CREATE OR REPLACE FUNCTION public.fn_sugestao_revisar_por_demanda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.demanda IS NOT DISTINCT FROM NEW.demanda THEN
    RETURN NULL;
  END IF;

  BEGIN
    UPDATE public.personalizacao_sugestao s
       SET revisao_pendente = true,
           revisao_motivo = 'demanda_do_conteudo',
           revisao_pendente_em = now()
     WHERE s.topico_id = NEW.topico_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING USING MESSAGE = 'fn_sugestao_revisar_por_demanda: ' || SQLERRM;
  END;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_sugestao_revisar_por_demanda() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_conteudo_demanda_formato_sugestao_revisar ON public.conteudo_demanda_formato;
CREATE TRIGGER trg_conteudo_demanda_formato_sugestao_revisar
  AFTER INSERT OR UPDATE OF demanda ON public.conteudo_demanda_formato
  FOR EACH ROW EXECUTE FUNCTION public.fn_sugestao_revisar_por_demanda();
"""

DOWNGRADE = rf"""
DROP TRIGGER IF EXISTS trg_atividade_aluno_sugestao_revisar ON public.atividade_aluno;
DROP FUNCTION IF EXISTS public.fn_sugestao_revisar_por_atividade();

DROP POLICY IF EXISTS {POLICY_LOG_PROFESSOR} ON public.personalizacao_sugestao_log;
DROP POLICY IF EXISTS {POLICY_TRAVA} ON public.personalizacao_sugestao;
DROP POLICY IF EXISTS {POLICY_SUGESTAO_PROFESSOR} ON public.personalizacao_sugestao;
DROP POLICY IF EXISTS {POLICY_SUGESTAO_ALUNO} ON public.personalizacao_sugestao;

DROP INDEX IF EXISTS public.personalizacao_sugestao_pendente_idx;
ALTER TABLE public.personalizacao_sugestao
  DROP CONSTRAINT IF EXISTS personalizacao_sugestao_revisao_motivo_check,
  DROP COLUMN IF EXISTS revisao_pendente_em,
  DROP COLUMN IF EXISTS revisao_motivo,
  DROP COLUMN IF EXISTS revisao_pendente;

DROP TABLE IF EXISTS public.conteudo_demanda_formato;
DROP FUNCTION IF EXISTS public.fn_sugestao_revisar_por_demanda();
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(COLUNAS)
    op.execute(RLS)
    op.execute(GATILHOS)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(DOWNGRADE)
    op.execute("NOTIFY pgrst, 'reload schema'")
