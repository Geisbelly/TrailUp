"""Um ponto de entrada para responder desafio — `desafio_responder` despacha

Decisão que a `20261021_19` deixou em aberto: *"unificar os dois responder"*. **Unificado o
ponto de entrada, não as regras** — e o motivo é medição, não gosto.

## O que as duas funções têm em comum: quase nada

Lidas lado a lado na produção (2026-10-21), `arena_responder` (2417 caracteres) e
`guilda_desafio_responder` (5345) compartilham três linhas de comparação de resposta e a guarda
de participação. Todo o resto difere **por desenho**:

| | `arena_responder` | `guilda_desafio_responder` |
| --- | --- | --- |
| tentativas | UMA (`ON CONFLICT DO NOTHING`) | `desafio_tentativas_*` por dificuldade, `DO UPDATE` |
| tempo | limitado a 600000 ms | **acumula** entre tentativas |
| fecha quando | todo aceito respondeu tudo **e** ninguém está `convidado` | nenhum par (aceito × questão) ainda pode ser respondido |
| retorno | `{correta, registrada}` | `{correta, tentativas, tentativas_restantes, faltam, encerrou}` |

Fundir os corpos daria um `IF` com duas implementações disjuntas dentro, em código que já foi
corrigido três vezes este mês (`_12`, `_14`, `_19`) — cada correção numa das duas. Seria mais
fácil quebrar uma mexendo na outra, que é o oposto do que unificar deveria render.

> Conferido e **descartado como defeito**: a arena compara `COALESCE(v_q.resposta_correta, '')`
> sem `::text` e a guilda com. `questoes.resposta_correta` é `text` puro (medido), então o cast
> é no-op e as duas comparações são equivalentes. Não há divergência para consertar aqui.

## O que de fato se duplicava: a escolha

Hoje quem decide qual chamar é o **cliente**, por `desafio.competitivo`, e o banco recusa o
caminho errado com 22023 (`arena_desafio_cooperativo` / `guilda_desafio_e_da_arena`). Ou seja, a
mesma pergunta — "este desafio tem equipe 2?" — é respondida em três lugares.

`desafio_responder` responde uma vez, no banco, e despacha. O predicado é o mesmo que as duas
guardas já usam, `EXISTS (... dp.equipe = 2)`, então não há terceira definição de "é da arena".

O ganho concreto não é estético: **o cliente pode estar desatualizado**. Se o adversário aceitar
entre o carregamento da tela e o envio da resposta, o `competitivo` que o cliente guardou está
velho, ele chama a função errada e o aluno vê um erro. Com um ponto de entrada, quem classifica
é quem tem o dado na hora.

O retorno é o payload de quem respondeu de verdade, mais `competitivo` — para a tela saber qual
regra valeu sem tentar adivinhar pela forma do objeto. **Nenhuma chave é inventada:** a arena
continua devolvendo `{correta, registrada}`, porque `faltam` e `tentativas_restantes` não
existem naquele caminho e preenchê-los com zero seria mentira.

## As duas antigas continuam com EXECUTE, de propósito

Aplicativo já instalado chama `guilda_desafio_responder`/`arena_responder` pelo nome. Revogar
junto com esta migration quebraria quem não atualizou. O cliente novo tenta
`desafio_responder` primeiro e **cai para o par antigo** quando a função não existe (PGRST202),
que é o mesmo cuidado de `carregarJanelaDaFormacao` — assim a ordem entre aplicar a migration e
publicar o app deixa de importar.

Revogar as duas é a continuação natural, **depois** de o app novo estar distribuído. Fica
registrado aqui para não virar dívida silenciosa; `test_rpc_chamada_tem_migracao` continua vendo
as três, porque o cliente chama as três.

Revision ID: 20261021_27
Revises: 20261021_26
Create Date: 2026-10-21
"""

from alembic import op

revision = "20261021_27"
down_revision = "20261021_26"
branch_labels = None
depends_on = None


ASSINATURA = "public.desafio_responder(uuid, bigint, text, integer)"

CRIA = """
CREATE OR REPLACE FUNCTION public.desafio_responder(p_desafio_id uuid, p_questao_id bigint, p_resposta text, p_tempo_ms integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_competitivo boolean;
  v_saida       jsonb;
BEGIN
  -- O MESMO predicado das duas guardas (`arena_desafio_cooperativo` e
  -- `guilda_desafio_e_da_arena`). Não é uma terceira definição de "é da arena": é a única,
  -- agora com um só lugar para mudar.
  SELECT EXISTS (
    SELECT 1 FROM public.desafio_participantes dp
     WHERE dp.desafio_id = p_desafio_id AND dp.equipe = 2
  ) INTO v_competitivo;

  -- Sem checagem de permissão aqui de propósito: quem recusa é a função que de fato responde,
  -- com a mensagem dela. Duplicar a guarda criaria duas respostas possíveis para o mesmo "não".
  IF v_competitivo THEN
    v_saida := public.arena_responder(p_desafio_id, p_questao_id, p_resposta, p_tempo_ms);
  ELSE
    v_saida := public.guilda_desafio_responder(p_desafio_id, p_questao_id, p_resposta, p_tempo_ms);
  END IF;

  RETURN COALESCE(v_saida, '{}'::jsonb) || jsonb_build_object('competitivo', v_competitivo);
END
$function$;

REVOKE ALL ON FUNCTION public.desafio_responder(uuid, bigint, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desafio_responder(uuid, bigint, text, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(CRIA)


def downgrade() -> None:
    # Remover é seguro: nada no banco depende dela, e o cliente cai para o par antigo quando a
    # função não existe (PGRST202) — é o mesmo caminho que cobre a ordem de publicação.
    op.execute(
        """
        DROP FUNCTION IF EXISTS public.desafio_responder(uuid, bigint, text, integer);

        NOTIFY pgrst, 'reload schema';
        """
    )
