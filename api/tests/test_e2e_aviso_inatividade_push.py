"""`20261104_06` (#632): o aviso de conta inativa também sai por push.

Mesmo banco do `test_e2e_exclusao_professor_aviso.py` (`20261024_07`), com a `20261104_06` por
cima. `notificacoes_enviar_push` é um dublê que só registra a chamada: o que se prova aqui é que a
retenção chama o push do MESMO aviso que gravou na caixa de entrada, uma vez, e só em `aplicar`.
O envio em si (token ativo, silêncio, pg_net) é da função do motor, que já tem os testes dela.
"""

from __future__ import annotations

import pytest

from tests.test_e2e_exclusao_professor_aviso import INATIVO, _aplicar, _banco, _chave, _um
from tests.test_e2e_retencao_expurgo import DSN, _modulo, _sql_de

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

M06 = _modulo("20261104_06_aviso_de_inatividade_por_push.py")

DUBLE_PUSH = """
CREATE TABLE public.push_chamadas (aluno uuid, notificacao bigint, titulo text, corpo text, dados jsonb, prioridade int);
CREATE FUNCTION public.notificacoes_enviar_push(p_aluno uuid, p_notificacao_id bigint, p_titulo text, p_corpo text,
  p_dados jsonb, p_prioridade integer DEFAULT 0) RETURNS integer LANGUAGE sql AS $$
  INSERT INTO public.push_chamadas VALUES (p_aluno, p_notificacao_id, p_titulo, p_corpo, p_dados, p_prioridade)
  RETURNING 1 $$;
"""


def _preparar(c, fn: str = "upgrade") -> None:
    c.execute(DUBLE_PUSH)
    for sql in _sql_de(M06, "upgrade"):
        c.execute(sql)
    if fn == "downgrade":
        for sql in _sql_de(M06, "downgrade"):
            c.execute(sql)


def _chamadas(c) -> list[tuple]:
    return c.execute(
        "SELECT aluno, notificacao, titulo, corpo, dados, prioridade FROM public.push_chamadas"
    ).fetchall()


def test_aviso_vai_para_a_caixa_e_por_push_uma_vez() -> None:
    with _banco() as c:
        _preparar(c)
        _aplicar(c)
        _chave(c)
        _um(c, "SELECT public.trailup_retencao()")

        caixa = c.execute(
            f"SELECT id, titulo, corpo FROM public.notificacoes WHERE aluno_id = '{INATIVO}'"
        ).fetchall()
        assert len(caixa) == 1
        notificacao, titulo, corpo = caixa[0]
        assert _chamadas(c) == [
            (INATIVO, notificacao, titulo, corpo,
             {"tipo": "sistema", "origem": "retencao", "motivo": "conta_inativa"}, 1),
        ]
        # O e-mail continua saindo como antes.
        assert _um(c, "SELECT count(*) FROM net.pedidos") == 1

        # Rodar de novo não avisa de novo: o aviso já existe.
        _um(c, "SELECT public.trailup_retencao()")
        assert len(_chamadas(c)) == 1


def test_simular_nao_manda_push() -> None:
    with _banco() as c:
        _preparar(c)
        _chave(c)
        r = _um(c, "SELECT public.trailup_retencao()")
        assert r["contas_inativas"]["avisaria"] == [str(INATIVO)]
        assert _chamadas(c) == []


def test_downgrade_volta_ao_aviso_sem_push() -> None:
    with _banco() as c:
        _preparar(c, "downgrade")
        _aplicar(c)
        _chave(c)
        _um(c, "SELECT public.trailup_retencao()")
        assert _um(c, "SELECT count(*) FROM public.notificacoes") == 1
        assert _chamadas(c) == []
