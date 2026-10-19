"""Fase 8: o desafio fecha e paga — sem isto os eixos das fases 1 e 4 nunca disparam

Oitava fase de `docs/superpowers/specs/2026-10-19-eventos-missoes-ranks-modos-design.md`.
Encadeia depois da fase 7 (`20261021_08`), que ligou os eixos na CRIAÇÃO.

## O que a medição mostrou, e que nenhuma fase anterior viu

O fluxo vivo da batalha de guilda é:

    guilda_desafio_criar  ->  mensagem no chat  ->  ...nada.

Três juntas abertas, todas verificadas no banco de produção:

1. **`guilda_desafio_criar` não registra ninguém em `desafio_participantes`.** Ela grava o
   desafio, as questões e a mensagem do chat. Como `fn_arena_placar` lê
   `desafio_participantes`, o placar de todo desafio criado pelo caminho vivo é **vazio** —
   e `arena_professor_resumo` (fase 7) mostra `aceitaram: 0` e `equipes: []` para todos.

2. **`guilda_desafio_responder` não é chamada por cliente nenhum**, e não grava `tempo_ms`
   nem tentativa. Sem `tempo_ms`, `modo = 'velocidade'` não consegue desempatar:
   `v_t1 * v_n2 <> v_t2 * v_n1` com tudo em zero é falso, e o desafio sai `empate`.
   (O mobile chama `guilda_chat_questao_responder`, que é outra coisa: questão solta no chat,
   gravada em `questao_aluno`. Não toca o desafio.)

3. **`arena_encerrar` é a ÚNICA função que fecha o desafio e paga** `desafio_vencido` /
   `desafio_empate` / `desafio_participou` / `desafio_derrota` — varrido com
   `pg_get_functiondef` sobre as 12 funções que mencionam `guilda_desafio`. E nenhum cliente
   a chama: dos sete `arena_*`, os clientes chamam só `arena_professor_resumo`.

Resultado: **a batalha é criada e nunca termina.** Ninguém é pontuado, e `consequencia` /
`dificuldade` — que as fases 1 e 4 construíram e que esta fase existe para tornar reais —
nunca saem do default porque nada chega ao ponto em que eles importariam.

## O que esta fase faz

**a) A criação registra os participantes.** Membros ativos da guilda entram como
`equipe 1, estado 'aceito'` — que é o certo para o desafio cooperativo de guilda
(`fn_desafio_encerrar` trata `formato = 'guilda'` sem rival como cooperativo). Isso também
conserta o `aceitaram: 0` do painel do professor, de graça.

**b) A resposta grava tempo e tentativa, e a tentativa passa a ter limite.**
`guilda_desafio_respostas` ganha `tentativas`, incrementada no `ON CONFLICT`. O limite vem de
`desafio_tentativas_normal` / `_dificil` (fase 1), então "menos tentativas" no difícil deixa
de ser enfeite do preset e passa a ser recusa do banco (`22023`).

> **O limite de TEMPO continua sendo do cliente, de propósito.** Para o banco julgar
> `desafio_tempo_seg_*` ele precisaria saber quando a questão foi ABERTA, e não existe esse
> registro — só o instante da resposta. Inventar uma guarda a partir de `created_at` do
> desafio puniria quem abre o desafio e responde depois, que é o uso normal. `tempo_seg`
> segue entregue por `fn_desafio_params_efetivos` (fase 7) e `tempo_ms` é gravado como
> reportado. Tornar o tempo autoritativo pede uma tabela de "questão aberta em" e é outra
> fase.

**c) O fechamento fica alcançável, por dois caminhos.** O miolo de `arena_encerrar` sai para
`fn_desafio_encerrar(p_desafio_id)`, **sem** a checagem de `auth.uid()`:

- `arena_encerrar` mantém a checagem de participante e delega — a porta do cliente não muda;
- a última resposta fecha sozinha: quando todo participante `aceito` respondeu todas as
  questões, `guilda_desafio_responder` chama o fechamento;
- `fn_desafio_varrer_abandonados()` em `pg_cron` fecha o que ficou aberto além de
  `desafio_encerra_apos_min` (padrão 30).

A varredura não é luxo: sem ela, **um participante que desiste deixa todos os outros sem
pagamento para sempre** — o fechamento automático exige que todos tenham respondido. E ela
precisa existir fora de `arena_encerrar` justamente porque o cron não tem `auth.uid()`; a
checagem de participante levantaria `arena_sem_permissao` em toda noite de varredura.

> Isto é a regra de fronteira do CLAUDE.md aplicada: fechar e pagar é encanamento, não tem
> modelo de linguagem no meio, e com a API fora do ar o desafio tem de fechar de todo modo.

Revision ID: 20261021_09
Revises: 20261021_08
Create Date: 2026-10-19
"""

from alembic import op

revision = "20261021_09"
down_revision = "20261021_08"
branch_labels = None
depends_on = None


TENTATIVAS = """
ALTER TABLE public.guilda_desafio_respostas
  ADD COLUMN IF NOT EXISTS tentativas integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.guilda_desafio_respostas.tentativas IS
  'Quantas vezes o aluno respondeu ESTA questao neste desafio. A chave unica e '
  '(desafio, questao, aluno) e o ON CONFLICT sobrescreve a resposta, entao sem esta coluna '
  'nao havia como contar tentativa -- e o preset desafio_tentativas_* da fase 1 nao tinha '
  'onde ser cobrado.';

ALTER TABLE public.guilda_desafio_respostas
  DROP CONSTRAINT IF EXISTS guilda_desafio_respostas_tentativas_check;
ALTER TABLE public.guilda_desafio_respostas
  ADD CONSTRAINT guilda_desafio_respostas_tentativas_check CHECK (tentativas >= 1);

INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('desafio_encerra_apos_min', '30',
   'Minutos de desafio aberto antes de a varredura fecha-lo. Sem varredura, um participante '
   'que desiste deixa todos os outros sem pagamento para sempre.', false)
ON CONFLICT (chave) DO NOTHING;
"""

TENTATIVAS_FORA = """
DELETE FROM public.app_config WHERE chave = 'desafio_encerra_apos_min';
ALTER TABLE public.guilda_desafio_respostas
  DROP CONSTRAINT IF EXISTS guilda_desafio_respostas_tentativas_check;
ALTER TABLE public.guilda_desafio_respostas DROP COLUMN IF EXISTS tentativas;
"""


# --------------------------------------------------------------------------------------
# O miolo do fechamento, sem checagem de sessao. Corpo da fase 4 (20261021_06), com a
# verificacao de participante removida e movida para `arena_encerrar`.
# --------------------------------------------------------------------------------------
ENCERRAR_MIOLO = """
CREATE OR REPLACE FUNCTION public.fn_desafio_encerrar(p_desafio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_d        public.guilda_desafios%ROWTYPE;
  v_p1 integer; v_p2 integer;
  v_t1 bigint;  v_t2 bigint;
  v_n1 integer; v_n2 integer;
  v_jog1 integer; v_jog2 integer;
  v_total    integer;
  v_cooperativo boolean;
  v_vencedor smallint;
  v_resultado text;
  v_ref      text;
  v_pagos    integer;
BEGIN
  -- SEM checagem de auth.uid() de proposito: quem chama por cron nao tem sessao, e a
  -- checagem de participante levantaria `arena_sem_permissao` em toda varredura. A porta do
  -- cliente (`arena_encerrar`) mantem a checagem e delega para ca.
  SELECT * INTO v_d FROM public.guilda_desafios
   WHERE id = p_desafio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'arena_desafio_inexistente';
  END IF;
  IF v_d.status = 'encerrado' THEN
    RETURN jsonb_build_object('status', 'encerrado', 'novo', false,
                              'resultado', v_d.resultado,
                              'vencedor_equipe', v_d.vencedor_equipe,
                              'consequencia', v_d.consequencia,
                              'dificuldade', v_d.dificuldade);
  END IF;

  SELECT COALESCE(sum(pontos)      FILTER (WHERE equipe = 1), 0),
         COALESCE(sum(tempo_ms)    FILTER (WHERE equipe = 1), 0),
         COALESCE(sum(integrantes) FILTER (WHERE equipe = 1), 0),
         COALESCE(sum(pontos)      FILTER (WHERE equipe = 2), 0),
         COALESCE(sum(tempo_ms)    FILTER (WHERE equipe = 2), 0),
         COALESCE(sum(integrantes) FILTER (WHERE equipe = 2), 0)
    INTO v_p1, v_t1, v_n1, v_p2, v_t2, v_n2
    FROM public.fn_arena_equipes(p_desafio_id);

  SELECT count(*) FILTER (WHERE equipe = 1 AND estado = 'aceito' AND respondidas > 0),
         count(*) FILTER (WHERE equipe = 2 AND estado = 'aceito' AND respondidas > 0)
    INTO v_jog1, v_jog2
    FROM public.fn_arena_placar(p_desafio_id);

  SELECT count(*) INTO v_total
    FROM public.guilda_desafio_questoes WHERE desafio_id = p_desafio_id;

  v_cooperativo := (v_d.formato = 'guilda' AND v_d.guilda_rival_id IS NULL);

  IF v_cooperativo THEN
    IF v_p1 * 2 >= v_total * GREATEST(v_n1, 1) THEN
      v_vencedor := 1; v_resultado := 'vitoria';
    ELSE
      v_vencedor := NULL; v_resultado := 'empate';
    END IF;
  ELSIF v_jog1 = 0 OR v_jog2 = 0 THEN
    v_vencedor := NULL; v_resultado := 'sem_adversario';
  ELSE
    IF v_n1 = 0 OR v_n2 = 0 THEN
      v_vencedor := CASE WHEN v_n1 > 0 THEN 1::smallint
                         WHEN v_n2 > 0 THEN 2::smallint
                         ELSE NULL END;
    ELSIF v_p1 * v_n2 > v_p2 * v_n1 THEN
      v_vencedor := 1;
    ELSIF v_p2 * v_n1 > v_p1 * v_n2 THEN
      v_vencedor := 2;
    ELSIF v_d.modo = 'velocidade' AND v_p1 > 0 AND v_t1 * v_n2 <> v_t2 * v_n1 THEN
      v_vencedor := CASE WHEN v_t1 * v_n2 < v_t2 * v_n1
                         THEN 1::smallint ELSE 2::smallint END;
    ELSE
      v_vencedor := NULL;
    END IF;
    v_resultado := CASE WHEN v_vencedor IS NULL THEN 'empate' ELSE 'vitoria' END;
  END IF;

  UPDATE public.guilda_desafios
     SET status = 'encerrado', encerrado_em = now(),
         vencedor_equipe = v_vencedor, resultado = v_resultado
   WHERE id = p_desafio_id;

  v_ref := 'classe' || ':' || v_d.classe_id::text
         || ':' || 'desafio' || ':' || p_desafio_id::text;

  v_pagos := 0;

  -- `treino` nao escreve NADA: nao pontua, nao move rank, nao paga moeda. O desafio e'
  -- encerrado e o placar e' devolvido do mesmo jeito -- treinar continua mostrando como foi.
  IF v_d.consequencia <> 'treino' THEN
    INSERT INTO public.eventos_aluno
           (aluno_id, tipo, referencia, valor, criado_em, idempotencia_key)
    SELECT pl.aluno_id, t.tipo, v_ref, 0, now(),
           md5(p_desafio_id::text || t.tipo || pl.aluno_id::text)::uuid
      FROM public.fn_arena_placar(p_desafio_id) pl
      CROSS JOIN LATERAL (
        SELECT unnest(
          ARRAY['desafio_participou']
          || CASE
               WHEN v_resultado = 'empate' THEN ARRAY['desafio_empate']
               WHEN v_resultado = 'vitoria' AND pl.equipe = v_vencedor
                 THEN ARRAY['desafio_vencido']
               -- A APOSTA. So' em `ranqueada`, e so' para quem jogou e PERDEU de alguem:
               -- `sem_adversario` nao e derrota, e `empate` ja saiu no ramo de cima.
               WHEN v_resultado = 'vitoria' AND v_d.consequencia = 'ranqueada'
                 THEN ARRAY['desafio_derrota']
               ELSE ARRAY[]::text[]
             END
        ) AS tipo
      ) t
     WHERE pl.estado = 'aceito' AND pl.respondidas > 0
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_pagos = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'status', 'encerrado', 'novo', true,
    'resultado', v_resultado,
    'vencedor_equipe', v_vencedor,
    'cooperativo', v_cooperativo,
    'consequencia', v_d.consequencia,
    'dificuldade', v_d.dificuldade,
    'eventos', v_pagos,
    'equipe_1', jsonb_build_object('pontos', v_p1, 'tempo_ms', v_t1,
                                   'integrantes', v_n1, 'jogaram', v_jog1),
    'equipe_2', jsonb_build_object('pontos', v_p2, 'tempo_ms', v_t2,
                                   'integrantes', v_n2, 'jogaram', v_jog2)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.fn_desafio_encerrar(uuid) FROM PUBLIC, anon, authenticated;

-- A porta do cliente: so' a checagem, o resto delega. Assinatura e retorno iguais aos de
-- hoje, entao nada que a chame precisa mudar.
CREATE OR REPLACE FUNCTION public.arena_encerrar(p_desafio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.desafio_participantes
     WHERE desafio_id = p_desafio_id AND aluno_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'arena_sem_permissao';
  END IF;

  RETURN public.fn_desafio_encerrar(p_desafio_id);
END
$function$;
"""


# --------------------------------------------------------------------------------------
# A varredura: quem desiste nao pode deixar os outros sem pagamento.
# --------------------------------------------------------------------------------------
VARREDURA = """
CREATE OR REPLACE FUNCTION public.fn_desafio_varrer_abandonados()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_min  integer := public.fn_app_config_int('desafio_encerra_apos_min', 30);
  v_id   uuid;
  v_n    integer := 0;
BEGIN
  FOR v_id IN
    SELECT d.id FROM public.guilda_desafios d
     WHERE d.status <> 'encerrado'
       AND d.created_at < now() - make_interval(mins => GREATEST(v_min, 1))
     ORDER BY d.created_at
     -- Teto por passada: a varredura roda a cada 5 min e nao deve virar uma transacao
     -- gigante na primeira vez que ligar numa base com desafio velho acumulado.
     LIMIT 200
  LOOP
    BEGIN
      PERFORM public.fn_desafio_encerrar(v_id);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Um desafio problematico nao pode parar a varredura dos outros: o proximo ciclo
      -- tenta de novo, e o aviso fica no log.
      RAISE WARNING 'fn_desafio_varrer_abandonados: desafio % falhou: %', v_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_n;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_desafio_varrer_abandonados() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('trailup_desafio_varredura')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trailup_desafio_varredura');

SELECT cron.schedule('trailup_desafio_varredura', '*/5 * * * *',
  $cron$SELECT public.fn_desafio_varrer_abandonados();$cron$);
"""

VARREDURA_FORA = """
SELECT cron.unschedule('trailup_desafio_varredura')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trailup_desafio_varredura');

DROP FUNCTION IF EXISTS public.fn_desafio_varrer_abandonados();
"""


# --------------------------------------------------------------------------------------
# A resposta: tempo, tentativa com limite, e fechamento automatico.
# --------------------------------------------------------------------------------------
RESPONDER = """
-- Assinatura nova (o `p_tempo_ms` entra com default), entao a antiga sai: Postgres nao troca
-- lista de parametros no `CREATE OR REPLACE`.
DROP FUNCTION IF EXISTS public.guilda_desafio_responder(uuid, bigint, text);

CREATE OR REPLACE FUNCTION public.guilda_desafio_responder(
  p_desafio_id uuid,
  p_questao_id bigint,
  p_resposta text,
  p_tempo_ms integer DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_q           public.questoes%ROWTYPE;
  v_d           public.guilda_desafios%ROWTYPE;
  v_tipo        text;
  v_correta     boolean;
  v_limite      integer;
  v_feitas      integer;
  v_tentativas  integer;
  v_total       integer;
  v_faltam      integer;
  v_fechou      jsonb := NULL;
BEGIN
  SELECT d.* INTO v_d
    FROM public.guilda_desafios d
    JOIN public.guilda_desafio_questoes dq ON dq.desafio_id = d.id
   WHERE d.id = p_desafio_id
     AND dq.questao_id = p_questao_id
     AND EXISTS (
       SELECT 1 FROM public.guilda_membros gm
        WHERE gm.guilda_id = d.guilda_id
          AND gm.aluno_id = auth.uid()
          AND gm.left_at IS NULL
     );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guilda_desafio_sem_permissao';
  END IF;

  -- Desafio encerrado nao aceita resposta. Sem isto, responder depois do fechamento
  -- mudaria o placar de um desafio JA PAGO -- e `ON CONFLICT DO NOTHING` no pagamento
  -- impede o acerto de virar premio, entao o aluno perderia o que ganhou sem explicacao.
  IF v_d.status = 'encerrado' THEN
    RAISE EXCEPTION 'guilda_desafio_encerrado' USING ERRCODE = '22023';
  END IF;

  -- LIMITE DE TENTATIVA -- e aqui que `desafio_tentativas_dificil` deixa de ser enfeite do
  -- preset. Conta as tentativas JA feitas nesta questao antes de gravar a nova.
  v_limite := public.fn_app_config_int(
    CASE WHEN lower(COALESCE(v_d.dificuldade, 'normal')) = 'dificil'
         THEN 'desafio_tentativas_dificil' ELSE 'desafio_tentativas_normal' END,
    2);
  SELECT COALESCE(r.tentativas, 0) INTO v_feitas
    FROM public.guilda_desafio_respostas r
   WHERE r.desafio_id = p_desafio_id AND r.questao_id = p_questao_id
     AND r.aluno_id = auth.uid();
  IF COALESCE(v_feitas, 0) >= GREATEST(v_limite, 1) THEN
    RAISE EXCEPTION 'guilda_desafio_sem_tentativas' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_q FROM public.questoes WHERE id = p_questao_id;
  v_tipo := lower(btrim(COALESCE(v_q.tipo::text, '')));
  -- Os dois lados do CASE original eram identicos; a comparacao e a mesma para todo tipo.
  v_correta := lower(btrim(COALESCE(p_resposta, '')))
             = lower(btrim(COALESCE(v_q.resposta_correta::text, '')));

  INSERT INTO public.guilda_desafio_respostas
         (desafio_id, questao_id, aluno_id, resposta, correta, tempo_ms, tentativas)
  VALUES (p_desafio_id, p_questao_id, auth.uid(), p_resposta, v_correta,
          GREATEST(COALESCE(p_tempo_ms, 0), 0), 1)
  ON CONFLICT (desafio_id, questao_id, aluno_id) DO UPDATE
     SET resposta = EXCLUDED.resposta,
         correta = EXCLUDED.correta,
         -- O tempo ACUMULA entre tentativas: quem erra e tenta de novo gastou os dois.
         -- Substituir premiaria a ultima tentativa, que e sempre a mais rapida.
         tempo_ms = COALESCE(public.guilda_desafio_respostas.tempo_ms, 0)
                  + GREATEST(COALESCE(EXCLUDED.tempo_ms, 0), 0),
         tentativas = public.guilda_desafio_respostas.tentativas + 1,
         respondida_em = now()
  RETURNING tentativas INTO v_tentativas;

  -- FECHAMENTO AUTOMATICO: a ultima resposta fecha. Quem conta e o par
  -- (participante aceito x questao do desafio) -- participante que nao respondeu tudo
  -- mantem o desafio aberto, e e para isso que existe a varredura.
  SELECT count(*) INTO v_total
    FROM public.guilda_desafio_questoes WHERE desafio_id = p_desafio_id;

  SELECT count(*) INTO v_faltam
    FROM public.desafio_participantes dp
    CROSS JOIN public.guilda_desafio_questoes dq
   WHERE dp.desafio_id = p_desafio_id
     AND dq.desafio_id = p_desafio_id
     AND dp.estado = 'aceito'
     AND NOT EXISTS (
       SELECT 1 FROM public.guilda_desafio_respostas r
        WHERE r.desafio_id = p_desafio_id
          AND r.questao_id = dq.questao_id
          AND r.aluno_id = dp.aluno_id
     );

  IF v_total > 0 AND v_faltam = 0 THEN
    v_fechou := public.fn_desafio_encerrar(p_desafio_id);
  END IF;

  RETURN jsonb_build_object(
    'correta', v_correta,
    'tentativas', v_tentativas,
    'tentativas_restantes', GREATEST(GREATEST(v_limite, 1) - COALESCE(v_tentativas, 1), 0),
    'faltam', v_faltam,
    'encerrou', v_fechou
  );
END
$function$;

REVOKE ALL ON FUNCTION public.guilda_desafio_responder(uuid, bigint, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_desafio_responder(uuid, bigint, text, integer)
  TO authenticated;
"""

RESPONDER_ANTERIOR = """
DROP FUNCTION IF EXISTS public.guilda_desafio_responder(uuid, bigint, text, integer);

CREATE OR REPLACE FUNCTION public.guilda_desafio_responder(p_desafio_id uuid, p_questao_id bigint, p_resposta text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_q public.questoes%ROWTYPE; v_tipo text; v_correta boolean; v_g uuid;
BEGIN
  SELECT d.guilda_id INTO v_g FROM public.guilda_desafios d JOIN public.guilda_desafio_questoes dq ON dq.desafio_id=d.id WHERE d.id=p_desafio_id AND dq.questao_id=p_questao_id AND EXISTS (SELECT 1 FROM public.guilda_membros gm WHERE gm.guilda_id=d.guilda_id AND gm.aluno_id=auth.uid() AND gm.left_at IS NULL);
  IF v_g IS NULL THEN RAISE EXCEPTION 'guilda_desafio_sem_permissao'; END IF;
  SELECT * INTO v_q FROM public.questoes WHERE id=p_questao_id; v_tipo:=lower(btrim(COALESCE(v_q.tipo::text,'')));
  v_correta:=lower(btrim(p_resposta))=lower(btrim(v_q.resposta_correta::text));
  INSERT INTO public.guilda_desafio_respostas(desafio_id,questao_id,aluno_id,resposta,correta) VALUES(p_desafio_id,p_questao_id,auth.uid(),p_resposta,v_correta) ON CONFLICT (desafio_id,questao_id,aluno_id) DO UPDATE SET resposta=EXCLUDED.resposta,correta=EXCLUDED.correta,respondida_em=now();
  RETURN jsonb_build_object('correta',v_correta);
END $function$;

REVOKE ALL ON FUNCTION public.guilda_desafio_responder(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_desafio_responder(uuid, bigint, text) TO authenticated;
"""


# --------------------------------------------------------------------------------------
# A criacao registra os participantes. Corpo da fase 7 (20261021_08) com UM bloco a mais.
# --------------------------------------------------------------------------------------
PARTICIPANTES = """
-- Mesma assinatura da fase 7: `CREATE OR REPLACE` basta, nada que a chame muda.
CREATE OR REPLACE FUNCTION public.guilda_desafio_criar(
  p_guilda_id uuid,
  p_modo text DEFAULT 'todos',
  p_quantidade integer DEFAULT 3,
  p_dificuldade text DEFAULT 'normal',
  p_consequencia text DEFAULT 'ranqueada'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_g public.guildas%ROWTYPE;
  v_id uuid;
  v_qids bigint[];
  v_q bigint;
  v_i integer := 0;
  v_modo text := lower(btrim(COALESCE(p_modo, 'todos')));
  v_dif text := lower(btrim(COALESCE(p_dificuldade, 'normal')));
  v_cons text := lower(btrim(COALESCE(p_consequencia, 'ranqueada')));
  v_params jsonb;
  v_jogadores integer;
BEGIN
  SELECT * INTO v_g
    FROM public.guildas
   WHERE id = p_guilda_id
     AND ativa
     AND EXISTS (
       SELECT 1 FROM public.guilda_membros
        WHERE guilda_id = p_guilda_id AND aluno_id = auth.uid() AND left_at IS NULL
     );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guilda_desafio_invalido';
  END IF;

  IF v_modo NOT IN ('todos', 'velocidade', 'precisao', 'duelo', 'duplo') THEN
    RAISE EXCEPTION 'guilda_desafio_invalido';
  END IF;
  IF v_dif NOT IN ('normal', 'dificil') THEN
    RAISE EXCEPTION 'guilda_desafio_dificuldade_invalida';
  END IF;
  IF v_cons NOT IN ('treino', 'ranqueada', 'evento') THEN
    RAISE EXCEPTION 'guilda_desafio_consequencia_invalida';
  END IF;

  SELECT array_agg(id ORDER BY random()) INTO v_qids
    FROM (
      SELECT q.id
        FROM public.questoes q
        JOIN public.atividades a ON a.id = q.atividade_id
        JOIN public.topicos t ON t.id = a.topico_id
       WHERE t.classe_id = v_g.classe_id
         AND public.fn_questao_liberada(q.id)
       LIMIT 30
    ) s;
  IF COALESCE(array_length(v_qids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'guilda_sem_questoes_liberadas';
  END IF;
  v_qids := v_qids[1:GREATEST(1, LEAST(p_quantidade, 10))];

  INSERT INTO public.guilda_desafios (
    guilda_id, classe_id, criado_por, formato, modo, titulo, configuracao,
    dificuldade, consequencia
  ) VALUES (
    p_guilda_id, v_g.classe_id, auth.uid(), 'guilda', v_modo, 'Desafio da guilda',
    jsonb_build_object('quantidade', array_length(v_qids, 1)),
    v_dif, v_cons
  ) RETURNING id INTO v_id;

  FOREACH v_q IN ARRAY v_qids LOOP
    v_i := v_i + 1;
    INSERT INTO public.guilda_desafio_questoes (desafio_id, questao_id, ordem)
    VALUES (v_id, v_q, v_i);
  END LOOP;

  -- O BLOCO NOVO desta fase. Sem ele `desafio_participantes` fica vazio, `fn_arena_placar`
  -- devolve zero linhas, e o desafio nao paga ninguem nem aparece no painel do professor
  -- (`aceitaram: 0`, `equipes: []`). `equipe 1` e `aceito` porque o desafio de guilda sem
  -- rival e cooperativo: todos jogam do mesmo lado, e `fn_desafio_encerrar` ja o trata assim.
  INSERT INTO public.desafio_participantes
         (desafio_id, aluno_id, equipe, estado, respondido_em)
  SELECT v_id, m.aluno_id, 1, 'aceito', now()
    FROM public.guilda_membros m
   WHERE m.guilda_id = p_guilda_id
     AND m.left_at IS NULL
     AND m.aluno_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_jogadores = ROW_COUNT;

  v_params := public.fn_desafio_params_efetivos(v_dif);

  INSERT INTO public.guilda_mensagens (guilda_id, classe_id, autor_id, tipo, texto, conteudo)
  VALUES (
    p_guilda_id, v_g.classe_id, auth.uid(), 'desafio', 'Um novo desafio foi lançado!',
    jsonb_build_object(
      'id', v_id, 'modo', v_modo, 'quantidade', array_length(v_qids, 1),
      'dificuldade', v_dif, 'consequencia', v_cons, 'params', v_params
    )
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'modo', v_modo,
    'quantidade', array_length(v_qids, 1),
    'dificuldade', v_dif,
    'consequencia', v_cons,
    'jogadores', v_jogadores,
    'params', v_params
  );
END
$function$;
"""


RELOAD = "\nNOTIFY pgrst, 'reload schema';\n"


def upgrade() -> None:
    op.execute(TENTATIVAS)
    op.execute(ENCERRAR_MIOLO)
    op.execute(VARREDURA)
    op.execute(RESPONDER)
    op.execute(PARTICIPANTES)
    op.execute(RELOAD)


def downgrade() -> None:
    # `arena_encerrar` volta a ter o corpo inteiro ANTES de `fn_desafio_encerrar` sair, senão
    # fica um instante em que a porta do cliente aponta para função que já não existe.
    op.execute(_arena_encerrar_da_fase_4())
    op.execute(RESPONDER_ANTERIOR)
    op.execute(VARREDURA_FORA)
    op.execute("DROP FUNCTION IF EXISTS public.fn_desafio_encerrar(uuid);")
    op.execute(TENTATIVAS_FORA)
    op.execute(RELOAD)


def _arena_encerrar_da_fase_4() -> str:
    """`arena_encerrar` como a fase 4 (20261021_06) a deixa, recortada do próprio arquivo.

    Copiar o corpo à mão aqui seria uma segunda fonte da verdade que envelhece em silêncio:
    o downgrade restauraria uma versão que já não é a da fase 4. Recortar do arquivo falha
    alto se ele mudar de forma.
    """
    from pathlib import Path

    fase4 = Path(__file__).with_name("20261021_06_aposta_e_pontuacao_ranqueada.py")
    texto = fase4.read_text(encoding="utf-8")
    marca = "ARENA = \"\"\"\n"
    inicio = texto.index(marca) + len(marca)
    fim = texto.index('\n"""', inicio)
    sql = texto[inicio:fim]
    if "CREATE OR REPLACE FUNCTION public.arena_encerrar(p_desafio_id uuid)" not in sql:
        raise RuntimeError("o bloco ARENA da fase 4 mudou de forma; revise o downgrade da fase 8")
    if "arena_sem_permissao" not in sql:
        raise RuntimeError("a checagem de participante saiu do ARENA da fase 4; revise a fase 8")
    return sql
