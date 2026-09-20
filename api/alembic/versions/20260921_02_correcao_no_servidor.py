"""a correcao vai para o servidor, com a mesma tolerancia que o cliente tinha

Revision ID: 20260921_02
Revises: 20260921_01
Create Date: 2026-09-21

A `20260921_01` tirou o gabarito do alcance do aluno. Consequencia imediata: o
cliente, que corrigia localmente lendo `questao.resposta_correta`, passou a
comparar contra NULL -- **toda resposta viraria errada**.

Entao a correcao tem de subir junto, e ela precisa ser tao tolerante quanto a
que o `QuestionActivity` fazia. A comparacao ingenua
(`lower(btrim(x)) = lower(btrim(gabarito))`) reprovaria resposta certa em tres
casos que o cliente aceitava:

1. **Letra e indice.** O gabarito pode estar gravado como o TEXTO da opcao
   enquanto o aluno manda "A" ou "1" -- e vice-versa.
2. **Verdadeiro/falso em varias grafias.** `v`/`true`/`verdadeiro`/`sim`.
3. **Acento e caixa.** "Nao" contra "nao".

`fn_texto_comparavel` usa **tabela explicita de acentos**, nao
`normalize('NFD')` com range de combining marks: gravado literalmente no fonte
esse range e INVISIVEL, e um replace acidental apaga a regra sem deixar rastro
no diff. E a licao que o `CLAUDE.md` ja registra para `derivarTipo`.

Exercitado contra as quatro questoes reais da base (verdadeiro_falso, multipla,
fill_blank), por todos os caminhos: literal, maiuscula, com espacos, pela letra
e pelo indice -- todas verdadeiras; resposta errada e resposta vazia, falsas.

**Dissertativa fica de fora de proposito.** Nao ha comparacao de texto que
decida uma pergunta aberta; o cliente continua validando por IA, agora julgando
pelo enunciado em vez do gabarito. Mover essa validacao para o servidor e
trabalho proprio.
"""

from alembic import op

revision = "20260921_02"
down_revision = "20260921_01"
branch_labels = None
depends_on = None


_FUNCOES = (
    "fn_texto_comparavel(text)",
    "fn_questao_confere(bigint, text)",
    "questao_responder(bigint, text, integer)",
)

# Sem acento -> com acento, lado a lado. Explicita porque a alternativa
# (range de combining marks) e invisivel no arquivo.
_DE = "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ"
_PARA = "aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION public.fn_texto_comparavel(p_texto text)
          RETURNS text
          LANGUAGE sql IMMUTABLE
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
          SELECT btrim(lower(translate(
            COALESCE(p_texto, ''),
            '{_DE}',
            '{_PARA}'
          )));
        $fn$
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_questao_confere(
          p_questao_id bigint,
          p_resposta text
        ) RETURNS boolean
          LANGUAGE plpgsql STABLE SECURITY DEFINER
          SET search_path TO 'public', 'pg_temp'
        AS $fn$
        DECLARE
          v_gabarito text;
          v_alts     jsonb;
          v_resp     text := public.fn_texto_comparavel(p_resposta);
          v_gab      text;
          v_i        integer;
          v_texto    text;
        BEGIN
          SELECT g.resposta_correta, q.alternativas
            INTO v_gabarito, v_alts
            FROM public.questoes q
            LEFT JOIN public.questao_gabarito g ON g.questao_id = q.id
           WHERE q.id = p_questao_id;

          IF v_gabarito IS NULL OR v_resp = '' THEN RETURN false; END IF;
          v_gab := public.fn_texto_comparavel(v_gabarito);

          IF v_resp = v_gab THEN RETURN true; END IF;

          IF v_resp IN ('v','true','verdadeiro','sim','certo')
             AND v_gab IN ('v','true','verdadeiro','sim','certo') THEN RETURN true; END IF;
          IF v_resp IN ('f','false','falso','nao','errado')
             AND v_gab IN ('f','false','falso','nao','errado') THEN RETURN true; END IF;

          -- Indice e letra contra as alternativas: os dois lados podem estar em
          -- formas diferentes (gabarito como texto, resposta como "A").
          IF jsonb_typeof(v_alts) = 'array' THEN
            FOR v_i IN 0 .. jsonb_array_length(v_alts) - 1 LOOP
              v_texto := public.fn_texto_comparavel(v_alts ->> v_i);
              IF v_texto = '' THEN CONTINUE; END IF;

              IF v_resp = v_texto
                 OR v_resp = v_i::text
                 OR v_resp = lower(chr(65 + v_i)) THEN
                IF v_gab = v_texto
                   OR v_gab = v_i::text
                   OR v_gab = lower(chr(65 + v_i)) THEN
                  RETURN true;
                END IF;
              END IF;
            END LOOP;
          END IF;

          RETURN false;
        END
        $fn$
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

          -- O gabarito volta junto, mas so DEPOIS de responder -- que e quando
          -- a tela precisa dele para o feedback.
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


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.fn_questao_confere(bigint, text)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_texto_comparavel(text)")
    # `questao_responder` fica: derruba-la aqui deixaria a `20260921_01` sem a
    # RPC que ela pressupoe, e o cliente sem como corrigir.
