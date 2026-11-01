"""O banco enfileira a análise de todo lote de telemetria novo

F3 (transporte da IA) do plano de métricas, Task 1. Cria a fila; quem a consome é o worker da API
(Task 2), que chama as duas funções de reivindicar e de registrar falha.

## O que estava errado

Medido em produção (29/10, só leitura): são 156 `telemetria_lotes`, de 14/10 a 29/10, todos de um aluno,
e **nenhum** tem `analysis_ciclo_id` nem `analysis_error`. 15 são dos últimos 7 dias, e todos têm
`payload`. O build em campo aponta para `*.traefik.me`, que serve certificado autoassinado: o `fetch`
falha, o app cai no caminho direto (grava no Supabase como `authenticated`) e o caminho direto não roda
o pipeline de análise. A análise só existe dentro de `POST /api/v1/telemetria/lotes`.

## O que muda

- `public.telemetria_analise_fila`: um item por lote a analisar (`lote_id` é a chave e cai junto com o
  lote, `ON DELETE CASCADE`), com a próxima tentativa, o número de tentativas, a trava do worker e o
  último erro.
- `fn_telemetria_lote_enfileira_analise()` (`trg_telemetria_lotes_enfileira_analise`, AFTER INSERT, por
  linha): todo lote que nasce sem análise e sem erro entra na fila, pelos dois caminhos (API e direto).
  Lote ignorado por `ON CONFLICT DO NOTHING` não dispara: não houve INSERT.
- `fn_telemetria_lote_sai_da_fila()` (`trg_telemetria_lotes_sai_da_fila`, AFTER UPDATE OF
  `analysis_ciclo_id, analysis_error`, por linha): quando o lote ganha análise ou erro, o item sai. É o
  que acontece quando a análise do pedido termina antes do worker. Convive com os gatilhos de retenção
  da `20261024_03` (`trg_retencao_fila_lotes_upd/_del`, por comando, com tabela de transição).
- `fn_telemetria_analise_reivindicar(p_limite, p_trava_seg)`: primeiro desiste dos itens que já gastaram
  as 5 tentativas e cuja trava venceu (o lote recebe `analysis_error = 'fila: trava vencida'`), depois
  apaga os itens cujo lote já tem análise ou erro (rede de segurança: o gatilho de saída cobre o caso normal), depois trava até
  `p_limite` itens vencidos (`proxima_tentativa_em <= now()`) e sem trava viva, na ordem de vencimento
  (desempate: o lote mais antigo, `created_at`),
  com `FOR UPDATE SKIP LOCKED`, e devolve os `lote_id`. Dois workers ao mesmo tempo não pegam o mesmo
  item. A trava vence em `p_trava_seg`: um worker que morreu no meio não prende o item para sempre.
- `fn_telemetria_analise_falhou(p_lote, p_erro, p_respeitar_trava, p_trava_seg)`: registra a falha de uma
  tentativa.

### Turmas (a guarda do #652)

`fn_telemetria_analise_reivindicar` recebe `p_classe_ids bigint[]` (padrão `NULL` = todas). Com lista, só
reivindica, e só desiste por trava vencida, de item cujo lote é de uma dessas turmas: uma API subida na
máquina de alguém para depurar, restrita à turma dela, não consome a fila compartilhada inteira nem gasta
LLM com o estudo de outras turmas. A limpeza de item já analisado continua valendo para todas (não gasta
nada e não decide nada). A API passa `telemetria_analise_fila_classe_ids`, e, vazia,
`personalizacao_jobs_classe_ids`, a mesma guarda dos jobs de personalização.

### A falha do pedido não solta a trava do worker

O pedido (`POST /telemetria/lotes`) também chama `fn_telemetria_analise_falhou` quando a análise dele
falha, e com `p_respeitar_trava = true`. Se o pedido passou da folga de 5 min e um worker já reivindicou o
lote e o está analisando (`travado_em` dentro de `p_trava_seg`), a falha do pedido não faz nada: zerar
`travado_em` deixaria outro worker pegar o mesmo lote no meio da análise. A janela é parâmetro (padrão
600 s, o mesmo `telemetria_analise_fila_trava_seconds` da API, que a passa) para não divergir da trava da
reivindicação se alguém mudar a configuração. O worker chama com `false`: a trava é dele.

### Decisões (tabela "Decisões deste plano" do plano da F3)

- **P2, folga de 5 min:** o item entra com `proxima_tentativa_em = now() + 5 min`. A análise do pedido
  (que fica, P1) termina antes e tira o item da fila, sem análise em dobro. Custo: até 5 min a mais para
  o lote do caminho direto ser analisado.
- **P3, retroativo de 7 dias** (a janela da I20): os pendentes com `created_at` nos últimos 7 dias entram
  na fila vencendo agora; os mais antigos recebem `analysis_error = 'expirado_sem_analise'`. Analisar
  hoje os 141 lotes de QA de 22/10 gastaria LLM e poderia gerar ações e notificações sobre estudo de uma
  semana atrás. Os antigos ficam sem análise, rotulados honestamente, e a I15 os conta como tratados.
- **P4, 5 tentativas com espera de `2^n` min:** a n-ésima falha (n já contado pela reivindicação) adia
  a próxima para `now() + 2^n` min (2, 4, 8 e 16). Na quinta, o lote recebe
  `analysis_error = 'fila: ' || erro` (até 500 caracteres, o mesmo corte da API) e o gatilho de saída
  tira o item. Um lote envenenado não prende a fila nem gasta LLM sem fim, nem quando derruba o worker
  (falta de memória, cancelamento) e nunca chega a `fn_telemetria_analise_falhou`: a quinta reivindicação
  já contou a tentativa, e quando a trava dela vence a reivindicação seguinte desiste do lote com
  `analysis_error = 'fila: trava vencida'` em vez de devolvê-lo de novo. Custo: uma falha transitória
  de mais de cerca de 30 min (a soma das esperas, 2 + 4 + 8 + 16) vira erro definitivo.

### Por que a tabela não tem policy

A fila é só do worker (`postgres`, dono, e `service_role`). O cliente não lê nem escreve nela: não há
policy e não há GRANT para `anon`/`authenticated` (`REVOKE ALL`). A RLS é ligada aqui de forma explícita
(em produção o event trigger `ensure_rls` já faria isso; o Postgres local dos testes não tem esse
gatilho), então a falta de policy é decisão registrada, não esquecimento: RLS ligada sem policy fecha
para todos menos o dono e o `service_role`.

### Por que `SECURITY DEFINER`

Os dois gatilhos rodam no papel de quem grava o lote, que no caminho direto é `authenticated`, sem
privilégio na fila. As duas funções do worker escrevem na fila e no lote. Todas são
`SET search_path = ''`, com nomes qualificados, `REVOKE ALL ... FROM PUBLIC, anon, authenticated`; só as
duas do worker têm `GRANT EXECUTE` para `service_role`. Dependem de o dono (`postgres`) passar pela RLS
de `telemetria_lotes`, o que vale enquanto a tabela não tiver `FORCE ROW LEVEL SECURITY` (mesma premissa
da `20261029_07`).

### Ordem das travas: lote antes do item

O caminho do pedido (`update_lote_analysis`) trava o lote no UPDATE, e o gatilho de saída então trava o
item da fila para apagá-lo. Toda função daqui segue a mesma ordem, lote antes de item, senão duas
transações cruzadas fariam um deadlock: `fn_telemetria_analise_falhou` trava o lote
(`PERFORM ... FOR UPDATE`) antes de ler o item, e a desistência por trava vencida da reivindicação trava
os lotes pelo próprio UPDATE (com `SKIP LOCKED`: lote que o pedido está gravando fica para a próxima)
antes que o gatilho apague os itens. A limpeza e a reivindicação em si só travam itens da fila, com
`SKIP LOCKED`, e nunca esperam.

### Regra de fronteira

Enfileirar é encanamento (nenhum modelo de linguagem no meio), então fica no banco e vale para os dois
caminhos e para qualquer build em campo. Analisar é IA e fica na API.

## Downgrade

Derruba os dois gatilhos, as quatro funções e a tabela. **Não desfaz o rótulo `expirado_sem_analise`:**
não há como distinguir depois quais lotes o retroativo rotulou de quais seriam rotulados por outra via,
e voltar a nulo faria a I15 acusar de novo lotes que a P3 decidiu não analisar.

Revision ID: 20261029_09
Revises: 20261029_08
Create Date: 2026-10-29
"""

from alembic import op

revision = "20261029_09"
down_revision = "20261029_08"
branch_labels = None
depends_on = None

FOLGA = "5 minutes"  # P2
JANELA_RETROATIVO = "7 days"  # P3
MAX_TENTATIVAS = 5  # P4
ROTULO_EXPIRADO = "expirado_sem_analise"
ROTULO_TRAVA_VENCIDA = "fila: trava vencida"

TABELA = """
CREATE TABLE IF NOT EXISTS public.telemetria_analise_fila (
  lote_id              uuid PRIMARY KEY REFERENCES public.telemetria_lotes (id) ON DELETE CASCADE,
  enfileirado_em       timestamptz NOT NULL DEFAULT now(),
  proxima_tentativa_em timestamptz NOT NULL,
  tentativas           integer NOT NULL DEFAULT 0,
  travado_em           timestamptz,
  ultimo_erro          text
);
CREATE INDEX IF NOT EXISTS telemetria_analise_fila_proxima_idx
  ON public.telemetria_analise_fila (proxima_tentativa_em);

ALTER TABLE public.telemetria_analise_fila ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.telemetria_analise_fila FROM PUBLIC, anon, authenticated;
"""

ENFILEIRA = f"""
CREATE OR REPLACE FUNCTION public.fn_telemetria_lote_enfileira_analise()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  IF NEW.analysis_ciclo_id IS NULL AND NEW.analysis_error IS NULL THEN
    -- folga: a analise do pedido termina antes e tira o item, sem analise em dobro
    INSERT INTO public.telemetria_analise_fila (lote_id, proxima_tentativa_em)
    VALUES (NEW.id, now() + interval '{FOLGA}')
    ON CONFLICT (lote_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_telemetria_lote_enfileira_analise() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_telemetria_lotes_enfileira_analise ON public.telemetria_lotes;
CREATE TRIGGER trg_telemetria_lotes_enfileira_analise
  AFTER INSERT ON public.telemetria_lotes
  FOR EACH ROW EXECUTE FUNCTION public.fn_telemetria_lote_enfileira_analise();
"""

SAI = """
CREATE OR REPLACE FUNCTION public.fn_telemetria_lote_sai_da_fila()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  IF NEW.analysis_ciclo_id IS NOT NULL OR NEW.analysis_error IS NOT NULL THEN
    DELETE FROM public.telemetria_analise_fila WHERE lote_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_telemetria_lote_sai_da_fila() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_telemetria_lotes_sai_da_fila ON public.telemetria_lotes;
CREATE TRIGGER trg_telemetria_lotes_sai_da_fila
  AFTER UPDATE OF analysis_ciclo_id, analysis_error ON public.telemetria_lotes
  FOR EACH ROW EXECUTE FUNCTION public.fn_telemetria_lote_sai_da_fila();
"""

REIVINDICAR = f"""
DROP FUNCTION IF EXISTS public.fn_telemetria_analise_reivindicar(integer, integer);
CREATE OR REPLACE FUNCTION public.fn_telemetria_analise_reivindicar(
  p_limite integer, p_trava_seg integer, p_classe_ids bigint[] DEFAULT NULL
)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- desiste do lote que gastou as tentativas e derrubou o worker (nunca chegou a falhou()). Ordem lote ->
  -- item: o UPDATE trava os lotes e o gatilho de saida apaga os itens.
  UPDATE public.telemetria_lotes
     SET analysis_error = '{ROTULO_TRAVA_VENCIDA}'
   WHERE id IN (SELECT l.id
                  FROM public.telemetria_lotes l
                  JOIN public.telemetria_analise_fila f ON f.lote_id = l.id
                 WHERE f.tentativas >= {MAX_TENTATIVAS}
                   AND f.travado_em < now() - make_interval(secs => p_trava_seg)
                   AND l.analysis_ciclo_id IS NULL AND l.analysis_error IS NULL
                   AND (p_classe_ids IS NULL OR l.classe_id = ANY (p_classe_ids))
                   FOR UPDATE OF l SKIP LOCKED);

  -- rede de seguranca: item cujo lote ja tem analise ou erro (o gatilho de saida cobre o caso normal).
  -- SKIP LOCKED aqui tambem: um item travado por outro worker nao faz este esperar.
  DELETE FROM public.telemetria_analise_fila
   WHERE lote_id IN (SELECT f.lote_id
                       FROM public.telemetria_analise_fila f
                       JOIN public.telemetria_lotes l ON l.id = f.lote_id
                      WHERE l.analysis_ciclo_id IS NOT NULL OR l.analysis_error IS NOT NULL
                        FOR UPDATE OF f SKIP LOCKED);

  RETURN QUERY
  WITH alvo AS (
    SELECT f.lote_id, l.created_at
      FROM public.telemetria_analise_fila f
      JOIN public.telemetria_lotes l ON l.id = f.lote_id
     WHERE f.proxima_tentativa_em <= now()
       AND (f.travado_em IS NULL OR f.travado_em < now() - make_interval(secs => p_trava_seg))
       AND (p_classe_ids IS NULL OR l.classe_id = ANY (p_classe_ids))
     -- desempate pelo lote mais antigo: o retroativo enfileira todos com o mesmo now(), e a janela de
     -- recorrencia de aluno_mental_state_history depende da ordem em que os ciclos acontecem
     ORDER BY f.proxima_tentativa_em, l.created_at
     LIMIT p_limite
       FOR UPDATE OF f SKIP LOCKED
  ), marcado AS (
    UPDATE public.telemetria_analise_fila f
       SET travado_em = now(), tentativas = f.tentativas + 1
      FROM alvo
     WHERE f.lote_id = alvo.lote_id
    RETURNING f.lote_id, f.proxima_tentativa_em
  )
  SELECT m.lote_id FROM marcado m JOIN alvo a ON a.lote_id = m.lote_id ORDER BY m.proxima_tentativa_em, a.created_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_telemetria_analise_reivindicar(integer, integer, bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_telemetria_analise_reivindicar(integer, integer, bigint[]) TO service_role;
"""

FALHOU = f"""
DROP FUNCTION IF EXISTS public.fn_telemetria_analise_falhou(uuid, text);
CREATE OR REPLACE FUNCTION public.fn_telemetria_analise_falhou(
  p_lote uuid, p_erro text, p_respeitar_trava boolean DEFAULT false, p_trava_seg integer DEFAULT 600
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_tentativas integer;
  v_travado_em timestamptz;
BEGIN
  -- ordem lote -> item, a mesma do pedido (UPDATE do lote, e o gatilho de saida apaga o item)
  PERFORM 1 FROM public.telemetria_lotes WHERE id = p_lote FOR UPDATE;
  SELECT f.tentativas, f.travado_em INTO v_tentativas, v_travado_em
    FROM public.telemetria_analise_fila f
   WHERE f.lote_id = p_lote
     FOR UPDATE;
  IF NOT FOUND THEN
    -- o lote ja saiu da fila (a analise do pedido terminou no meio): nada a registrar
    RETURN;
  END IF;

  IF p_respeitar_trava AND v_travado_em IS NOT NULL
     AND v_travado_em >= now() - make_interval(secs => p_trava_seg) THEN
    -- o pedido falhou, mas um worker reivindicou o lote e ainda o analisa: a falha e dele, nao do pedido
    RETURN;
  END IF;

  IF v_tentativas >= {MAX_TENTATIVAS} THEN
    -- desiste: o erro no lote faz o gatilho de saida tirar o item
    UPDATE public.telemetria_lotes
       SET analysis_error = left('fila: ' || COALESCE(p_erro, ''), 500)
     WHERE id = p_lote;
  ELSE
    UPDATE public.telemetria_analise_fila
       SET proxima_tentativa_em = now() + make_interval(mins => power(2, v_tentativas)::int),
           travado_em = NULL,
           ultimo_erro = left(p_erro, 500)
     WHERE lote_id = p_lote;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_telemetria_analise_falhou(uuid, text, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_telemetria_analise_falhou(uuid, text, boolean, integer) TO service_role;
"""

RETROATIVO = f"""
INSERT INTO public.telemetria_analise_fila (lote_id, proxima_tentativa_em)
SELECT l.id, now()
  FROM public.telemetria_lotes l
 WHERE l.analysis_ciclo_id IS NULL AND l.analysis_error IS NULL
   AND l.created_at >= now() - interval '{JANELA_RETROATIVO}'
ON CONFLICT (lote_id) DO NOTHING;

UPDATE public.telemetria_lotes
   SET analysis_error = '{ROTULO_EXPIRADO}'
 WHERE analysis_ciclo_id IS NULL AND analysis_error IS NULL
   AND created_at < now() - interval '{JANELA_RETROATIVO}';
"""

DOWNGRADE = """
DROP TRIGGER IF EXISTS trg_telemetria_lotes_sai_da_fila ON public.telemetria_lotes;
DROP TRIGGER IF EXISTS trg_telemetria_lotes_enfileira_analise ON public.telemetria_lotes;
DROP FUNCTION IF EXISTS public.fn_telemetria_analise_falhou(uuid, text, boolean, integer);
DROP FUNCTION IF EXISTS public.fn_telemetria_analise_falhou(uuid, text);
DROP FUNCTION IF EXISTS public.fn_telemetria_analise_reivindicar(integer, integer, bigint[]);
DROP FUNCTION IF EXISTS public.fn_telemetria_analise_reivindicar(integer, integer);
DROP FUNCTION IF EXISTS public.fn_telemetria_lote_sai_da_fila();
DROP FUNCTION IF EXISTS public.fn_telemetria_lote_enfileira_analise();
DROP TABLE IF EXISTS public.telemetria_analise_fila;
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(ENFILEIRA)
    op.execute(SAI)
    op.execute(REIVINDICAR)
    op.execute(FALHOU)
    op.execute(RETROATIVO)


def downgrade() -> None:
    # O rótulo `expirado_sem_analise` fica: voltar a nulo faria a I15 acusar o que a P3 decidiu não analisar.
    op.execute(DOWNGRADE)
