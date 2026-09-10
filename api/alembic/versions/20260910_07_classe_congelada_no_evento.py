"""a classe e' resolvida uma vez, no INSERT, e congela na linha do evento

Fecha a causa das referencias orfas, em vez de tratar o sintoma.

Ate aqui a classe do evento era deduzida **na leitura**: a view do rank pegava o
id dentro de `referencia` e caçava a tabela certa. Isso faz a atribuicao depender
de o alvo continuar existindo -- e conteudo regerado apaga atividade. Medido em
producao: 66 ids de referencia apontando para atividade que nao existe mais, 160
pontos que rank nenhum contava. A `20260910_06` recuperou o que tinha evidencia e
zerou o resto, mas a causa seguia de pe: qualquer regeracao futura orfana os
eventos daquele material outra vez.

Com `classe_id` na linha, resolvido no INSERT, apagar o conteudo depois deixa de
tirar os pontos do aluno. O historico para de depender do presente.

**A coluna e' congelada, e nao apenas resolvida.** Este e' o ponto de seguranca,
nao de zelo: `eventos_aluno_posse_upd` deixa o aluno dar UPDATE nos proprios
eventos (`aluno_id = auth.uid()`), e `trg_eventos_aluno_valor_upd` disparava so'
em `UPDATE OF valor, tipo`. Uma `classe_id` gravavel seria caminho direto para o
aluno mover a pontuacao dele para a turma que quisesse liderar. Duas mudancas
fecham isso:

- o gatilho de UPDATE passa a disparar em **qualquer** coluna, nao so' duas;
- no UPDATE a coluna e' restaurada de `OLD`, sempre. Nem exclusao de conteudo nem
  UPDATE do cliente a mudam.

**O backfill roda ANTES do gatilho novo**, de proposito: com a restauracao de
`OLD` instalada, um `UPDATE ... SET classe_id = ...` seria desfeito linha por
linha -- a mesma armadilha que a `20260910_04` e a `20260910_06` pegaram, e nao
custa nada evitar a terceira vez. Enquanto isso o gatilho antigo nao interfere:
ele so' olha `valor, tipo`, e o backfill toca apenas `classe_id`.

O AFTER de conquistas fica desligado durante o backfill. Reavaliar 27 conquistas
por linha em ~400 eventos e' trabalho longo a troco de nada: preencher
`classe_id` nao muda nenhuma metrica que aquelas conquistas leem.

**Conquista continua com `classe_id` nulo, de proposito.** `conquistas.escopo` e'
`comum` ou `perfil` -- o premio nao pertence a uma classe, vale em todas as do
aluno. A view mantem o leque (`classe_aluno`) para esses, e o `COALESCE` decide:
`classe_id` quando ha, leque quando nao.

**A view fica trivial.** Saem a CTE `referencias_normalizadas`, a extracao de id,
a deducao de entidade e cinco LEFT JOINs; entra uma coluna. A resolucao por forma
da referencia (`20260910_06`) continua viva em
`fn_eventos_aluno_resolve_classe_id`, que e' quem alimenta o INSERT -- e agora
tem um lugar so', em vez de dois que um teste tinha de manter iguais.

FK com `ON DELETE SET NULL`: mantem a coluna honesta sem apagar evento. Classe
apagada nao tem rank, entao perder a atribuicao ali nao custa nada.

Revision ID: 20260910_07
Revises: 20260910_06
Create Date: 2026-09-10
"""

from alembic import op

revision = "20260910_07"
down_revision = "20260910_06"
branch_labels = None
depends_on = None


COLUNA = """
ALTER TABLE public.eventos_aluno
  ADD COLUMN IF NOT EXISTS classe_id bigint;

COMMENT ON COLUMN public.eventos_aluno.classe_id IS
  'Classe resolvida no INSERT e congelada. Nulo em evento sem classe (ciclo da IA) e em premio de conquista, que vale em todas as classes do aluno.';

ALTER TABLE public.eventos_aluno
  DROP CONSTRAINT IF EXISTS eventos_aluno_classe_id_fkey;

ALTER TABLE public.eventos_aluno
  ADD CONSTRAINT eventos_aluno_classe_id_fkey
  FOREIGN KEY (classe_id) REFERENCES public.classe (id) ON DELETE SET NULL;

-- A view agrupa por (aluno, classe): e' este indice que paga a desnormalizacao.
CREATE INDEX IF NOT EXISTS eventos_aluno_classe_aluno_idx
  ON public.eventos_aluno (classe_id, aluno_id);
"""


# Antes do gatilho novo. Com a restauracao de OLD instalada, este UPDATE seria
# desfeito linha por linha.
BACKFILL = """
ALTER TABLE public.eventos_aluno DISABLE TRIGGER trg_eventos_aluno_after_upd;

UPDATE public.eventos_aluno e
   SET classe_id = public.fn_eventos_aluno_resolve_classe_id(e.tipo, e.referencia)
 WHERE e.classe_id IS NULL;

ALTER TABLE public.eventos_aluno ENABLE TRIGGER trg_eventos_aluno_after_upd;
"""


GATILHO = """
CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_valor_do_banco()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Resolvida uma vez, aqui. O que o cliente mandar nesta coluna e' ignorado.
    NEW.classe_id := public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia);
  ELSE
    -- Congelada. Nem exclusao de conteudo nem UPDATE do cliente a mudam -- e o
    -- cliente PODE dar UPDATE nos proprios eventos (`eventos_aluno_posse_upd`),
    -- entao sem esta linha ele moveria a pontuacao para a turma que quisesse.
    NEW.classe_id := OLD.classe_id;
  END IF;

  -- Creditado tem valor de quem concede: presenca e participacao vem da RPC,
  -- o premio de conquista vem de `conquistas.pontos_recompensa`.
  IF public.fn_evento_creditado(NEW.tipo) THEN
    RETURN NEW;
  END IF;

  -- Para todo o resto, o que o cliente mandou em `valor` e' descartado.
  NEW.valor := public.fn_pontos_do_evento(NEW.tipo);

  IF public.fn_evento_de_conclusao(NEW.tipo) THEN
    -- Conclusao sem referencia nao pode ser atribuida a rank algum.
    IF NULLIF(TRIM(BOTH FROM COALESCE(NEW.referencia, '')), '') IS NULL THEN
      NEW.valor := 0;
      RETURN NEW;
    END IF;

    -- Concluir de novo nao paga de novo. A linha E gravada -- o cliente faz
    -- `.insert().select().single()` e um RETURN NULL o quebraria. No UPDATE a
    -- comparacao e' "existe linha ANTERIOR com a mesma chave": comparar por
    -- existencia acharia a propria vizinha e zeraria as duas.
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

  -- Sem classe resolvida no INSERT, o evento nao chega a rank algum: pagar por
  -- ele inflaria o razao com pontos invisiveis. Agora e' leitura de coluna, nao
  -- consulta -- e no UPDATE le a classe CONGELADA, entao conteudo apagado depois
  -- nao tira os pontos de ninguem.
  --
  -- `conquista:<id>` nao entra aqui: e' creditado e ja retornou acima.
  IF COALESCE(NEW.valor, 0) > 0
     AND NEW.referencia IS NOT NULL
     AND NEW.classe_id IS NULL THEN
    NEW.valor := 0;
  END IF;

  RETURN NEW;
END;
$fn$;

-- Passa a disparar em QUALQUER coluna. Com a lista `valor, tipo`, um
-- `UPDATE ... SET classe_id = ...` nao acionava o gatilho e a coluna congelada
-- ficava gravavel pelo cliente.
DROP TRIGGER IF EXISTS trg_eventos_aluno_valor_upd ON public.eventos_aluno;
CREATE TRIGGER trg_eventos_aluno_valor_upd
  BEFORE UPDATE ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trg_eventos_aluno_valor_do_banco();
"""


VIEW_RANK = """
CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas AS
 WITH eventos_por_classe AS (
         SELECT e.aluno_id,
            COALESCE(e.classe_id, ca_conq.classe_id) AS classe_id,
            sum(COALESCE(e.valor, 0::numeric)) AS pontuacao
           FROM eventos_aluno e
             -- Premio de conquista nao pertence a classe alguma
             -- (`conquistas.escopo` e' `comum` ou `perfil`), entao vale em toda
             -- classe onde o aluno compete. Este join e' o unico que multiplica
             -- linhas, de proposito, e o `sum` por (aluno, classe) conta o
             -- premio inteiro em cada uma.
             LEFT JOIN classe_aluno ca_conq
               ON e.classe_id IS NULL
              AND starts_with(lower(TRIM(BOTH FROM COALESCE(e.referencia, ''::text))), 'conquista:')
              AND ca_conq.aluno_id = e.aluno_id
          WHERE COALESCE(e.classe_id, ca_conq.classe_id) IS NOT NULL
          GROUP BY e.aluno_id, (COALESCE(e.classe_id, ca_conq.classe_id))
        ), base AS (
         SELECT r.id AS rank_id,
            r.classe_id,
            ca.aluno_id,
            rt.criterio,
                CASE rt.criterio
                    WHEN 'percentual'::text THEN COALESCE(ca."porcentagemConcluida", 0::numeric)
                    WHEN 'pontuacao'::text THEN COALESCE(epc.pontuacao, 0::numeric)
                    WHEN 'tempo'::text THEN COALESCE(ca."tempoGastoMin", 0::numeric)
                    ELSE 0::numeric
                END AS pontuacao
           FROM ranks r
             JOIN rank_tipo rt ON rt.id = r.tipo_id
             JOIN classe_aluno ca ON ca.classe_id = r.classe_id
             LEFT JOIN eventos_por_classe epc
               ON epc.classe_id = r.classe_id AND epc.aluno_id = ca.aluno_id
        ), ordenado AS (
         SELECT b.rank_id,
            b.classe_id,
            b.aluno_id,
            b.pontuacao,
            dense_rank() OVER (PARTITION BY b.rank_id ORDER BY b.pontuacao DESC, b.aluno_id) AS posicao
           FROM base b
        )
 SELECT o.rank_id,
    o.classe_id,
    o.posicao,
    a.id AS id_aluno,
    a.nome AS nome_aluno,
    o.pontuacao,
    -- Nao e' progresso na trilha: e' quanto o aluno tem em relacao ao primeiro
    -- colocado. O lider da 100 por construcao.
    round(o.pontuacao / NULLIF(max(o.pontuacao) OVER (PARTITION BY o.rank_id), 0::numeric)
          * 100::numeric, 2) AS percentual_do_lider,
        CASE
            WHEN o.posicao = 1 THEN 'ouro'::text
            WHEN o.posicao = 2 THEN 'prata'::text
            WHEN o.posicao = 3 THEN 'bronze'::text
            ELSE NULL::text
        END AS medalha
   FROM ordenado o
     JOIN alunos a ON a.id = o.aluno_id;
"""


CONFERE = """
DO $$
DECLARE
  v_fora     bigint;
  v_congelou boolean;
BEGIN
  -- Todo evento que resolve classe pela referencia tem de ter a coluna gravada.
  SELECT count(*) INTO v_fora
    FROM public.eventos_aluno e
   WHERE e.classe_id IS DISTINCT FROM
         public.fn_eventos_aluno_resolve_classe_id(e.tipo, e.referencia);

  IF v_fora > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'classe_id divergente da referencia em ' || v_fora::text || ' evento(s)';
  END IF;

  -- Premio de conquista fica sem classe, para a view espalhar.
  SELECT count(*) INTO v_fora
    FROM public.eventos_aluno e
   WHERE e.tipo = 'conquista_desbloqueada'
     AND e.classe_id IS NOT NULL;

  IF v_fora > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'premio de conquista com classe fixa: ' || v_fora::text;
  END IF;

  -- Nenhum evento pagando sem classe (fora do premio, que e' creditado).
  SELECT count(*) INTO v_fora
    FROM public.eventos_aluno e
   WHERE COALESCE(e.valor, 0) <> 0
     AND e.classe_id IS NULL
     AND NOT public.fn_evento_creditado(e.tipo);

  IF v_fora > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'evento sem classe ainda pagando: ' || v_fora::text;
  END IF;

  -- E o congelamento tem de estar valendo: o gatilho de UPDATE precisa cobrir
  -- todas as colunas, senao `SET classe_id = ...` passa sem passar por ele.
  SELECT (t.tgattr = ''::int2vector) INTO v_congelou
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.eventos_aluno'::regclass
     AND t.tgname = 'trg_eventos_aluno_valor_upd';

  IF v_congelou IS NOT TRUE THEN
    RAISE EXCEPTION
      'trg_eventos_aluno_valor_upd nao cobre todas as colunas: classe_id ficaria gravavel';
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(COLUNA)
    # Antes do gatilho: ele restaura `OLD.classe_id` e desfaria o backfill.
    op.execute(BACKFILL)
    op.execute(GATILHO)
    op.execute(VIEW_RANK)
    op.execute(CONFERE)


# A view tem de parar de referenciar `classe_id` ANTES de a coluna cair, senao o
# DROP COLUMN falha por dependencia.
#
# Volta a deduzir a classe pela referencia -- a mesma regra da `20260910_06`,
# mas chamando `fn_eventos_aluno_resolve_classe_id` por linha em vez de repetir
# os cinco LEFT JOINs. O resultado e' identico (a funcao E aquela regra); o custo
# por leitura e' maior, o que e' aceitavel num caminho de rollback.
VIEW_SEM_COLUNA = """
CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas AS
 WITH eventos_por_classe AS (
         SELECT e.aluno_id,
            COALESCE(
              public.fn_eventos_aluno_resolve_classe_id(e.tipo, e.referencia),
              ca_conq.classe_id
            ) AS classe_id,
            sum(COALESCE(e.valor, 0::numeric)) AS pontuacao
           FROM eventos_aluno e
             LEFT JOIN classe_aluno ca_conq
               ON starts_with(lower(TRIM(BOTH FROM COALESCE(e.referencia, ''::text))), 'conquista:')
              AND ca_conq.aluno_id = e.aluno_id
          WHERE COALESCE(
                  public.fn_eventos_aluno_resolve_classe_id(e.tipo, e.referencia),
                  ca_conq.classe_id
                ) IS NOT NULL
          GROUP BY e.aluno_id,
                   (COALESCE(
                      public.fn_eventos_aluno_resolve_classe_id(e.tipo, e.referencia),
                      ca_conq.classe_id))
        ), base AS (
         SELECT r.id AS rank_id,
            r.classe_id,
            ca.aluno_id,
            rt.criterio,
                CASE rt.criterio
                    WHEN 'percentual'::text THEN COALESCE(ca."porcentagemConcluida", 0::numeric)
                    WHEN 'pontuacao'::text THEN COALESCE(epc.pontuacao, 0::numeric)
                    WHEN 'tempo'::text THEN COALESCE(ca."tempoGastoMin", 0::numeric)
                    ELSE 0::numeric
                END AS pontuacao
           FROM ranks r
             JOIN rank_tipo rt ON rt.id = r.tipo_id
             JOIN classe_aluno ca ON ca.classe_id = r.classe_id
             LEFT JOIN eventos_por_classe epc
               ON epc.classe_id = r.classe_id AND epc.aluno_id = ca.aluno_id
        ), ordenado AS (
         SELECT b.rank_id,
            b.classe_id,
            b.aluno_id,
            b.pontuacao,
            dense_rank() OVER (PARTITION BY b.rank_id ORDER BY b.pontuacao DESC, b.aluno_id) AS posicao
           FROM base b
        )
 SELECT o.rank_id,
    o.classe_id,
    o.posicao,
    a.id AS id_aluno,
    a.nome AS nome_aluno,
    o.pontuacao,
    round(o.pontuacao / NULLIF(max(o.pontuacao) OVER (PARTITION BY o.rank_id), 0::numeric)
          * 100::numeric, 2) AS percentual_do_lider,
        CASE
            WHEN o.posicao = 1 THEN 'ouro'::text
            WHEN o.posicao = 2 THEN 'prata'::text
            WHEN o.posicao = 3 THEN 'bronze'::text
            ELSE NULL::text
        END AS medalha
   FROM ordenado o
     JOIN alunos a ON a.id = o.aluno_id;
"""


def downgrade() -> None:
    # A view primeiro: enquanto ela usar `classe_id`, a coluna nao cai.
    op.execute(VIEW_SEM_COLUNA)
    # O gatilho volta a olhar so' `valor, tipo` e a resolver por consulta.
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

          IF public.fn_evento_de_conclusao(NEW.tipo) THEN
            IF NULLIF(TRIM(BOTH FROM COALESCE(NEW.referencia, '')), '') IS NULL THEN
              NEW.valor := 0;
              RETURN NEW;
            END IF;

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

          IF COALESCE(NEW.valor, 0) > 0
             AND NEW.referencia IS NOT NULL
             AND public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia) IS NULL THEN
            NEW.valor := 0;
          END IF;

          RETURN NEW;
        END;
        $fn$;

        DROP TRIGGER IF EXISTS trg_eventos_aluno_valor_upd ON public.eventos_aluno;
        CREATE TRIGGER trg_eventos_aluno_valor_upd
          BEFORE UPDATE OF valor, tipo ON public.eventos_aluno
          FOR EACH ROW EXECUTE FUNCTION public.trg_eventos_aluno_valor_do_banco();
        """
    )
    op.execute("DROP INDEX IF EXISTS public.eventos_aluno_classe_aluno_idx")
    op.execute(
        "ALTER TABLE public.eventos_aluno "
        "DROP CONSTRAINT IF EXISTS eventos_aluno_classe_id_fkey"
    )
    op.execute("ALTER TABLE public.eventos_aluno DROP COLUMN IF EXISTS classe_id")
