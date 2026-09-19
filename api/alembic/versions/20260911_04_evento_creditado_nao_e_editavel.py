"""o valor e o tipo do evento congelam no UPDATE, como a classe ja congelava

Revision ID: 20260911_04
Revises: 20260911_03

## O buraco

`eventos_aluno_posse_upd` deixa o aluno dar UPDATE nos proprios eventos, e
`trg_eventos_aluno_valor_do_banco` tinha um atalho:

    IF public.fn_evento_creditado(NEW.tipo) THEN
      RETURN NEW;   -- valor de quem concede, nao do banco
    END IF;

O atalho esta certo no INSERT -- presenca e participacao valem o que a RPC
decidiu, e o premio de conquista vale `conquistas.pontos_recompensa`. No UPDATE
ele entregava a coluna `valor` ao cliente.

Medido nesta base, com o bloco inteiro desfeito por excecao no fim:

    UPDATE eventos_aluno SET valor = 99999 WHERE id = <presenca do proprio aluno>
      -> valor = 99999 aceito

E o caminho pelo tipo, que e pior porque nem precisa de um evento creditado
para comecar -- `fn_evento_creditado` casa por PREFIXO (`presenca`,
`participacao`, `conquista`):

    UPDATE eventos_aluno SET tipo = 'participacao_extra', valor = 55555
      -> valor = 55555 aceito

Ou seja: qualquer evento do aluno virava pontuacao arbitraria com um UPDATE, e
o rank le exatamente essa coluna. Isto e a MESMA falha que a `20260910_06`
fechou para `classe_id` -- lá o gatilho olhava so `UPDATE OF valor, tipo` e a
lista curta era o buraco. O congelamento resolveu a classe e deixou o valor.

## A correcao

No UPDATE, o que decide pagamento vira historico e e restaurado de OLD:
`tipo`, `valor`, `concedido_por` e `aluno_id`, junto do `classe_id` que ja era.

A ORDEM importa. `tipo` e restaurado ANTES do teste de creditado, senao o
atalho seria escolhido pelo tipo NOVO: com `tipo` restaurado depois, a linha
sairia com o tipo comum de volta e o valor de 55555 que o cliente mandou, ja
retornado sem passar por `fn_pontos_do_evento`.

Para o que nao e creditado nada muda: o valor ja era recalculado de
`fn_pontos_do_evento(tipo)` e o que o cliente mandava ja era descartado.

Nenhum codigo do repo da UPDATE em `eventos_aluno` -- conferido em `mobile/src`,
`frontend/src` e `api/app`. A politica de UPDATE fica no lugar porque e a
premissa do congelamento descrito no CLAUDE.md; o que sai e a possibilidade de
o UPDATE mexer no que paga.

Create Date: 2026-09-11
"""

from alembic import op

revision = "20260911_04"
down_revision = "20260911_03"
branch_labels = None
depends_on = None


_CORPO_NOVO = """
CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_valor_do_banco()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  RETURN NEW;
END;
$function$
"""


def upgrade() -> None:
    op.execute(_CORPO_NOVO)

    # CONFERE de COMPORTAMENTO, nao de texto: grava um evento creditado, tenta
    # os dois ataques e verifica que nenhum passou. A sonda roda num bloco com
    # EXCEPTION -- que em plpgsql e' um savepoint --, e sai por uma excecao de
    # codigo proprio, entao NADA do que ela inseriu fica no banco. Variavel de
    # plpgsql nao e' transacional, por isso o resultado atravessa o rollback.
    op.execute(
        """
        DO $confere$
        DECLARE
          v_aluno uuid;
          v_id bigint;
          v_valor_direto numeric;
          v_valor_pelo_tipo numeric;
          v_tipo_final text;
        BEGIN
          SELECT id INTO v_aluno FROM public.alunos LIMIT 1;
          IF v_aluno IS NULL THEN
            RAISE NOTICE USING MESSAGE =
              'CONFERE: sem aluno na base, sonda de comportamento nao executada';
            RETURN;
          END IF;

          BEGIN
            INSERT INTO public.eventos_aluno
                   (aluno_id, tipo, referencia, valor, criado_em, concedido_por)
            VALUES (v_aluno, 'presenca_aula', 'confere:20260911_04', 10, now(), v_aluno)
            RETURNING id INTO v_id;

            -- Ataque 1: mexer no valor de um evento creditado.
            UPDATE public.eventos_aluno SET valor = 99999 WHERE id = v_id;
            SELECT valor INTO v_valor_direto FROM public.eventos_aluno WHERE id = v_id;

            -- Ataque 2: levar um evento comum para um tipo creditado, pagando.
            UPDATE public.eventos_aluno SET tipo = 'participacao_extra', valor = 55555
             WHERE id = v_id;
            SELECT valor, tipo INTO v_valor_pelo_tipo, v_tipo_final
              FROM public.eventos_aluno WHERE id = v_id;

            RAISE EXCEPTION USING ERRCODE = 'ZZ001';
          EXCEPTION WHEN SQLSTATE 'ZZ001' THEN
            NULL;  -- esperado: e' o que desfaz a sonda
          END;

          IF COALESCE(v_valor_direto, -1) <> 10 THEN
            RAISE EXCEPTION USING MESSAGE =
              'UPDATE ainda muda o valor de evento creditado: virou '
              || COALESCE(v_valor_direto::text, 'nulo');
          END IF;

          IF COALESCE(v_valor_pelo_tipo, -1) <> 10 THEN
            RAISE EXCEPTION USING MESSAGE =
              'trocar o tipo no UPDATE ainda paga: valor virou '
              || COALESCE(v_valor_pelo_tipo::text, 'nulo');
          END IF;

          IF COALESCE(v_tipo_final, '') <> 'presenca_aula' THEN
            RAISE EXCEPTION USING MESSAGE =
              'o tipo nao congelou no UPDATE: virou ' || COALESCE(v_tipo_final, 'nulo');
          END IF;

          RAISE NOTICE USING MESSAGE =
            'CONFERE: valor, tipo, concedido_por e aluno_id congelam no UPDATE';
        END
        $confere$;
        """
    )


_CORPO_ANTIGO = """
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
  END IF;

  IF public.fn_evento_creditado(NEW.tipo) THEN
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

  RETURN NEW;
END;
$function$
"""


def downgrade() -> None:
    # Reabre o buraco de propósito: e' o unico jeito de voltar ao estado
    # anterior. Nao ha dado a restaurar -- a correcao nao alterou nenhuma linha.
    op.execute(_CORPO_ANTIGO)
