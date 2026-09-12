"""refazer vale nota: 90% da melhor tentativa + 10% da pior

"Nota nunca piora" foi a proposta inicial e foi descartada pelo dado: em
Illinois (ICER 2020, N = 617 e 353) essa variante teve 49% de retake com apenas
70% melhorando -- os autores leem como roll of the dice, porque o aluno tenta a
sorte quando nao ha o que perder, e ela atrai quem ja tem nota quase perfeita.
A 90/10 subiu o retake entre alunos B (16%->32%) e C (50%->64%) SEM aumentar
quem piora.

Com uma tentativa so', max = min e a conta devolve a propria nota: a formula
nao muda nada para quem nunca comprou o item.

Duas exclusoes que vieram do uso:

  - V ou F nao conta. Com duas alternativas a segunda tentativa acerta por
    eliminacao, e o item viraria ponto de graca.
  - Questao com gabarito ja revelado nao conta. Refazer o que ja foi mostrado
    e' transcricao, nao aprendizado.

Revision ID: 20260912_05
Revises: 20260912_04
Create Date: 2026-09-12
"""

from alembic import op

revision = "20260912_05"
down_revision = "20260912_04"
branch_labels = None
depends_on = None


# As mesmas oito grafias que `normalizeQuestionType` do mobile reduz a
# "true_false" (mobile/src/utils/personalization.ts e ActivityRenderer.tsx).
# Se o banco reconhecer menos, um "verdadeiro ou falso" escapa do filtro.
TIPOS_BINARIOS: tuple[str, ...] = (
    "true_false",
    "true or false",
    "true_or_false",
    "truefalse",
    "verdadeiro_falso",
    "verdadeiro ou falso",
    "verdadeiro/falso",
    "booleano",
)


# Duas condicoes, porque a primeira sozinha seria satisfeita abrindo e
# fechando. 120s de leitura ATIVA -- nunca dwell, que conta tela aberta parada.
SEGUNDOS_DE_LEITURA = 120


def _lista_tipos() -> str:
    return ", ".join(f"'{t}'" for t in TIPOS_BINARIOS)


TENTATIVA = """
CREATE TABLE IF NOT EXISTS public.atividade_tentativa (
  id           bigserial PRIMARY KEY,
  aluno_id     uuid    NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  atividade_id bigint  NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  ordem        integer NOT NULL CHECK (ordem >= 1),
  percentual   numeric NOT NULL CHECK (percentual BETWEEN 0 AND 100),
  compra_id    bigint  NULL REFERENCES public.loja_compras(id),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, atividade_id, ordem)
);

COMMENT ON TABLE public.atividade_tentativa IS
  'Historico de tentativas. Existe porque 90/10 precisa da melhor E da pior:
   atividade_aluno guarda uma nota so.';

ALTER TABLE public.atividade_tentativa ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.atividade_tentativa
  FROM anon, authenticated;

DROP POLICY IF EXISTS atividade_tentativa_sel ON public.atividade_tentativa;
CREATE POLICY atividade_tentativa_sel ON public.atividade_tentativa
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid()
         OR aluno_id IN (SELECT public.app_alunos_do_professor()));
"""


REVELADO = """
CREATE TABLE IF NOT EXISTS public.questao_gabarito_revelado (
  aluno_id    uuid   NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  questao_id  bigint NOT NULL,
  revelado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, questao_id)
);

COMMENT ON TABLE public.questao_gabarito_revelado IS
  'Registra que o aluno VIU o gabarito daquela questao. E um fato, nao uma
   configuracao: mostrar_gabarito_ao_errar nao existe no banco e o default do
   mobile e revelar, entao filtrar pela configuracao deixaria a segunda chance
   indisponivel para quase todo erro. Quem grava e o cliente, como em
   eventos_aluno.';

ALTER TABLE public.questao_gabarito_revelado ENABLE ROW LEVEL SECURITY;

-- O aluno grava o proprio registro: e o app dele que sabe o que foi exibido.
REVOKE INSERT, UPDATE, DELETE ON public.questao_gabarito_revelado FROM anon;
GRANT  INSERT ON public.questao_gabarito_revelado TO authenticated;

DROP POLICY IF EXISTS questao_gabarito_revelado_sel
  ON public.questao_gabarito_revelado;
CREATE POLICY questao_gabarito_revelado_sel ON public.questao_gabarito_revelado
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid()
         OR aluno_id IN (SELECT public.app_alunos_do_professor()));

DROP POLICY IF EXISTS questao_gabarito_revelado_ins
  ON public.questao_gabarito_revelado;
CREATE POLICY questao_gabarito_revelado_ins ON public.questao_gabarito_revelado
  FOR INSERT TO authenticated
  WITH CHECK (aluno_id = auth.uid());
"""

ELEGIVEL = f"""
CREATE OR REPLACE FUNCTION public.fn_questao_elegivel_retry(p_questao_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_tipo     text;
  v_revelada boolean;
BEGIN
  -- `::text` antes de qualquer COALESCE: se `tipo` for enum um dia, comparar
  -- com '' coage o literal ao enum e estoura em tempo de execucao.
  SELECT lower(btrim(COALESCE(q.tipo::text, ''))) INTO v_tipo
    FROM public.questoes q
   WHERE q.id = p_questao_id;

  IF v_tipo IS NULL THEN
    RETURN false;
  END IF;

  -- V ou F: com duas alternativas a segunda tentativa acerta por eliminacao.
  IF v_tipo IN ({_lista_tipos()}) THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.questao_gabarito_revelado r
     WHERE r.aluno_id = auth.uid() AND r.questao_id = p_questao_id
  ) INTO v_revelada;

  RETURN NOT v_revelada;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_questao_elegivel_retry(bigint) TO authenticated;
"""


GATE = f"""
CREATE OR REPLACE FUNCTION public.fn_revisou_topico(
  p_topico_id bigint,
  p_desde     timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_tocou  boolean;
  v_ativos numeric;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM public.personalizacao_item_progresso p
     WHERE p.aluno_id = auth.uid()
       AND p.topico_id = p_topico_id
       AND p.updated_at > p_desde
  ) INTO v_tocou;

  IF NOT v_tocou THEN
    RETURN false;
  END IF;

  -- Filtra por scope SEMPRE: dentro de um lote, topic/content/material trazem
  -- o mesmo intervalo, e somar escopos diferentes multiplica o tempo.
  --
  -- E usa active_sec, nunca dwell_sec: dwell conta tela aberta parada, e
  -- aceitaria o aluno deixando o material aberto sem ler.
  SELECT COALESCE(SUM(t.active_sec), 0) INTO v_ativos
    FROM public.telemetria_time_metric_entries t
   WHERE t.aluno_id = auth.uid()
     AND t.topico_id = p_topico_id
     AND t.scope = 'material'
     AND t.captured_at > p_desde;

  RETURN v_ativos >= {SEGUNDOS_DE_LEITURA};
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_revisou_topico(bigint, timestamptz)
  TO authenticated;
"""


NOTA = """
CREATE OR REPLACE FUNCTION public.fn_nota_90_10(
  p_aluno        uuid,
  p_atividade_id bigint
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  -- Com uma tentativa so', MAX = MIN e a conta devolve a propria nota: a
  -- formula nao muda nada para quem nunca comprou o item.
  SELECT LEAST(
           100,
           round(0.9 * MAX(percentual) + 0.1 * MIN(percentual), 2)
         )
    FROM public.atividade_tentativa
   WHERE aluno_id = p_aluno AND atividade_id = p_atividade_id;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_atividade_tentativa_nota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_nota numeric;
BEGIN
  v_nota := public.fn_nota_90_10(NEW.aluno_id, NEW.atividade_id);

  -- `acertos_percentual`, NUNCA `percentual_concluido`. O segundo e conclusao,
  -- nao nota, e alimenta trailup_recalcular_topico_aluno: gravar 68 de nota ali
  -- faria a atividade parecer 68% concluida e mexeria no percentual do topico.
  UPDATE public.atividade_aluno
     SET acertos_percentual = v_nota
   WHERE aluno_id = NEW.aluno_id AND atividade_id = NEW.atividade_id;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_atividade_tentativa_nota ON public.atividade_tentativa;
CREATE TRIGGER trg_atividade_tentativa_nota
  AFTER INSERT ON public.atividade_tentativa
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_atividade_tentativa_nota();

GRANT EXECUTE ON FUNCTION public.fn_nota_90_10(uuid, bigint) TO authenticated;
"""


COMPRAR_V2 = """
CREATE OR REPLACE FUNCTION public.loja_comprar(
  p_item            text,
  p_classe_id       bigint,
  p_idempotency_key text,
  p_alvo_tipo       text   DEFAULT NULL,
  p_alvo_id         bigint DEFAULT NULL,
  p_parametro       text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_aluno      uuid := auth.uid();
  v_item       public.loja_itens%ROWTYPE;
  v_existente  public.loja_compras%ROWTYPE;
  v_desligados text[];
  v_gratis     integer;
  v_compradas  integer;
  v_preco      numeric := 0;
  v_saldo      numeric;
  v_origem     text := 'compra';
  v_compra_id  bigint;
  v_topico_id  bigint;
  v_teto       integer;
  v_usados     integer;
  v_ultima     timestamptz;
BEGIN
  IF v_aluno IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  -- 1. Idempotencia. O pedido pode ter chegado e a resposta ter se perdido;
  -- repetir devolve a mesma compra em vez de cobrar de novo.
  SELECT * INTO v_existente
    FROM public.loja_compras
   WHERE aluno_id = v_aluno AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'repetido', true,
      'compra_id', v_existente.id,
      'saldo', public.loja_saldo()
    );
  END IF;

  -- 2. Matricula, pelo helper: predicado que consultasse classe_aluno direto
  -- entraria em recursao de RLS.
  IF p_classe_id NOT IN (SELECT public.app_classes_do_aluno()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'fora_da_turma');
  END IF;

  -- 3. Item ligado.
  SELECT * INTO v_item FROM public.loja_itens WHERE codigo = p_item;
  IF NOT FOUND OR NOT v_item.ativo THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'item_indisponivel');
  END IF;

  SELECT itens_desligados INTO v_desligados
    FROM public.loja_config_classe WHERE classe_id = p_classe_id;

  IF p_item = ANY(COALESCE(v_desligados, '{}'::text[])) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'item_desligado_na_turma');
  END IF;

  -- 4. Validacao do alvo/parametro ANTES de cobrar. Ela vivia no passo 10, e
  -- de la so' sabia recusar com RAISE: o cliente recebia erro cru de banco em
  -- vez do `{ok:false, erro:...}` que toda outra recusa devolve. A atomicidade
  -- se segurava, mas o contrato da RPC nao.
  --
  -- `p_parametro IS NULL` explicito: `NULL NOT IN (...)` devolve NULL, nao
  -- TRUE, entao sem esta guarda o NULL passaria batido.
  IF v_item.efeito = 'troca_formato' THEN
    IF p_alvo_id IS NULL
       OR p_parametro IS NULL
       OR p_parametro NOT IN ('audio','texto','slides') THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'formato_invalido');
    END IF;
  END IF;

  -- Teto, cooldown e gate da segunda chance. Todos ANTES de cobrar.
  IF v_item.efeito = 'segunda_chance' THEN
    IF p_alvo_tipo IS DISTINCT FROM 'atividade' OR p_alvo_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'alvo_invalido');
    END IF;

    SELECT a.topico_id INTO v_topico_id
      FROM public.atividades a WHERE a.id = p_alvo_id;

    SELECT retry_max_por_topico INTO v_teto
      FROM public.loja_config_classe WHERE classe_id = p_classe_id;
    v_teto := COALESCE(v_teto, 1);

    SELECT count(*) INTO v_usados
      FROM public.loja_compras c
      JOIN public.atividades a ON a.id = c.alvo_id
     WHERE c.aluno_id = v_aluno
       AND c.item_codigo = 'segunda_chance'
       AND c.status <> 'estornada'
       AND a.topico_id = v_topico_id;

    IF COALESCE(v_usados, 0) >= v_teto THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'teto_do_topico');
    END IF;

    -- Cooldown imposto, nao sugerido: 97% dos alunos espacaram as tentativas
    -- porque a janela os obrigou, nao por escolha. Alargar a janela nao fez
    -- ninguem espacar mais.
    SELECT max(criado_em) INTO v_ultima
      FROM public.atividade_tentativa
     WHERE aluno_id = v_aluno AND atividade_id = p_alvo_id;

    IF v_ultima IS NOT NULL AND v_ultima > now() - interval '24 hours' THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'cooldown_24h');
    END IF;

    IF NOT public.fn_revisou_topico(
         v_topico_id, COALESCE(v_ultima, '-infinity'::timestamptz)) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'revise_o_material');
    END IF;

    -- Nenhuma questao elegivel: V ou F e gabarito ja visto ficam de fora, e uma
    -- atividade inteira de V ou F simplesmente nao pode ser refeita.
    IF NOT EXISTS (
      SELECT 1 FROM public.questoes q
       WHERE q.atividade_id = p_alvo_id
         AND public.fn_questao_elegivel_retry(q.id)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'sem_questao_elegivel');
    END IF;
  END IF;

  -- 5. Dotacao primeiro. Unidade gratuita nao consulta preco nem saldo: negar
  -- algo gratis a quem esta sem moeda seria negar justamente a quem a dotacao
  -- existe para proteger.
  v_gratis := public.loja_saldo_item(p_classe_id, p_item);

  IF v_gratis > 0 THEN
    v_origem := 'dotacao';
    v_preco := 0;
  ELSE
    -- 6. Preco, com a escalada contando so' as unidades compradas.
    v_compradas := public.loja_compradas_do_item(p_classe_id, p_item);
    v_preco := ceil(v_item.preco_base * power(v_item.preco_fator, v_compradas));

    -- 7. Saldo, com a carteira travada.
    --
    -- Trava por advisory lock, e nao por FOR UPDATE: o Postgres recusa
    -- `FOR UPDATE` junto de funcao de agregacao ("FOR UPDATE is not allowed
    -- with aggregate functions"), e travar linha por linha nao ajudaria de
    -- qualquer forma -- o problema e a linha que AINDA NAO existe, inserida por
    -- uma compra simultanea. O lock e por aluno e morre com a transacao.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_aluno::text, 0));

    SELECT COALESCE(SUM(delta), 0) INTO v_saldo
      FROM public.moedas_ledger
     WHERE aluno_id = v_aluno;

    IF v_saldo < v_preco THEN
      RETURN jsonb_build_object(
        'ok', false, 'erro', 'saldo_insuficiente',
        'saldo', v_saldo, 'preco', v_preco
      );
    END IF;
  END IF;

  -- 8. A posse.
  INSERT INTO public.loja_compras
    (aluno_id, classe_id, item_codigo, origem, preco_pago,
     alvo_tipo, alvo_id, idempotency_key)
  VALUES
    (v_aluno, p_classe_id, p_item, v_origem, v_preco,
     p_alvo_tipo, p_alvo_id, p_idempotency_key)
  RETURNING id INTO v_compra_id;

  -- 9. O debito, apontando para a compra: sem compra_id o extrato diria que
  -- saiu moeda sem dizer por que.
  IF v_preco > 0 THEN
    INSERT INTO public.moedas_ledger
      (aluno_id, delta, motivo, classe_id, compra_id)
    VALUES
      (v_aluno, -v_preco, 'compra', p_classe_id, v_compra_id);
  END IF;

  -- 10. O efeito. Nesta fatia so' `troca_formato`; os outros tres chegam com
  -- as suas salvaguardas nas fatias 3 e 4.
  IF v_item.efeito = 'troca_formato' THEN
    -- Ja validado no passo 4, antes de cobrar.
    INSERT INTO public.loja_formato_escolhido (aluno_id, topico_id, formato)
    VALUES (v_aluno, p_alvo_id, p_parametro)
    ON CONFLICT (aluno_id, topico_id)
    DO UPDATE SET formato = EXCLUDED.formato, atualizado_em = now();

    UPDATE public.loja_compras
       SET status = 'consumida', consumido_em = now()
     WHERE id = v_compra_id;
  END IF;

  -- 11. O saldo devolvido sai do banco, nunca de conta feita no cliente.
  RETURN jsonb_build_object(
    'ok', true,
    'compra_id', v_compra_id,
    'origem', v_origem,
    'preco', v_preco,
    'saldo', public.loja_saldo()
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION
  public.loja_comprar(text, bigint, text, text, bigint, text) TO authenticated;
"""


def upgrade() -> None:
    op.execute(TENTATIVA)
    op.execute(REVELADO)
    op.execute(ELEGIVEL)
    op.execute(GATE)
    op.execute(NOTA)
    op.execute(COMPRAR_V2)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.questao_gabarito_revelado CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.atividade_tentativa CASCADE;")
