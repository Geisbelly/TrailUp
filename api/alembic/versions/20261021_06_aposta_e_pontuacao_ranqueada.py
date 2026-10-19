"""Fase 4 dos modos: aposta, piso, e a divergencia `sum(valor)` x `GREATEST(valor,0)` resolvida

Quarta fase de `docs/superpowers/specs/2026-10-19-eventos-missoes-ranks-modos-design.md`.
Entra depois da 5b porque a 4 foi pulada na ordem de execucao; a cadeia e'
`20261021_01 -> _02 -> _03 -> _04 (5a) -> _05 (5b) -> _06 (esta)`.

Esta e a fase que da dente aos eixos que a fase 1 criou: `consequencia` passa a decidir se o
desafio escreve em `eventos_aluno`, e `dificuldade` passa a multiplicar o que ele vale.

## O que o spec dizia e nao funciona

> "a derrota ranqueada nao precisa de schema novo: e uma linha em `eventos_pontuacao` com
> `pontos` negativo"

**Nao passa.** `eventos_pontuacao` tem `CHECK (pontos >= 0)` -- medido, junto com
`CHECK (moedas >= 0)`. O spec conferiu que `eventos_aluno.valor` nao tem CHECK (verdade) e
concluiu que a TABELA DE PRECOS tambem nao tinha. O INSERT da derrota falharia na migracao.

A saida nao e' derrubar o CHECK: ele e' o que impede um erro de digitacao numa linha de preco
virar pontuacao negativa para todo mundo (so' `service_role` escreve ali -- o cliente tem
SELECT e nada mais, verificado). Entao a coluna `penalidade` marca a linha que PODE ser
negativa, e o CHECK vira `pontos >= 0 OR penalidade`. Negativo passa a ser decisao registrada
na propria linha, e as outras 18 continuam protegidas.

`eventos_pontuacao_classe` nao e tocada de proposito: ela tem `pontos` com o mesmo CHECK, mas
`fn_pontos_do_evento(text)` nao tem sobrecarga que a leia (so' `fn_moedas_do_evento` consulta
a versao por classe). A coluna esta morta hoje; abrir o CHECK dela seria abrir superficie sem
efeito nenhum.

## A aposta nao pode vir no INSERT

`trg_eventos_aluno_valor_do_banco` descarta o `valor` que o cliente manda e o recalcula por
`fn_pontos_do_evento(tipo)`. Entao o fator de dificuldade **nao pode** ser aplicado pela
`arena_encerrar` no valor inserido -- seria descartado uma linha depois.

Nem cabe um tipo de evento por dificuldade (`desafio_vencido_dificil`...): isso multiplica a
tabela de precos por cada eixo novo.

O caminho que o proprio repo ja usa e' o fator resolvido no banco a partir da REFERENCIA, que
e' exatamente o que `fn_fator_de_atraso(aluno, referencia, quando)` faz. `fn_fator_de_aposta`
e irmao dela: le o desafio pela referencia `classe:<id>:desafio:<uuid>` e devolve o
multiplicador de `app_config`. Aplicado no mesmo lugar, logo antes do atraso.

Uma diferenca que importa: o atraso roda sob `IF COALESCE(NEW.valor,0) > 0`. A aposta roda
sob `<> 0`, senao ela nunca alcancaria a derrota -- que e' o unico valor negativo que existe.

## O piso, e por que ele e por aluno e por turma

Sem piso, uma sequencia de derrotas leva o aluno a pontuacao negativa e ao fim da lista --
desmotivador justamente para quem ja esta perdendo. O piso e' `ranqueada_piso_pontos`
(default 0: da' para perder o que ganhou na turma, nao da' para ficar devendo).

A conta e' contra o ACUMULADO do aluno naquela turma, porque e' isso que o rank mostra
("por turma, pontos acumulados"). O indice `eventos_aluno_classe_aluno_idx (classe_id,
aluno_id)` ja existe e serve a consulta.

Dois detalhes:

- **`e.id <> NEW.id` nao e' paranoia.** O gatilho tambem roda em UPDATE, e ali a propria linha
  JA esta na tabela com o valor antigo. Sem excluir-se da soma, um UPDATE qualquer veria o
  proprio desconto como "ja acumulado" e o aplicaria de novo.
- **`classe_id` nulo zera a penalidade**, e explicitamente, com `IF` -- nao pelo acidente de
  `e.classe_id = NULL` nunca ser verdade. Evento sem classe nao chega a rank algum, e o
  gatilho ja zera os POSITIVOS nessa situacao; zerar o negativo tambem e' a mesma regra, so'
  simetrica. Cai para o lado de nao punir, igual `app_prazo_atraso_fator`.

## A divergencia medida, resolvida nos dois lugares

| onde | antes | agora |
| --- | --- | --- |
| `fn_evento_classe_apurar` | `sum(GREATEST(valor, 0))` | `sum(valor)` |
| `vw_rank_posicoes_por_classe_todas` | `sum(valor)` | `sum(valor)` (ja estava) |

A derrota passa a descontar nos DOIS. O `GREATEST` nao era uma posicao sobre economia -- foi
escrito quando valor negativo nao existia. Mantido, a aposta derrubaria o rank sem mexer na
apuracao do evento, que e' a inconsistencia que o spec mandou resolver nesta fase.

**Tirar o `GREATEST` nao bastava, e so' a execucao mostrou:** `eventos_classe_resultado` e
`eventos_classe_resultado_guilda` tem cada uma `CHECK (pontos >= 0)` na coluna de DESTINO.
Com a soma bruta, a primeira apuracao com uma derrota abortava inteira com 23514 -- o evento
nunca fechava, ninguem recebia medalha, e o erro aparecia longe da causa. Os dois CHECKs saem.

Eles sao diferentes do de `eventos_pontuacao`, que ficou (marcado por `penalidade`): la a
linha e' PRECO escrito a mao, e proteger contra digito errado faz sentido; aqui a coluna e'
RESULTADO de um `sum()` que passa a poder ser negativo por desenho. Um numero negativo num
placar e' menos grave que uma apuracao que nao roda.

`participou` continua sendo `COUNT(ea.id) > 0` (jogar conta como participar mesmo perdendo) e
`destaque` continua exigindo `pontos > 0` -- quem fechou o evento no negativo nao e' destaque.

**Nada disso e retroativo, e isso foi medido:** `guilda_desafios` tem 0 linhas e
`eventos_aluno` tem 0 eventos `desafio%` (e `min(valor) = 0` nas 520 linhas existentes). A
mudanca vale para o que vier.

## `rank_tipo`: o CASE da view e o criterio que o console promete

A view tem `CASE rt.criterio WHEN 'percentual' / 'pontuacao' / 'tempo' ELSE 0`. Logo **criar
um tipo de ranking com criterio novo ranqueia todo mundo em zero** -- em silencio, porque
`ELSE 0` nao e' erro. E' a mesma armadilha do PR #540.

Duas consequencias medidas disso, que esta fase conserta:

1. O console oferece `pontuacao | tempo | acertos` (`rankings.ts`). **`acertos` nao existe no
   CASE** -- um ranking de acertos sempre mostrou todo mundo com zero. A coluna existe
   (`classe_aluno."acertosPercentual"`, e a view ja faz join em `classe_aluno`), entao o
   ramo e uma linha. Conserta-se o calculo em vez de tirar a opcao.
2. `percentual` existe no CASE e tem linha na tabela ("Percentual Concluido"), mas o console
   nao sabe expressa-lo: `criterioValido` manda todo desconhecido para `pontuacao`. Editar
   aquele tipo pelo console REESCREVIA o criterio dele. (A parte do cliente vai no mesmo PR.)

E `ranqueada` entra como criterio proprio -- pontos so' dos desafios `consequencia =
'ranqueada'`, que e' a escada que a aposta move.

O join do criterio `ranqueada` compara `d.id::text`, nao `...::uuid`: o recorte da referencia
e' um `substring` por regexp, e um texto de 36 caracteres do alfabeto do uuid que nao seja um
uuid valido levantaria em tempo de execucao DENTRO da view do rank.

> A view mantem `security_invoker` desligado e segue sem GRANT para `anon`/`authenticated` --
> ela e' a excecao deliberada que o CLAUDE.md descreve (o par com
> `vw_rank_posicoes_por_classe`). `CREATE OR REPLACE VIEW` preserva reloptions e GRANTs; a
> lista de colunas nao muda, entao a view dependente continua valendo.

Revision ID: 20261021_06
Revises: 20261021_05
Create Date: 2026-10-19
"""

from alembic import op

revision = "20261021_06"
down_revision = "20261021_05"
branch_labels = None
depends_on = None


# --------------------------------------------------------------------------------------
# Tabela de precos: a linha que pode ser negativa e marcada como tal.
# --------------------------------------------------------------------------------------
PRECOS = """
ALTER TABLE public.eventos_pontuacao
  ADD COLUMN IF NOT EXISTS penalidade boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.eventos_pontuacao.penalidade IS
  'Autoriza pontos negativo nesta linha. O CHECK e pontos >= 0 OR penalidade: negativo e '
  'decisao registrada na linha, nao ausencia de guarda na tabela.';

ALTER TABLE public.eventos_pontuacao DROP CONSTRAINT IF EXISTS eventos_pontuacao_pontos_check;
ALTER TABLE public.eventos_pontuacao ADD CONSTRAINT eventos_pontuacao_pontos_check
  CHECK (pontos >= 0 OR penalidade);

-- A aposta. Moedas fica em 0 e nao por acaso: `fn_eventos_aluno_paga_moeda` so grava com
-- `v_moedas > 0`, e `moedas_ledger` nao deve ir para tras por derrota -- perder pontuacao e
-- uma coisa, confiscar carteira e outra.
INSERT INTO public.eventos_pontuacao (tipo, pontos, moedas, descricao, penalidade) VALUES
  ('desafio_derrota', -6, 0, 'Perdeu um desafio ranqueado da arena (a aposta).', true)
ON CONFLICT (tipo) DO UPDATE
   SET pontos = EXCLUDED.pontos,
       moedas = EXCLUDED.moedas,
       descricao = EXCLUDED.descricao,
       penalidade = EXCLUDED.penalidade;

INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('ranqueada_piso_pontos', '0',
   'Piso do acumulado do aluno na turma. A derrota nunca desce dele. Privado: e teto '
   'anti-abuso ao contrario -- saber onde a punicao para ajuda a planeja-la.', false)
ON CONFLICT (chave) DO NOTHING;
"""


# --------------------------------------------------------------------------------------
# Leitores de configuracao.
# --------------------------------------------------------------------------------------
LEITORES = """
-- Irmao de `fn_app_config_int`, para chave DECIMAL ou NEGATIVA.
--
-- O idioma das outras chaves e `regexp_replace(valor, '[^0-9]', '', 'g')`, que apaga o ponto
-- E o sinal: '2.0' viraria 20 e '-50' viraria 50. `app_prazo_atraso_fator` ja avisava do
-- ponto; o sinal e o mesmo problema, e aqui ele importa porque o piso pode ser negativo.
CREATE OR REPLACE FUNCTION public.fn_app_config_num(p_chave text, p_padrao numeric)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
  v_bruto text;
  v_valor numeric;
BEGIN
  SELECT valor INTO v_bruto FROM public.app_config WHERE chave = p_chave;
  IF v_bruto IS NULL THEN
    RETURN p_padrao;
  END IF;

  BEGIN
    -- `-` por ultimo na classe para ser literal, nao faixa. A virgula de quem edita a linha
    -- na mao vira ponto antes.
    v_valor := NULLIF(regexp_replace(translate(v_bruto, ',', '.'), '[^0-9.-]', '', 'g'), '')::numeric;
  EXCEPTION WHEN others THEN
    -- Linha malformada cai no padrao. Levantar aqui quebraria o fluxo do aluno por causa de
    -- um caractere numa tabela de configuracao.
    RETURN p_padrao;
  END;

  RETURN COALESCE(v_valor, p_padrao);
END;
$function$;

CREATE OR REPLACE FUNCTION public.app_ranqueada_piso_pontos()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
  SELECT public.fn_app_config_num('ranqueada_piso_pontos', 0);
$function$;

-- Multiplicador da dificuldade. Dificuldade desconhecida vale 1: um valor novo na coluna nao
-- pode mudar a pontuacao de ninguem antes de ter preset proprio.
CREATE OR REPLACE FUNCTION public.app_desafio_aposta_fator(p_dificuldade text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
  SELECT CASE lower(COALESCE(p_dificuldade, ''))
           WHEN 'dificil' THEN public.fn_app_config_num('desafio_aposta_fator_dificil', 2.0)
           WHEN 'normal'  THEN public.fn_app_config_num('desafio_aposta_fator_normal', 1.0)
           ELSE 1
         END;
$function$;

-- Irmao de `fn_fator_de_atraso`: quem decide o fator e a REFERENCIA, nao o tipo do evento.
-- Referencia que nao seja de desafio nem chega a consultar `guilda_desafios`.
CREATE OR REPLACE FUNCTION public.fn_fator_de_aposta(p_referencia text)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
  v_id text;
  v_dificuldade text;
BEGIN
  v_id := NULLIF(
    substring(TRIM(BOTH FROM COALESCE(p_referencia, '')) from 'desafio:([0-9a-fA-F-]{36})$'),
    ''
  );
  IF v_id IS NULL THEN
    RETURN 1;
  END IF;

  -- Comparacao por texto, nao cast para uuid: 36 caracteres do alfabeto do uuid podem nao
  -- formar um uuid valido, e o cast levantaria dentro do gatilho de pontuacao.
  SELECT d.dificuldade INTO v_dificuldade
    FROM public.guilda_desafios d WHERE d.id::text = v_id;

  IF v_dificuldade IS NULL THEN
    RETURN 1;
  END IF;

  RETURN public.app_desafio_aposta_fator(v_dificuldade);
END;
$function$;
"""


# --------------------------------------------------------------------------------------
# O gatilho de valor: aposta e piso. O resto do corpo e identico ao de hoje.
# --------------------------------------------------------------------------------------
GATILHO = """
CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_valor_do_banco()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_piso      numeric;
  v_acumulado numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Resolvida uma vez, aqui. O que o cliente mandar nesta coluna e' ignorado.
    NEW.classe_id := public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia);
  ELSE
    -- Congelada. Nem exclusao de conteudo nem UPDATE do cliente a mudam -- e o
    -- cliente PODE dar UPDATE nos proprios eventos (`eventos_aluno_posse_upd`),
    -- entao sem esta linha ele moveria a pontuacao para a turma que quisesse.
    NEW.classe_id := OLD.classe_id;

    -- O TIPO congela junto, e ANTES do teste de creditado abaixo. E' o tipo que
    -- decide se o valor vem de quem concedeu ou de `fn_pontos_do_evento`, entao
    -- troca-lo no UPDATE era escolher a regra: `fn_evento_creditado` casa por
    -- prefixo, e um `SET tipo = 'participacao_extra', valor = 55555` saia
    -- pago. Restaurar depois do teste nao resolveria -- a linha ja teria
    -- retornado pelo atalho.
    NEW.tipo := OLD.tipo;

    -- Quem concedeu e para quem tambem sao historico: sem isto o aluno se
    -- declara concedido por um professor, ou passa o evento para outro.
    NEW.concedido_por := OLD.concedido_por;
    NEW.aluno_id := OLD.aluno_id;
    NEW.motivo := OLD.motivo;
  END IF;

  -- Creditado tem valor de quem concede: presenca e participacao vem da RPC,
  -- o premio de conquista vem de `conquistas.pontos_recompensa`.
  IF public.fn_evento_creditado(NEW.tipo) THEN
    -- ... e no UPDATE esse valor ja foi decidido, entao e' historico tambem.
    -- Este era o buraco: o atalho devolvia NEW com o `valor` do cliente, e o
    -- rank le exatamente esta coluna.
    IF TG_OP <> 'INSERT' THEN
      NEW.valor := OLD.valor;
    END IF;
    RETURN NEW;
  END IF;

  -- Para todo o resto, o que o cliente mandou em `valor` e' descartado.
  NEW.valor := public.fn_pontos_do_evento(NEW.tipo);

  IF public.fn_evento_de_conclusao(NEW.tipo) THEN
    -- Conclusao sem referencia nao pode ser atribuida a rank algum.
    IF NULLIF(TRIM(BOTH FROM COALESCE(NEW.referencia, '')), '') IS NULL THEN
      NEW.valor := 0;
      RETURN NEW;
    END IF;

    -- Concluir de novo nao paga de novo. A linha E gravada -- o cliente faz
    -- `.insert().select().single()` e um RETURN NULL o quebraria. No UPDATE a
    -- comparacao e' "existe linha ANTERIOR com a mesma chave": comparar por
    -- existencia acharia a propria vizinha e zeraria as duas.
    IF EXISTS (
      SELECT 1
        FROM public.eventos_aluno e
       WHERE e.aluno_id = NEW.aluno_id
         AND e.tipo = NEW.tipo
         AND e.referencia = NEW.referencia
         AND (
           TG_OP = 'INSERT'
           OR (COALESCE(e.criado_em, 'epoch'::timestamp), e.id)
              < (COALESCE(NEW.criado_em, 'epoch'::timestamp), NEW.id)
         )
    ) THEN
      NEW.valor := 0;
    END IF;
  END IF;

  -- Sem classe resolvida no INSERT, o evento nao chega a rank algum: pagar por
  -- ele inflaria o razao com pontos invisiveis. Agora e' leitura de coluna, nao
  -- consulta -- e no UPDATE le a classe CONGELADA, entao conteudo apagado depois
  -- nao tira os pontos de ninguem.
  --
  -- `conquista:<id>` nao entra aqui: e' creditado e ja retornou acima.
  IF COALESCE(NEW.valor, 0) > 0
     AND NEW.referencia IS NOT NULL
     AND NEW.classe_id IS NULL THEN
    NEW.valor := 0;
  END IF;

  -- APOSTA -- multiplicativo, e ANTES do atraso. E' propriedade do DESAFIO (a dificuldade
  -- com que ele foi criado), nao da entrega, entao nao se mistura com a conta de prazo.
  --
  -- A guarda e `<> 0`, nao `> 0` como a do atraso: a derrota ranqueada e o unico valor
  -- negativo do sistema, e e' exatamente ela que a aposta precisa alcancar. Com `> 0` a
  -- dificuldade dobraria o premio e deixaria o risco igual.
  IF COALESCE(NEW.valor, 0) <> 0 THEN
    NEW.valor := ROUND(NEW.valor * public.fn_fator_de_aposta(NEW.referencia));
  END IF;

  -- PISO -- so' para negativo, contra o acumulado do aluno NAQUELA turma, que e' o que o
  -- rank mostra. Sem ele uma sequencia de derrotas manda para o negativo justamente quem ja
  -- esta perdendo.
  IF COALESCE(NEW.valor, 0) < 0 THEN
    IF NEW.classe_id IS NULL THEN
      -- Evento sem classe nao chega a rank algum. O bloco acima ja zera os positivos nessa
      -- situacao; zerar o negativo e' a mesma regra, simetrica. Explicito de proposito: nao
      -- depender de `e.classe_id = NULL` nunca ser verdade.
      NEW.valor := 0;
    ELSE
      v_piso := public.app_ranqueada_piso_pontos();

      -- `e.id <> NEW.id` porque o gatilho tambem roda em UPDATE, e ali a propria linha ja
      -- esta na tabela com o valor antigo -- sem isto o UPDATE veria o proprio desconto
      -- como ja acumulado e o aplicaria de novo.
      SELECT COALESCE(sum(e.valor), 0) INTO v_acumulado
        FROM public.eventos_aluno e
       WHERE e.aluno_id = NEW.aluno_id
         AND e.classe_id = NEW.classe_id
         AND e.id <> NEW.id;

      -- `LEAST(0, ...)` para o piso nunca VIRAR premio: aluno abaixo do piso (possivel se a
      -- chave for editada para cima) receberia um positivo sem ter ganhado nada.
      NEW.valor := LEAST(0, GREATEST(NEW.valor, v_piso - v_acumulado));
    END IF;
  END IF;

  -- ATRASO -- o ULTIMO passo, e multiplicativo. Zero vezes qualquer coisa
  -- continua zero, entao aplicar aqui nao desfaz nenhuma das regras acima:
  -- conclusao repetida, referencia vazia e classe nula continuam valendo 0.
  -- Com o fator em 1.0, que e como ele nasce, esta linha nao muda nada.
  --
  -- O instante julgado e o do EVENTO, nao o de agora: assim um UPDATE futuro
  -- nao transforma em atrasado o que foi entregue no prazo. `criado_em` e
  -- `timestamp without time zone` gravado por `now()` numa sessao UTC (conferido
  -- no banco), entao `AT TIME ZONE 'UTC'` o devolve ao instante certo.
  IF COALESCE(NEW.valor, 0) > 0 THEN
    NEW.valor := ROUND(
      NEW.valor * public.fn_fator_de_atraso(
        NEW.aluno_id,
        NEW.referencia,
        COALESCE(NEW.criado_em AT TIME ZONE 'UTC', now())
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;
"""


# --------------------------------------------------------------------------------------
# A arena: `consequencia` decide se escreve, `ranqueada` paga a derrota.
# --------------------------------------------------------------------------------------
ARENA = """
CREATE OR REPLACE FUNCTION public.arena_encerrar(p_desafio_id uuid)
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
  SELECT * INTO v_d FROM public.guilda_desafios
   WHERE id = p_desafio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'arena_desafio_inexistente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.desafio_participantes
     WHERE desafio_id = p_desafio_id AND aluno_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'arena_sem_permissao';
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
"""


# --------------------------------------------------------------------------------------
# O destino da soma tem de aceitar o que a soma passa a produzir.
# --------------------------------------------------------------------------------------
RESULTADO_ACEITA_NEGATIVO = """
-- Sem isto, `sum(valor)` + uma derrota = 23514 e a apuracao aborta INTEIRA: o evento nao
-- fecha, ninguem recebe medalha, e o erro aparece longe da causa. Medido ao vivo.
--
-- Ao contrario do CHECK de `eventos_pontuacao` (que ficou, marcado por `penalidade`), aqui a
-- coluna nao e preco escrito a mao: e resultado de um `sum()` que passa a poder ser negativo
-- por desenho. Placar negativo e menos grave que apuracao que nao roda.
ALTER TABLE public.eventos_classe_resultado
  DROP CONSTRAINT IF EXISTS eventos_classe_resultado_pontos_check;
ALTER TABLE public.eventos_classe_resultado_guilda
  DROP CONSTRAINT IF EXISTS eventos_classe_resultado_guilda_pontos_check;

COMMENT ON COLUMN public.eventos_classe_resultado.pontos IS
  'Soma bruta de eventos_aluno.valor na janela do evento. Pode ser NEGATIVA desde a fase 4: '
  'a derrota ranqueada desconta aqui do mesmo jeito que no rank. `destaque` continua exigindo '
  'pontos > 0, e `posicao` ordena com negativo no fim.';

-- `membros >= 0` e `posicao >= 1` continuam: a posicao da guilda ja nasce NULL quando os
-- pontos nao sao positivos (`CASE WHEN g.pontos > 0`), entao nada colide.
"""

RESULTADO_SO_POSITIVO = """
-- Volta o piso de zero. Linha negativa gravada enquanto a fase 4 estava de pe impediria o
-- CHECK de validar, entao ela e subida para zero antes -- o downgrade nao pode travar.
UPDATE public.eventos_classe_resultado SET pontos = 0 WHERE pontos < 0;
UPDATE public.eventos_classe_resultado_guilda SET pontos = 0 WHERE pontos < 0;

ALTER TABLE public.eventos_classe_resultado ADD CONSTRAINT eventos_classe_resultado_pontos_check
  CHECK (pontos >= 0);
ALTER TABLE public.eventos_classe_resultado_guilda ADD CONSTRAINT eventos_classe_resultado_guilda_pontos_check
  CHECK (pontos >= 0);
"""


# --------------------------------------------------------------------------------------
# A apuracao do evento: `sum(valor)`, do mesmo jeito que o rank. Resto identico.
# --------------------------------------------------------------------------------------
APURACAO_SOMA_BRUTA = """
      SELECT ca.aluno_id,
             -- `sum(valor)` e nao `sum(GREATEST(valor, 0))`: a derrota ranqueada desconta
             -- AQUI tambem. O GREATEST foi escrito quando valor negativo nao existia; com a
             -- aposta ele deixaria o rank cair sem a apuracao do evento mudar.
             COALESCE(SUM(ea.valor), 0) AS pontos,
             COUNT(ea.id) > 0 AS participou"""

APURACAO_SOMA_ANTIGA = """      SELECT ca.aluno_id,
             COALESCE(SUM(GREATEST(ea.valor, 0)), 0) AS pontos,
             COUNT(ea.id) > 0 AS participou"""


def _apuracao(soma: str) -> str:
    return f"""
CREATE OR REPLACE FUNCTION public.fn_evento_classe_apurar(p_evento_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_evento public.eventos_classe%ROWTYPE;
  v_participantes integer;
  v_conq_part bigint;
  v_conq_dest bigint;
BEGIN
  SELECT * INTO v_evento FROM public.eventos_classe WHERE id = p_evento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.eventos_classe_resultado WHERE evento_id = p_evento_id;
  DELETE FROM public.eventos_classe_resultado_guilda WHERE evento_id = p_evento_id;

  INSERT INTO public.eventos_classe_resultado (evento_id, aluno_id, pontos, participou, posicao, destaque)
  SELECT p_evento_id, t.aluno_id, t.pontos, t.participou, t.posicao,
         (v_evento.medalha_destaque AND t.participou AND t.pontos > 0 AND t.posicao <= 3)
  FROM (
    SELECT b.aluno_id, b.pontos, b.participou,
           CASE WHEN b.participou THEN dense_rank() OVER (PARTITION BY b.participou ORDER BY b.pontos DESC) END AS posicao
    FROM (
{soma}
      FROM public.classe_aluno ca
      LEFT JOIN public.eventos_aluno ea
        ON ea.aluno_id = ca.aluno_id
       AND ea.criado_em >= v_evento.inicio
       AND ea.criado_em <= v_evento.fim
       AND (
         ea.classe_id = v_evento.classe_id
         OR (ea.classe_id IS NULL AND public.fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia) = v_evento.classe_id)
       )
      WHERE ca.classe_id = v_evento.classe_id
      GROUP BY ca.aluno_id
    ) b
  ) t;
  GET DIAGNOSTICS v_participantes = ROW_COUNT;

  IF v_evento.modalidade_guilda THEN
    INSERT INTO public.eventos_classe_resultado_guilda (evento_id, guilda_id, pontos, membros, posicao)
    SELECT p_evento_id, g.guilda_id, g.pontos, g.membros,
           CASE WHEN g.pontos > 0 THEN dense_rank() OVER (ORDER BY g.pontos DESC) END
    FROM (
      SELECT s.guilda_id, COALESCE(SUM(r.pontos), 0) AS pontos, COUNT(*)::integer AS membros
      FROM public.guilda_evento_snapshot s
      LEFT JOIN public.eventos_classe_resultado r ON r.evento_id = p_evento_id AND r.aluno_id = s.aluno_id
      WHERE s.evento_id = p_evento_id::text
      GROUP BY s.guilda_id
    ) g;
  END IF;

  SELECT COUNT(*)::integer INTO v_participantes
  FROM public.eventos_classe_resultado WHERE evento_id = p_evento_id AND participou;

  IF v_evento.moedas > 0 THEN
    INSERT INTO public.moedas_ledger (aluno_id, delta, motivo, evento_tipo, referencia, classe_id)
    SELECT r.aluno_id, v_evento.moedas, 'evento', 'evento_classe', 'evento_classe:' || p_evento_id::text, v_evento.classe_id
    FROM public.eventos_classe_resultado r
    WHERE r.evento_id = p_evento_id AND r.participou
    ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento' DO NOTHING;
  END IF;

  -- Medalhas (issue #152: medalha de evento é uma `conquista`, escopo 'evento'). A conquista é
  -- criada na primeira apuração e reaproveitada nas seguintes; `conquistas_aluno` não tem chave
  -- única por (aluno, conquista), então a posse é protegida por NOT EXISTS. `pontos_recompensa`
  -- fica em 0: a medalha não paga pontos (os pontos do evento são outra decisão).
  v_conq_part := v_evento.conquista_participacao_id;
  v_conq_dest := v_evento.conquista_destaque_id;

  IF v_evento.medalha_participacao AND v_conq_part IS NULL THEN
    INSERT INTO public.conquistas (nome, descricao, categoria, tipo, escopo, criterio, pontos_recompensa, classe_id, criado_por)
    VALUES (left('Participação — ' || v_evento.titulo, 120), 'Participou do evento “' || v_evento.titulo || '”.',
            'evento', 'evento_participacao', 'evento',
            jsonb_build_object('metrica', 'evento_medalha', 'evento_id', p_evento_id, 'tipo', 'participacao'),
            0, v_evento.classe_id, v_evento.criado_por)
    RETURNING id INTO v_conq_part;
  END IF;
  IF v_evento.medalha_destaque AND v_conq_dest IS NULL THEN
    INSERT INTO public.conquistas (nome, descricao, categoria, tipo, escopo, criterio, pontos_recompensa, classe_id, criado_por)
    VALUES (left('Destaque — ' || v_evento.titulo, 120), 'Entre os destaques do evento “' || v_evento.titulo || '”.',
            'evento', 'evento_destaque', 'evento',
            jsonb_build_object('metrica', 'evento_medalha', 'evento_id', p_evento_id, 'tipo', 'destaque'),
            0, v_evento.classe_id, v_evento.criado_por)
    RETURNING id INTO v_conq_dest;
  END IF;
  UPDATE public.eventos_classe SET conquista_participacao_id = v_conq_part, conquista_destaque_id = v_conq_dest
   WHERE id = p_evento_id;

  IF v_conq_part IS NOT NULL THEN
    INSERT INTO public.conquistas_aluno (aluno_id, conquista_id, concluida, progresso, data_conquista)
    SELECT r.aluno_id, v_conq_part, true, 100, now()
    FROM public.eventos_classe_resultado r
    WHERE r.evento_id = p_evento_id AND r.participou
      AND NOT EXISTS (SELECT 1 FROM public.conquistas_aluno x WHERE x.aluno_id = r.aluno_id AND x.conquista_id = v_conq_part);
  END IF;
  IF v_conq_dest IS NOT NULL THEN
    INSERT INTO public.conquistas_aluno (aluno_id, conquista_id, concluida, progresso, data_conquista)
    SELECT r.aluno_id, v_conq_dest, true, 100, now()
    FROM public.eventos_classe_resultado r
    WHERE r.evento_id = p_evento_id AND r.destaque
      AND NOT EXISTS (SELECT 1 FROM public.conquistas_aluno x WHERE x.aluno_id = r.aluno_id AND x.conquista_id = v_conq_dest);
  END IF;

  RETURN v_participantes;
END
$function$;
"""


# --------------------------------------------------------------------------------------
# A view do rank: os criterios que faltavam no CASE, e o de ranqueada.
# --------------------------------------------------------------------------------------
# `CRITERIO_RANQUEADA` e o unico trecho novo do corpo; o resto e a definicao de hoje.
def _view(com_novos_criterios: bool) -> str:
    cte_ranqueada = (
        """, eventos_ranqueada AS (
         -- Pontos so' dos desafios `consequencia = 'ranqueada'`: a escada que a aposta move.
         -- `d.id::text` e nao `...::uuid` porque o recorte da referencia e um substring por
         -- regexp, e 36 caracteres do alfabeto do uuid podem nao formar um uuid valido -- o
         -- cast levantaria DENTRO da view do rank.
         SELECT e.aluno_id,
            e.classe_id,
            sum(COALESCE(e.valor, 0::numeric)) AS pontuacao
           FROM eventos_aluno e
             JOIN guilda_desafios d ON d.id::text = NULLIF(substring(TRIM(BOTH FROM COALESCE(e.referencia, ''::text)) from 'desafio:([0-9a-fA-F-]{36})$'), ''::text)
          WHERE d.consequencia = 'ranqueada'::text AND e.classe_id IS NOT NULL
          GROUP BY e.aluno_id, e.classe_id
        )"""
        if com_novos_criterios
        else ""
    )
    ramos = (
        """                    WHEN 'acertos'::text THEN COALESCE(ca."acertosPercentual", 0::numeric)
                    WHEN 'ranqueada'::text THEN COALESCE(erq.pontuacao, 0::numeric)
"""
        if com_novos_criterios
        else ""
    )
    join_ranqueada = (
        """
             LEFT JOIN eventos_ranqueada erq ON erq.classe_id = r.classe_id AND erq.aluno_id = ca.aluno_id"""
        if com_novos_criterios
        else ""
    )
    return f"""
CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas AS
 WITH referencias_normalizadas AS (
         SELECT e.aluno_id,
            e.classe_id AS classe_id_gravada,
            e.tipo,
            COALESCE(e.valor, 0::numeric) AS valor,
            TRIM(BOTH FROM COALESCE(e.referencia, ''::text)) AS referencia_bruta,
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM e.referencia), ''::text) IS NULL THEN NULL::bigint
                    WHEN TRIM(BOTH FROM e.referencia) ~ '^\\d+$'::text THEN TRIM(BOTH FROM e.referencia)::bigint
                    WHEN split_part(TRIM(BOTH FROM e.referencia), ':'::text, 2) ~ '^\\d+$'::text THEN split_part(TRIM(BOTH FROM e.referencia), ':'::text, 2)::bigint
                    ELSE NULL::bigint
                END AS referencia_id
           FROM eventos_aluno e
        ), eventos_por_classe AS (
         SELECT e.aluno_id,
            COALESCE(e.classe_id_gravada, t.classe_id, t_c.classe_id, t_a.classe_id, cl.id) AS classe_id,
            sum(e.valor) AS pontuacao
           FROM referencias_normalizadas e
             LEFT JOIN topicos t ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'topico'::text) AND t.id = e.referencia_id
             LEFT JOIN conteudos c ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'conteudo'::text) AND c.id = e.referencia_id
             LEFT JOIN topicos t_c ON t_c.id = c.topico_id
             LEFT JOIN atividades atv ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'atividade'::text) AND atv.id = e.referencia_id
             LEFT JOIN topicos t_a ON t_a.id = atv.topico_id
             LEFT JOIN classe cl ON starts_with(lower(e.referencia_bruta), 'classe:'::text) AND cl.id = e.referencia_id
          WHERE COALESCE(e.classe_id_gravada, t.classe_id, t_c.classe_id, t_a.classe_id, cl.id) IS NOT NULL
          GROUP BY e.aluno_id, (COALESCE(e.classe_id_gravada, t.classe_id, t_c.classe_id, t_a.classe_id, cl.id))
        ){cte_ranqueada}, base AS (
         SELECT r.id AS rank_id,
            r.classe_id,
            ca.aluno_id,
            rt.criterio,
                CASE rt.criterio
                    WHEN 'percentual'::text THEN COALESCE(ca."porcentagemConcluida", 0::numeric)
                    WHEN 'pontuacao'::text THEN COALESCE(epc.pontuacao, 0::numeric)
                    WHEN 'tempo'::text THEN COALESCE(ca."tempoGastoMin", 0::numeric)
{ramos}                    ELSE 0::numeric
                END AS pontuacao
           FROM ranks r
             JOIN rank_tipo rt ON rt.id = r.tipo_id
             JOIN classe_aluno ca ON ca.classe_id = r.classe_id
             LEFT JOIN eventos_por_classe epc ON epc.classe_id = r.classe_id AND epc.aluno_id = ca.aluno_id{join_ranqueada}
        ), ordenado AS (
         SELECT b.rank_id,
            b.classe_id,
            b.aluno_id,
            b.pontuacao,
            dense_rank() OVER (PARTITION BY b.rank_id ORDER BY b.pontuacao DESC, b.aluno_id) AS posicao
           FROM base b
        )
 SELECT o.rank_id,
    o.classe_id,
    o.posicao,
    a.id AS id_aluno,
    a.nome AS nome_aluno,
    o.pontuacao,
    round(o.pontuacao / NULLIF(max(o.pontuacao) OVER (PARTITION BY o.rank_id), 0::numeric) * 100::numeric, 2) AS percentual_do_lider,
        CASE
            WHEN o.posicao = 1 THEN 'ouro'::text
            WHEN o.posicao = 2 THEN 'prata'::text
            WHEN o.posicao = 3 THEN 'bronze'::text
            ELSE NULL::text
        END AS medalha
   FROM ordenado o
     JOIN alunos a ON a.id = o.aluno_id;
"""


# `rank_tipo` nao e escrita pelo cliente -- `20260826_09` a classificou como "referencia sem
# dono: qualquer autenticado le, ninguem escreve pelo app", e a medicao confirma (INSERT da'
# 42501 para professor). Entao o tipo novo nasce aqui, que e o caminho desenhado.
RANK_TIPO = """
INSERT INTO public.rank_tipo (nome, descricao, criterio)
SELECT 'Ranqueada', 'Pontos ganhos e perdidos em desafios ranqueados da arena.', 'ranqueada'
 WHERE NOT EXISTS (SELECT 1 FROM public.rank_tipo WHERE criterio = 'ranqueada');
"""

RANK_TIPO_FORA = """
DELETE FROM public.ranks WHERE tipo_id IN (SELECT id FROM public.rank_tipo WHERE criterio = 'ranqueada');
DELETE FROM public.rank_tipo WHERE criterio = 'ranqueada';
"""


ANTERIOR_PRECOS = """
DELETE FROM public.eventos_pontuacao WHERE tipo = 'desafio_derrota';

ALTER TABLE public.eventos_pontuacao DROP CONSTRAINT IF EXISTS eventos_pontuacao_pontos_check;
ALTER TABLE public.eventos_pontuacao ADD CONSTRAINT eventos_pontuacao_pontos_check
  CHECK (pontos >= 0);
ALTER TABLE public.eventos_pontuacao DROP COLUMN IF EXISTS penalidade;

DELETE FROM public.app_config WHERE chave = 'ranqueada_piso_pontos';
"""

ANTERIOR_LEITORES = """
DROP FUNCTION IF EXISTS public.fn_fator_de_aposta(text);
DROP FUNCTION IF EXISTS public.app_desafio_aposta_fator(text);
DROP FUNCTION IF EXISTS public.app_ranqueada_piso_pontos();
DROP FUNCTION IF EXISTS public.fn_app_config_num(text, numeric);
"""

# O gatilho de hoje, sem aposta e sem piso -- restaurado por inteiro.
ANTERIOR_GATILHO = """
CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_valor_do_banco()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.classe_id := public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia);
  ELSE
    NEW.classe_id := OLD.classe_id;
    NEW.tipo := OLD.tipo;
    NEW.concedido_por := OLD.concedido_por;
    NEW.aluno_id := OLD.aluno_id;
    NEW.motivo := OLD.motivo;
  END IF;

  IF public.fn_evento_creditado(NEW.tipo) THEN
    IF TG_OP <> 'INSERT' THEN
      NEW.valor := OLD.valor;
    END IF;
    RETURN NEW;
  END IF;

  NEW.valor := public.fn_pontos_do_evento(NEW.tipo);

  IF public.fn_evento_de_conclusao(NEW.tipo) THEN
    IF NULLIF(TRIM(BOTH FROM COALESCE(NEW.referencia, '')), '') IS NULL THEN
      NEW.valor := 0;
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.eventos_aluno e
       WHERE e.aluno_id = NEW.aluno_id
         AND e.tipo = NEW.tipo
         AND e.referencia = NEW.referencia
         AND (
           TG_OP = 'INSERT'
           OR (COALESCE(e.criado_em, 'epoch'::timestamp), e.id)
              < (COALESCE(NEW.criado_em, 'epoch'::timestamp), NEW.id)
         )
    ) THEN
      NEW.valor := 0;
    END IF;
  END IF;

  IF COALESCE(NEW.valor, 0) > 0
     AND NEW.referencia IS NOT NULL
     AND NEW.classe_id IS NULL THEN
    NEW.valor := 0;
  END IF;

  IF COALESCE(NEW.valor, 0) > 0 THEN
    NEW.valor := ROUND(
      NEW.valor * public.fn_fator_de_atraso(
        NEW.aluno_id,
        NEW.referencia,
        COALESCE(NEW.criado_em AT TIME ZONE 'UTC', now())
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;
"""

# A arena de hoje, sem o eixo de consequencia -- restaurada por inteiro.
ANTERIOR_ARENA = """
CREATE OR REPLACE FUNCTION public.arena_encerrar(p_desafio_id uuid)
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
  SELECT * INTO v_d FROM public.guilda_desafios
   WHERE id = p_desafio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'arena_desafio_inexistente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.desafio_participantes
     WHERE desafio_id = p_desafio_id AND aluno_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'arena_sem_permissao';
  END IF;
  IF v_d.status = 'encerrado' THEN
    RETURN jsonb_build_object('status', 'encerrado', 'novo', false,
                              'resultado', v_d.resultado,
                              'vencedor_equipe', v_d.vencedor_equipe);
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
             ELSE ARRAY[]::text[]
           END
      ) AS tipo
    ) t
   WHERE pl.estado = 'aceito' AND pl.respondidas > 0
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_pagos = ROW_COUNT;

  RETURN jsonb_build_object(
    'status', 'encerrado', 'novo', true,
    'resultado', v_resultado,
    'vencedor_equipe', v_vencedor,
    'cooperativo', v_cooperativo,
    'eventos', v_pagos,
    'equipe_1', jsonb_build_object('pontos', v_p1, 'tempo_ms', v_t1,
                                   'integrantes', v_n1, 'jogaram', v_jog1),
    'equipe_2', jsonb_build_object('pontos', v_p2, 'tempo_ms', v_t2,
                                   'integrantes', v_n2, 'jogaram', v_jog2)
  );
END
$function$;
"""


RELOAD = "\nNOTIFY pgrst, 'reload schema';\n"


def upgrade() -> None:
    op.execute(PRECOS)
    op.execute(LEITORES)
    op.execute(GATILHO)
    op.execute(ARENA)
    op.execute(RESULTADO_ACEITA_NEGATIVO)
    op.execute(_apuracao(APURACAO_SOMA_BRUTA))
    op.execute(_view(com_novos_criterios=True))
    op.execute(RANK_TIPO)
    op.execute(RELOAD)


def downgrade() -> None:
    # O tipo de rank sai ANTES da view: `ranks` referencia `rank_tipo`, e a view antiga nao
    # conhece o criterio `ranqueada` -- deixa-lo para tras ranquearia a turma em zero.
    op.execute(RANK_TIPO_FORA)
    op.execute(_view(com_novos_criterios=False))
    op.execute(_apuracao(APURACAO_SOMA_ANTIGA))
    # Depois de a apuracao voltar a somar só positivo: o CHECK não pode ser restaurado antes
    # da função que o respeita, senão uma reapuração no meio do downgrade abortaria.
    op.execute(RESULTADO_SO_POSITIVO)
    op.execute(ANTERIOR_ARENA)
    op.execute(ANTERIOR_GATILHO)
    op.execute(ANTERIOR_LEITORES)
    op.execute(ANTERIOR_PRECOS)
    op.execute(RELOAD)
