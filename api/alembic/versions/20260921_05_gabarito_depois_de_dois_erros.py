"""o gabarito so aparece depois de acertar ou de errar duas vezes

Revision ID: 20260921_05
Revises: 20260921_04
Create Date: 2026-09-21

`questao_responder` devolvia `resposta_correta` em TODA chamada, inclusive na
primeira resposta errada. Medido nesta base, antes desta migracao:

    questao_responder(1065,'COMA',7)
      -> {"correta": false, "tentativa": 1, "resposta_correta": "UMA"}

Ou seja: errar uma vez entregava a resposta. E entregava no PAYLOAD, o que a
tela nao consegue desfazer -- esconder na interface deixa o valor no trafego,
que e exatamente o modo de falha que a `20260921_01` fechou para a coluna.

A regra passa a ser: **o gabarito e' liberado quando o aluno acerta, ou a
partir do SEGUNDO erro.** Ela mora aqui, no servidor, e nao na tela, porque
cliente nao esconde o que ja recebeu.

Quatro coisas que nao sao acidentais:

1. **Conta ERRO, nao tentativa.** `tentativa` cresce tambem quando o aluno
   acerta e responde de novo para revisar; usa-la faria a segunda visita a uma
   questao ja acertada parecer o segundo erro. O que a regra pesa e' a
   dificuldade, e dificuldade se mede em erro.
2. **O erro da vez entra na conta.** A contagem roda DEPOIS do INSERT, entao o
   segundo erro libera na hora -- nao no terceiro. Contar antes de inserir
   deslocaria a regra em um e ninguem notaria: o aluno so veria a resposta uma
   tentativa tarde demais.
3. **`gabarito_liberado` e' campo proprio, nao `resposta_correta IS NOT NULL`.**
   Questao sem linha em `questao_gabarito` tambem devolve nulo, e as duas
   situacoes dizem coisas diferentes na tela: "ainda nao" contra "nao existe".
   Sem o campo, a tela anunciaria "sem gabarito" para quem so precisa errar
   mais uma vez.
4. **`CREATE OR REPLACE` nao preserva `SET search_path`** -- a clausula e'
   redeclarada aqui, como o `CLAUDE.md` registra. E antes de substituir, o `DO`
   abaixo confere que o corpo vivo ainda tem as quatro guardas da `20260921_02`
   (sessao, existencia, matricula, `fn_questao_confere`): substituir funcao que
   cresceu por emenda apaga regra em silencio.

Medido depois, em transacao revertida, com o JWT de um aluno matriculado:

    1o erro  -> {"correta": false, "erros": 1, "gabarito_liberado": false,
                 "resposta_correta": null}
    2o erro  -> {"correta": false, "erros": 2, "gabarito_liberado": true,
                 "resposta_correta": "UMA"}
    acerto   -> {"correta": true,  "erros": 0, "gabarito_liberado": true,
                 "resposta_correta": "SISD"}
"""

from alembic import op

revision = "20260921_05"
down_revision = "20260921_04"
branch_labels = None
depends_on = None


_ASSINATURA = "questao_responder(bigint, text, integer)"

# As guardas que a `20260921_02` pos no corpo. Se alguma sumiu, o corpo vivo
# nao e' mais o que esta migracao pensa que e' -- e substituir apagaria regra.
_GUARDAS = (
    "questao_sem_sessao",
    "questao_inexistente",
    "questao_sem_permissao",
    "fn_questao_confere",
)


def upgrade() -> None:
    faltando = " OR ".join(
        f"position('{guarda}' in v_corpo) = 0" for guarda in _GUARDAS
    )
    op.execute(
        f"""
        DO $guarda$
        DECLARE v_corpo text;
        BEGIN
          SELECT p.prosrc INTO v_corpo
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'questao_responder';

          IF v_corpo IS NULL THEN
            RAISE EXCEPTION 'questao_responder nao existe: rode a 20260921_02 antes';
          END IF;

          IF {faltando} THEN
            RAISE EXCEPTION
              'o corpo vivo de questao_responder perdeu alguma guarda da 20260921_02; '
              'compare antes de substituir';
          END IF;
        END
        $guarda$
        """
    )

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
          v_erros     integer;
          v_liberado  boolean;
        BEGIN
          IF v_me IS NULL THEN
            RAISE EXCEPTION 'questao_sem_sessao';
          END IF;

          SELECT * INTO v_q FROM public.questoes WHERE id = p_questao_id;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'questao_inexistente';
          END IF;

          IF NOT EXISTS (
            SELECT 1
              FROM public.atividades a
              JOIN public.topicos t ON t.id = a.topico_id
              JOIN public.classe_aluno ca ON ca.classe_id = t.classe_id
             WHERE a.id = v_q.atividade_id AND ca.aluno_id = v_me
          ) THEN
            RAISE EXCEPTION 'questao_sem_permissao';
          END IF;

          v_correta := public.fn_questao_confere(p_questao_id, p_resposta);

          SELECT g.resposta_correta INTO v_gabarito
            FROM public.questao_gabarito g WHERE g.questao_id = p_questao_id;

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

          -- Depois do INSERT de proposito: o erro da vez tem de contar, senao
          -- a regra escorrega um e o aluno so ve a resposta uma tentativa
          -- tarde demais.
          SELECT count(*) INTO v_erros
            FROM public.questao_aluno
           WHERE aluno_id = v_me AND questao_id = p_questao_id
             AND correta IS FALSE;

          -- Acertou: ve o gabarito porque ja o produziu. Errou duas vezes: ve
          -- porque insistir sem saber onde errou nao ensina nada.
          v_liberado := v_correta OR v_erros >= 2;

          RETURN jsonb_build_object(
            'correta', v_correta,
            'tentativa', v_tentativa,
            'erros', v_erros,
            'gabarito_liberado', v_liberado,
            -- Nulo enquanto nao liberado: esconder na tela deixaria o valor no
            -- trafego, e o aluno le o trafego.
            'resposta_correta', CASE WHEN v_liberado THEN v_gabarito END
          );
        END
        $fn$
        """
    )

    # Sem esta, quem ja ERROU DUAS VEZES perde o gabarito ao fechar o app: o
    # valor so viajava na resposta de `questao_responder`, e a tela nao tem
    # como pedi-lo de novo sem gastar uma tentativa. Ela nao INSERE nada --
    # so le o que ja esta gravado e aplica a mesma regra.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.questao_gabarito_do_aluno(
          p_questao_id bigint
        ) RETURNS jsonb
          LANGUAGE plpgsql STABLE SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
        DECLARE
          v_me       uuid := auth.uid();
          v_at       bigint;
          v_erros    integer;
          v_acertou  boolean;
          v_liberado boolean;
          v_gabarito text;
        BEGIN
          IF v_me IS NULL THEN
            RAISE EXCEPTION 'questao_sem_sessao';
          END IF;

          SELECT q.atividade_id INTO v_at FROM public.questoes q WHERE q.id = p_questao_id;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'questao_inexistente';
          END IF;

          IF NOT EXISTS (
            SELECT 1
              FROM public.atividades a
              JOIN public.topicos t ON t.id = a.topico_id
              JOIN public.classe_aluno ca ON ca.classe_id = t.classe_id
             WHERE a.id = v_at AND ca.aluno_id = v_me
          ) THEN
            RAISE EXCEPTION 'questao_sem_permissao';
          END IF;

          SELECT count(*) FILTER (WHERE qa.correta IS FALSE),
                 COALESCE(bool_or(qa.correta), false)
            INTO v_erros, v_acertou
            FROM public.questao_aluno qa
           WHERE qa.aluno_id = v_me AND qa.questao_id = p_questao_id;

          v_liberado := v_acertou OR COALESCE(v_erros, 0) >= 2;

          IF v_liberado THEN
            SELECT g.resposta_correta INTO v_gabarito
              FROM public.questao_gabarito g WHERE g.questao_id = p_questao_id;
          END IF;

          RETURN jsonb_build_object(
            'correta', v_acertou,
            'erros', COALESCE(v_erros, 0),
            'gabarito_liberado', v_liberado,
            'resposta_correta', v_gabarito
          );
        END
        $fn$
        """
    )

    for assinatura in (_ASSINATURA, "questao_gabarito_do_aluno(bigint)"):
        op.execute(f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon")
        op.execute(f"GRANT EXECUTE ON FUNCTION public.{assinatura} TO authenticated")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.questao_gabarito_do_aluno(bigint)")
    # `questao_responder` fica como esta: voltar a devolver o gabarito em toda
    # chamada e' reabrir o vazamento. A volta e' a propria `20260921_02`, que
    # reescreve a funcao inteira.
