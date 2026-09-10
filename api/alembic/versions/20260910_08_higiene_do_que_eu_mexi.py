"""fecha o search_path do gatilho de conquistas e tira o corpo morto que sobrou

Terceira passada de higiene, e a ultima que o linter aponta dentro do que eu
mexi nesta sequencia. As `20260909_*` e `20260910_*` reescreveram o gatilho de
conquistas tres vezes por substituicao de `prosrc`, e duas coisas ficaram para
tras.

**1. `trg_eventos_aluno_after_iud` sem `search_path`.** E' a funcao viva do
gatilho de conquistas -- tres gatilhos apontam para ela --, e o corpo referencia
**4 tabelas sem prefixo `public.`**. Sem fixar, quem chama decide onde esses
nomes sao resolvidos: um schema plantado antes de `public` no `search_path` faz
a funcao ler outra tabela. Ela nao e' `SECURITY DEFINER`, entao nao ha escalada
de privilegio -- mas ha troca silenciosa de dado, que e' pior de diagnosticar.

Fixar em `public, pg_temp` resolve exatamente como resolve hoje (conferi: o corpo
so' cita o schema `public`), entao nao ha mudanca de comportamento. Inlining nao
e' preocupacao: e' `plpgsql`.

**2. `trg_eventos_aluno_after_ins` e' corpo morto.** A `20260909_01` criou
`trg_eventos_aluno_after_iud` e reapontou os tres gatilhos para ela, deixando a
antiga orfa. Medido: **0 gatilhos, 0 dependencias, 0 citacoes em funcao ou view**
-- e 11.929 bytes de corpo.

Nao e' so' lixo: e' a versao ANTIGA da avaliacao de conquistas, com a
materializacao de posicao de rank (`v_posicao_ant`, `v_posicao_nova`) que o
`CLAUDE.md` registra como abandonada -- "ranking e' dirigido so' por view; este
gatilho nao materializa posicao". Corpo morto que sombreia a logica viva e'
armadilha: basta alguem reapontar um gatilho para ela e o comportamento velho
ressuscita, sem nenhum aviso.

**3. `fn_eventos_aluno_referencia_id` sem `search_path`.** Nao era minha, mas
entrou no meu caminho: e' ela que a `fn_eventos_aluno_resolve_classe_id` chama
para extrair o id, e a resolucao de classe agora roda em todo INSERT de evento
(`20260910_07`). Fechar o `search_path` de quem eu passei a depender e' parte do
mesmo cuidado. Nao ha custo de inlining: a chamadora ja tem `search_path` fixo,
entao ja nao era inlineada.

O que **nao** muda: o ERROR de `security_definer_view`. Ele saiu de
`vw_rank_posicoes_por_classe_todas` e apareceu em
`vw_rank_posicoes_por_classe` porque a `20260910_05` revogou `authenticated` da
primeira -- o linter passou a apontar a que o cliente realmente le. E a cortada
**precisa** rodar como dono: se fosse `security_invoker`, leria a `_todas` como
`authenticated`, que nao tem privilegio nenhum nela, e o rank sumiria com
"permission denied". A excecao continua deliberada, so' mudou de view -- o
`CLAUDE.md` foi corrigido para nomear a certa.

Revision ID: 20260910_08
Revises: 20260910_07
Create Date: 2026-09-10
"""

from alembic import op

revision = "20260910_08"
down_revision = "20260910_07"
branch_labels = None
depends_on = None


FUNCOES_SEM_SEARCH_PATH = (
    "public.trg_eventos_aluno_after_iud()",
    "public.fn_eventos_aluno_referencia_id(text)",
)

SEARCH_PATH = "\n".join(
    f"ALTER FUNCTION {assinatura} SET search_path TO 'public', 'pg_temp';"
    for assinatura in FUNCOES_SEM_SEARCH_PATH
)

SEARCH_PATH_DESFEITO = "\n".join(
    f"ALTER FUNCTION {assinatura} RESET search_path;"
    for assinatura in FUNCOES_SEM_SEARCH_PATH
)


# `ALTER FUNCTION ... SET search_path`, e nao `CREATE OR REPLACE`: recolar os
# 11.929 bytes de `trg_eventos_aluno_after_iud` congelaria aqui uma copia de um
# corpo que e' GERADO -- ele sai do dicionario de metricas da `20260909_01` e
# passou por tres substituicoes depois. `ALTER` mexe so' no parametro.
CORPO_MORTO = """
DROP FUNCTION IF EXISTS public.trg_eventos_aluno_after_ins();
"""


CONFERE = """
DO $$
DECLARE
  v_gatilhos bigint;
  v_morta    bigint;
  v_solta    bigint;
BEGIN
  -- Os tres gatilhos continuam na funcao viva.
  SELECT count(*) INTO v_gatilhos
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.eventos_aluno'::regclass
     AND NOT t.tgisinternal
     AND p.proname = 'trg_eventos_aluno_after_iud';

  IF v_gatilhos <> 3 THEN
    RAISE EXCEPTION USING MESSAGE =
      'esperava 3 gatilhos em trg_eventos_aluno_after_iud, achei ' || v_gatilhos::text;
  END IF;

  -- E a morta se foi.
  SELECT count(*) INTO v_morta
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'trg_eventos_aluno_after_ins';

  IF v_morta > 0 THEN
    RAISE EXCEPTION 'trg_eventos_aluno_after_ins continua existindo';
  END IF;

  -- Nenhuma das duas ficou com search_path mutavel.
  SELECT count(*) INTO v_solta
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('trg_eventos_aluno_after_iud', 'fn_eventos_aluno_referencia_id')
     AND p.proconfig IS NULL;

  IF v_solta > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'funcao com search_path ainda mutavel: ' || v_solta::text;
  END IF;

  -- E o que elas alimentam continua de pe. `search_path` fixo impede inlining,
  -- e a resolucao de classe roda em todo INSERT de evento desde a 20260910_07:
  -- se ela parar de resolver, o rank para de contar.
  IF public.fn_eventos_aluno_resolve_classe_id('conteudo_concluido', 'conteudo:174') IS NULL THEN
    RAISE EXCEPTION 'fn_eventos_aluno_resolve_classe_id parou de resolver classe';
  END IF;

  IF public.fn_eventos_aluno_referencia_id('conteudo:174') <> 174 THEN
    RAISE EXCEPTION 'fn_eventos_aluno_referencia_id parou de extrair o id';
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(SEARCH_PATH)
    op.execute(CORPO_MORTO)
    op.execute(CONFERE)


def downgrade() -> None:
    # O `search_path` volta a ser mutavel. O corpo morto NAO volta: eram 11.929
    # bytes sem gatilho, sem dependencia e sem citacao, e a versao viva da mesma
    # logica esta em `trg_eventos_aluno_after_iud`.
    op.execute(SEARCH_PATH_DESFEITO)
