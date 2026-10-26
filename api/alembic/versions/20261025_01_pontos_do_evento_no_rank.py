"""Os "Pontos do evento" chegam ao aluno: encerrar credita `eventos_classe.pontos` no rank (#141)

O professor preenche "Pontos do evento" no console (`eventos_classe.pontos`) e, até aqui, o número
não ia para lugar nenhum. A apuração (`fn_evento_classe_apurar`, `20261017_03` e a versão de hoje
na `20261021_06`) dizia isso no próprio docstring: "A pontuação do evento NÃO é creditada ainda".
Moedas e medalhas já saíam; os pontos, não.

## O que muda

Na apuração, cada participante (`eventos_classe_resultado.participou`, o mesmo critério das moedas
e da medalha de participação) ganha UMA linha em `eventos_aluno`:

| coluna | valor |
| --- | --- |
| `tipo` | `evento_classe_pontos` |
| `referencia` | `classe:<classe_id>:evento:<evento_id>` |
| `valor` | `eventos_classe.pontos` |
| `concedido_por` | quem encerrou (o professor), ou quem criou o evento |
| `motivo` | `Evento: <título>` |

Por que cada peça é como é:

- **A referência começa com `classe:<id>:`.** É a forma que `fn_eventos_aluno_resolve_classe_id`
  e a view do rank já resolvem contra `classe` (desde a `20260909_03`). O gatilho de inserção grava
  `classe_id` a partir dela, então a linha entra no rank da turma do evento e na janela do período
  aberto, sem mexer em view nenhuma.
- **O tipo é creditado** (`fn_evento_creditado` passa a reconhecer o prefixo `evento_classe`).
  Isso faz três coisas que já existem para presença e nota do professor:
  1. `trg_eventos_aluno_valor_do_banco` mantém o `valor` de quem concedeu, em vez de trocá-lo por
     `fn_pontos_do_evento(tipo)` (que daria zero para um tipo sem preço), e congela o valor no UPDATE;
  2. a policy `eventos_aluno_posse_ins` recusa o tipo vindo do cliente: o aluno não se dá ponto de
     evento;
  3. as métricas de conquista e de missão ignoram o tipo (ponto concedido não é uso do app).
- **Idempotente.** Índice único parcial `eventos_aluno_evento_classe_unico (aluno_id, tipo,
  referencia) WHERE tipo = 'evento_classe_pontos'` e `ON CONFLICT ... DO NOTHING`, com o predicado
  repetido (regra do CLAUDE.md). Apurar de novo não credita duas vezes nem muda o valor já dado.
  É um índice próprio, como o `eventos_aluno_meta_unico`, para não recriar o
  `eventos_aluno_creditado_unico`.
- **Ponto de evento não conta como atividade de outro evento.** A soma da janela passa a ignorar
  `evento_classe_pontos`. Sem isso, dois eventos sobrepostos na mesma turma se alimentariam: o
  crédito do primeiro, gravado ao encerrar, cairia na janela do segundo como "pontos feitos" e
  marcaria `participou` para quem não fez nada nele. Pelo mesmo motivo uma reapuração não soma o
  próprio crédito.
- **`pontos = 0` não grava nada.** E quem não participou não recebe: o opt-in é participar.
- **A moeda não dobra.** `fn_eventos_aluno_paga_moeda` roda nesta inserção, mas o tipo não tem
  preço em `eventos_pontuacao`, então `fn_moedas_do_evento` devolve 0. As moedas do evento
  continuam saindo só pelo `moedas_ledger` da própria apuração.

A data do crédito é a do encerramento (`now()`, como as moedas): o ponto entra no período do rank
que está aberto quando o professor encerra. Período já encerrado tem pódio congelado e não muda.

Visibilidade: nada novo. A linha é do aluno (`eventos_aluno`, RLS de sempre), e o rank continua
passando pela `vw_rank_posicoes_por_classe`, com o corte do #134.

## Downgrade

Volta a apuração da `20261021_06`, o `fn_evento_creditado` da `20261020_03` e derruba o índice. As
linhas `evento_classe_pontos` já gravadas ficam: apagar crédito dado mudaria o rank de quem já o
viu.

Revision ID: 20261025_01
Revises: 20261024_11
Create Date: 2026-10-25
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261025_01"
down_revision = "20261024_11"
branch_labels = None
depends_on = None


TIPO = "evento_classe_pontos"


def _load(nome: str):
    path = Path(__file__).with_name(nome)
    spec = importlib.util.spec_from_file_location(nome, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _troca(texto: str, antigo: str, novo: str, onde: str) -> str:
    if texto.count(antigo) != 1:
        raise RuntimeError(f"o trecho de {onde} mudou de forma; revise a 20261025_01")
    return texto.replace(antigo, novo, 1)


CREDITADO = """
CREATE OR REPLACE FUNCTION public.fn_evento_creditado(p_tipo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT COALESCE(
    starts_with(lower(p_tipo), 'presenca')
    OR starts_with(lower(p_tipo), 'participacao')
    OR starts_with(lower(p_tipo), 'conquista')
    OR starts_with(lower(p_tipo), 'nota_professor')
    OR starts_with(lower(p_tipo), 'meta_atingida')
    OR starts_with(lower(p_tipo), 'evento_classe'),
    false
  );
$fn$;
"""

INDICE = f"""
CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_evento_classe_unico
  ON public.eventos_aluno (aluno_id, tipo, referencia)
  WHERE tipo = '{TIPO}';
"""

INDICE_FORA = "DROP INDEX IF EXISTS public.eventos_aluno_evento_classe_unico;"


def apuracao_anterior() -> str:
    """`fn_evento_classe_apurar` como a `20261021_06` a deixa (a última que a redefine)."""
    m06 = _load("20261021_06_aposta_e_pontuacao_ranqueada.py")
    return m06._apuracao(m06.APURACAO_SOMA_BRUTA)


def apuracao_com_pontos() -> str:
    sql = apuracao_anterior()
    sql = _troca(
        sql,
        "       AND ea.criado_em <= v_evento.fim\n",
        "       AND ea.criado_em <= v_evento.fim\n"
        "       -- Ponto de evento (crédito de uma apuração) não é atividade feita na janela.\n"
        f"       AND ea.tipo <> '{TIPO}'\n",
        "janela da soma",
    )
    sql = _troca(
        sql,
        "  -- Medalhas (issue #152",
        f"""  -- Pontos do evento (#141): uma linha por participante em `eventos_aluno`, com a referência
  -- `classe:<id>:` que o gatilho e a view do rank resolvem para a turma do evento. Tipo creditado:
  -- o valor é o do evento, não o de `fn_pontos_do_evento`. O índice parcial e o ON CONFLICT (com o
  -- predicado repetido) tornam reapurar inofensivo.
  IF v_evento.pontos > 0 THEN
    INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, concedido_por, motivo)
    SELECT r.aluno_id, '{TIPO}',
           'classe:' || v_evento.classe_id::text || ':evento:' || p_evento_id::text,
           v_evento.pontos, COALESCE(auth.uid(), v_evento.criado_por),
           left('Evento: ' || v_evento.titulo, 200)
    FROM public.eventos_classe_resultado r
    WHERE r.evento_id = p_evento_id AND r.participou
    ON CONFLICT (aluno_id, tipo, referencia) WHERE tipo = '{TIPO}' DO NOTHING;
  END IF;

  -- Medalhas (issue #152""",
        "bloco das medalhas",
    )
    sql = _troca(
        sql,
        "a medalha não paga pontos (os pontos do evento são outra decisão).",
        "a medalha não paga pontos (os pontos do evento saem no bloco acima).",
        "comentário das medalhas",
    )
    return sql


def upgrade() -> None:
    op.execute(CREDITADO)
    op.execute(INDICE)
    op.execute(apuracao_com_pontos())


def downgrade() -> None:
    op.execute(apuracao_anterior())
    op.execute(INDICE_FORA)
    op.execute(_load("20261020_03_economia_metas_extrato_auditoria.py").CREDITADO)
