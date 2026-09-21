"""conquista de perfil so destrava para quem e daquele perfil

Revision ID: 20260910_11
Revises: 20260910_10

## O que estava errado

`trg_eventos_aluno_after_iud()` avaliava as conquistas assim:

    FOR v_conquista IN SELECT * FROM public.conquistas LOOP

Sem filtro nenhum de audiencia. `conquistas.escopo` e `comum` ou `perfil`, e
quando e `perfil` a linha tem `perfil_alvo` -- mas o gatilho ignorava as duas
colunas e media TODAS as conquistas contra TODO aluno. Resultado: o aluno
destravava conquista de perfil que nao e o dele.

Medido em producao, aluno b49f2e21 (perfis representativos: mastermind 85 e
conqueror 60):

    conquista               perfil_alvo
    Horizonte Completo      seeker
    Sequencia de Ouro       achiever
    Arrancada               daredevil
    Retorno Firme           survivor

Ele recebeu a notificacao "Nova conquista desbloqueada!" de cada uma, e a
tela de conquistas -- que filtra certo, por `conquistaVisivelParaPerfis` --
nao as mostrava. Do ponto de vista do aluno, ele ganhava conquista que nao
existe no perfil dele.

No banco: 9 de 14 linhas de conquista de perfil estavam indevidas, pagando
250 pontos que entraram no rank.

## A regra, e de onde ela vem

A audiencia canonica esta no cliente, em
`mobile/src/utils/conquistaAudience.ts` (`conquistaVisivelParaPerfis`):

  - `escopo = 'comum'` vale para todo mundo;
  - `escopo = 'perfil'` vale so se `perfil_alvo` casar com um dos perfis
    REPRESENTATIVOS do aluno -- nao apenas o dominante.

E "representativo" vem de `resolveRepresentativeBrainHexProfiles` no
`mobile/src/utils/brainHex.ts`: ordenados por afinidade decrescente, entram os
dois primeiros com afinidade > 0, mais qualquer um com afinidade >= 20
(SECONDARY_SIGNAL_INDEX = 1, DEFAULT_SIGNAL_THRESHOLD = 20).

Esta migracao replica essa regra no gatilho. Os dois numeros sao os mesmos do
TypeScript de proposito, e ha teste (`test_conquista_de_perfil.py`) que le as
constantes do arquivo do mobile e falha se elas divergirem do SQL -- duas
implementacoes da mesma regra sem nada amarrando as duas foi exatamente o
problema que este repo ja teve com o merge de materiais.

O calculo entra como CTE no SELECT do laco, nao como subconsulta por linha: o
proprio comentario da funcao diz que agregado e "uma vez por evento, nao uma
vez por conquista".

Esta migracao NAO revoga as conquistas ja dadas nem estorna os 250 pontos --
isso e visivel para o aluno, que ja foi notificado, e mexe no ranking. Fica
como decisao separada.

Create Date: 2026-09-10
"""

from alembic import op

revision = "20260910_11"
down_revision = "20260910_10"
branch_labels = None
depends_on = None


# Substituicao no corpo VIVO: a funcao ja foi alterada por
# 20260909_01 (conquistas por metrica) e por 20260910_08 (search_path), e
# recolar texto de uma delas reverteria a outra em silencio.
_ANCORA = "  FOR v_conquista IN SELECT * FROM public.conquistas LOOP"

# Espelho de conquistaVisivelParaPerfis + resolveRepresentativeBrainHexProfiles.
# `lower(COALESCE(perfil_alvo, ''))` cobre o caso de conquista marcada como
# `perfil` sem alvo: no cliente `Boolean(alvo && ...)` a rejeita, e aqui a
# string vazia nao casa com nenhum nome de perfil -- mesmo efeito.
_FILTRO = """  FOR v_conquista IN
    WITH representativos AS (
      SELECT rep.nome
        FROM (
          SELECT lower(p.nome) AS nome,
                 COALESCE(ap.afinidade, 0) AS af,
                 row_number() OVER (
                   ORDER BY COALESCE(ap.afinidade, 0) DESC, p.nome ASC
                 ) AS pos
            FROM public.aluno_perfil ap
            JOIN public.perfil p ON p.id = ap.perfil_id
           WHERE ap.aluno_id = v_aluno_id
        ) rep
       WHERE rep.af >= 20
          OR (rep.af > 0 AND rep.pos <= 2)
    )
    SELECT c.*
      FROM public.conquistas c
     WHERE lower(COALESCE(c.escopo, 'comum')) <> 'perfil'
        OR lower(COALESCE(c.perfil_alvo, '')) IN (SELECT nome FROM representativos)
  LOOP"""


def upgrade() -> None:
    op.execute(
        f"""
        DO $migracao$
        DECLARE
          v_def TEXT;
          v_novo TEXT;
          v_oid OID;
          v_ocorrencias INT;
          v_ancora TEXT := $ancora${_ANCORA}$ancora$;
          v_troca TEXT := $troca${_FILTRO}$troca$;
        BEGIN
          v_oid := to_regprocedure('public.trg_eventos_aluno_after_iud()');
          IF v_oid IS NULL THEN
            RAISE EXCEPTION USING MESSAGE =
              'trg_eventos_aluno_after_iud() nao encontrada';
          END IF;

          v_def := pg_get_functiondef(v_oid);

          -- Idempotente.
          IF position('representativos' IN v_def) > 0 THEN
            RAISE NOTICE 'gatilho ja filtra conquista por perfil representativo';
            RETURN;
          END IF;

          v_ocorrencias := (length(v_def) - length(replace(v_def, v_ancora, '')))
                           / length(v_ancora);
          IF v_ocorrencias <> 1 THEN
            RAISE EXCEPTION USING MESSAGE =
              'esperava 1 ocorrencia do laco de conquistas, achei '
              || v_ocorrencias::text;
          END IF;

          v_novo := replace(v_def, v_ancora, v_troca);
          IF v_novo = v_def THEN
            RAISE EXCEPTION USING MESSAGE = 'substituicao nao alterou a definicao';
          END IF;

          EXECUTE v_novo;
        END
        $migracao$;
        """
    )

    # CONFERE: a regra entrou, e ela de fato separa as conquistas do aluno
    # medido -- sem isso a migracao poderia "passar" com um filtro que nao
    # filtra nada.
    op.execute(
        """
        DO $confere$
        DECLARE
          v_tem BOOLEAN;
          v_indevidas INT;
        BEGIN
          v_tem := position(
            'representativos' IN pg_get_functiondef(
              to_regprocedure('public.trg_eventos_aluno_after_iud()')
            )
          ) > 0;
          IF NOT v_tem THEN
            RAISE EXCEPTION USING MESSAGE =
              'o gatilho vivo nao contem o filtro de perfil representativo';
          END IF;

          -- A mesma conta, em leitura: quantas linhas JA existentes o filtro
          -- novo teria barrado. Serve de registro do estrago e prova que a
          -- expressao compila sobre o dado real.
          WITH representativos AS (
            SELECT r.aluno_id, r.nome
              FROM (
                SELECT ap.aluno_id,
                       lower(p.nome) AS nome,
                       COALESCE(ap.afinidade, 0) AS af,
                       row_number() OVER (
                         PARTITION BY ap.aluno_id
                         ORDER BY COALESCE(ap.afinidade, 0) DESC, p.nome ASC
                       ) AS pos
                  FROM public.aluno_perfil ap
                  JOIN public.perfil p ON p.id = ap.perfil_id
              ) r
             WHERE r.af >= 20 OR (r.af > 0 AND r.pos <= 2)
          )
          SELECT count(*)
            INTO v_indevidas
            FROM public.conquistas_aluno ca
            JOIN public.conquistas c ON c.id = ca.conquista_id
           WHERE lower(COALESCE(c.escopo, 'comum')) = 'perfil'
             AND NOT EXISTS (
               SELECT 1
                 FROM representativos rp
                WHERE rp.aluno_id = ca.aluno_id
                  AND rp.nome = lower(COALESCE(c.perfil_alvo, ''))
             );

          RAISE NOTICE USING MESSAGE =
            'CONFERE: ' || v_indevidas::text
            || ' linha(s) de conquista de perfil ja existentes que o filtro'
            || ' novo barraria (nao sao revogadas por esta migracao)';
        END
        $confere$;
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        DO $volta$
        DECLARE
          v_def TEXT;
          v_novo TEXT;
          v_oid OID;
        BEGIN
          v_oid := to_regprocedure('public.trg_eventos_aluno_after_iud()');
          IF v_oid IS NULL THEN
            RETURN;
          END IF;

          v_def := pg_get_functiondef(v_oid);
          v_novo := replace(v_def, $troca${_FILTRO}$troca$, $ancora${_ANCORA}$ancora$);
          IF v_novo = v_def THEN
            RAISE NOTICE 'filtro nao encontrado; nada a reverter';
            RETURN;
          END IF;

          EXECUTE v_novo;
        END
        $volta$;
        """
    )
