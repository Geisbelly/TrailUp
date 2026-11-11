"""Visibilidade do tópico: rascunho, publicado e agendado

## Por quê

Tudo o que o professor criava aparecia na hora para o aluno, inclusive a trilha inteira que a
IA acabou de gerar e ninguém revisou. Não havia como preparar o próximo tópico antes da aula,
nem deixar um tópico abrir sozinho numa data.

## O que entra

`topicos.publicacao` (`rascunho` | `publicado` | `agendado`) e `topicos.publicar_em`.

- **Tópico que já existia fica `publicado`**: a coluna nasce com esse default e só depois o
  default passa a `rascunho`. Nenhum aluno perde nada no deploy.
- **Tópico novo nasce `rascunho`** (decisão de produto): o professor revisa e publica. Vale
  também para a trilha da IA e para as funções de duplicar, que não informam a coluna.
- **Agendado abre na hora exata pela leitura.** `app_topico_liberado` compara `publicar_em` com
  `now()`, então o aluno vê o tópico no minuto marcado, sem depender de nada rodar. `agendado`
  exige `publicar_em` (CHECK). A varredura de baixo só acerta as contas e o estado depois.
- Publicar ou agendar **não regera a personalização**: `trg_topicos_class_delta_job` só olha
  `nome, descricao, ordem, next, depende` (`20260827_03`).

## RLS: policies RESTRICTIVE, não reescrita das permissivas

Mesmo molde da `20261110_09`: as policies de posse (`*_posse_sel` e as do personalizado)
continuam decidindo QUEM alcança a linha; as restritivas daqui exigem, por cima delas, que o
tópico esteja liberado, a não ser para o professor dono, que precisa ver o rascunho para
editá-lo. Restritiva compõe com a aprovação do personalizado sem que uma apague a outra.

Não basta esconder a linha de `topicos`: o material de um tópico oculto vazaria pelas
tabelas-filhas, cujas policies sobem a cadeia com helpers `SECURITY DEFINER`
(`app_classe_do_topico` lê o tópico cru). Então a restrição vale para o tópico e para tudo o que
carrega o material dele:

- por `topico_id`: `conteudos`, `atividades`, `boss_falas`, `conteudo_personalizado`,
  `cards_personalizados`, `personalizacao_sugestao`, `fontes_personalizacao`;
- por `conteudo_id`: `midias`, `cards`, `materiais_gerados`;
- por `atividade_id`: `questoes`, `atividade_conteudos`.

As listas de ocultos (`app_topicos_ocultos_para_mim` e as de conteúdo e atividade) são
`SECURITY DEFINER` e só trazem tópicos de turmas em que quem pergunta é ALUNO e não é o
professor. Na policy entram como `id <> ALL (ARRAY(SELECT ...))`: subconsulta sem correlação,
calculada uma vez por consulta (InitPlan), e vazia no caso comum. `coalesce(..., true)` deixa
passar a linha sem tópico (`fontes_personalizacao.topico_id` é opcional).

Só SELECT: escrever já é do professor dono pelas policies de posse. `service_role` e `postgres`
(API e worker) ignoram RLS e continuam vendo tudo, o que a geração precisa.

Fora do alcance desta migration, de propósito:
- dados do próprio aluno (`topico_aluno`, telemetria): só trazem o id, nunca o material;
- RPCs `SECURITY DEFINER` que leem material por id. Elas não passam pela RLS e ficam para uma
  auditoria à parte.

## O que o aluno vê: `topicos_em_breve`

O app mostra um aviso com cards "em breve" no lugar dos tópicos ocultos, **sem nome nem
material**. A RPC devolve só a data de abertura (`null` para rascunho), uma linha por tópico
oculto, e só para quem é aluno da turma.

## As contas só contam o que o aluno vê

`trailup_recalcular_classe_aluno` somava todos os tópicos da turma: um rascunho novo derrubaria o
percentual (e o `isComplete`) de quem já tinha terminado tudo o que existe. E
`trailup_recalcular_nota_classe_aluno` dá 0 a atividade com prazo vencido sem entrega, inclusive
num tópico que o aluno nem enxerga. As duas passam a filtrar `app_topico_liberado`, por troca no
texto VIVO (as duas foram reescritas por `replace` em migrations anteriores; a de produção é a
verdade). Sem a âncora esperada, a migration falha alto em vez de seguir sem o filtro.

Como a conta depende da visibilidade, mudar a visibilidade recalcula:

- `trg_topicos_visibilidade_recalcular` (AFTER UPDATE, por comando, com tabelas de transição):
  recalcula as matrículas da turma quando algum tópico mudou de liberado para oculto ou o
  contrário. "Publicar todos" vira um recálculo por aluno, não um por tópico. `SECURITY DEFINER`
  porque quem publica é o professor e quem é recalculado é a matrícula do aluno. Falha no recálculo
  vira WARNING: publicar nunca é desfeito por causa da conta.
- `fn_topicos_abrir_agendados` (`pg_cron`, a cada minuto, job `trailup_topicos_agendados`): o
  agendado que venceu já aparece para o aluno pela leitura, mas a matrícula ainda guardava o
  percentual sem ele. A varredura passa o tópico para `publicado` (mantendo `publicar_em` como
  registro) e recalcula as turmas afetadas. Sem ela, quem tinha 100% continuaria com 100% e
  `isComplete` até tocar em algo.

## Downgrade

Tira o job, o gatilho e o filtro das contas (troca de volta no texto vivo), e derruba RPC,
policies, helpers, CHECKs e colunas. Tudo volta a ficar visível.

Revision ID: 20261110_10
Revises: 20261110_09
Create Date: 2026-11-10
"""

from alembic import op

revision = "20261110_10"
down_revision = "20261110_09"
branch_labels = None
depends_on = None

ESTADOS = ("rascunho", "publicado", "agendado")

# (tabela, coluna, função que lista os ids ocultos para quem pergunta)
RESTRICOES = [
    ("conteudos", "topico_id", "app_topicos_ocultos_para_mim"),
    ("atividades", "topico_id", "app_topicos_ocultos_para_mim"),
    ("boss_falas", "topico_id", "app_topicos_ocultos_para_mim"),
    ("conteudo_personalizado", "topico_id", "app_topicos_ocultos_para_mim"),
    ("cards_personalizados", "topico_id", "app_topicos_ocultos_para_mim"),
    ("personalizacao_sugestao", "topico_id", "app_topicos_ocultos_para_mim"),
    ("fontes_personalizacao", "topico_id", "app_topicos_ocultos_para_mim"),
    ("midias", "conteudo_id", "app_conteudos_ocultos_para_mim"),
    ("cards", "conteudo_id", "app_conteudos_ocultos_para_mim"),
    ("materiais_gerados", "conteudo_id", "app_conteudos_ocultos_para_mim"),
    ("questoes", "atividade_id", "app_atividades_ocultas_para_mim"),
    ("atividade_conteudos", "atividade_id", "app_atividades_ocultas_para_mim"),
]

COLUNAS = """
ALTER TABLE public.topicos
  ADD COLUMN IF NOT EXISTS publicacao text NOT NULL DEFAULT 'publicado',
  ADD COLUMN IF NOT EXISTS publicar_em timestamp with time zone NULL;

-- Só depois de as linhas existentes terem ficado `publicado`.
ALTER TABLE public.topicos ALTER COLUMN publicacao SET DEFAULT 'rascunho';

ALTER TABLE public.topicos DROP CONSTRAINT IF EXISTS topicos_publicacao_chk;
ALTER TABLE public.topicos ADD CONSTRAINT topicos_publicacao_chk
  CHECK (publicacao IN ('rascunho', 'publicado', 'agendado'));

ALTER TABLE public.topicos DROP CONSTRAINT IF EXISTS topicos_agendado_tem_data_chk;
ALTER TABLE public.topicos ADD CONSTRAINT topicos_agendado_tem_data_chk
  CHECK (publicacao <> 'agendado' OR publicar_em IS NOT NULL);

COMMENT ON COLUMN public.topicos.publicacao IS
  'rascunho | publicado | agendado. O aluno só vê o tópico liberado (app_topico_liberado).';
COMMENT ON COLUMN public.topicos.publicar_em IS
  'Quando o tópico agendado abre para o aluno. Comparado com now() na leitura, sem cron.';
"""

FUNCOES = """
-- Pura: a regra de "liberado" num lugar só. Roda com o papel de quem lê (está em policy).
CREATE OR REPLACE FUNCTION public.app_topico_liberado(p_publicacao text, p_publicar_em timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT coalesce(p_publicacao, 'publicado') = 'publicado'
      OR (p_publicacao = 'agendado' AND p_publicar_em IS NOT NULL AND p_publicar_em <= now())
$fn$;

-- Tópicos que EU não posso ver: não liberados, em turmas onde sou aluno e não sou o professor.
-- DEFINER de propósito: lê `topicos` cru (sem a própria restrição) e não entra em recursão.
CREATE OR REPLACE FUNCTION public.app_topicos_ocultos_para_mim()
RETURNS SETOF bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT t.id
    FROM topicos t
   WHERE t.classe_id IN (SELECT public.app_classes_do_aluno())
     AND NOT EXISTS (SELECT 1 FROM classe c WHERE c.id = t.classe_id AND c.professor_id = auth.uid())
     AND NOT public.app_topico_liberado(t.publicacao, t.publicar_em)
$fn$;

CREATE OR REPLACE FUNCTION public.app_conteudos_ocultos_para_mim()
RETURNS SETOF bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT co.id FROM conteudos co
   WHERE co.topico_id IN (SELECT public.app_topicos_ocultos_para_mim())
$fn$;

CREATE OR REPLACE FUNCTION public.app_atividades_ocultas_para_mim()
RETURNS SETOF bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT a.id FROM atividades a
   WHERE a.topico_id IN (SELECT public.app_topicos_ocultos_para_mim())
$fn$;

-- O que o app mostra no lugar dos tópicos ocultos: só QUANDO abre (null = rascunho).
-- Sem id, nome, descrição ou ordem: nada do tópico sai daqui.
CREATE OR REPLACE FUNCTION public.topicos_em_breve(p_classe_id bigint)
RETURNS TABLE(abre_em timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT CASE WHEN t.publicacao = 'agendado' THEN t.publicar_em END
    FROM topicos t
   WHERE t.classe_id = p_classe_id
     AND EXISTS (SELECT 1 FROM classe_aluno ca WHERE ca.classe_id = p_classe_id AND ca.aluno_id = auth.uid())
     AND NOT public.app_topico_liberado(t.publicacao, t.publicar_em)
   ORDER BY t.publicar_em NULLS LAST, t.ordem NULLS LAST, t.id
$fn$;
"""

GRANTS = """
REVOKE ALL ON FUNCTION public.app_topico_liberado(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_topico_liberado(text, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.app_topicos_ocultos_para_mim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_topicos_ocultos_para_mim() TO authenticated;
REVOKE ALL ON FUNCTION public.app_conteudos_ocultos_para_mim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_conteudos_ocultos_para_mim() TO authenticated;
REVOKE ALL ON FUNCTION public.app_atividades_ocultas_para_mim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_atividades_ocultas_para_mim() TO authenticated;
REVOKE ALL ON FUNCTION public.topicos_em_breve(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.topicos_em_breve(bigint) TO authenticated;
"""

POLICY_TOPICOS = """
DROP POLICY IF EXISTS topicos_publicado_sel ON public.topicos;
CREATE POLICY topicos_publicado_sel ON public.topicos
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    classe_id IN (SELECT public.app_classes_do_professor())
    OR public.app_topico_liberado(publicacao, publicar_em)
  );
"""


# --- contas: só tópico liberado ------------------------------------------------------------------
# Âncoras copiadas de `pg_get_functiondef` em produção (10/11/2026).
MARCA_DAS_CONTAS = "app_topico_liberado(t.publicacao, t.publicar_em)"

PERCENTUAL = (
    "public.trailup_recalcular_classe_aluno(uuid, bigint)",
    "      LEFT JOIN personalizado p ON p.topico_id = t.id\n     WHERE t.classe_id = p_classe\n",
    "      LEFT JOIN personalizado p ON p.topico_id = t.id\n     WHERE t.classe_id = p_classe\n"
    "       AND public.app_topico_liberado(t.publicacao, t.publicar_em)\n",
)
NOTA = (
    "public.trailup_recalcular_nota_classe_aluno(uuid, bigint)",
    "       WHERE t.classe_id = p_classe\n    ) x",
    "       WHERE t.classe_id = p_classe\n         AND public.app_topico_liberado(t.publicacao, t.publicar_em)\n    ) x",
)


def troca_no_vivo(assinatura: str, de: str, para: str, *, ligar: bool) -> str:
    """`replace` no texto vivo da função. Ligar sem a âncora falha alto; repetir não faz nada."""
    if not ligar:
        de, para = para, de
    pronto = "> 0" if ligar else "= 0"
    falta = (
        f"RAISE EXCEPTION 'visibilidade do topico: {assinatura} sem a ancora esperada';"
        if ligar
        else "RETURN;"
    )
    return f"""
DO $troca$
DECLARE
  v_fn regprocedure := to_regprocedure('{assinatura}');
  v_def text;
BEGIN
  IF v_fn IS NULL THEN RETURN; END IF;
  v_def := pg_get_functiondef(v_fn);
  IF strpos(v_def, $c${MARCA_DAS_CONTAS}$c$) {pronto} THEN RETURN; END IF;
  IF strpos(v_def, $c${de}$c$) = 0 THEN {falta} END IF;
  EXECUTE replace(v_def, $c${de}$c$, $c${para}$c$);
END
$troca$;
"""


RECALCULO = """
-- Mudou o que o aluno vê: recalcula as matrículas das turmas afetadas, uma vez por aluno.
CREATE OR REPLACE FUNCTION public.fn_topicos_visibilidade_recalcular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ca.aluno_id, ca.classe_id
      FROM novos n
      JOIN velhos v ON v.id = n.id
      JOIN public.classe_aluno ca ON ca.classe_id = n.classe_id
     WHERE ca.aluno_id IS NOT NULL
       AND public.app_topico_liberado(n.publicacao, n.publicar_em)
           IS DISTINCT FROM public.app_topico_liberado(v.publicacao, v.publicar_em)
  LOOP
    BEGIN
      PERFORM public.trailup_recalcular_classe_aluno(r.aluno_id, r.classe_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING USING MESSAGE = 'visibilidade do topico: matricula ' || r.aluno_id::text
        || ' / ' || r.classe_id::text || ' nao recalculada: ' || SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_topicos_visibilidade_recalcular() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_topicos_visibilidade_recalcular ON public.topicos;
CREATE TRIGGER trg_topicos_visibilidade_recalcular
  AFTER UPDATE ON public.topicos
  REFERENCING OLD TABLE AS velhos NEW TABLE AS novos
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_topicos_visibilidade_recalcular();

-- Agendado que venceu: já está visível pela leitura; aqui o estado e as contas alcançam.
CREATE INDEX IF NOT EXISTS topicos_agendados_idx
  ON public.topicos (publicar_em) WHERE publicacao = 'agendado';

CREATE OR REPLACE FUNCTION public.fn_topicos_abrir_agendados()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_classes bigint[];
  v_n integer;
  r record;
BEGIN
  WITH abertos AS (
    UPDATE public.topicos SET publicacao = 'publicado'
     WHERE publicacao = 'agendado' AND publicar_em <= now()
    RETURNING classe_id
  )
  SELECT array_agg(DISTINCT classe_id), count(*) INTO v_classes, v_n FROM abertos;

  IF coalesce(v_n, 0) = 0 THEN RETURN 0; END IF;

  FOR r IN
    SELECT DISTINCT ca.aluno_id, ca.classe_id
      FROM public.classe_aluno ca
     WHERE ca.classe_id = ANY (v_classes) AND ca.aluno_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.trailup_recalcular_classe_aluno(r.aluno_id, r.classe_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING USING MESSAGE = 'topico agendado: matricula ' || r.aluno_id::text
        || ' / ' || r.classe_id::text || ' nao recalculada: ' || SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_topicos_abrir_agendados() FROM PUBLIC, anon, authenticated;
"""

JOB = "trailup_topicos_agendados"
CRON = "* * * * *"

CRON_SQL = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
    PERFORM cron.schedule('{JOB}', '{CRON}', 'SELECT public.fn_topicos_abrir_agendados()');
  END IF;
END $$
"""

CRON_FORA = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
  END IF;
END $$
"""

def nome_da_policy(tabela: str) -> str:
    return f"{tabela}_topico_publicado_sel"


def policy_da_filha(tabela: str, coluna: str, funcao: str) -> str:
    """Restritiva de SELECT; a tabela pode não existir num banco antigo, então vai num DO."""
    nome = nome_da_policy(tabela)
    return f"""
DO $do$
BEGIN
  IF to_regclass('public.{tabela}') IS NULL THEN
    RAISE NOTICE 'visibilidade do topico: public.{tabela} nao existe, sem policy';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS {nome} ON public.{tabela}';
  EXECUTE $p$
    CREATE POLICY {nome} ON public.{tabela}
      AS RESTRICTIVE FOR SELECT TO authenticated
      USING (coalesce({coluna} <> ALL (ARRAY(SELECT public.{funcao}())), true))
  $p$;
END
$do$;
"""


def upgrade() -> None:
    op.execute(COLUNAS)
    op.execute(FUNCOES)
    op.execute(GRANTS)
    op.execute(POLICY_TOPICOS)
    for tabela, coluna, funcao in RESTRICOES:
        op.execute(policy_da_filha(tabela, coluna, funcao))
    for conta in (PERCENTUAL, NOTA):
        op.execute(troca_no_vivo(*conta, ligar=True))
    op.execute(RECALCULO)
    op.execute(CRON_SQL)


def downgrade() -> None:
    op.execute(CRON_FORA)
    op.execute("DROP TRIGGER IF EXISTS trg_topicos_visibilidade_recalcular ON public.topicos")
    op.execute("DROP FUNCTION IF EXISTS public.fn_topicos_visibilidade_recalcular()")
    op.execute("DROP FUNCTION IF EXISTS public.fn_topicos_abrir_agendados()")
    op.execute("DROP INDEX IF EXISTS public.topicos_agendados_idx")
    # Antes de derrubar `app_topico_liberado`, que as contas passam a chamar.
    for conta in (PERCENTUAL, NOTA):
        op.execute(troca_no_vivo(*conta, ligar=False))
    for tabela, _coluna, _funcao in RESTRICOES:
        nome = nome_da_policy(tabela)
        op.execute(
            f"""
DO $do$
BEGIN
  IF to_regclass('public.{tabela}') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS {nome} ON public.{tabela}';
  END IF;
END
$do$;
"""
        )
    op.execute("DROP POLICY IF EXISTS topicos_publicado_sel ON public.topicos")
    op.execute("DROP FUNCTION IF EXISTS public.topicos_em_breve(bigint)")
    op.execute("DROP FUNCTION IF EXISTS public.app_atividades_ocultas_para_mim()")
    op.execute("DROP FUNCTION IF EXISTS public.app_conteudos_ocultos_para_mim()")
    op.execute("DROP FUNCTION IF EXISTS public.app_topicos_ocultos_para_mim()")
    op.execute("DROP FUNCTION IF EXISTS public.app_topico_liberado(text, timestamptz)")
    op.execute("ALTER TABLE public.topicos DROP CONSTRAINT IF EXISTS topicos_agendado_tem_data_chk")
    op.execute("ALTER TABLE public.topicos DROP CONSTRAINT IF EXISTS topicos_publicacao_chk")
    op.execute("ALTER TABLE public.topicos DROP COLUMN IF EXISTS publicar_em")
    op.execute("ALTER TABLE public.topicos DROP COLUMN IF EXISTS publicacao")
