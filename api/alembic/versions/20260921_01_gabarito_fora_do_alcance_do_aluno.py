"""o gabarito sai da tabela que o aluno pode ler

Revision ID: 20260921_01
Revises: 20260920_07
Create Date: 2026-09-21

O aluno recebia a resposta junto com a questao. Nao era so a tela mostrando --
o DADO era legivel. Medido nesta base, assumindo a role `authenticated` com o
JWT do aluno:

    SELECT id, enunciado, resposta_correta FROM questoes;
    1061 | Um sistema distribuido e percebido... | Verdadeiro
    1062 | Qual categoria da Taxonomia de Flynn  | SISD
    1063 | Na taxonomia de Flynn, SIMD significa | Data
    1064 | Sistemas fortemente acoplados...      | Falso

Com a chave publica do app, qualquer cliente HTTP baixa o gabarito inteiro das
turmas em que o aluno esta matriculado. E o app tambem corrigia localmente
(`QuestionActivity` lia `questao.resposta_correta`), entao a resposta PRECISAVA
estar no payload.

## Por que nao bastava tirar da view

`vw_aluno_classe_detalhado` e `security_invoker = on`: ela le `questoes` COMO O
ALUNO. E RLS e por LINHA, nao por coluna -- o aluno tem duas policies de leitura
(`aluno_select_questoes` e `questoes_posse_sel`), entao a linha vem inteira,
com a coluna junto. Tirar o campo da view seria cosmetico: bastava consultar a
tabela direto.

## A forma

O gabarito passa a viver em `questao_gabarito`, cuja RLS so deixa o PROFESSOR
da turma ler. O aluno nao tem policy nenhuma ali -- nao ve linha, entao nao ha
coluna a vazar.

**As escritas nao mudam em lugar nenhum.** Um gatilho em `questoes` espelha
`resposta_correta` para a tabela protegida a cada INSERT/UPDATE. O console do
professor, a API e o pipeline de personalizacao continuam gravando onde sempre
gravaram; so as LEITURAS mudam de lugar. Isso e o que mantem o raio pequeno: um
unico `select` no console pedia a coluna (`topicsApi.ts`).

E `SELECT (resposta_correta)` sai de `anon` e de `authenticated`. Privilegio de
coluna e por ROLE, e aluno e professor sao os dois `authenticated` -- e por isso
que o professor passa a ler pela tabela nova, que distingue por POSSE. INSERT e
UPDATE da coluna continuam liberados: o professor precisa escrever, e escrever
nao vaza.

## A correcao passa a ser do servidor

`questao_responder` recebe a resposta, corrige contra o gabarito protegido,
grava em `questao_aluno` e devolve o veredito -- e a resposta certa **so depois
de responder**. E o mesmo desenho de `arena_responder`/`arena_desafio`, pelo
mesmo motivo.

A coluna `questoes.resposta_correta` FICA por enquanto: ela e a fonte que o
gatilho espelha, e derruba-la exige migrar os escritores dos tres servicos.
Ela ja nao e legivel por ninguem que nao seja dono do dado.
"""

from alembic import op

revision = "20260921_01"
down_revision = "20260920_07"
branch_labels = None
depends_on = None


_FUNCOES = ("questao_responder(bigint, text, integer)",)

# Tudo de `questoes` MENOS o gabarito. Explicita de proposito: e a lista que
# alguem revisa num diff, e a guarda no fim recusa coluna que nao esteja aqui.
_COLUNAS_VISIVEIS = (
    "id",
    "atividade_id",
    "enunciado",
    "tipo",
    "alternativas",
    "midia_url",
    "created_at",
    "nota_estabelecida",
)


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.questao_gabarito (
          questao_id       bigint PRIMARY KEY
                           REFERENCES public.questoes(id) ON DELETE CASCADE,
          resposta_correta text,
          atualizado_em    timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("ALTER TABLE public.questao_gabarito ENABLE ROW LEVEL SECURITY")

    # O professor DONO da turma le e escreve. O aluno nao tem policy: nao ve
    # linha nenhuma, entao nao ha coluna a vazar. `app_classe_da_atividade` e
    # `app_classes_do_professor` sao os mesmos helpers que as policies de
    # `questoes` ja usam -- repetir o EXISTS aqui criaria uma segunda regra.
    op.execute(
        """
        DROP POLICY IF EXISTS questao_gabarito_professor ON public.questao_gabarito
        """
    )
    op.execute(
        """
        CREATE POLICY questao_gabarito_professor ON public.questao_gabarito
          FOR ALL TO authenticated
          USING (
            public.app_classe_da_atividade(
              (SELECT q.atividade_id FROM public.questoes q WHERE q.id = questao_id)
            ) IN (SELECT public.app_classes_do_professor())
          )
          WITH CHECK (
            public.app_classe_da_atividade(
              (SELECT q.atividade_id FROM public.questoes q WHERE q.id = questao_id)
            ) IN (SELECT public.app_classes_do_professor())
          )
        """
    )

    op.execute(
        """
        INSERT INTO public.questao_gabarito (questao_id, resposta_correta)
        SELECT q.id, q.resposta_correta FROM public.questoes q
        ON CONFLICT (questao_id) DO UPDATE
          SET resposta_correta = EXCLUDED.resposta_correta,
              atualizado_em = now()
        """
    )

    # O espelho. E' ele que deixa TODO escritor existente intacto -- console do
    # professor, API e pipeline continuam gravando em `questoes`.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_questoes_espelha_gabarito()
          RETURNS trigger
          LANGUAGE plpgsql SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
        BEGIN
          INSERT INTO public.questao_gabarito (questao_id, resposta_correta)
          VALUES (NEW.id, NEW.resposta_correta)
          ON CONFLICT (questao_id) DO UPDATE
            SET resposta_correta = EXCLUDED.resposta_correta,
                atualizado_em = now();
          RETURN NEW;
        END
        $fn$
        """
    )
    op.execute("DROP TRIGGER IF EXISTS trg_questoes_espelha_gabarito ON public.questoes")
    op.execute(
        """
        CREATE TRIGGER trg_questoes_espelha_gabarito
          AFTER INSERT OR UPDATE OF resposta_correta ON public.questoes
          FOR EACH ROW EXECUTE FUNCTION public.fn_questoes_espelha_gabarito()
        """
    )

    # A correcao vai para o servidor. O `tempo_gasto_seg` e a LATENCIA da
    # tentativa, a mesma grandeza que `QuestionActivity` ja media -- nao e
    # permanencia de telemetria.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.questao_responder(
          p_questao_id bigint,
          p_resposta text,
          p_tempo_gasto_seg integer DEFAULT NULL
        ) RETURNS jsonb
          LANGUAGE plpgsql SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
        DECLARE
          v_me        uuid := auth.uid();
          v_q         public.questoes%ROWTYPE;
          v_gabarito  text;
          v_correta   boolean;
          v_tentativa integer;
          v_tempo     integer;
        BEGIN
          IF v_me IS NULL THEN
            RAISE EXCEPTION 'questao_sem_sessao';
          END IF;

          SELECT * INTO v_q FROM public.questoes WHERE id = p_questao_id;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'questao_inexistente';
          END IF;

          -- Matricula na turma da questao. Sem isto a RPC responderia questao
          -- de turma alheia -- e ela roda como dono, entao a RLS nao a segura.
          IF NOT EXISTS (
            SELECT 1
              FROM public.atividades a
              JOIN public.topicos t ON t.id = a.topico_id
              JOIN public.classe_aluno ca ON ca.classe_id = t.classe_id
             WHERE a.id = v_q.atividade_id AND ca.aluno_id = v_me
          ) THEN
            RAISE EXCEPTION 'questao_sem_permissao';
          END IF;

          SELECT g.resposta_correta INTO v_gabarito
            FROM public.questao_gabarito g WHERE g.questao_id = p_questao_id;

          v_correta := lower(btrim(COALESCE(p_resposta, '')))
                     = lower(btrim(COALESCE(v_gabarito, '')));

          -- Teto de 1h: o numero vem do relogio do aparelho.
          v_tempo := NULLIF(LEAST(GREATEST(COALESCE(p_tempo_gasto_seg, 0), 0), 3600), 0);

          SELECT COALESCE(max(tentativa), 0) + 1 INTO v_tentativa
            FROM public.questao_aluno
           WHERE aluno_id = v_me AND questao_id = p_questao_id;

          INSERT INTO public.questao_aluno
                 (aluno_id, questao_id, atividade_id, tentativa, resposta,
                  correta, acertos_percentual, tempo_gasto_seg)
          VALUES (v_me, p_questao_id, v_q.atividade_id, v_tentativa,
                  COALESCE(p_resposta, ''), v_correta,
                  CASE WHEN v_correta THEN 100 ELSE 0 END, v_tempo);

          -- A resposta certa so sai DEPOIS de responder. Antes disso ela nao
          -- aparece em payload nenhum.
          RETURN jsonb_build_object(
            'correta', v_correta,
            'tentativa', v_tentativa,
            'resposta_correta', v_gabarito
          );
        END
        $fn$
        """
    )

    for assinatura in _FUNCOES:
        op.execute(f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon")
        op.execute(f"GRANT EXECUTE ON FUNCTION public.{assinatura} TO authenticated")

    # **REVOKE de COLUNA nao anula GRANT de TABELA.** Privilegio de coluna e
    # ADITIVO: `authenticated` tinha `SELECT` na tabela inteira, que ja implica
    # todas as colunas, e um `REVOKE SELECT (resposta_correta)` por cima nao
    # tira nada. Medido -- a guarda no fim desta migracao reprovou a primeira
    # tentativa exatamente assim.
    #
    # A forma certa e derrubar o SELECT da tabela e conceder coluna a coluna.
    # INSERT e UPDATE ficam intactos: o professor escreve o gabarito, e
    # escrever nao vaza. `service_role` tem grant proprio e nao e atingido --
    # a API e o microservice usam SERVICE_ROLE_KEY.
    op.execute("REVOKE SELECT ON public.questoes FROM anon, authenticated")
    op.execute(
        f"""
        GRANT SELECT ({", ".join(_COLUNAS_VISIVEIS)})
          ON public.questoes TO authenticated
        """
    )

    # Coluna nova nasceria SEM grant, e o aluno pararia de ve-la calado. A
    # guarda obriga quem acrescentar coluna a decidir se ela e publica.
    op.execute(
        f"""
        DO $confere$
        DECLARE v_nova text;
        BEGIN
          SELECT string_agg(a.attname, ', ') INTO v_nova
            FROM pg_attribute a
           WHERE a.attrelid = 'public.questoes'::regclass
             AND a.attnum > 0 AND NOT a.attisdropped
             AND a.attname <> 'resposta_correta'
             AND a.attname <> ALL (ARRAY[{", ".join(repr(c) for c in _COLUNAS_VISIVEIS)}]);
          IF v_nova IS NOT NULL THEN
            RAISE EXCEPTION USING MESSAGE =
              'coluna de questoes fora da lista de visiveis: ' || v_nova
              || ' -- decida se o aluno pode le-la';
          END IF;
        END
        $confere$;
        """
    )

    op.execute(
        """
        DO $confere$
        BEGIN
          IF has_column_privilege('authenticated', 'public.questoes',
                                  'resposta_correta', 'SELECT') THEN
            RAISE EXCEPTION USING MESSAGE =
              'authenticated ainda le questoes.resposta_correta';
          END IF;
          IF NOT has_column_privilege('authenticated', 'public.questoes',
                                      'enunciado', 'SELECT') THEN
            RAISE EXCEPTION USING MESSAGE =
              'o revoke derrubou o enunciado junto -- o aluno ficou sem questao';
          END IF;
          IF NOT has_column_privilege('authenticated', 'public.questoes',
                                      'resposta_correta', 'UPDATE') THEN
            RAISE EXCEPTION USING MESSAGE =
              'o professor perdeu a escrita do gabarito';
          END IF;
        END
        $confere$;
        """
    )


def downgrade() -> None:
    op.execute("GRANT SELECT ON public.questoes TO anon, authenticated")
    for assinatura in _FUNCOES:
        op.execute(f"DROP FUNCTION IF EXISTS public.{assinatura}")
    op.execute("DROP TRIGGER IF EXISTS trg_questoes_espelha_gabarito ON public.questoes")
    op.execute("DROP FUNCTION IF EXISTS public.fn_questoes_espelha_gabarito()")
    # A tabela FICA: ela e copia de `questoes.resposta_correta`, entao apaga-la
    # nao perde dado, mas derrubar o espelho e depois voltar deixaria o gabarito
    # velho. Quem quiser some-la faz isso explicitamente.
