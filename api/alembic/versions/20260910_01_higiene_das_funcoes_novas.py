"""fecha o search_path das funcoes novas e tira o anon de quem nao precisa

O linter do Supabase apontou, depois das migracoes 20260909_*, tres funcoes que
eu acrescentei sem `SET search_path` e duas `SECURITY DEFINER` executaveis por
`anon`. Sao itens de higiene, mas sao meus -- vale fechar antes que virem
precedente.

**`search_path` mutavel.** Sem fixar, o `search_path` de quem chama decide onde
os nomes sao resolvidos: um schema plantado antes de `public` faz a funcao
chamar outra coisa. Nas tres o risco e' baixo, porque nenhuma e' `SECURITY
DEFINER` -- elas rodam com o privilegio de quem chama, entao nao ha escalada. O
projeto tem 37 funcoes assim; estas tres eu nao deixo crescer.

**`anon` executando `SECURITY DEFINER`.** `app_rank_limite_visivel()` devolve o
limite do rank e `fn_pontos_do_evento()` devolve quanto vale um tipo de evento --
nenhuma expoe nada. Mas as duas rodam com privilegio do dono e ficam publicadas
em `/rest/v1/rpc/...` sem login, o que nao tem motivo para existir.

Usa `ALTER FUNCTION ... SET search_path`, nao `CREATE OR REPLACE`: recolar os
corpos aqui congelaria uma copia deles dentro desta migracao, e a
`fn_conquista_metrica_suportada` e' gerada a partir do dicionario de metricas da
`20260909_01`. `ALTER` mexe so' no parametro.

O que **nao** muda:

- `authenticated` mantem EXECUTE nas duas. `fn_pontos_do_evento` e' chamada pelo
  gatilho `BEFORE INSERT`, que e' `SECURITY INVOKER` e roda como o aluno --
  revogar dele quebraria toda gravacao de evento.
- `fn_evento_creditado` e `fn_conquista_metrica_suportada` continuam com os
  grants que tem: a primeira e' avaliada dentro da policy de INSERT, como o
  aluno, e a segunda dentro do CHECK de `conquistas`.
- `vw_rank_posicoes_por_classe` continua sem `security_invoker`. O linter marca
  como ERROR, mas e' a excecao deliberada documentada no `CLAUDE.md`: o ranking
  soma eventos de varios alunos, o que um aluno nao pode fazer lendo
  `eventos_aluno` linha a linha, e por isso mantem o bypass com filtro na saida.

Revision ID: 20260910_01
Revises: 20260909_05
Create Date: 2026-09-10
"""

from alembic import op

revision = "20260910_01"
down_revision = "20260909_05"
branch_labels = None
depends_on = None


# assinatura -> so' para o SQL ficar legivel; a ordem nao importa.
FUNCOES_SEM_SEARCH_PATH = (
    "public.fn_conquista_metrica_suportada(text)",
    "public.fn_evento_creditado(text)",
    "public.trg_eventos_aluno_valor_do_banco()",
)

SEARCH_PATH = "\n".join(
    f"ALTER FUNCTION {assinatura} SET search_path TO 'public', 'pg_temp';"
    for assinatura in FUNCOES_SEM_SEARCH_PATH
)

SEARCH_PATH_DESFEITO = "\n".join(
    f"ALTER FUNCTION {assinatura} RESET search_path;"
    for assinatura in FUNCOES_SEM_SEARCH_PATH
)

GRANTS = """
REVOKE ALL ON FUNCTION public.app_rank_limite_visivel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_rank_limite_visivel() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_pontos_do_evento(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pontos_do_evento(text) TO authenticated, service_role;
"""

# Falha aqui, na migracao, em vez de falhar depois num INSERT de conquista ou de
# evento -- que e' onde estas funcoes sao realmente exercitadas. `SET
# search_path` impede inlining, e o CHECK de `conquistas` e a policy de INSERT
# de `eventos_aluno` dependem das duas primeiras.
CONFERE = """
DO $$
DECLARE
  v_orfas  text;
  v_pontos numeric;
BEGIN
  IF NOT public.fn_conquista_metrica_suportada('dias_seguidos') THEN
    RAISE EXCEPTION 'fn_conquista_metrica_suportada parou de reconhecer metrica valida';
  END IF;

  IF public.fn_conquista_metrica_suportada('metrica_que_nao_existe') THEN
    RAISE EXCEPTION 'fn_conquista_metrica_suportada passou a aceitar metrica desconhecida';
  END IF;

  SELECT string_agg(id::text, ', ') INTO v_orfas
    FROM public.conquistas
   WHERE criterio IS NULL
      OR NOT public.fn_conquista_metrica_suportada(criterio->>'metrica');

  IF v_orfas IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE =
      'o CHECK de conquistas deixou de valer para: ' || v_orfas;
  END IF;

  IF NOT public.fn_evento_creditado('presenca_aula')
     OR public.fn_evento_creditado('conteudo_concluido') THEN
    RAISE EXCEPTION 'fn_evento_creditado mudou de comportamento';
  END IF;

  SELECT public.fn_pontos_do_evento('conteudo_concluido') INTO v_pontos;
  IF COALESCE(v_pontos, 0) <= 0 THEN
    RAISE EXCEPTION 'fn_pontos_do_evento parou de devolver a pontuacao da tabela';
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(SEARCH_PATH)
    op.execute(GRANTS)
    op.execute(CONFERE)


def downgrade() -> None:
    op.execute(SEARCH_PATH_DESFEITO)
    op.execute("GRANT EXECUTE ON FUNCTION public.app_rank_limite_visivel() TO anon")
    op.execute("GRANT EXECUTE ON FUNCTION public.fn_pontos_do_evento(text) TO anon")
