"""presenca e ponto extra de sala: chegam ao rank, tem motivo e tem historico

Revision ID: 20260911_05
Revises: 20260911_04

## O que estava quebrado antes de qualquer feature nova

`registrar_presenca_da_turma` grava `referencia = 'classe:<id>:<AAAA-MM-DD>'`, e
o comentario dela afirma que "o `split_part(..., ':', 2)` da view continua
achando o id da classe". Nao acha: a view passou a LER a coluna `classe_id`
(20260910_06), e quem preenche essa coluna no INSERT e
`fn_eventos_aluno_resolve_classe_id`, que tira o id de
`fn_eventos_aluno_referencia_id` -- e essa pega os digitos do FIM:

    '^.*:[0-9]+$'

`'classe:32:2026-09-11'` nao casa, porque depois do ultimo `:` vem `2026-09-11`,
que tem hifen. Resultado medido:

    fn_eventos_aluno_referencia_id('classe:32:2026-09-11') -> NULL
    fn_eventos_aluno_resolve_classe_id(...)                -> NULL

E `classe_id` nulo tira o evento do rank inteiro: a CTE `eventos_por_classe` de
`vw_rank_posicoes_por_classe_todas` filtra
`WHERE COALESCE(e.classe_id, ca_conq.classe_id) IS NOT NULL`, e o `LEFT JOIN`
que espalha por turma so vale para `conquista:`. Ou seja: **presenca concedida
pelo professor nunca contaria no ranking**.

Nao apareceu ainda porque ha ZERO eventos de presenca na base -- a feature foi
construida e nunca usada. Apareceria no primeiro uso, e como pontos que somem
em silencio.

A correcao e' ensinar o resolvedor a ler o SEGUNDO segmento quando o prefixo e'
`classe:`, que e' exatamente o que o comentario da RPC ja dizia. Para os outros
prefixos (`topico:`, `conteudo:`, `atividade:`, `conquista:`) nada muda: eles
continuam pelos digitos do fim.

## Ponto extra de atividade em sala

Tipo novo `participacao_extra`. Nao precisa entrar em
`fn_evento_creditado`: ela casa por PREFIXO (`participacao`), entao o valor ja
vem de quem concede em vez de `fn_pontos_do_evento`.

Tres diferencas em relacao a presenca, e nenhuma e' detalhe:

1. **Nao e' um por dia.** Presenca deduplica por `classe:<id>:<data>`, o que
   esta certo -- ha uma aula por dia. Duas atividades em sala no mesmo dia sao
   dois creditos, e com a mesma referencia a segunda cairia no `DO NOTHING` sem
   erro nenhum. Por isso a referencia do extra leva um slug do motivo:
   `classe:<id>:<data>:<slug>`. Clicar duas vezes na MESMA atividade continua
   pagando uma vez.
2. **Motivo e' obrigatorio.** E' o rotulo que o historico mostra e e' o que
   torna a deduplicacao acima possivel. Sem ele, "pontos extras" viraria uma
   linha sem explicacao na pontuacao do aluno.
3. **Valor tem teto**, em `app_config.credito_extra_maximo`. O professor digita
   o valor, e um zero a mais viraria lider de turma sem recurso -- `valor` e'
   justamente a coluna que o rank soma.

## Historico

`vw_creditos_concedidos`, com `security_invoker = on`: a RLS de `eventos_aluno`
ja diz quem ve o que (o aluno ve o proprio, o professor ve os alunos das classes
dele), entao a view nao precisa repetir o filtro -- e, rodando como invoker, nao
pode virar um bypass. Nao junta `professor`: a policy daquela tabela e'
own-or-owner, entao o nome do professor voltaria nulo para o aluno e daria a
impressao de dado faltando.

Create Date: 2026-09-11
"""

from alembic import op

revision = "20260911_05"
down_revision = "20260911_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. O motivo do credito.
    # ------------------------------------------------------------------
    op.execute(
        """
        ALTER TABLE public.eventos_aluno
          ADD COLUMN IF NOT EXISTS motivo text
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN public.eventos_aluno.motivo IS
          'Rótulo de um crédito concedido pelo professor -- o que o histórico '
          'mostra. Obrigatório em participacao_extra, onde também entra na '
          'referência para a deduplicação. Nulo em evento gerado pelo app.'
        """
    )

    # ------------------------------------------------------------------
    # 2. `motivo` congela no UPDATE, junto do resto que descreve a concessao.
    #    Sem isto o aluno reescreve a justificativa do proprio credito.
    # ------------------------------------------------------------------
    op.execute(
        """
        DO $congela$
        DECLARE
          v_def text;
          v_ancora text := 'NEW.aluno_id := OLD.aluno_id;';
        BEGIN
          v_def := pg_get_functiondef('public.trg_eventos_aluno_valor_do_banco'::regproc);

          IF position('NEW.motivo := OLD.motivo;' IN v_def) > 0 THEN
            RAISE NOTICE USING MESSAGE = 'motivo ja congelado, nada a fazer';
            RETURN;
          END IF;

          -- A ancora tem de ser unica: substituir a primeira de varias deixaria
          -- o resto da funcao incoerente sem erro nenhum.
          IF (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 THEN
            RAISE EXCEPTION USING MESSAGE =
              'ancora do congelamento nao e unica em trg_eventos_aluno_valor_do_banco';
          END IF;

          EXECUTE replace(
            v_def,
            v_ancora,
            v_ancora || chr(10) || '    NEW.motivo := OLD.motivo;'
          );
        END
        $congela$;
        """
    )

    # ------------------------------------------------------------------
    # 3. O resolvedor aprende a ler o segundo segmento de `classe:<id>:...`.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_resolve_classe_id(
          p_tipo text, p_referencia text
        )
         RETURNS bigint
         LANGUAGE sql
         STABLE
         SET search_path TO 'public', 'pg_temp'
        AS $function$
          WITH ref AS (
            SELECT public.fn_eventos_aluno_referencia_id(p_referencia) AS ref_id,
                   TRIM(BOTH FROM COALESCE(p_referencia, ''::text))    AS bruta
          ), alvo AS (
            SELECT ref.ref_id,
                   ref.bruta,
                   COALESCE(
                     CASE WHEN position(':' in ref.bruta) > 0 THEN
                       CASE lower(split_part(ref.bruta, ':', 1))
                         WHEN 'topico' THEN 'topico'
                         WHEN 'topic' THEN 'topico'
                         WHEN 'conteudo' THEN 'conteudo'
                         WHEN 'content' THEN 'conteudo'
                         WHEN 'atividade' THEN 'atividade'
                         WHEN 'activity' THEN 'atividade'
                         WHEN 'classe' THEN 'classe'
                         WHEN 'class' THEN 'classe'
                         WHEN 'conquista' THEN 'conquista'
                         ELSE NULL::text
                       END
                     END,
                     CASE
                       WHEN starts_with(lower(COALESCE(p_tipo, ''::text)), 'topico') THEN 'topico'
                       WHEN starts_with(lower(COALESCE(p_tipo, ''::text)), 'conteudo') THEN 'conteudo'
                       WHEN starts_with(lower(COALESCE(p_tipo, ''::text)), 'atividade') THEN 'atividade'
                       ELSE NULL::text
                     END
                   ) AS entidade
              FROM ref
          ), com_classe AS (
            -- `classe:<id>:<data>` e `classe:<id>:<data>:<slug>` -- o id e' o
            -- SEGUNDO segmento, por construcao da RPC que grava. Tirar os
            -- digitos do fim (que e' o que `fn_eventos_aluno_referencia_id`
            -- faz) devolvia NULL para a data com hifen, e classe nula tira o
            -- evento do rank.
            SELECT alvo.*,
                   CASE
                     WHEN alvo.entidade = 'classe' THEN
                       NULLIF(regexp_replace(split_part(alvo.bruta, ':', 2), '[^0-9]', '', 'g'), '')::bigint
                     ELSE alvo.ref_id
                   END AS id_alvo
              FROM alvo
          )
          SELECT COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id)
          FROM com_classe
          LEFT JOIN public.topicos t    ON com_classe.entidade = 'topico'    AND t.id = com_classe.id_alvo
          LEFT JOIN public.conteudos c  ON com_classe.entidade = 'conteudo'  AND c.id = com_classe.id_alvo
          LEFT JOIN public.topicos t_c  ON t_c.id = c.topico_id
          LEFT JOIN public.atividades a ON com_classe.entidade = 'atividade' AND a.id = com_classe.id_alvo
          LEFT JOIN public.topicos t_a  ON t_a.id = a.topico_id
          LEFT JOIN public.classe cl    ON com_classe.entidade = 'classe'    AND cl.id = com_classe.id_alvo;
        $function$
        """
    )

    # ------------------------------------------------------------------
    # 4. Teto do credito extra. Fica em `app_config` porque e' parametro de
    #    operacao, ao lado de `presenca_aula_pontos` e `rank_limite_visivel`.
    # ------------------------------------------------------------------
    op.execute(
        """
        INSERT INTO public.app_config (chave, valor)
        VALUES ('credito_extra_maximo', '100')
        ON CONFLICT (chave) DO NOTHING
        """
    )

    # ------------------------------------------------------------------
    # 5. A RPC geral. Uma so' para os tres tipos: os quatro bloqueios (sessao,
    #    posse da classe, tipo permitido, valor valido) sao os mesmos, e duas
    #    copias deles divergiriam.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.registrar_credito_da_turma(
          p_classe_id bigint,
          p_alunos uuid[] DEFAULT NULL::uuid[],
          p_tipo text DEFAULT 'presenca_aula'::text,
          p_valor numeric DEFAULT NULL::numeric,
          p_data date DEFAULT NULL::date,
          p_motivo text DEFAULT NULL::text
        )
         RETURNS integer
         LANGUAGE plpgsql
         SECURITY DEFINER
         SET search_path TO 'public', 'pg_temp'
        AS $function$
        DECLARE
          v_professor uuid := auth.uid();
          v_data      date := COALESCE(p_data, CURRENT_DATE);
          v_valor     numeric;
          v_teto      numeric;
          v_motivo    text := NULLIF(TRIM(BOTH FROM COALESCE(p_motivo, '')), '');
          v_slug      text;
          v_ref       text;
          v_qtd       integer;
        BEGIN
          IF v_professor IS NULL THEN
            RAISE EXCEPTION 'sem sessao';
          END IF;

          -- A classe tem que ser dele. Sem isto, um professor daria credito na
          -- turma de outro.
          IF p_classe_id IS NULL
             OR p_classe_id NOT IN (SELECT public.app_classes_do_professor()) THEN
            RAISE EXCEPTION USING MESSAGE = 'classe ' || p_classe_id::text || ' nao e sua';
          END IF;

          IF p_tipo NOT IN ('presenca_aula', 'participacao_aula', 'participacao_extra') THEN
            RAISE EXCEPTION USING MESSAGE = 'tipo ' || p_tipo || ' nao pode ser concedido';
          END IF;

          IF p_tipo = 'participacao_extra' THEN
            -- Obrigatorio: e' o rotulo do historico E o que separa duas
            -- atividades do mesmo dia na deduplicacao. Sem ele, a segunda
            -- cairia no DO NOTHING sem erro e o professor acharia que pagou.
            IF v_motivo IS NULL THEN
              RAISE EXCEPTION USING MESSAGE =
                'participacao_extra exige motivo: e o rotulo do historico';
            END IF;

            IF p_valor IS NULL THEN
              RAISE EXCEPTION USING MESSAGE =
                'participacao_extra exige valor: nao ha padrao para atividade de sala';
            END IF;
          END IF;

          v_valor := COALESCE(
            p_valor,
            (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::numeric
               FROM public.app_config WHERE chave = 'presenca_aula_pontos')
          );

          IF v_valor IS NULL OR v_valor <= 0 THEN
            RAISE EXCEPTION USING MESSAGE = 'valor invalido para ' || p_tipo;
          END IF;

          -- Teto: `valor` e' a coluna que o rank soma, e um zero a mais viraria
          -- lider de turma sem recurso.
          v_teto := (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::numeric
                       FROM public.app_config WHERE chave = 'credito_extra_maximo');
          IF v_teto IS NOT NULL AND v_valor > v_teto THEN
            RAISE EXCEPTION USING MESSAGE =
              'valor ' || v_valor::text || ' passa do teto de ' || v_teto::text;
          END IF;

          -- O id da classe fica no SEGUNDO segmento: e' de la que
          -- `fn_eventos_aluno_resolve_classe_id` le, e sem isso o evento nasce
          -- com classe nula e nao chega ao rank.
          v_ref := 'classe:' || p_classe_id::text || ':' || to_char(v_data, 'YYYY-MM-DD');

          IF p_tipo = 'participacao_extra' THEN
            v_slug := NULLIF(
              left(regexp_replace(lower(v_motivo), '[^a-z0-9]+', '-', 'g'), 40),
              ''
            );
            -- Motivo que vira slug vazio (so simbolos) ainda precisa de chave
            -- propria, senao dois creditos diferentes colidem.
            v_ref := v_ref || ':' || COALESCE(v_slug, md5(v_motivo));
          END IF;

          INSERT INTO public.eventos_aluno
                 (aluno_id, tipo, referencia, valor, criado_em, concedido_por, motivo)
          SELECT ca.aluno_id, p_tipo, v_ref, v_valor, now(), v_professor, v_motivo
            FROM public.classe_aluno ca
           WHERE ca.classe_id = p_classe_id
             AND (p_alunos IS NULL OR ca.aluno_id = ANY(p_alunos))
          ON CONFLICT (aluno_id, tipo, referencia)
            WHERE tipo IN ('presenca_aula', 'participacao_aula', 'conquista_desbloqueada')
            DO NOTHING;

          GET DIAGNOSTICS v_qtd = ROW_COUNT;
          RETURN v_qtd;
        END;
        $function$
        """
    )

    # A RPC antiga passa a delegar. O console ja a chama, e trocar a chamada
    # dele e' outro commit -- duas implementacoes das mesmas quatro guardas e'
    # o que nao pode existir.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.registrar_presenca_da_turma(
          p_classe_id bigint,
          p_alunos uuid[] DEFAULT NULL::uuid[],
          p_tipo text DEFAULT 'presenca_aula'::text,
          p_valor numeric DEFAULT NULL::numeric,
          p_data date DEFAULT NULL::date
        )
         RETURNS integer
         LANGUAGE sql
         SECURITY DEFINER
         SET search_path TO 'public', 'pg_temp'
        AS $function$
          SELECT public.registrar_credito_da_turma(
            p_classe_id, p_alunos, p_tipo, p_valor, p_data, NULL
          );
        $function$
        """
    )

    op.execute(
        """
        REVOKE ALL ON FUNCTION public.registrar_credito_da_turma(
          bigint, uuid[], text, numeric, date, text
        ) FROM PUBLIC, anon
        """
    )
    op.execute(
        """
        GRANT EXECUTE ON FUNCTION public.registrar_credito_da_turma(
          bigint, uuid[], text, numeric, date, text
        ) TO authenticated
        """
    )

    # ------------------------------------------------------------------
    # 6. O historico.
    # ------------------------------------------------------------------
    op.execute("DROP VIEW IF EXISTS public.vw_creditos_concedidos")
    op.execute(
        """
        CREATE VIEW public.vw_creditos_concedidos AS
          SELECT e.id,
                 e.aluno_id,
                 a.nome           AS nome_aluno,
                 e.classe_id,
                 e.tipo,
                 e.valor,
                 e.motivo,
                 e.concedido_por,
                 e.criado_em,
                 COALESCE(
                   NULLIF(split_part(COALESCE(e.referencia, ''), ':', 3), '')::date,
                   e.criado_em::date
                 ) AS data_credito
            FROM public.eventos_aluno e
            JOIN public.alunos a ON a.id = e.aluno_id
           WHERE e.concedido_por IS NOT NULL
             AND public.fn_evento_creditado(e.tipo)
             AND e.tipo <> 'conquista_desbloqueada'
        """
    )

    # `security_invoker = on`: a RLS de `eventos_aluno` e de `alunos` ja resolve
    # a audiencia, e como dono a view seria um bypass -- foi assim que se lia
    # ranking e telemetria sem login antes da 20260826_10.
    op.execute("ALTER VIEW public.vw_creditos_concedidos SET (security_invoker = on)")
    op.execute("REVOKE ALL ON public.vw_creditos_concedidos FROM PUBLIC, anon")
    op.execute("GRANT SELECT ON public.vw_creditos_concedidos TO authenticated")

    op.execute(
        """
        COMMENT ON VIEW public.vw_creditos_concedidos IS
          'Histórico de crédito concedido pelo professor (presença, participação '
          'e ponto extra de sala). Roda como invoker: a RLS de eventos_aluno diz '
          'quem vê o quê. Exclui conquista, que não é concedida à mão e tem '
          'classe nula de propósito.'
        """
    )

    # ------------------------------------------------------------------
    # 7. CONFERE de comportamento, desfeito por excecao no fim.
    # ------------------------------------------------------------------
    op.execute(
        """
        DO $confere$
        DECLARE
          v_classe bigint;
          v_aluno uuid;
          v_id bigint;
          v_classe_resolvida bigint;
          v_motivo_depois text;
          v_ref_base text;
          -- Literal montado por concatenacao. `text()` do SQLAlchemy varre a
          -- string CRUA e le dois-pontos seguido de digitos como nome de bind
          -- parameter -- inclusive dentro de comentario SQL, que ele nao
          -- reconhece. Escrever a data colada no dois-pontos, aqui ou num
          -- comentario, faz a migracao falhar antes de chegar ao banco.
          v_dia text := '2026-09-11';
        BEGIN
          -- Conquista tem classe nula de proposito, e isso vale sem depender de
          -- dado: a entidade `conquista` nao tem join para classe.
          IF public.fn_eventos_aluno_resolve_classe_id(
               'conquista_desbloqueada', 'conquista' || ':' || '1'
             ) IS NOT NULL THEN
            RAISE EXCEPTION USING MESSAGE =
              'conquista deixou de ter classe nula, e ela e nula de proposito';
          END IF;

          -- Daqui para baixo precisa de classe REAL: o resolvedor termina num
          -- join com `classe`, entao um id inventado devolve nulo e o teste
          -- acusaria a funcao por um defeito do proprio teste.
          SELECT ca.classe_id, ca.aluno_id INTO v_classe, v_aluno
            FROM public.classe_aluno ca
            JOIN public.classe c ON c.id = ca.classe_id
           LIMIT 1;

          IF v_classe IS NULL THEN
            RAISE NOTICE USING MESSAGE =
              'CONFERE: sem matricula na base, sonda nao executada';
            RETURN;
          END IF;

          v_ref_base := 'classe:' || v_classe::text || ':' || v_dia;

          IF public.fn_eventos_aluno_resolve_classe_id('presenca_aula', v_ref_base)
             IS DISTINCT FROM v_classe THEN
            RAISE EXCEPTION USING MESSAGE =
              'o resolvedor ainda nao le o segundo segmento da referencia de classe';
          END IF;

          IF public.fn_eventos_aluno_resolve_classe_id(
               'participacao_extra', v_ref_base || ':' || 'exercicio-de-sala'
             ) IS DISTINCT FROM v_classe THEN
            RAISE EXCEPTION USING MESSAGE =
              'o resolvedor nao aceita o slug do motivo na referencia';
          END IF;

          BEGIN
            INSERT INTO public.eventos_aluno
                   (aluno_id, tipo, referencia, valor, criado_em, concedido_por, motivo)
            VALUES (v_aluno, 'participacao_extra', v_ref_base || ':' || 'confere',
                    7, now(), v_aluno, 'sonda')
            RETURNING id, classe_id INTO v_id, v_classe_resolvida;

            UPDATE public.eventos_aluno SET motivo = 'reescrito pelo aluno' WHERE id = v_id;
            SELECT motivo INTO v_motivo_depois FROM public.eventos_aluno WHERE id = v_id;

            RAISE EXCEPTION USING ERRCODE = 'ZZ001';
          EXCEPTION WHEN SQLSTATE 'ZZ001' THEN
            NULL;  -- esperado: e' o que desfaz a sonda
          END;

          IF v_classe_resolvida IS DISTINCT FROM v_classe THEN
            RAISE EXCEPTION USING MESSAGE =
              'credito extra nasceu com classe ' || COALESCE(v_classe_resolvida::text, 'nula')
              || ' em vez de ' || v_classe::text || ' -- nao chegaria ao rank';
          END IF;

          IF COALESCE(v_motivo_depois, '') <> 'sonda' THEN
            RAISE EXCEPTION USING MESSAGE =
              'o motivo nao congelou no UPDATE: virou ' || COALESCE(v_motivo_depois, 'nulo');
          END IF;

          RAISE NOTICE USING MESSAGE =
            'CONFERE: credito nasce com classe, motivo congela e o historico existe';
        END
        $confere$;
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS public.vw_creditos_concedidos")
    op.execute(
        """
        DROP FUNCTION IF EXISTS public.registrar_credito_da_turma(
          bigint, uuid[], text, numeric, date, text
        )
        """
    )
    op.execute("DELETE FROM public.app_config WHERE chave = 'credito_extra_maximo'")
    # A coluna `motivo` fica: ela e' anulavel e pode ter dado. O congelamento
    # dela no gatilho tambem fica -- desfazer reabriria um buraco sem motivo.
    #
    # `registrar_presenca_da_turma` e `fn_eventos_aluno_resolve_classe_id` NAO
    # voltam ao corpo antigo: os dois estavam com defeito (presenca nascia com
    # classe nula e nao chegava ao rank). Reverter seria reintroduzir isso.
