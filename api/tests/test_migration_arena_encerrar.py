"""`20261021_26`: a decisão sobre `arena_encerrar` — REVOKE, não "desistir".

O plano deixou a escolha aberta. O que decidiu foi a medição, e é ela que estes testes travam:
a função é a única das sete `arena*` sem chamador de cliente, o caminho competitivo fecha por
`arena_responder` (DEFINER) e a partida abandonada fecha pela varredura. Revogar não remove
funcionalidade; mantê-la ligada deixa um participante encerrar a partida que o outro aceitou.
"""

import importlib.util
import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config
from tests.test_rpc_chamada_tem_migracao import _rpcs_chamadas

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
_ARQUIVO = "20261021_26_arena_encerrar_sai_da_mao_do_jogador.py"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M26 = _modulo(_ARQUIVO)

# As outras seis do domínio, que os clientes chamam e que NÃO são tocadas.
_ARENA_EM_USO = (
    "arena_convite_responder",
    "arena_desafio",
    "arena_desafio_criar",
    "arena_listar",
    "arena_professor_resumo",
    "arena_responder",
)


def test_encadeia_depois_da_25() -> None:
    assert _M26.revision == "20261021_26"
    assert _M26.down_revision == "20261021_25"


def test_revoga_so_de_authenticated() -> None:
    """`anon` nunca teve (medido), e `service_role` mantém: se o encerramento precisar ser
    forçado por operação, o caminho existe e passa por credencial de servidor."""
    assert "REVOKE EXECUTE ON FUNCTION public.arena_encerrar(uuid) FROM authenticated;" in _M26.ESTREITA
    assert "service_role" not in _M26.ESTREITA
    assert "anon" not in _M26.ESTREITA


def test_nenhum_cliente_chama_arena_encerrar() -> None:
    """A justificativa inteira do REVOKE. Se um cliente passar a chamar, este teste falha ANTES
    de alguém descobrir pelo 42501 — e a decisão volta a ser a outra: dar a isso a semântica de
    desistir, com consequência definida, não reabrir o acesso."""
    assert "arena_encerrar" not in _rpcs_chamadas(), (
        "Um cliente passou a chamar arena_encerrar. Revogar o EXECUTE o quebra. Ver o docstring "
        "da 20261021_26: desistência precisa de consequência para quem desiste e de algo para o "
        "adversário; não é só reabrir a função."
    )


def test_as_outras_seis_do_dominio_continuam_em_uso_e_intactas() -> None:
    """Guarda contra generalizar o REVOKE. A assimetria é de UMA função; as outras seis são
    chamadas de verdade, e revogá-las derrubaria a arena inteira."""
    chamadas = _rpcs_chamadas()
    for nome in _ARENA_EM_USO:
        assert nome in chamadas, f"{nome} deixou de ser chamada; a premissa da decisão mudou"
        assert nome not in _M26.ESTREITA, f"{nome} não deve ser tocada por esta migration"


def test_o_downgrade_reconcede_e_nao_mora_no_topo() -> None:
    """Mesma armadilha da `_25`: constante de módulo com GRANT cai do lado do upgrade para as
    varreduras que cortam em `def downgrade`, e elas concluiriam que a migration não revoga."""
    fonte = (_VERSOES / _ARQUIVO).read_text(encoding="utf-8")
    assert not re.findall(r"^\s*GRANT\s+EXECUTE", fonte.split("def downgrade")[0], re.M)
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_26:20261021_25", sql=True)
    assert "GRANT EXECUTE ON FUNCTION public.arena_encerrar(uuid) TO authenticated;" in output.getvalue()
