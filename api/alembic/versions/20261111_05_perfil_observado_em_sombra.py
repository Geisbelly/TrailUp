"""O vetor observado em sombra (fase 5 do roteiro de diversidade de perfis)

`aluno_perfil_observado` guarda, por aluno e indicador, o que o **uso** do app diz sobre um perfil
BrainHex, com a quantidade de dado que sustenta cada valor. O banco recalcula tudo uma vez por dia
(`pg_cron`, 06:20 UTC). Spec: `docs/superpowers/specs/2026-11-11-vetor-observado-em-sombra-design.md`.

**Em sombra, de propósito:**
- não escreve em `aluno_perfil`: o vetor do questionário continua sendo o único que o produto usa;
- nenhum fluxo do app, do console ou da API lê esta tabela;
- não combina o observado com o questionário, nem estima confiança ou probabilidade. A v3 do
  questionário não estima confiança (`docs/analises/issue-1-adaptacao-evidencias.md`), e combinar
  agora exigiria inventar o peso dele.

**Indicadores da v1** (versão `v1-sombra`), os mesmos de `indicadoresDeComportamento.ts`, com
paridade testada por um arquivo de casos comum (`api/tests/fixtures/perfil_observado_casos.json`):

- Survivor, `persistencia_apos_erro`: de `atividade_tentativas`, a fração das atividades com erro
  (alguma tentativa respondida abaixo de 100%) em que o aluno abriu outra tentativa.
  `valor = (insistiu / com_erro - 0,5) x 2`, `n` = atividades com erro.
- Mastermind, `proporcao_de_teoria`: tempo ativo em conteúdo sobre o total de conteúdo e atividade
  (`tempo_gasto_min` de `conteudo_aluno` e `atividade_aluno`). `n` em minutos, no mínimo 1.

Sem ocasião, sem linha: zero diria "não persiste", que é outra coisa. Achiever, Conqueror, Seeker,
Daredevil e Socializer ficam de fora; o spec diz por quê de cada um. Nada de valor inventado.

**Sem policy, de propósito.** RLS ligada e `REVOKE` para `anon` e `authenticated`: só o
`service_role` lê, para pesquisa. Mostrar ao aluno ou ao professor "o comportamento diz que você é
Survivor" contrariaria os limites da v3. A ausência de policy aqui é decisão, não esquecimento.

Retenção `vida_da_conta`: sai com a conta pela FK.

Revision ID: 20261111_05
Revises: 20261111_04
Create Date: 2026-11-11
"""

from alembic import op

revision = "20261111_05"
down_revision = "20261111_04"
branch_labels = None
depends_on = None

JOB = "trailup_perfil_observado"
CRON = "20 6 * * *"
VERSAO = "v1-sombra"

TABELA = """
CREATE TABLE IF NOT EXISTS public.aluno_perfil_observado (
  aluno_id     uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  indicador    text NOT NULL,
  versao       text NOT NULL,
  perfil       text NOT NULL CHECK (perfil IN ('seeker', 'survivor', 'daredevil', 'mastermind',
                                                'conqueror', 'socializer', 'achiever')),
  valor        numeric NOT NULL CHECK (valor BETWEEN -1 AND 1),
  n            integer NOT NULL CHECK (n >= 1),
  fonte        text NOT NULL,
  calculado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, indicador, versao)
);

COMMENT ON TABLE public.aluno_perfil_observado IS
  'Vetor observado em sombra (20261111_05): evidencia por indicador do que o uso diz sobre um perfil. '
  'Nao escreve em aluno_perfil e o produto nao le. Sem policy de proposito: so service_role, para pesquisa.';

ALTER TABLE public.aluno_perfil_observado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aluno_perfil_observado FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.aluno_perfil_observado TO service_role;
"""

RETENCAO = """
INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo) VALUES
  ('aluno_perfil_observado', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'indicadores de uso por perfil, calculados pelo banco para pesquisa; sai com a conta pela FK')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

FUNCAO = f"""
CREATE OR REPLACE FUNCTION public.fn_perfil_observado_recalcular()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_linhas integer;
BEGIN
  WITH por_atividade AS (
    -- Com erro: alguma tentativa respondida abaixo de 100%. Insistiu: abriu a tentativa 2 ou mais.
    SELECT t.aluno_id,
           bool_or(t.respondida_em IS NOT NULL AND t.acertos_percentual < 100) AS errou,
           max(t.numero) > 1 AS insistiu
      FROM public.atividade_tentativas t
     GROUP BY t.aluno_id, t.atividade_id
  ),
  survivor AS (
    SELECT aluno_id,
           count(*) FILTER (WHERE errou) AS com_erro,
           count(*) FILTER (WHERE errou AND insistiu) AS insistiu
      FROM por_atividade
     GROUP BY aluno_id
  ),
  tempo AS (
    SELECT aluno_id, sum(teoria) AS teoria, sum(teoria) + sum(pratica) AS total
      FROM (
        SELECT ca.aluno_id, GREATEST(0, COALESCE(ca.tempo_gasto_min, 0))::numeric AS teoria, 0::numeric AS pratica
          FROM public.conteudo_aluno ca
        UNION ALL
        SELECT aa.aluno_id, 0::numeric, GREATEST(0, COALESCE(aa.tempo_gasto_min, 0))::numeric
          FROM public.atividade_aluno aa
      ) x
     GROUP BY aluno_id
  ),
  novos AS (
    SELECT aluno_id, 'survivor' AS perfil, 'persistencia_apos_erro' AS indicador,
           (insistiu::numeric / com_erro - 0.5) * 2 AS valor,
           com_erro::integer AS n,
           'atividade_tentativas' AS fonte
      FROM survivor
     WHERE com_erro > 0
    UNION ALL
    SELECT aluno_id, 'mastermind', 'proporcao_de_teoria',
           (teoria / total - 0.5) * 2,
           GREATEST(1, round(total))::integer,
           'conteudo_aluno+atividade_aluno'
      FROM tempo
     WHERE total > 0
  ),
  apagados AS (
    -- Indicador que perdeu a ocasião (dado apagado) sai.
    DELETE FROM public.aluno_perfil_observado o
     WHERE o.versao = '{VERSAO}'
       AND NOT EXISTS (SELECT 1 FROM novos n WHERE n.aluno_id = o.aluno_id AND n.indicador = o.indicador)
  ),
  gravados AS (
    INSERT INTO public.aluno_perfil_observado (aluno_id, indicador, versao, perfil, valor, n, fonte, calculado_em)
    SELECT aluno_id, indicador, '{VERSAO}', perfil, LEAST(1, GREATEST(-1, valor)), n, fonte, now()
      FROM novos
    ON CONFLICT (aluno_id, indicador, versao) DO UPDATE
       SET perfil = EXCLUDED.perfil,
           valor = EXCLUDED.valor,
           n = EXCLUDED.n,
           fonte = EXCLUDED.fonte,
           calculado_em = EXCLUDED.calculado_em
    RETURNING 1
  )
  SELECT count(*) INTO v_linhas FROM gravados;
  RETURN v_linhas;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_perfil_observado_recalcular() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_perfil_observado_recalcular() TO service_role;
"""

CRON_SQL = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
    PERFORM cron.schedule('{JOB}', '{CRON}', 'SELECT public.fn_perfil_observado_recalcular()');
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


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(RETENCAO)
    op.execute(FUNCAO)
    op.execute(CRON_SQL)


def downgrade() -> None:
    op.execute(CRON_FORA)
    op.execute("DROP FUNCTION IF EXISTS public.fn_perfil_observado_recalcular()")
    op.execute("DELETE FROM public.retencao_politica WHERE tabela = 'aluno_perfil_observado'")
    op.execute("DROP TABLE IF EXISTS public.aluno_perfil_observado")
