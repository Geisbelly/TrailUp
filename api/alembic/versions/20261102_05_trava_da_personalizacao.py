"""Trava da personalização no baseline e na turma de comparação (#13)

A `20261102_02` registra a cohort e a `_03` mede, mas nada segurava a personalização: o baseline e
a turma de comparação recebiam material como qualquer turma, e a RPC só podia acusar
`baseline_contaminado`. Esta migration é o pré-requisito para o estudo começar.

## Decisões (aprovadas em 01/11)

- **Retida desde o registro.** A turma em `estudo_coorte` fica com a personalização retida
  desde o registro, o pré-estudo incluído, e até a liberação: no `corte` (intervenção) ou no dia
  seguinte ao `fim` (comparação, lista de espera; sem `fim`, segue retida). A liberação é pela
  data, sem job. A regra mora numa função só (`estudo_coorte_retem`), que os helpers e a RPC usam.
- **A trava esconde, não impede a geração.** A fila, o worker e o microservice continuam como
  estão: o material é gerado e o aluno não o vê. No corte ele já está pronto, então a semana 0 não
  carrega o atraso da geração. O custo é o mesmo de uma turma fora do estudo. Bloquear a geração
  exigiria fechar mais de dez caminhos (seis `INSERT`s, o worker, os endpoints manuais, o
  microservice); a exposição tem um ponto só, a RLS.
- **Escopo: o que a IA gera ou decide para o aluno.** Aqui, o material por perfil e por aluno
  (`conteudo_personalizado`, `cards_personalizados`), as falas geradas do boss (`boss_falas`; o app
  cai nas falas fixas) e o andamento da geração (`personalizacao_jobs`; sem isso o aluno veria
  "preparando material" que não chega). A adequação em tempo real fica retida na API (o grafo só
  mede, e `POST /personalizar` responde 409). Fica igual nos dois braços e nas duas fases, e vai
  para `limitacoes`: as regras fixas do jogo por perfil (tema, cronômetro padrão, batalha) e o
  guia (chat).
- **Policy `RESTRICTIVE`, de SELECT, para `authenticated`.** Ela entra com E nas policies que já
  existem, então nenhuma é reescrita, e vale também para o Realtime. O professor dono continua
  vendo o material da turma (precisa revisar o que vai ser liberado). Linha com `classe_id` NULL
  passa: o app sempre filtra por turma.
- **O helper só fala das turmas do próprio aluno.** `app_classes_retidas_do_aluno()` precisa de
  EXECUTE para `authenticated` (a policy roda como quem lê) e é chamável pelo PostgREST; listar as
  turmas retidas de todo mundo diria a qualquer aluno quem é o grupo de comparação.
- **Contaminação passa a ser exposição medida.** Com a trava, material pronto antes do corte é o
  esperado. `baseline_contaminado` e `comparacao_recebeu_personalizacao` passam a ser tempo ativo
  no escopo `material` dentro da janela retida, o que só aparece se algo escapar (cache do app,
  caminho esquecido). Entram `exposicao_antes_do_registro` (efeito de antes do estudo) e `trava`.

## RLS conferida com o papel `authenticated` no e2e

Aluno de turma retida não vê a base, a derivação, os cards, as falas nem os jobs; o professor dono
vê; o aluno de outra turma continua sem ver nada a mais; a liberação acontece no corte e, na
comparação, depois do fim.

Revision ID: 20261102_05
Revises: 20261102_04
Create Date: 2026-11-02
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261102_05"
down_revision = "20261102_04"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

# Tabelas que o aluno lê direto do Supabase e que trazem o que a IA gerou para a turma.
TABELAS_RETIDAS = ("conteudo_personalizado", "cards_personalizados", "boss_falas", "personalizacao_jobs")
POLICY = "estudo_trava_sel"


FUNCOES = r"""
-- A regra da trava, num lugar só. Retida desde o registro; libera no corte (intervenção) ou no dia
-- seguinte ao fim (comparação). Comparação sem fim segue retida.
CREATE OR REPLACE FUNCTION public.estudo_coorte_retem(p_braco text, p_corte date, p_fim date, p_timezone text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT CASE p_braco
           WHEN 'intervencao' THEN (now() AT TIME ZONE p_timezone)::date < p_corte
           ELSE p_fim IS NULL OR (now() AT TIME ZONE p_timezone)::date <= p_fim
         END
$fn$;
REVOKE ALL ON FUNCTION public.estudo_coorte_retem(text, date, date, text) FROM PUBLIC, anon, authenticated;

-- Para a RLS: as turmas do aluno logado que estão com a personalização retida. Só as dele: a
-- função é chamável pelo PostgREST, e a lista de todas diria quem é o grupo de comparação.
CREATE OR REPLACE FUNCTION public.app_classes_retidas_do_aluno()
RETURNS SETOF bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT ec.classe_id
    FROM public.estudo_coorte ec
   WHERE ec.classe_id IN (SELECT ca.classe_id FROM public.classe_aluno ca WHERE ca.aluno_id = auth.uid())
     AND public.estudo_coorte_retem(ec.braco, ec.corte, ec.fim, ec.timezone)
$fn$;
REVOKE ALL ON FUNCTION public.app_classes_retidas_do_aluno() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_classes_retidas_do_aluno() TO authenticated;

-- Para a API (adequação em tempo real, POST /personalizar, sugestão). Sem EXECUTE para cliente.
CREATE OR REPLACE FUNCTION public.estudo_personalizacao_retida(p_classe_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.estudo_coorte ec
     WHERE ec.classe_id = p_classe_id
       AND public.estudo_coorte_retem(ec.braco, ec.corte, ec.fim, ec.timezone)
  )
$fn$;
REVOKE ALL ON FUNCTION public.estudo_personalizacao_retida(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estudo_personalizacao_retida(bigint) TO service_role;
"""


def _policies() -> str:
    blocos = []
    for tabela in TABELAS_RETIDAS:
        blocos.append(
            f"""
DROP POLICY IF EXISTS {POLICY} ON public.{tabela};
CREATE POLICY {POLICY} ON public.{tabela}
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    classe_id IS NULL
    OR classe_id IN (SELECT public.app_classes_do_professor())
    -- O helper nunca devolve NULL (classe_id é NOT NULL em estudo_coorte) e o NULL da linha já
    -- passou acima, então o NOT IN aqui não engole linha nenhuma.
    OR NOT (classe_id IN (SELECT public.app_classes_retidas_do_aluno()))
  );
COMMENT ON POLICY {POLICY} ON public.{tabela} IS
  'Trava do estudo (#13, 20261102_05): aluno de turma com personalizacao retida nao le. Restritiva: so estreita as outras.';
"""
        )
    return "\n".join(blocos)


def _load(nome: str):
    path = AQUI.with_name(nome)
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_02_05", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def rpc_anterior() -> str:
    """`metricas_estudo_coortes` como a `20261102_03` a deixou (o downgrade volta a ela)."""
    return _load("20261102_03_metricas_estudo_coortes.py").RPC


# Trechos da RPC da `_03` que mudam. Cada um tem de aparecer uma vez só: se a `_03` mudar de forma,
# a migration falha alto em vez de gravar uma RPC pela metade.
_TROCAS = (
    (
        "  v_pronto_ate_fim boolean;\n",
        "  v_exposto_antes boolean;\n",
    ),
    (
        """    v_pronto_ate_fim := EXISTS (
      SELECT 1 FROM public.conteudo_personalizado cp
       WHERE cp.classe_id = c.classe_id
         AND lower(COALESCE(cp.status, '')) = 'pronto'
         AND cp.gerado_em < ((v_ultimo + 1)::timestamp AT TIME ZONE c.timezone)
    );
""",
        """    -- Exposição da turma antes de ela entrar no estudo (efeito que vem de antes do registro).
    v_exposto_antes := EXISTS (
      SELECT 1 FROM public.telemetria_time_metric_entries e
       WHERE e.classe_id = c.classe_id
         AND e.scope = 'material'
         AND e.active_sec > 0
         AND e.captured_at < c.registrado_em
    );
""",
    ),
    (
        """      'contaminacao', jsonb_build_object(
        'material_pronto_antes_do_corte', v_pronto_antes,
        'comparacao_recebeu_personalizacao',
          CASE WHEN c.braco = 'comparacao' THEN v_pronto_ate_fim END,
        'baseline_contaminado',
          v_pronto_antes OR COALESCE((v_pre ->> 'alunos_expostos')::integer, 0) > 0
      ),
""",
        """      -- Com a trava (20261102_05), material pronto antes do corte é o esperado: a geração segue
      -- e o aluno não vê. Contaminação é exposição medida dentro da janela retida.
      'contaminacao', jsonb_build_object(
        'material_pronto_antes_do_corte', v_pronto_antes,
        'exposicao_antes_do_registro', v_exposto_antes,
        'comparacao_recebeu_personalizacao',
          CASE WHEN c.braco = 'comparacao'
               THEN COALESCE((v_pos ->> 'alunos_expostos')::integer, 0) > 0 END,
        'baseline_contaminado',
          COALESCE((v_pre ->> 'alunos_expostos')::integer, 0) > 0
      ),
      'trava', jsonb_build_object(
        'retida_agora', public.estudo_coorte_retem(c.braco, c.corte, c.fim, c.timezone),
        'libera_em', CASE WHEN c.braco = 'intervencao' THEN c.corte ELSE c.fim + 1 END
      ),
""",
    ),
    (
        "      'sem trava de personalizacao, a turma pode receber material no baseline e a de comparacao tambem; ver contaminacao',\n",
        "      'a personalizacao fica retida desde o registro (RLS e API); o que escapar aparece como exposicao em contaminacao',\n"
        "      'regras fixas do jogo por perfil (tema, cronometro padrao, batalha) e o guia ficam iguais nos dois bracos e nas duas fases',\n"
        "      'ciclos_personalizacao conta geracao, nao entrega: na retencao o material e gerado e fica escondido',\n",
    ),
)


def rpc_nova() -> str:
    texto = rpc_anterior()
    for antigo, novo in _TROCAS:
        if texto.count(antigo) != 1:
            raise RuntimeError(
                "metricas_estudo_coortes mudou de forma desde a 20261102_03; revise a 20261102_05"
            )
        texto = texto.replace(antigo, novo)
    return texto


DOWNGRADE = r"""
DROP FUNCTION IF EXISTS public.estudo_personalizacao_retida(bigint);
DROP FUNCTION IF EXISTS public.app_classes_retidas_do_aluno();
"""


def upgrade() -> None:
    op.execute(FUNCOES)
    op.execute(_policies())
    op.execute(rpc_nova())


def downgrade() -> None:
    # A RPC antiga volta antes de a regra sair: a nova chama `estudo_coorte_retem`.
    op.execute(rpc_anterior())
    for tabela in TABELAS_RETIDAS:
        op.execute(f"DROP POLICY IF EXISTS {POLICY} ON public.{tabela}")
    op.execute(DOWNGRADE)
    op.execute("DROP FUNCTION IF EXISTS public.estudo_coorte_retem(text, date, date, text)")
    op.execute("NOTIFY pgrst, 'reload schema'")
