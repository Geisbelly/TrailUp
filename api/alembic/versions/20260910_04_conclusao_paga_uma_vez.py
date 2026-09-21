"""concluir paga uma vez, e o que foi concluido de fato passa a ter evento

O razao de estudo nao batia com o registro autoritativo. Medido em producao,
aluno de demonstracao:

| o que aconteceu de verdade        | o que o razao dizia                       |
|-----------------------------------|-------------------------------------------|
| 3 conteudos concluidos            | 15 eventos `conteudo_concluido`           |
| 9 atividades concluidas           | 5 eventos `atividade_concluida`           |

Os 15 eventos tem **duas** referencias distintas: `(nulo)` em 13 deles e
`conteudo:174` nos outros dois. Ou seja: 13 conclusoes anonimas, uma conclusao
contada duas vezes, e dois conteudos concluidos sem evento algum. Do lado das
atividades, 7 das 9 concluidas nao tinham evento com a referencia certa.

Sao tres defeitos somados:

1. **Nao havia dedupe.** `eventos_aluno_creditado_unico` cobre so' os tipos
   creditados (presenca, participacao, premio). Concluir o mesmo conteudo de
   novo rendia 10 pontos de novo -- e o aluno podia repetir a vontade.
2. **Conclusao sem referencia valia ponto.** Nenhum rank consegue atribui-la,
   entao ela inflava o razao sem nunca aparecer em lugar nenhum. Eram 130 dos
   150 pontos de `conteudo_concluido`.
3. **Faltavam eventos.** `conteudo_aluno` e `atividade_aluno` sao mantidas por
   gatilho e tem FK viva; o evento e' emitido pelo cliente e se perdeu.

**Repetir passa a valer zero, e a linha continua sendo gravada.** Nao e' um
`RETURN NULL`: o cliente faz `.insert().select().single()`
(`mobile/src/models/Evento.ts`), e uma linha nao inserida o faria estourar com
"no rows returned". O fato fica registrado -- o aluno realmente revisitou --, so'
nao paga de novo.

**Por isso o dedupe e' gatilho, e nao indice unico.** Um indice rejeitaria o
INSERT com erro na cara do aluno. O gatilho ja roda em todo INSERT, inclusive em
SQL direto, entao a garantia e' a mesma sem quebrar o cliente.

**Os eventos que faltavam sao inseridos, nada e' apagado.** `ultima_visualizacao`
das tabelas de progresso da a data, e ela e' `timestamp` sem tz igual a
`eventos_aluno.criado_em` -- nao ha conversao escondida. Apagar historico mexeria
em `dias_seguidos` e `eventos_totais`, que sao metricas de conquista; conferi que
os 13 anonimos nao sustentam nenhum dia sozinhos (15 dias com evento, 15 sem
eles), mas preservar sai de graca e nao arrisca nada.

Nao trata `atividade_revisada`: 70 das 86 referencias apontam para atividade que
nao existe mais, e sem a linha nao ha `topico_id` para recuperar. Nao ha tabela
autoritativa de "revisoes" para reconstruir, e rever E' repetivel por natureza --
nao entra no dedupe. Os 16 que resolvem seguem valendo 2 cada.

Revision ID: 20260910_04
Revises: 20260910_03
Create Date: 2026-09-10
"""

from alembic import op

revision = "20260910_04"
down_revision = "20260910_03"
branch_labels = None
depends_on = None


# Tipo que representa um ESTADO, nao um ato repetivel: concluir o mesmo conteudo
# duas vezes nao e' duas vezes o aprendizado. `atividade_revisada` fica fora de
# proposito -- rever de novo e' rever de novo.
TIPOS_DE_CONCLUSAO = (
    "conteudo_concluido",
    "atividade_concluida",
    "atividade_acertada",
)

LISTA_SQL = ", ".join(f"'{t}'" for t in TIPOS_DE_CONCLUSAO)

FUNCAO_CONCLUSAO = f"""
CREATE OR REPLACE FUNCTION public.fn_evento_de_conclusao(p_tipo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT COALESCE(p_tipo, '') IN ({LISTA_SQL});
$fn$;

REVOKE ALL ON FUNCTION public.fn_evento_de_conclusao(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_evento_de_conclusao(text) TO authenticated, service_role;
"""


GATILHO = """
CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_valor_do_banco()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  -- Creditado tem valor de quem concede: presenca e participacao vem da RPC,
  -- o premio de conquista vem de `conquistas.pontos_recompensa`.
  IF public.fn_evento_creditado(NEW.tipo) THEN
    RETURN NEW;
  END IF;

  -- Para todo o resto, o que o cliente mandou em `valor` e' descartado.
  NEW.valor := public.fn_pontos_do_evento(NEW.tipo);

  IF public.fn_evento_de_conclusao(NEW.tipo) THEN
    -- Conclusao sem referencia nao pode ser atribuida a rank algum: pagar por
    -- ela inflaria o razao com pontos que nunca aparecem.
    IF NULLIF(TRIM(BOTH FROM COALESCE(NEW.referencia, '')), '') IS NULL THEN
      NEW.valor := 0;
      RETURN NEW;
    END IF;

    -- Concluir de novo nao paga de novo. A linha E gravada -- o cliente faz
    -- `.insert().select().single()` e um RETURN NULL o quebraria.
    --
    -- Vale para INSERT **e** para UPDATE, e o ramo de UPDATE nao e' zelo: a
    -- `20260909_05` instalou um `BEFORE UPDATE OF valor, tipo` sobre esta mesma
    -- funcao, entao sem ele o gatilho recalculava o valor cheio por cima do
    -- zero e desfazia o backfill logo abaixo, linha por linha.
    --
    -- No UPDATE a comparacao e' "existe linha ANTERIOR com a mesma chave", nao
    -- "existe outra": comparar por existencia acharia a propria vizinha e
    -- zeraria as duas. `criado_em` e' anulavel, e sem o COALESCE a comparacao
    -- daria NULL e a repeticao passaria batida.
    IF EXISTS (
      SELECT 1
        FROM public.eventos_aluno e
       WHERE e.aluno_id = NEW.aluno_id
         AND e.tipo = NEW.tipo
         AND e.referencia = NEW.referencia
         AND (
           TG_OP = 'INSERT'
           OR (COALESCE(e.criado_em, 'epoch'::timestamp), e.id)
              < (COALESCE(NEW.criado_em, 'epoch'::timestamp), NEW.id)
         )
    ) THEN
      NEW.valor := 0;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;
"""


# Alinha o que ja esta gravado a regra nova. Sem apagar linha nenhuma: o que
# muda e' o `valor`.
ZERAR_REPETICOES = """
-- 1) Conclusao sem referencia: nao ha rank que a receba.
UPDATE public.eventos_aluno e
   SET valor = 0
 WHERE public.fn_evento_de_conclusao(e.tipo)
   AND NULLIF(TRIM(BOTH FROM COALESCE(e.referencia, '')), '') IS NULL
   AND COALESCE(e.valor, 0) <> 0;

-- 2) Repeticao: paga a primeira, zera as seguintes. `id` desempata quando duas
--    linhas tem o mesmo `criado_em`, senao a escolha seria arbitraria e o
--    resultado mudaria a cada execucao.
WITH ordenadas AS (
  SELECT e.id,
         row_number() OVER (
           PARTITION BY e.aluno_id, e.tipo, e.referencia
           ORDER BY e.criado_em, e.id
         ) AS ordem
    FROM public.eventos_aluno e
   WHERE public.fn_evento_de_conclusao(e.tipo)
     AND NULLIF(TRIM(BOTH FROM COALESCE(e.referencia, '')), '') IS NOT NULL
)
UPDATE public.eventos_aluno e
   SET valor = 0
  FROM ordenadas o
 WHERE o.id = e.id
   AND o.ordem > 1
   AND COALESCE(e.valor, 0) <> 0;
"""


# O que foi concluido de fato e nao tinha evento. Aditivo.
EVENTOS_QUE_FALTAVAM = """
INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)
SELECT ca.aluno_id,
       'conteudo_concluido',
       'conteudo:' || ca.conteudo_id::text,
       public.fn_pontos_do_evento('conteudo_concluido'),
       COALESCE(ca.ultima_visualizacao, now()::timestamp)
  FROM public.conteudo_aluno ca
 WHERE starts_with(ca.status::text, 'concl')
   AND NOT EXISTS (
     SELECT 1 FROM public.eventos_aluno e
      WHERE e.aluno_id = ca.aluno_id
        AND e.tipo = 'conteudo_concluido'
        AND e.referencia = 'conteudo:' || ca.conteudo_id::text);

INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)
SELECT aa.aluno_id,
       'atividade_concluida',
       'atividade:' || aa.atividade_id::text,
       public.fn_pontos_do_evento('atividade_concluida'),
       COALESCE(aa.ultima_visualizacao, now()::timestamp)
  FROM public.atividade_aluno aa
 WHERE starts_with(aa.status::text, 'concl')
   AND NOT EXISTS (
     SELECT 1 FROM public.eventos_aluno e
      WHERE e.aluno_id = aa.aluno_id
        AND e.tipo = 'atividade_concluida'
        AND e.referencia = 'atividade:' || aa.atividade_id::text);
"""


CONFERE = """
DO $$
DECLARE
  v_repetido bigint;
  v_anonimo  bigint;
  v_faltando bigint;
BEGIN
  IF NOT public.fn_evento_de_conclusao('conteudo_concluido')
     OR public.fn_evento_de_conclusao('atividade_revisada') THEN
    RAISE EXCEPTION 'fn_evento_de_conclusao nao classifica como esperado';
  END IF;

  -- Nenhuma repeticao paga.
  SELECT count(*) INTO v_repetido
    FROM (
      SELECT row_number() OVER (
               PARTITION BY e.aluno_id, e.tipo, e.referencia
               ORDER BY e.criado_em, e.id
             ) AS ordem,
             COALESCE(e.valor, 0) AS valor
        FROM public.eventos_aluno e
       WHERE public.fn_evento_de_conclusao(e.tipo)
         AND NULLIF(TRIM(BOTH FROM COALESCE(e.referencia, '')), '') IS NOT NULL
    ) s
   WHERE s.ordem > 1 AND s.valor <> 0;

  IF v_repetido > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'conclusao repetida ainda pagando: ' || v_repetido::text;
  END IF;

  -- Nenhuma conclusao anonima paga.
  SELECT count(*) INTO v_anonimo
    FROM public.eventos_aluno e
   WHERE public.fn_evento_de_conclusao(e.tipo)
     AND NULLIF(TRIM(BOTH FROM COALESCE(e.referencia, '')), '') IS NULL
     AND COALESCE(e.valor, 0) <> 0;

  IF v_anonimo > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'conclusao sem referencia ainda pagando: ' || v_anonimo::text;
  END IF;

  -- Tudo o que foi concluido tem evento.
  SELECT count(*) INTO v_faltando
    FROM public.conteudo_aluno ca
   WHERE starts_with(ca.status::text, 'concl')
     AND NOT EXISTS (
       SELECT 1 FROM public.eventos_aluno e
        WHERE e.aluno_id = ca.aluno_id
          AND e.tipo = 'conteudo_concluido'
          AND e.referencia = 'conteudo:' || ca.conteudo_id::text);

  IF v_faltando > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'conteudo concluido sem evento: ' || v_faltando::text;
  END IF;

  SELECT count(*) INTO v_faltando
    FROM public.atividade_aluno aa
   WHERE starts_with(aa.status::text, 'concl')
     AND NOT EXISTS (
       SELECT 1 FROM public.eventos_aluno e
        WHERE e.aluno_id = aa.aluno_id
          AND e.tipo = 'atividade_concluida'
          AND e.referencia = 'atividade:' || aa.atividade_id::text);

  IF v_faltando > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'atividade concluida sem evento: ' || v_faltando::text;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(FUNCAO_CONCLUSAO)
    op.execute(GATILHO)
    op.execute(ZERAR_REPETICOES)
    op.execute(EVENTOS_QUE_FALTAVAM)
    op.execute(CONFERE)


def downgrade() -> None:
    # O gatilho volta a versao da 20260909_05: valor pela tabela, sem dedupe.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_valor_do_banco()
        RETURNS trigger
        LANGUAGE plpgsql
        SET search_path TO 'public', 'pg_temp'
        AS $fn$
        BEGIN
          IF public.fn_evento_creditado(NEW.tipo) THEN
            RETURN NEW;
          END IF;

          NEW.valor := public.fn_pontos_do_evento(NEW.tipo);
          RETURN NEW;
        END;
        $fn$;
        """
    )
    # Os valores zerados nao voltam: eram repeticao e conclusao sem referencia,
    # e reintroduzi-los reinflaria o rank.
    op.execute("DROP FUNCTION IF EXISTS public.fn_evento_de_conclusao(text)")
