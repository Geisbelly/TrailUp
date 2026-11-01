"""O aluno não grava mais a própria nota, nem responde depois do prazo, nem cobra evento de atividade que não concluiu (#136, fase 5)

## O que estava aberto

Medido em produção em 01/11, com `SET LOCAL ROLE authenticated` e as claims de um aluno real, tudo
dentro de ROLLBACK:

- **A nota era do cliente.** `atividade_aluno` tem policy de INSERT e UPDATE `aluno_id = auth.uid()`
  e GRANT completo para `authenticated`. Um upsert direto com `status = 'concluido'`,
  `acertos_percentual = 100` e `pontuacao_obtida = 999` passava e ficava gravado. O limite de
  tentativas (`20261101_13`) só valia para quem passava pela RPC: com `tentativas_max = 1` já usada,
  o upsert direto continuava passando.
- **O prazo também.** Responder as questões direto em `questao_aluno` com o prazo vencido levava
  `atividade_aluno` a `concluido` pelo gatilho `trg_questao_aluno_progresso`
  (`trailup_recalcular_atividade_respostas`, que roda como dono). A RPC recusava o mesmo caso com
  `prazo_expirado`; o caminho direto, não. E "feita" no modelo de abandono é justamente
  `atividade_aluno` concluída.
- **Os pontos de atividade.** O valor de `eventos_aluno` já é do banco
  (`trg_eventos_aluno_valor_do_banco`), e repetir a referência paga 0. Mas `atividade_concluida`
  (15), `atividade_acertada` (5) e `atividade_revisada` (2) entravam uma vez por atividade válida
  **sem a atividade ter sido concluída**.

## O que muda

Três gatilhos BEFORE, todos `SECURITY INVOKER` e todos só para a escrita do cliente
(`current_user IN ('authenticated', 'anon')`). Pelo mesmo motivo de `20261029_06`: dentro de uma RPC
`SECURITY DEFINER` as claims continuam `authenticated`, o que muda é o `current_user`. Conferido em
produção em 01/11 que **toda** função que escreve em `atividade_aluno` ou `questao_aluno` é
`SECURITY DEFINER` (as duas RPCs de tentativa, `avaliar_entrega`, o recálculo por resposta, a
recorreção do gabarito, o tempo da telemetria, as RPCs do cronômetro de estudo, o provisionamento da
matrícula e `trg_atividades_after_insert`). Nenhuma delas é tocada.

### `atividade_aluno`: o cliente só marca visita e "em andamento"

- **UPDATE.** O cliente só muda `status`, `ultima_visualizacao` e `updated_at`. Mudar qualquer outra
  coluna é recusado (`42501`). A comparação é a linha inteira em jsonb menos as três livres, e não uma
  lista de colunas protegidas: coluna nova nasce protegida.
  - `status = 'concluido'` vindo do cliente é recusado. Quem conclui é `atividade_responder_tentativa`.
  - Linha já concluída **continua concluída**, em silêncio. É o que `marcarIniciada` faz ao abrir de
    novo uma atividade feita (refazer, revisão): antes isso rebaixava o progresso até a resposta
    chegar.
- **INSERT.** Recusado com `status = 'concluido'` ou com nota, acerto, progresso, tempo ou metadata
  diferentes do default da coluna. O `id` sai da sequência, pelo mesmo motivo de `20261029_06`: um
  `id` à frente dela colidiria no próximo INSERT de qualquer um. Aqui a lista é explícita (o default
  não se lê de dentro do gatilho), e o e2e prende que toda coluna de `atividade_aluno` está numa das
  duas listas.

### `questao_aluno`: depois do prazo, só a revisão pedida

O cliente não grava resposta com o prazo efetivo (`fn_prazo_efetivo`) vencido. A mensagem é
`prazo_expirado`, a mesma da RPC, e o app já a traduz. A exceção é a **revisão pedida pelo
professor** (`alteracao_aluno` com `decisao_efetiva = 'revisar'` ainda não feita): ela pode vir depois
do prazo, e `20261101_12` decidiu que revisão pendente não vira 0 por prazo.

A resposta também precisa ser de uma questão da própria atividade (`questoes.atividade_id`). Antes,
o cliente escolhia o `atividade_id` livremente, e o prazo conferido seria o da atividade que ele
dissesse.

A leitura (questão, prazo, revisão) fica numa função `SECURITY DEFINER`, `fn_questao_aluno_recusa`,
que usa `auth.uid()`. O gatilho continua `INVOKER`, para saber quem escreve.

**Tentativas esgotadas não são conferidas aqui, de propósito.** Quem esgotou já concluiu, e o recálculo
por resposta só mexe em `status` e `percentual_concluido`, nunca na nota. A nota só muda pela RPC, que
confere as tentativas. Recusar aqui quebraria a revisão e a segunda chance sem proteger nada.

### `eventos_aluno`: evento de atividade só com a atividade concluída

`atividade_concluida`, `atividade_acertada` e `atividade_revisada` vindos do cliente exigem
referência `atividade:<id>` e uma linha de `atividade_aluno` desse aluno concluída. Com a guarda de
cima, só a RPC conclui, então o evento passa a depender da conclusão do servidor. O app já grava o
evento depois da RPC.

"Acertada" exige só concluída, não 100%: no app, acertar é ter **todas as respostas corretas**, e a
resposta aberta validada pela IA pode estar correta com menos de 100. Pôr um limiar aqui recusaria
acerto de verdade.

## O que fica de fora

- `topico_atividade_*` (atividade personalizada, referência `item:`): não têm linha em `atividades`,
  nem prazo, nem tentativas. O progresso delas é `personalizacao_item_progresso`.
- `guilda_chat_questao_responder` grava em `questao_aluno` como dono e não confere prazo. Responder no
  chat da guilda ainda conta para concluir depois do prazo. Fica para a #155.
- `desafio_vencido` (12) ainda entra pelo cliente. É da arena (#155).

## Quando aplicar (e quando mesclar)

**Só com o build novo nos alunos.** O app de antes da fase 2 grava a conclusão direto e passaria a
receber erro em toda atividade. **Mesclar é aplicar:** a API roda `alembic upgrade head` ao subir,
então o próximo deploy depois do merge liga a guarda. Pré-requisitos:

1. O build com a fase 2 publicado **com versão nova**. Hoje `mobile/app.json` está em 1.0.4, a mesma
   do build anterior, e a telemetria não distingue um do outro.
2. `app_versao_minima` com essa versão, para o app antigo pedir atualização.
3. Linhas em `atividade_tentativas` vindas dos alunos. Em 01/11 eram 0.

## Downgrade

Derruba os três gatilhos e as quatro funções: volta ao defeito medido acima. Existe para a migration
ser reversível. O USAGE na sequência fica: já existia em produção antes desta migration.

Revision ID: 20261102_04
Revises: 20261102_03
Create Date: 2026-11-02
"""

from __future__ import annotations

from alembic import op

revision = "20261102_04"
down_revision = "20261102_03"
branch_labels = None
depends_on = None

# O que o cliente muda numa linha que já existe. Todo o resto é do servidor.
COLUNAS_LIVRES = ("status", "ultima_visualizacao", "updated_at")
# No INSERT do cliente, cada coluna do servidor tem de chegar com o default. `id` e as chaves à parte.
DEFAULTS_DO_SERVIDOR = {
    "percentual_concluido": "0",
    "acertos_percentual": "0",
    "tempo_gasto_min": "0",
    "tempo_direto_min": "0",
    "pontuacao_obtida": "NULL",
    "pontuacao_maxima": "NULL",
    "avaliacao_metadata": "'{}'::jsonb",
}
CHAVES = ("id", "aluno_id", "atividade_id")
# Eventos que pagam por atividade e que o app grava depois de concluir.
EVENTOS_DE_ATIVIDADE = ("atividade_concluida", "atividade_acertada", "atividade_revisada")


def _lista(itens) -> str:
    return ", ".join(f"'{i}'" for i in itens)


ATIVIDADE_ALUNO = (
    r"""
CREATE OR REPLACE FUNCTION public.fn_atividade_aluno_guarda_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = ''
AS $function$
BEGIN
  -- `current_user`, nao as claims: dentro das RPCs SECURITY DEFINER as claims continuam `authenticated`.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text = 'concluido' THEN
      RAISE EXCEPTION 'atividade_aluno: a conclusao e do servidor'
        USING ERRCODE = '42501', HINT = 'Use atividade_responder_tentativa.';
    END IF;
    IF """
    + "\n       OR ".join(
        f"NEW.{coluna} IS DISTINCT FROM {padrao}" for coluna, padrao in DEFAULTS_DO_SERVIDOR.items()
    )
    + r""" THEN
      RAISE EXCEPTION 'atividade_aluno: nota, acerto, progresso e tempo sao do servidor'
        USING ERRCODE = '42501', HINT = 'Use atividade_responder_tentativa.';
    END IF;
    -- `id` a frente da sequencia colidiria com o proximo INSERT de qualquer um (20261029_06).
    NEW.id := nextval(pg_get_serial_sequence('public.atividade_aluno', 'id'));
    RETURN NEW;
  END IF;

  -- A linha inteira menos o que o cliente pode mudar: coluna nova nasce protegida.
  IF (to_jsonb(NEW) - ARRAY["""
    + _lista(COLUNAS_LIVRES)
    + r"""]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY["""
    + _lista(COLUNAS_LIVRES)
    + r"""]) THEN
    RAISE EXCEPTION 'atividade_aluno: nota, acerto, progresso e tempo sao do servidor'
      USING ERRCODE = '42501', HINT = 'Use atividade_responder_tentativa.';
  END IF;

  IF OLD.status::text = 'concluido' THEN
    -- Abrir de novo uma atividade feita (refazer, revisao) nao desfaz a conclusao.
    NEW.status := OLD.status;
  ELSIF NEW.status::text = 'concluido' THEN
    RAISE EXCEPTION 'atividade_aluno: a conclusao e do servidor'
      USING ERRCODE = '42501', HINT = 'Use atividade_responder_tentativa.';
  END IF;
  RETURN NEW;
END;
$function$;

DO $g$ BEGIN
  -- Explicito: o `nextval()` da guarda confere privilegio na sequencia; o default nao conferia.
  -- Sem `format()`: o SQL offline do Alembic dobraria o marcador. O nome ja vem qualificado e citado.
  EXECUTE 'GRANT USAGE ON SEQUENCE ' || pg_get_serial_sequence('public.atividade_aluno', 'id')
          || ' TO authenticated';
END $g$;

-- `a_`: antes dos gatilhos de updated_at, que so carimbam a hora.
DROP TRIGGER IF EXISTS trg_atividade_aluno_a_guarda_cliente ON public.atividade_aluno;
CREATE TRIGGER trg_atividade_aluno_a_guarda_cliente
  BEFORE INSERT OR UPDATE ON public.atividade_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_atividade_aluno_guarda_cliente();
"""
)

QUESTAO_ALUNO = r"""
CREATE OR REPLACE FUNCTION public.fn_questao_aluno_recusa(p_questao bigint, p_atividade bigint)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aluno uuid := auth.uid();
  v_atividade bigint;
  v_prazo timestamptz;
BEGIN
  SELECT q.atividade_id INTO v_atividade FROM public.questoes q WHERE q.id = p_questao;
  IF v_atividade IS NULL OR v_atividade IS DISTINCT FROM p_atividade THEN
    RETURN 'questao_de_outra_atividade';
  END IF;

  v_prazo := public.fn_prazo_efetivo(v_aluno, v_atividade);
  IF v_prazo IS NOT NULL AND v_prazo < now() AND NOT EXISTS (
       -- Revisao pedida pelo professor vale depois do prazo (20261101_12).
       SELECT 1 FROM public.alteracao_aluno r
        WHERE r.aluno_id = v_aluno
          AND r.atividade_id = v_atividade
          AND r.decisao_efetiva = 'revisar'
          AND r.revisar_desde IS NOT NULL
          AND r.revisada_em IS NULL) THEN
    RETURN 'prazo_expirado';
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_questao_aluno_recusa(bigint, bigint) FROM PUBLIC, anon;
-- O gatilho roda como o aluno e chama esta funcao.
GRANT EXECUTE ON FUNCTION public.fn_questao_aluno_recusa(bigint, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_questao_aluno_guarda_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = ''
AS $function$
DECLARE
  v_motivo text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  v_motivo := public.fn_questao_aluno_recusa(NEW.questao_id, NEW.atividade_id);
  IF v_motivo = 'prazo_expirado' THEN
    -- A mesma mensagem da RPC: o app ja a traduz.
    RAISE EXCEPTION 'prazo_expirado' USING ERRCODE = 'P0001';
  ELSIF v_motivo IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'questao_aluno: ' || v_motivo, ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_questao_aluno_a_guarda_cliente ON public.questao_aluno;
CREATE TRIGGER trg_questao_aluno_a_guarda_cliente
  BEFORE INSERT OR UPDATE ON public.questao_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_questao_aluno_guarda_cliente();
"""

EVENTOS_ALUNO = (
    r"""
CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_atividade_concluida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = ''
AS $function$
DECLARE
  v_atividade bigint;
BEGIN
  -- UPDATE do cliente ja e recusado por trg_eventos_aluno_a_trava_cliente (20261029_06).
  IF current_user NOT IN ('authenticated', 'anon') OR TG_OP <> 'INSERT'
     OR NEW.tipo NOT IN ("""
    + _lista(EVENTOS_DE_ATIVIDADE)
    + r""") THEN
    RETURN NEW;
  END IF;
  v_atividade := substring(NEW.referencia FROM '^atividade:([0-9]{1,18})$')::bigint;
  -- Le como o aluno: a RLS de atividade_aluno ja o limita ao proprio.
  IF v_atividade IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.atividade_aluno aa
        WHERE aa.aluno_id = NEW.aluno_id AND aa.atividade_id = v_atividade
          AND aa.status::text = 'concluido') THEN
    RAISE EXCEPTION USING MESSAGE = 'eventos_aluno: ' || NEW.tipo || ' so com a atividade concluida',
      ERRCODE = '42501', HINT = 'A conclusao vem de atividade_responder_tentativa.';
  END IF;
  RETURN NEW;
END;
$function$;

-- `b_`: depois da trava do cliente (`a_`), antes do valor; recusar antes de calcular nao muda nada.
DROP TRIGGER IF EXISTS trg_eventos_aluno_b_atividade_concluida ON public.eventos_aluno;
CREATE TRIGGER trg_eventos_aluno_b_atividade_concluida
  BEFORE INSERT ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_eventos_aluno_atividade_concluida();
"""
)


def upgrade() -> None:
    op.execute(ATIVIDADE_ALUNO)
    op.execute(QUESTAO_ALUNO)
    op.execute(EVENTOS_ALUNO)


def downgrade() -> None:
    # Sem REVOKE do USAGE na sequencia: ele existia em producao antes desta migration.
    op.execute("DROP TRIGGER IF EXISTS trg_eventos_aluno_b_atividade_concluida ON public.eventos_aluno")
    op.execute("DROP FUNCTION IF EXISTS public.fn_eventos_aluno_atividade_concluida()")
    op.execute("DROP TRIGGER IF EXISTS trg_questao_aluno_a_guarda_cliente ON public.questao_aluno")
    op.execute("DROP FUNCTION IF EXISTS public.fn_questao_aluno_guarda_cliente()")
    op.execute("DROP FUNCTION IF EXISTS public.fn_questao_aluno_recusa(bigint, bigint)")
    op.execute("DROP TRIGGER IF EXISTS trg_atividade_aluno_a_guarda_cliente ON public.atividade_aluno")
    op.execute("DROP FUNCTION IF EXISTS public.fn_atividade_aluno_guarda_cliente()")
