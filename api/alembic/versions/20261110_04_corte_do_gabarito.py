"""Corte do gabarito (fase 3): o cliente não lê mais `resposta_correta`, nem grava em `questao_aluno`

> **Não aplicar antes de `app_versao_minima` >= 1.0.8.** O merge aplica: a API roda
> `alembic upgrade head` ao subir. O app abaixo da 1.0.8 corrige no aparelho com o gabarito; sem
> ele, toda objetiva vira "errada" e a dissertativa aceita qualquer texto. Com a versão mínima
> ligada, esse app mostra a tela de atualizar em vez de corrigir errado.

Fecha o que `docs/analises/2026-11-08-gabarito-fora-do-app-do-aluno.md` deixou para o corte. As
fases 1 (`20261108_01`, correção no banco) e 2 (o app responde só pelas RPCs) já estão no ar.

## O que muda

1. **`questoes`: SELECT por coluna, sem `resposta_correta`.** Revogar só a coluna não funciona
   enquanto existe o GRANT na tabela inteira, então sai o da tabela e entra um por coluna. A lista
   é lida de `information_schema` na hora de aplicar, porque o schema de `questoes` não é todo
   versionado (`formato_texto` é da `20261108_03`, `dificuldade` da `20261021_10`, `config_resposta`
   da `20261110_02`, que o aluno precisa ler para responder os tipos do spec B).

   **Vale também para o professor**, que é `authenticated`: o console passa a ler o gabarito de
   `questao_gabarito` (espelho mantido por `trg_questoes_espelha_gabarito`, com a policy do
   professor da turma). A escrita continua em `questoes`, e INSERT/UPDATE não mudam.

   **Coluna nova em `questoes` nasce invisível para o cliente.** O GRANT por coluna não cobre o que
   vier depois: a migration que criar a coluna tem de dar `GRANT SELECT (coluna)` a
   `authenticated`. Sem isso, o PostgREST devolve `42501` para quem pedir a coluna.

2. **`vw_aluno_classe_detalhado` com `NULL::text AS questao_resposta_correta`.** Ela é
   `security_invoker`: lendo `q.resposta_correta`, toda leitura dela daria `42501` para o aluno. O
   resto da view é o texto da `20260921_02`. O app da fase 2 já não lê essa coluna.

3. **`questao_aluno` sem escrita do cliente.** A guarda da `20261102_04` só recusava depois do
   prazo; agora recusa todo INSERT e UPDATE de `authenticated`/`anon`. Quem grava são as RPCs
   `SECURITY DEFINER` (`questao_responder`, `questao_registrar_correcao_ia`,
   `guilda_chat_questao_responder`, `fn_alteracao_recorrigir_questao`), e para elas `current_user`
   é o dono. O DELETE do console (`classDeletion.ts`) não passa por esta guarda.

   No app 1.0.8, `QuestaoAluno.registrarResposta` só roda para questão que não é da turma (id que
   não é inteiro positivo), e essa não tem linha em `questoes` para gravar.

4. **`atividade_responder_tentativa` soma o que o banco corrigiu.** O acerto da atividade passa a
   ser a média, sobre as questões da atividade, da última resposta de cada uma em `questao_aluno`
   (questão sem resposta conta 0). É a mesma conta do app (`acertoMedioAtividade`), com os
   percentuais que a `questao_responder` gravou. O valor que o app manda fica no
   `avaliacao_metadata` (`tentativa.acertos_do_app`), para medir divergência.

   Os pontos continuam vindo do app, porque as regras que os reduzem (`zero_if_wrong`, eliminação,
   `penalty_*`) são do app. Mas agora têm **teto**: `round(pontuacao_maxima × acerto / 100)`. O app
   pode baixar a nota, não subir.

   Atividade sem questão em `questoes` (entrega, projeto) não tem o que somar: vale o que o app
   manda, limitado como antes.

## O que não muda

- `validate-essay-answer-ai` sem `questaoId` continua aceitando `respostaProfessor`. Sem
  `questaoId` ela não grava nada, e o console (professor) usa esse caminho. Com a guarda de
  `questao_aluno`, o aluno não tem onde gravar a nota que inventasse.
- API e microservice leem `questoes` como `service_role`.

Revision ID: 20261110_04
Revises: 20261115_03
Create Date: 2026-11-10
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261110_04"
down_revision = "20261115_03"
branch_labels = None
depends_on = None

_AQUI = Path(__file__).resolve().parent


def _carregar(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"_corte_{arquivo[:11]}", _AQUI / arquivo)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_VIEW = _carregar("20260921_02_reexpoe_resposta_correta_na_view.py")
_GUARDA = _carregar("20261102_04_guarda_da_atividade_no_banco.py")
_TENTATIVAS = _carregar("20261101_13_tentativas_com_tempo_do_servidor.py")


def _responder_de_antes() -> str:
    """O corpo da `20261101_13`, para o downgrade devolver exatamente o que havia."""
    texto = _TENTATIVAS.FUNCOES
    inicio = texto.index("CREATE OR REPLACE FUNCTION public.atividade_responder_tentativa(")
    fim_grant = "TO authenticated;"
    fim = texto.index(fim_grant, texto.index("GRANT EXECUTE ON FUNCTION public.atividade_responder_tentativa", inicio))
    return texto[inicio : fim + len(fim_grant)]


GRANT_POR_COLUNA = r"""
DO $g$
DECLARE
  v_colunas text;
BEGIN
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO v_colunas
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'questoes'
     AND c.column_name <> 'resposta_correta';

  REVOKE SELECT ON public.questoes FROM authenticated, anon;
  -- Um GRANT antigo só da coluna sobreviveria ao REVOKE da tabela.
  REVOKE SELECT (resposta_correta) ON public.questoes FROM authenticated, anon;
  EXECUTE 'GRANT SELECT (' || v_colunas || ') ON public.questoes TO authenticated';
END
$g$;
"""

GRANT_DA_TABELA = r"""
GRANT SELECT ON public.questoes TO authenticated;
"""

GUARDA = r"""
CREATE OR REPLACE FUNCTION public.fn_questao_aluno_guarda_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = ''
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  -- Corte do gabarito (20261110_04): a resposta é corrigida e gravada pelo banco.
  RAISE EXCEPTION USING MESSAGE = 'questao_aluno: a resposta e gravada pela questao_responder',
    ERRCODE = '42501', HINT = 'Atualize o app.';
END;
$function$;

DROP TRIGGER IF EXISTS trg_questao_aluno_a_guarda_cliente ON public.questao_aluno;
CREATE TRIGGER trg_questao_aluno_a_guarda_cliente
  BEFORE INSERT OR UPDATE ON public.questao_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_questao_aluno_guarda_cliente();
"""

RESPONDER = (
    r"""
CREATE OR REPLACE FUNCTION public.atividade_responder_tentativa(
  p_tentativa bigint,
  p_acertos_percentual numeric,
  p_pontuacao_obtida numeric,
  p_avaliacao_metadata jsonb DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aluno uuid := auth.uid();
  v_tent public.atividade_tentativas%ROWTYPE;
  v_prazo timestamptz;
  v_maxima numeric;
  v_max_tent integer;
  v_questoes integer;
  v_acertos numeric;
  v_teto numeric;
  v_pontos numeric;
  v_no_tempo boolean;
  v_tolerancia integer;
  v_meta jsonb;
  v_bonus numeric := 0;
  v_faixa record;
  v_valor numeric;
  v_feitas integer;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tent FROM public.atividade_tentativas WHERE id = p_tentativa FOR UPDATE;
  IF v_tent.id IS NULL OR v_tent.aluno_id <> v_aluno THEN
    RAISE EXCEPTION 'tentativa_nao_encontrada' USING ERRCODE = '42501';
  END IF;
  IF v_tent.respondida_em IS NOT NULL THEN
    RAISE EXCEPTION 'tentativa_ja_respondida' USING ERRCODE = 'P0001';
  END IF;

  v_prazo := public.fn_prazo_efetivo(v_aluno, v_tent.atividade_id);
  IF v_prazo IS NOT NULL AND v_prazo < now() THEN
    RAISE EXCEPTION 'prazo_expirado' USING ERRCODE = 'P0001', HINT = v_prazo::text;
  END IF;

  SELECT a.pontuacao_maxima, a.tentativas_max INTO v_maxima, v_max_tent
    FROM public.atividades a WHERE a.id = v_tent.atividade_id;
  v_maxima := COALESCE(NULLIF(v_maxima, 0),
                       (SELECT NULLIF(aa.pontuacao_maxima, 0) FROM public.atividade_aluno aa
                         WHERE aa.aluno_id = v_aluno AND aa.atividade_id = v_tent.atividade_id));

  -- O acerto é o que o banco corrigiu (20261110_04): a média da última resposta de cada questão
  -- da atividade. Questão sem resposta conta 0. Sem questão (entrega), vale o que o app manda.
  SELECT count(*) INTO v_questoes FROM public.questoes q WHERE q.atividade_id = v_tent.atividade_id;
  IF v_questoes > 0 THEN
    SELECT round(COALESCE(sum(u.percentual), 0) / v_questoes)
      INTO v_acertos
      FROM (
        SELECT DISTINCT ON (qa.questao_id)
               COALESCE(qa.acertos_percentual, CASE WHEN qa.correta THEN 100 ELSE 0 END) AS percentual
          FROM public.questao_aluno qa
          JOIN public.questoes q ON q.id = qa.questao_id AND q.atividade_id = v_tent.atividade_id
         WHERE qa.aluno_id = v_aluno
         ORDER BY qa.questao_id, qa.tentativa DESC
      ) u;
  ELSE
    v_acertos := p_acertos_percentual;
  END IF;
  v_acertos := greatest(0, least(100, COALESCE(v_acertos, 0)));

  -- Os pontos são do app (as regras que reduzem a nota são dele), com teto no acerto do banco.
  v_teto := CASE WHEN v_questoes > 0 AND v_maxima IS NOT NULL THEN round(v_maxima * v_acertos / 100)
                 ELSE v_maxima END;
  v_pontos := CASE WHEN p_pontuacao_obtida IS NULL THEN NULL
                   ELSE greatest(0, least(COALESCE(v_teto, p_pontuacao_obtida), p_pontuacao_obtida)) END;

  v_tolerancia := public.fn_cronometro_config('cronometro_tolerancia_seg', 5);
  v_no_tempo := v_tent.cronometrada
                AND now() <= v_tent.iniciada_em + make_interval(secs => v_tent.limite_seg + v_tolerancia);

  UPDATE public.atividade_tentativas
     SET respondida_em = now(), no_tempo = v_no_tempo, acertos_percentual = v_acertos,
         pontuacao_obtida = v_pontos, pontuacao_maxima = v_maxima
   WHERE id = v_tent.id;

  -- `professor` em avaliacao_metadata é de avaliar_entrega; o app não escreve essa chave.
  v_meta := COALESCE(p_avaliacao_metadata, '{}'::jsonb) - 'professor' - 'tentativa';
  v_meta := v_meta || jsonb_build_object('tentativa', jsonb_build_object(
    'id', v_tent.id, 'numero', v_tent.numero, 'cronometrada', v_tent.cronometrada, 'no_tempo', v_no_tempo,
    'acertos_do_app', p_acertos_percentual, 'pontos_do_app', p_pontuacao_obtida));

  -- Vale a última tentativa (decisão de 01/11).
  INSERT INTO public.atividade_aluno AS aa
    (aluno_id, atividade_id, status, percentual_concluido, acertos_percentual, pontuacao_obtida,
     pontuacao_maxima, avaliacao_metadata, ultima_visualizacao, updated_at)
  VALUES
    (v_aluno, v_tent.atividade_id, 'concluido', 100, v_acertos, v_pontos, v_maxima, v_meta, now(), now())
  ON CONFLICT (aluno_id, atividade_id) DO UPDATE
    SET status = 'concluido', percentual_concluido = 100, acertos_percentual = EXCLUDED.acertos_percentual,
        pontuacao_obtida = EXCLUDED.pontuacao_obtida, pontuacao_maxima = EXCLUDED.pontuacao_maxima,
        avaliacao_metadata = (COALESCE(aa.avaliacao_metadata, '{}'::jsonb) - 'tentativa')
                             || (EXCLUDED.avaliacao_metadata - 'professor'),
        ultima_visualizacao = now(), updated_at = now();

  -- Tempo vale XP, não nota: cada faixa atingida paga uma vez por atividade.
  IF v_no_tempo THEN
    FOR v_faixa IN
      SELECT x.minimo, 'atividade_no_tempo_' || x.minimo AS tipo
        FROM (VALUES """
    + ", ".join(f"({minimo})" for minimo, _ in _TENTATIVAS.FAIXAS)
    + r""") AS x(minimo)
       WHERE v_acertos >= x.minimo
    LOOP
      INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, criado_em)
      VALUES (v_aluno, v_faixa.tipo, 'atividade:' || v_tent.atividade_id, now() AT TIME ZONE 'UTC')
      ON CONFLICT (aluno_id, tipo, referencia) WHERE tipo LIKE 'atividade\_no\_tempo\_%' DO NOTHING
      RETURNING valor INTO v_valor;
      v_bonus := v_bonus + COALESCE(v_valor, 0);
      v_valor := NULL;
    END LOOP;
  END IF;

  SELECT count(*) INTO v_feitas FROM public.atividade_tentativas
   WHERE aluno_id = v_aluno AND atividade_id = v_tent.atividade_id AND respondida_em IS NOT NULL;

  RETURN jsonb_build_object(
    'tentativa_id', v_tent.id,
    'numero', v_tent.numero,
    'cronometrada', v_tent.cronometrada,
    'no_tempo', v_no_tempo,
    'acertos_percentual', v_acertos,
    'pontuacao_obtida', v_pontos,
    'pontuacao_maxima', v_maxima,
    'xp_bonus', v_bonus,
    'restantes', CASE WHEN v_max_tent IS NULL THEN NULL ELSE greatest(0, v_max_tent - v_feitas) END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.atividade_responder_tentativa(bigint, numeric, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atividade_responder_tentativa(bigint, numeric, numeric, jsonb) TO authenticated;
"""
)


def upgrade() -> None:
    # A view primeiro: com o GRANT por coluna e a view ainda lendo o gabarito, o aluno levaria
    # 42501 no intervalo. Na mesma transação não há intervalo, mas a ordem documenta a dependência.
    op.execute(_VIEW.VIEW_SEM_GABARITO)
    op.execute(GRANT_POR_COLUNA)
    op.execute(GUARDA)
    op.execute(RESPONDER)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(_responder_de_antes())
    op.execute(_GUARDA.QUESTAO_ALUNO)
    op.execute(GRANT_DA_TABELA)
    op.execute(_VIEW.VIEW)
    op.execute("NOTIFY pgrst, 'reload schema'")
