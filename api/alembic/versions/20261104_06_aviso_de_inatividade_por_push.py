"""Aviso de conta inativa também por push (#632).

O aviso de que a conta vai ser apagada (`trailup_retencao`, `20261024_07`) saía por e-mail e caía
na caixa de entrada do app (`notificacoes`). Gravar em `notificacoes` não dispara push: no motor de
notificações, quem manda push é `notificacoes_enviar_push`, chamada por quem entrega
(`notificacoes_entregar`, `notificacoes_rank_varrer`...). O aviso nunca chamava. O aluno inativo,
justamente o que não abre o app, só via o aviso se lesse o e-mail.

Agora, logo depois de gravar o aviso na caixa de entrada, a retenção chama
`notificacoes_enviar_push` para o mesmo registro, com prioridade alta. A função já cuida do resto:
só aparelhos com token ativo, fora do horário de silêncio, e o envio pelo `pg_net`. Sem aparelho, ou
no silêncio, não sai push - o e-mail e a caixa de entrada continuam valendo, e o prazo de exclusão
conta a partir do e-mail, como antes.

Só acontece em modo `aplicar`, que é onde o aviso é criado.

Mesmo padrão da `20261102_25`: lê o texto da função na migration que a definiu por último e troca só
os trechos; se o trecho mudou de forma, a migration falha em vez de aplicar algo diferente do revisado.

Revision ID: 20261104_06
Revises: 20261104_05
Create Date: 2026-11-04
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261104_06"
down_revision = "20261104_05"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

TROCAS = (
    (
        "  v_inicio    timestamptz := clock_timestamp();\n",
        "  v_inicio    timestamptz := clock_timestamp();\n  v_push_ids  bigint[];\n",
    ),
    (
        "    INSERT INTO public.notificacoes (aluno_id, titulo, corpo, tipo, origem, contexto)\n",
        "    , caixa AS (\n"
        "    INSERT INTO public.notificacoes (aluno_id, titulo, corpo, tipo, origem, contexto)\n",
    ),
    (
        "      FROM novos;\n",
        "      FROM novos\n"
        "    RETURNING id)\n"
        "    SELECT array_agg(id) INTO v_push_ids FROM caixa;\n"
        "\n"
        "    -- Push do mesmo aviso (#632, 20261104_06). Fora do silencio e so' para aparelho ativo:\n"
        "    -- quem decide e' notificacoes_enviar_push. Sem aparelho, ficam o e-mail e a caixa.\n"
        "    PERFORM public.notificacoes_enviar_push(\n"
        "      n.aluno_id, n.id, n.titulo, n.corpo,\n"
        "      jsonb_build_object('tipo', 'sistema', 'origem', 'retencao', 'motivo', 'conta_inativa'), 1)\n"
        "      FROM public.notificacoes n\n"
        "     WHERE n.id = ANY (coalesce(v_push_ids, ARRAY[]::bigint[]));\n",
    ),
)


def _load(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_04_06", AQUI.with_name(nome))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def retencao_anterior() -> str:
    return _load("20261024_07_exclusao_professor_e_aviso_inatividade.py").RETENCAO_SQL


def retencao_nova() -> str:
    texto = retencao_anterior()
    for antigo, novo in TROCAS:
        if texto.count(antigo) != 1:
            raise RuntimeError("trailup_retencao mudou de forma desde a 20261024_07; revise a 20261104_06")
        texto = texto.replace(antigo, novo)
    return texto


def upgrade() -> None:
    op.execute(retencao_nova())


def downgrade() -> None:
    op.execute(retencao_anterior())
