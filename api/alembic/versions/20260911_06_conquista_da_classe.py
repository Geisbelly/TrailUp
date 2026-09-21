"""conquista da turma: o professor cadastra, e o gatilho passa a filtrar por classe

Revision ID: 20260911_06
Revises: 20260911_05

Implementa a #158.

## O bloqueio de correcao que vem antes da feature

`trg_eventos_aluno_after_iud` avalia o aluno contra `SELECT c.* FROM conquistas c`
-- TODAS. Enquanto as 27 sao globais isso esta certo. No instante em que existir
conquista de turma, cada aluno passa a ser avaliado contra as conquistas de
turmas as quais nem pertence, e **destrava a conquista de outra turma**. E erro
de correcao antes de ser de desempenho, e a issue ja o antecipava.

O filtro entra AQUI, na mesma migracao que cria a coluna, e nao depois: a coluna
sem o filtro e' uma janela aberta.

### O `WHERE` precisa de parenteses, e isso nao e' detalhe

O predicado atual e' uma disjuncao:

    WHERE lower(COALESCE(c.escopo, 'comum')) <> 'perfil'
       OR lower(COALESCE(c.perfil_alvo, '')) IN (SELECT nome FROM representativos)

Acrescentar `AND <filtro de classe>` no fim faz o Postgres ler
`A OR (B AND C)` -- `AND` liga mais forte que `OR`. Conquista comum de OUTRA
turma continuaria passando pelo primeiro ramo, calada. Por isso a substituicao
troca o bloco inteiro por `(A OR B) AND C`, com os parenteses explicitos.

## O que a coluna significa

`classe_id` anulavel: **nulo e' global** (as 27 que ja existem), preenchido e' da
turma. `criado_por` guarda quem cadastrou, como `eventos_aluno.concedido_por`.

`ON DELETE CASCADE` na classe: conquista de turma nao sobrevive a turma. O
cascade chega a `conquistas_aluno` pela FK que ja existe.

## Quem pode escrever

`conquistas_posse_sel` era `USING (true)` -- todo mundo lia tudo, o que estava
certo quando tudo era global. Com conquista de turma, o aluno veria na biblioteca
medalha de turma que nao e' dele. A leitura passa a ser
`global OU da minha turma OU de turma que eu leciono`.

Escrita: so' o professor, e so' nas classes dele. `classe_id IN
app_classes_do_professor()` **exclui NULL por construcao** -- entao o professor
nao consegue criar conquista global nem transformar a dele numa. E o que impede
uma medalha de turma virar medalha de todo mundo.

## A unicidade de `tipo` era global, e isso bloqueava a feature

Descoberto ao rodar o CONFERE, nao por leitura: os dois indices unicos de
`conquistas` ignoram a turma.

    conquistas_tipo_comum_uq   UNIQUE (tipo)               WHERE escopo = 'comum'
    conquistas_tipo_perfil_uq  UNIQUE (perfil_alvo, tipo)  WHERE escopo = 'perfil'

Com eles, a conquista que o professor cadastra colide com a global de mesmo
`tipo`, e duas turmas nunca podem ter conquistas do mesmo tipo. A feature
travaria no primeiro cadastro, com erro de chave duplicada que nao diz nada ao
professor.

Os dois passam a incluir `COALESCE(classe_id, -1)`. O `COALESCE` nao e' enfeite:
`classe_id` e nulo nas globais, e em indice unico NULL nao colide com NULL --
`UNIQUE (classe_id, tipo)` cru deixaria duas globais com o mesmo tipo passarem,
perdendo a garantia que existe hoje. Com o `-1`, as globais continuam num espaco
unico e cada turma ganha o seu.

## Teto da recompensa

`pontos_recompensa` vira evento `conquista_desbloqueada`, que e' creditado --
o valor vai direto ao razao sem passar por `fn_pontos_do_evento`. Sem teto, um
zero a mais no cadastro vale mais que o semestre inteiro de estudo.

O teto e' de `app_config` e nao de um `CHECK`: `CHECK` exige expressao imutavel e
nao pode ler tabela. Fica num gatilho BEFORE, que so' vale para conquista de
turma -- as globais sao semeadas por migracao, por quem desenvolve.

Create Date: 2026-09-11
"""

from alembic import op

revision = "20260911_06"
down_revision = "20260911_05"
branch_labels = None
depends_on = None


def _sql_literal(texto: str) -> str:
    """Literal SQL com as aspas simples dobradas.

    O texto substituido carrega `'comum'`, `'perfil'` e `''` dentro dele; sem
    dobrar, o literal fecharia no meio e o `DO` viraria sintaxe invalida num
    ponto que nao tem nada a ver com o erro.
    """
    return "'" + texto.replace("'", "''") + "'"

# Sentinela ESPECIFICA desta mudanca. Uma generica (procurar por `classe_id`,
# por exemplo) casaria com outra coisa e a migracao nao faria nada, calada --
# defeito que ja custou caro neste repo.
_SENTINELA = "-- FILTRO DE CLASSE (20260911_06)"

_ANCORA = """    SELECT c.*
      FROM public.conquistas c
     WHERE lower(COALESCE(c.escopo, 'comum')) <> 'perfil'
        OR lower(COALESCE(c.perfil_alvo, '')) IN (SELECT nome FROM representativos)
  LOOP"""

_SUBSTITUTO = """    SELECT c.*
      FROM public.conquistas c
     WHERE (
             lower(COALESCE(c.escopo, 'comum')) <> 'perfil'
             OR lower(COALESCE(c.perfil_alvo, '')) IN (SELECT nome FROM representativos)
           )
       AND (
             {sentinela}
             -- Os parenteses acima nao sao estilo: o predicado de perfil e uma
             -- DISJUNCAO, e `AND` liga mais forte que `OR`. Sem eles, conquista
             -- comum de outra turma passaria pelo primeiro ramo.
             c.classe_id IS NULL
             OR c.classe_id IN (
                  SELECT ca.classe_id
                    FROM public.classe_aluno ca
                   WHERE ca.aluno_id = v_aluno_id
                )
           )
  LOOP""".replace("{sentinela}", _SENTINELA)


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. As colunas.
    # ------------------------------------------------------------------
    op.execute(
        """
        ALTER TABLE public.conquistas
          ADD COLUMN IF NOT EXISTS classe_id bigint,
          ADD COLUMN IF NOT EXISTS criado_por uuid
        """
    )

    op.execute(
        """
        DO $fk$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.conquistas'::regclass
               AND conname = 'conquistas_classe_id_fkey'
          ) THEN
            ALTER TABLE public.conquistas
              ADD CONSTRAINT conquistas_classe_id_fkey
              FOREIGN KEY (classe_id) REFERENCES public.classe(id) ON DELETE CASCADE;
          END IF;
        END
        $fk$;
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS conquistas_classe_idx
          ON public.conquistas (classe_id) WHERE classe_id IS NOT NULL
        """
    )

    # A unicidade de `tipo` passa a ser POR TURMA. Ver o cabecalho: sem isto a
    # conquista do professor colide com a global de mesmo tipo, e duas turmas
    # nunca podem ter conquistas do mesmo tipo.
    op.execute("DROP INDEX IF EXISTS public.conquistas_tipo_comum_uq")
    op.execute(
        """
        CREATE UNIQUE INDEX conquistas_tipo_comum_uq
          ON public.conquistas (COALESCE(classe_id, -1), tipo)
          WHERE escopo = 'comum'
        """
    )

    op.execute("DROP INDEX IF EXISTS public.conquistas_tipo_perfil_uq")
    op.execute(
        """
        CREATE UNIQUE INDEX conquistas_tipo_perfil_uq
          ON public.conquistas (COALESCE(classe_id, -1), perfil_alvo, tipo)
          WHERE escopo = 'perfil'
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN public.conquistas.classe_id IS
          'Nulo = conquista global (as semeadas por migração). Preenchido = da '
          'turma, cadastrada pelo professor. O gatilho de avaliação filtra por '
          'esta coluna: sem isso o aluno destravaria conquista de outra turma.'
        """
    )

    # ------------------------------------------------------------------
    # 2. O FILTRO. Vem junto da coluna de proposito -- coluna sem filtro e'
    #    uma janela aberta.
    # ------------------------------------------------------------------
    op.execute(
        """
        DO $filtro$
        DECLARE
          v_def text;
          v_ancora text := %(ancora)s;
          v_ocorrencias int;
        BEGIN
          v_def := pg_get_functiondef('public.trg_eventos_aluno_after_iud'::regproc);

          IF position(%(sentinela)s IN v_def) > 0 THEN
            RAISE NOTICE USING MESSAGE =
              'o filtro de classe ja esta no gatilho, nada a fazer';
            RETURN;
          END IF;

          v_ocorrencias := (length(v_def) - length(replace(v_def, v_ancora, '')))
                           / length(v_ancora);

          IF v_ocorrencias <> 1 THEN
            RAISE EXCEPTION USING MESSAGE =
              'a ancora do loop de conquistas aparece ' || v_ocorrencias::text
              || ' vezes em trg_eventos_aluno_after_iud -- esperado exatamente 1';
          END IF;

          EXECUTE replace(v_def, v_ancora, %(substituto)s);
        END
        $filtro$;
        """
        % {
            "ancora": _sql_literal(_ANCORA),
            "sentinela": _sql_literal(_SENTINELA),
            "substituto": _sql_literal(_SUBSTITUTO),
        }
    )

    # ------------------------------------------------------------------
    # 3. Quem le e quem escreve.
    # ------------------------------------------------------------------
    op.execute("DROP POLICY IF EXISTS conquistas_posse_sel ON public.conquistas")
    op.execute(
        """
        CREATE POLICY conquistas_posse_sel ON public.conquistas
          FOR SELECT TO authenticated
          USING (
            classe_id IS NULL
            OR classe_id IN (SELECT public.app_minhas_classes())
            OR classe_id IN (SELECT public.app_classes_do_professor())
          )
        """
    )

    # `classe_id IN app_classes_do_professor()` exclui NULL por construcao:
    # o professor nao cria conquista global nem converte a dele numa.
    for nome, cmd, clausula in (
        ("conquistas_professor_ins", "INSERT", "WITH CHECK"),
        ("conquistas_professor_upd", "UPDATE", "USING"),
        ("conquistas_professor_del", "DELETE", "USING"),
    ):
        op.execute(f"DROP POLICY IF EXISTS {nome} ON public.conquistas")
        extra = (
            " WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()))"
            if cmd == "UPDATE"
            else ""
        )
        op.execute(
            f"""
            CREATE POLICY {nome} ON public.conquistas
              FOR {cmd} TO authenticated
              {clausula} (classe_id IN (SELECT public.app_classes_do_professor()))
              {extra}
            """
        )

    # ------------------------------------------------------------------
    # 4. Teto da recompensa.
    # ------------------------------------------------------------------
    op.execute(
        """
        INSERT INTO public.app_config (chave, valor)
        VALUES ('conquista_recompensa_maxima', '200')
        ON CONFLICT (chave) DO NOTHING
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.trg_conquistas_limita_recompensa()
         RETURNS trigger
         LANGUAGE plpgsql
         SET search_path TO 'public', 'pg_temp'
        AS $function$
        DECLARE
          v_teto numeric;
        BEGIN
          -- Global e' semeada por migracao, por quem desenvolve: nao passa por
          -- aqui. O teto existe para o que vem de formulario.
          IF NEW.classe_id IS NULL THEN
            RETURN NEW;
          END IF;

          v_teto := (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::numeric
                       FROM public.app_config
                      WHERE chave = 'conquista_recompensa_maxima');

          IF v_teto IS NOT NULL AND COALESCE(NEW.pontos_recompensa, 0) > v_teto THEN
            RAISE EXCEPTION USING MESSAGE =
              'recompensa ' || NEW.pontos_recompensa::text
              || ' passa do teto de ' || v_teto::text;
          END IF;

          IF COALESCE(NEW.pontos_recompensa, 0) < 0 THEN
            RAISE EXCEPTION USING MESSAGE = 'recompensa nao pode ser negativa';
          END IF;

          RETURN NEW;
        END;
        $function$
        """
    )

    op.execute(
        "DROP TRIGGER IF EXISTS trg_conquistas_recompensa ON public.conquistas"
    )
    op.execute(
        """
        CREATE TRIGGER trg_conquistas_recompensa
          BEFORE INSERT OR UPDATE ON public.conquistas
          FOR EACH ROW EXECUTE FUNCTION public.trg_conquistas_limita_recompensa()
        """
    )

    # ------------------------------------------------------------------
    # 5. CONFERE: o filtro entrou, e ele de fato separa as turmas.
    # ------------------------------------------------------------------
    op.execute(
        """
        DO $confere$
        DECLARE
          v_def text;
          v_classe_a bigint;
          v_classe_b bigint;
          v_aluno_a uuid;
          v_conq bigint;
          v_destravou boolean;
        BEGIN
          v_def := pg_get_functiondef('public.trg_eventos_aluno_after_iud'::regproc);

          IF position('-- FILTRO DE CLASSE (20260911_06)' IN v_def) = 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'o filtro de classe nao entrou no gatilho de conquistas';
          END IF;

          -- O parenteses e' a diferenca entre filtrar e nao filtrar.
          IF position('AND (' IN v_def) = 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'o filtro entrou sem os parenteses: AND ligaria mais forte que OR';
          END IF;

          SELECT ca.classe_id, ca.aluno_id INTO v_classe_a, v_aluno_a
            FROM public.classe_aluno ca
            JOIN public.classe c ON c.id = ca.classe_id
           LIMIT 1;

          SELECT c.id INTO v_classe_b
            FROM public.classe c
           WHERE c.id <> COALESCE(v_classe_a, -1)
             AND NOT EXISTS (
               SELECT 1 FROM public.classe_aluno ca2
                WHERE ca2.classe_id = c.id AND ca2.aluno_id = v_aluno_a
             )
           LIMIT 1;

          IF v_classe_a IS NULL OR v_classe_b IS NULL THEN
            RAISE NOTICE USING MESSAGE =
              'CONFERE: base sem duas turmas distintas, sonda de isolamento nao executada';
            RETURN;
          END IF;

          BEGIN
            -- Conquista da turma B, trivial de atingir (1 evento basta).
            INSERT INTO public.conquistas
                   (nome, descricao, categoria, tipo, criterio, pontos_recompensa,
                    escopo, classe_id)
            VALUES ('sonda 20260911_06', 'sonda', 'progresso', 'sonda_20260911_06',
                    '{"metrica": "eventos_totais", "minimo": 1}'::jsonb, 1,
                    'comum', v_classe_b)
            RETURNING id INTO v_conq;

            -- Um evento qualquer do aluno da turma A dispara a avaliacao.
            INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, criado_em)
            VALUES (v_aluno_a, 'topico_aberto', NULL, now());

            SELECT EXISTS (
              SELECT 1 FROM public.conquistas_aluno
               WHERE aluno_id = v_aluno_a AND conquista_id = v_conq
            ) INTO v_destravou;

            RAISE EXCEPTION USING ERRCODE = 'ZZ001';
          EXCEPTION WHEN SQLSTATE 'ZZ001' THEN
            NULL;  -- esperado: e' o que desfaz a sonda
          END;

          IF COALESCE(v_destravou, TRUE) THEN
            RAISE EXCEPTION USING MESSAGE =
              'o aluno destravou conquista de turma a qual nao pertence';
          END IF;

          RAISE NOTICE USING MESSAGE =
            'CONFERE: conquista de turma so avalia quem e da turma';
        END
        $confere$;
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_conquistas_recompensa ON public.conquistas"
    )
    op.execute(
        "DROP FUNCTION IF EXISTS public.trg_conquistas_limita_recompensa()"
    )
    op.execute("DELETE FROM public.app_config WHERE chave = 'conquista_recompensa_maxima'")

    for nome in (
        "conquistas_professor_ins",
        "conquistas_professor_upd",
        "conquistas_professor_del",
    ):
        op.execute(f"DROP POLICY IF EXISTS {nome} ON public.conquistas")

    op.execute("DROP POLICY IF EXISTS conquistas_posse_sel ON public.conquistas")
    op.execute(
        """
        CREATE POLICY conquistas_posse_sel ON public.conquistas
          FOR SELECT TO authenticated USING (true)
        """
    )

    # O DELETE vem ANTES de recriar os indices globais: duas turmas com o
    # mesmo tipo impediriam a recriacao do indice unico sem turma.
    op.execute("DELETE FROM public.conquistas WHERE classe_id IS NOT NULL")
    op.execute("DROP INDEX IF EXISTS public.conquistas_tipo_comum_uq")
    op.execute(
        """
        CREATE UNIQUE INDEX conquistas_tipo_comum_uq
          ON public.conquistas (tipo) WHERE escopo = 'comum'
        """
    )
    op.execute("DROP INDEX IF EXISTS public.conquistas_tipo_perfil_uq")
    op.execute(
        """
        CREATE UNIQUE INDEX conquistas_tipo_perfil_uq
          ON public.conquistas (perfil_alvo, tipo) WHERE escopo = 'perfil'
        """
    )

    # As conquistas de turma somem junto com a coluna -- e e' o certo: sem o
    # filtro de volta no gatilho, elas seriam avaliadas para todo mundo.
    op.execute("DELETE FROM public.conquistas WHERE classe_id IS NOT NULL")
    op.execute(
        """
        ALTER TABLE public.conquistas
          DROP COLUMN IF EXISTS classe_id,
          DROP COLUMN IF EXISTS criado_por
        """
    )

    # O filtro sai junto: sem a coluna, `c.classe_id` nao existe e o gatilho
    # quebraria na proxima avaliacao.
    op.execute(
        """
        DO $desfaz$
        DECLARE
          v_def text;
          v_inicio int;
          v_fim int;
        BEGIN
          v_def := pg_get_functiondef('public.trg_eventos_aluno_after_iud'::regproc);
          IF position('-- FILTRO DE CLASSE (20260911_06)' IN v_def) = 0 THEN
            RETURN;
          END IF;

          EXECUTE replace(v_def, %(substituto)s, %(ancora)s);
        END
        $desfaz$;
        """
        % {
            "ancora": _sql_literal(_ANCORA),
            "substituto": _sql_literal(_SUBSTITUTO),
        }
    )
