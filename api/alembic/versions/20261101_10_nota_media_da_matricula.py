"""A nota média da matrícula passa a ser calculada pelo banco

## Por quê

`classe_aluno."notaMedia"` nunca foi gravada por ninguém: nenhuma função, gatilho ou cliente a
escreve, e as 6 matrículas de produção estavam com NULL em 01/11. O console (média, distribuição,
risco), o CSV de notas (#747) e o modelo de evasão a leem. Na turma 66, o Aluno Demo fez 0 de 10 na
única atividade com questões e aparecia como "sem nota".

## A conta (decisão de 01/11, Geisbelly)

- Escala 0 a 10, **ponderada pelos pontos**: 10 × soma dos pontos obtidos ÷ soma dos pontos possíveis.
- Entra a atividade com pontuação obtida (corrigida pelo professor ou pontuada pelas questões).
- **Prazo vencido sem entrega conta 0**, até o professor dar nota: `avaliar_entrega` grava
  `pontuacao_obtida`, que passa a valer no lugar do 0. Entregue e ainda sem correção não entra.
  "Entregue" é a mesma regra das entregas do modelo: `atividade_aluno` concluída ou evento
  `atividade_concluida`.
- Sem nada avaliado, a nota é NULL (sem nota), nunca 0.

`trailup_recalcular_nota_classe_aluno` faz a conta. `trailup_recalcular_classe_aluno`, que já roda a
cada mudança em `conteudo_aluno`/`atividade_aluno` e no cronômetro, passa a chamá-la. A troca é
feita no texto vivo da função, e falha alto se a âncora não estiver lá. Como o prazo vence sem
ninguém gravar nada, `trailup_recalcular_notas_com_prazo` roda de hora em hora no `pg_cron`
(`trailup_notas_com_prazo`). Nada com relógio fica na API. Sem `pg_cron` (banco local, CI), nada é
agendado. No fim, todas as matrículas são recalculadas uma vez.

## Quem grava

A policy `classe_aluno_posse_upd` deixa o aluno dar UPDATE na própria matrícula. Com a nota valendo
no risco e no CSV do professor, isso seria uma porta. O gatilho `trg_classe_aluno_nota_pelo_banco`
ignora a nota vinda de `authenticated`/`anon` (UPDATE mantém a anterior, INSERT grava NULL), salvo
dentro da conta do banco, que se identifica por `trailup.nota_pelo_banco` local à transação.
SECURITY DEFINER (`avaliar_entrega`), `pg_cron` e migrations rodam como dono e passam.

## "0 sem progresso = sem nota" sai

A regra existia porque se supunha que `classe_aluno` grava 0 antes de qualquer correção. O padrão da
coluna é NULL e ninguém gravava 0. Com a nota calculada, um 0 real (prazo vencido, nada feito) seria
lido como "sem nota". Ela sai das duas views que a tinham:
- `vw_metricas_engajamento_aluno_classe`: entrada de nota do modelo e "tem nota" da `_09`;
- `vw_metricas_distribuicao_turma_classe`: faixa `sem_dado` da `_08`.

Também sai do console (`notaParaRisco`). Sem nota agora é só NULL.

Revision ID: 20261101_10
Revises: 20261101_09
Create Date: 2026-11-01
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261101_10"
down_revision = "20261101_09"
branch_labels = None
depends_on = None

JOB = "trailup_notas_com_prazo"
CRON = "7 * * * *"

NOTA = r"""
CREATE OR REPLACE FUNCTION public.trailup_recalcular_nota_classe_aluno(p_aluno uuid, p_classe bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_obtidos numeric;
  v_maximos numeric;
  v_nota numeric;
BEGIN
  IF p_aluno IS NULL OR p_classe IS NULL THEN RETURN; END IF;

  SELECT sum(x.obtido), sum(x.maximo) INTO v_obtidos, v_maximos
    FROM (
      SELECT COALESCE(NULLIF(aa.pontuacao_maxima, 0), a.pontuacao_maxima) AS maximo,
             CASE
               WHEN aa.pontuacao_obtida IS NOT NULL THEN aa.pontuacao_obtida
               -- Prazo vencido sem entrega: 0 até o professor dar nota (decisão de 01/11).
               WHEN public.fn_prazo_efetivo(p_aluno, a.id) < now()
                    AND COALESCE(aa.status::text, '') <> 'concluido'
                    AND NOT EXISTS (
                          SELECT 1 FROM public.eventos_aluno ea
                           WHERE ea.aluno_id = p_aluno AND ea.tipo = 'atividade_concluida'
                             AND ea.referencia = 'atividade:' || a.id::text) THEN 0
             END AS obtido
        FROM public.topicos t
        JOIN public.atividades a ON a.topico_id = t.id
        LEFT JOIN public.atividade_aluno aa ON aa.atividade_id = a.id AND aa.aluno_id = p_aluno
       WHERE t.classe_id = p_classe
    ) x
   WHERE x.obtido IS NOT NULL AND COALESCE(x.maximo, 0) > 0;

  IF COALESCE(v_maximos, 0) > 0 THEN
    v_nota := round(10 * greatest(0, least(v_obtidos, v_maximos)) / v_maximos, 2);
  END IF;

  -- O gatilho de guarda só deixa a nota passar com esta marca (local à transação).
  PERFORM set_config('trailup.nota_pelo_banco', '1', true);
  UPDATE public.classe_aluno SET "notaMedia" = v_nota
   WHERE aluno_id = p_aluno AND classe_id = p_classe AND "notaMedia" IS DISTINCT FROM v_nota;
  PERFORM set_config('trailup.nota_pelo_banco', '', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_classe_aluno_nota_pelo_banco()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND COALESCE(current_setting('trailup.nota_pelo_banco', true), '') <> '1' THEN
    IF TG_OP = 'INSERT' THEN
      NEW."notaMedia" := NULL;
    ELSE
      NEW."notaMedia" := OLD."notaMedia";
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_classe_aluno_nota_pelo_banco ON public.classe_aluno;
CREATE TRIGGER trg_classe_aluno_nota_pelo_banco
  BEFORE INSERT OR UPDATE OF "notaMedia" ON public.classe_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trg_classe_aluno_nota_pelo_banco();

CREATE OR REPLACE FUNCTION public.trailup_recalcular_notas_com_prazo()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  -- Só turmas com prazo: é o único jeito de a nota mudar sem ninguém gravar nada.
  FOR r IN
    SELECT DISTINCT ca.aluno_id, ca.classe_id
      FROM public.classe_aluno ca
     WHERE ca.aluno_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.topicos t JOIN public.atividades a ON a.topico_id = t.id
                    WHERE t.classe_id = ca.classe_id AND a.data_entrega IS NOT NULL)
  LOOP
    BEGIN
      PERFORM public.trailup_recalcular_nota_classe_aluno(r.aluno_id, r.classe_id);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'nota da matricula (%, %) nao recalculada: %', r.aluno_id, r.classe_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.trailup_recalcular_notas_com_prazo() FROM PUBLIC, anon, authenticated;
"""

ANCORA = "  IF p_aluno IS NULL OR p_classe IS NULL THEN RETURN; END IF;\n"
CHAMADA = "  PERFORM public.trailup_recalcular_nota_classe_aluno(p_aluno, p_classe);\n"


def _gancho(*, ligar: bool) -> str:
    # `replace` no texto vivo de `trailup_recalcular_classe_aluno`, como na `20261101_08`. Ligar sem a
    # âncora falha alto; ligar de novo, ou desligar o que não está ligado, não faz nada.
    de, para = (ANCORA, ANCORA + CHAMADA) if ligar else (ANCORA + CHAMADA, ANCORA)
    pronto = "> 0" if ligar else "= 0"
    falta = (
        "RAISE EXCEPTION 'trailup_recalcular_classe_aluno sem a ancora esperada: revise a 20261101_10';"
        if ligar
        else "RETURN;"
    )
    return f"""
DO $gancho$
DECLARE
  v_fn regprocedure := to_regprocedure('public.trailup_recalcular_classe_aluno(uuid, bigint)');
  v_def text;
BEGIN
  IF v_fn IS NULL THEN RETURN; END IF;
  v_def := pg_get_functiondef(v_fn);
  IF strpos(v_def, $c${CHAMADA}$c$) {pronto} THEN RETURN; END IF;
  IF strpos(v_def, $c${de}$c$) = 0 THEN {falta} END IF;
  EXECUTE replace(v_def, $c${de}$c$, $c${para}$c$);
END
$gancho$;
"""


RECALCULA_TODAS = """
SELECT public.trailup_recalcular_nota_classe_aluno(aluno_id, classe_id)
  FROM (SELECT DISTINCT aluno_id, classe_id FROM public.classe_aluno WHERE aluno_id IS NOT NULL) m;
"""

CRON_SQL = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
    PERFORM cron.schedule('{JOB}', '{CRON}', 'SELECT public.trailup_recalcular_notas_com_prazo()');
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


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"m_{arquivo[:11]}_para_01_10", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _trocar(texto: str, de: str, para: str) -> str:
    assert texto.count(de) == 1, f"trecho esperado uma vez: {de[:60]!r}"
    return texto.replace(de, para)


def _engajamento_anterior() -> str:
    return _modulo("20261101_09_modelo_so_com_atividade_avaliavel.py").ENGAJAMENTO


def _distribuicao_anterior() -> str:
    return _modulo("20261101_08_nota_sem_nota_e_acento_da_conquista.py").DISTRIBUICAO


def _engajamento() -> str:
    sql = _engajamento_anterior()
    sql = _trocar(
        sql,
        "           -- 0 a 100; -1 sem nota. classe_aluno grava 0 antes de qualquer correção: 0 sem\n"
        '           -- progresso é "sem nota" (mesma regra do console, notaParaRisco).\n'
        "           CASE WHEN m.nota_media IS NULL OR (m.nota_media = 0 AND COALESCE(m.progresso_pct, 0) = 0) THEN -1\n",
        "           -- 0 a 100; -1 sem nota. A nota é calculada pelo banco (20261101_10): NULL é sem nota,\n"
        "           -- e 0 é zero (mesma regra do console, notaParaRisco).\n"
        "           CASE WHEN m.nota_media IS NULL THEN -1\n",
    )
    return _trocar(
        sql,
        "           NOT (m.nota_media IS NULL OR (m.nota_media = 0 AND COALESCE(m.progresso_pct, 0) = 0))\n",
        "           m.nota_media IS NOT NULL\n",
    )


def _distribuicao() -> str:
    sql = _distribuicao_anterior()
    return _trocar(
        sql,
        "-- Sem nota não é nota baixa: NULL, ou 0 sem progresso (default do classe_aluno), é sem_dado.\n"
        "         CASE WHEN base.nota_media IS NULL\n"
        "                OR (base.nota_media = 0::numeric AND base.progresso_pct = 0::numeric) THEN 'sem_dado'::text\n",
        "-- Sem nota não é nota baixa: NULL é sem_dado; 0 é zero (a nota é do banco, 20261101_10).\n"
        "         CASE WHEN base.nota_media IS NULL THEN 'sem_dado'::text\n",
    )


ENGAJAMENTO = _engajamento()
DISTRIBUICAO = _distribuicao()


def upgrade() -> None:
    op.execute(NOTA)
    op.execute(_gancho(ligar=True))
    op.execute(ENGAJAMENTO)
    op.execute(DISTRIBUICAO)
    op.execute(RECALCULA_TODAS)
    op.execute(CRON_SQL)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    # As notas já gravadas ficam: são a conta do banco, não um valor inventado.
    op.execute(CRON_FORA)
    op.execute(_engajamento_anterior())
    op.execute(_distribuicao_anterior())
    op.execute(_gancho(ligar=False))
    op.execute("DROP TRIGGER IF EXISTS trg_classe_aluno_nota_pelo_banco ON public.classe_aluno")
    op.execute("DROP FUNCTION IF EXISTS public.trg_classe_aluno_nota_pelo_banco()")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_recalcular_notas_com_prazo()")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_recalcular_nota_classe_aluno(uuid, bigint)")
    op.execute("NOTIFY pgrst, 'reload schema'")
