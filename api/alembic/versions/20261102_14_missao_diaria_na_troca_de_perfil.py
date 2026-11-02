"""Missão diária: trocar o perfil ativo gera na hora a coorte do dia do perfil novo

## O defeito, confirmado no código

O app mostra só as diárias do **perfil da missão** (`perfilDaMissao` no mobile, `fn_perfil_da_missao`
no banco, `20261021_20`): o `perfil_ativo` salvo, se for representativo, senão o primeiro
representativo. Quem cria as diárias é `fn_missao_diaria_gerar`, e ela só roda pelo pg_cron
`trailup_missao_diaria` (`0 3 * * *`, meia-noite de Brasília, `20261021_05`). A coorte é
`(turma × perfil da missão de algum aluno dela)`, calculada **naquele momento**.

Em `alunos.perfil_ativo` só existe `trg_alunos_progresso_perfil` (`20260920_08`), que recalcula
progresso. Nada gera missão. Então o aluno que troca o perfil ativo depois da meia-noite para um
perfil que ninguém da turma tinha à 0h fica sem diária até o cron seguinte. A própria `20261021_20`
registrou isso como limite conhecido.

Foi o que apareceu em 02/11/2026 na turma 56 (conta de QA "Aluno Demo"): `perfil_ativo = conqueror`,
afinidades mastermind 85 e conqueror 60 (os dois representativos), `perfilDaMissao = conqueror`, e as
diárias do dia só existiam para `achiever` e `mastermind`. Em 01/11 havia coorte `conqueror`. Com
os dois perfis representativos, a única forma de a 0h de 02/11 não gerar `conqueror` é o perfil da
missão do aluno não ser `conqueror` naquele momento.

## A correção, no banco

Gerar coorte determinística é encanamento, não IA, então fica no banco (regra de fronteira):

1. `fn_missao_diaria_gerar` ganha `p_aluno uuid DEFAULT NULL`. Com ele, o laço de coortes olha
   só as turmas desse aluno, no perfil da missão de agora. Sem ele, nada muda: o cron chama
   `fn_missao_diaria_gerar()` e continua gerando todas. É o **mesmo** gerador, com o mesmo hash
   `turma:perfil:dia` e o mesmo `ON CONFLICT ... DO NOTHING`. A coorte que nasce à tarde é igual à
   que a meia-noite teria gerado, e chamar de novo não duplica.

   O corpo é reescrito a partir do que **está no banco** (`prosrc`), como em `20261030_02`, que já
   o redefiniu assim. Só uma linha é acrescentada no recorte da coorte. Se o recorte não for
   achado exatamente uma vez, a migração falha em vez de gravar uma função que não filtra.

   A assinatura muda, então a antiga `(date)` sai antes. Deixar as duas tornaria
   `fn_missao_diaria_gerar()` ambígua e o cron falharia toda noite.

2. Gatilho novo `trg_alunos_missao_diaria_perfil`, `AFTER UPDATE OF perfil_ativo` em `alunos`,
   só quando o valor muda:
   - chama `fn_missao_diaria_gerar(NULL, NEW.id)`: o dia de hoje em Brasília, as turmas do aluno;
   - se nasceu missão, chama `fn_missao_diaria_enfileirar_texto()`, e o texto por LLM vem
     pela fila como o do cron (`20261021_07`). Ela é idempotente e respeita o teto diário. Até o
     worker rodar, vale o texto do molde;
   - os dois passos ficam em blocos `EXCEPTION` separados, que só avisam: falha de missão não
     pode impedir a troca de perfil, e falha ao enfileirar não desfaz a missão gerada.

Nenhuma tabela, coluna ou policy nova. `SECURITY DEFINER`, `search_path` fixo e `REVOKE` da
função nova e do gerador com a assinatura nova, como as irmãs.

> Limites conhecidos, fora desta migração:
> - **Matrícula no meio do dia** (`classe_aluno` INSERT) e **afinidade que muda** (`aluno_perfil`)
>   também mudam o perfil da missão e têm o mesmo buraco. Com o gerador aceitando `p_aluno`, cada
>   um é um gatilho de poucas linhas. `aluno_perfil` pede gatilho por instrução, porque o quiz grava
>   várias linhas e um gatilho por linha veria o vetor pela metade.
> - O aluno que alterna entre dois perfis representativos agora tem a coorte dos dois no dia. Isso
>   já acontecia quando a turma tinha os dois perfis. O gatilho de eventos só avalia as missões do
>   perfil da missão do momento.
> - O job de texto sai com `trigger_source = 'db_cron_missao_diaria'`, porque a função de
>   enfileirar não recebe a origem.

Revision ID: 20261102_14
Revises: 20261102_13
Create Date: 2026-11-02
"""

from alembic import op

revision = "20261102_14"
down_revision = "20261102_13"
branch_labels = None
depends_on = None


# O recorte da coorte como `20261021_20` o deixou (`_COORTE_DEPOIS`). `20261030_02` só trocou textos
# dos moldes, longe daqui.
FILTRO_ANTES = """     WHERE ca.classe_id IS NOT NULL AND ca.aluno_id IS NOT NULL
       AND pm.perfil IS NOT NULL
"""

FILTRO_DEPOIS = """     WHERE ca.classe_id IS NOT NULL AND ca.aluno_id IS NOT NULL
       AND pm.perfil IS NOT NULL
       -- Com `p_aluno`, so' as coortes dele: as turmas em que esta', no perfil da missao de
       -- agora (20261102_14, troca de perfil ativo). Sem ele, todas, como o cron sempre fez.
       AND (p_aluno IS NULL OR ca.aluno_id = p_aluno)
"""

# Cabeçalho do gerador desde `20261021_05`; muda só a lista de parâmetros.
_CABECALHO = """CREATE FUNCTION public.fn_missao_diaria_gerar({parametros})
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS %L"""

PARAMETROS_ANTES = "p_dia date DEFAULT NULL"
PARAMETROS_DEPOIS = "p_dia date DEFAULT NULL, p_aluno uuid DEFAULT NULL"


def _reescrever(assinatura_de: str, assinatura_para: str, parametros_para: str, antes: str, depois: str) -> str:
    """Troca `antes` por `depois` no corpo que está no banco e recria a função com outra
    assinatura. Falha se o trecho não aparece exatamente uma vez."""
    criar = _CABECALHO.format(parametros=parametros_para)
    return f"""
DO $migracao$
DECLARE
  v_corpo  text;
  v_antes  text := $antes${antes}$antes$;
  v_depois text := $depois${depois}$depois$;
  v_vezes  int;
BEGIN
  SELECT p.prosrc INTO v_corpo
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.fn_missao_diaria_gerar({assinatura_de})');
  IF v_corpo IS NULL THEN
    -- Ja' reescrita por quem rodou antes: aceita. Ausente dos dois lados: erro.
    IF to_regprocedure('public.fn_missao_diaria_gerar({assinatura_para})') IS NOT NULL THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'fn_missao_diaria_gerar({assinatura_de}) nao existe';
  END IF;

  v_vezes := (length(v_corpo) - length(replace(v_corpo, v_antes, ''))) / length(v_antes);
  IF v_vezes <> 1 THEN
    RAISE EXCEPTION 'recorte da coorte encontrado % vez(es) em fn_missao_diaria_gerar', v_vezes;
  END IF;

  -- A antiga sai antes: com as duas, `fn_missao_diaria_gerar()` do cron ficaria ambigua.
  DROP FUNCTION public.fn_missao_diaria_gerar({assinatura_de});
  EXECUTE format($criar${criar}$criar$, replace(v_corpo, v_antes, v_depois));
END
$migracao$;

REVOKE ALL ON FUNCTION public.fn_missao_diaria_gerar({assinatura_para}) FROM PUBLIC, anon, authenticated;
"""


def gerador_com_aluno() -> str:
    return _reescrever("date", "date, uuid", PARAMETROS_DEPOIS, FILTRO_ANTES, FILTRO_DEPOIS)


def gerador_sem_aluno() -> str:
    return _reescrever("date, uuid", "date", PARAMETROS_ANTES, FILTRO_DEPOIS, FILTRO_ANTES)


GATILHO = r"""
CREATE OR REPLACE FUNCTION public.trg_alunos_missao_diaria_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_novas integer := 0;
BEGIN
  -- A coorte de HOJE do perfil da missao novo, nas turmas do aluno, se ainda nao existe
  -- (20261102_14). Mesmo gerador do cron: mesmo hash e mesmo ON CONFLICT, entao o que nasce
  -- aqui e' o que a meia-noite teria gerado. Falha aqui nao impede a troca de perfil.
  BEGIN
    v_novas := public.fn_missao_diaria_gerar(NULL, NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'missao diaria do aluno % na troca de perfil falhou: %', NEW.id, SQLERRM;
    RETURN NEW;
  END;

  -- Texto por LLM pela fila, como o do cron (20261021_07). Bloco proprio: falhar ao
  -- enfileirar nao desfaz a missao; o pior caso e' o texto do molde.
  IF COALESCE(v_novas, 0) > 0 THEN
    BEGIN
      PERFORM public.fn_missao_diaria_enfileirar_texto();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'texto da missao diaria do aluno % nao foi enfileirado: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_alunos_missao_diaria_perfil() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_alunos_missao_diaria_perfil ON public.alunos;
CREATE TRIGGER trg_alunos_missao_diaria_perfil
  AFTER UPDATE OF perfil_ativo ON public.alunos
  FOR EACH ROW
  WHEN (OLD.perfil_ativo IS DISTINCT FROM NEW.perfil_ativo)
  EXECUTE FUNCTION public.trg_alunos_missao_diaria_perfil();
"""

SEM_GATILHO = """
DROP TRIGGER IF EXISTS trg_alunos_missao_diaria_perfil ON public.alunos;
DROP FUNCTION IF EXISTS public.trg_alunos_missao_diaria_perfil();
"""


def upgrade() -> None:
    op.execute(gerador_com_aluno())
    op.execute(GATILHO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    # O gatilho chama a assinatura nova; sai antes dela.
    op.execute(SEM_GATILHO)
    op.execute(gerador_sem_aluno())
    op.execute("NOTIFY pgrst, 'reload schema'")
