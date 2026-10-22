"""`20261021_25`: helpers de guilda saem do alcance do aluno.

Achado da segunda revisão da leva: a `20261021_23`, ao versionar os GRANT que só existiam no
banco, trouxe quatro funções para o campo de visão de `test_definer_exposto_sem_sessao` — que até
então as pulava, porque o corpo delas vive num `.sql` de `docs/mobile/sql/` e aquele portão lia
só os `.py`. Três reprovaram, e uma (`guilda_bloqueio_ativo`) entregava a qualquer aluno se duas
pessoas quaisquer se bloquearam.
"""

import importlib.util
import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_definer_exposto_sem_sessao import _expostas
from tests.test_migrations import _offline_alembic_config
from tests.test_rpc_chamada_tem_migracao import _rpcs_chamadas

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
_ARQUIVO = "20261021_25_helpers_de_guilda_saem_do_alcance_do_aluno.py"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M25 = _modulo(_ARQUIVO)

_HELPERS = (
    "public.guilda_bloqueio_ativo(uuid, uuid)",
    "public.guilda_janela_aberta(bigint)",
    "public.guilda_congelar_composicao(text, bigint)",
    "public.guilda_classe_atual(bigint)",
)


def test_encadeia_depois_da_24() -> None:
    assert _M25.revision == "20261021_25"
    assert _M25.down_revision == "20261021_24"


def test_as_quatro_perdem_o_execute_de_authenticated() -> None:
    for assinatura in _HELPERS:
        assert f"REVOKE EXECUTE ON FUNCTION {assinatura} FROM authenticated;" in _M25.ESTREITA, assinatura


def test_nenhum_cliente_chama_as_quatro() -> None:
    """A justificativa inteira do REVOKE. Se um cliente passar a chamar uma delas, este teste
    falha ANTES de alguém descobrir pelo 42501 em produção — e aí a decisão é outra: dar à função
    uma checagem de sessão, não devolver o EXECUTE."""
    chamadas = _rpcs_chamadas()
    for assinatura in _HELPERS:
        nome = assinatura.split("(")[0].removeprefix("public.")
        assert nome not in chamadas, (
            f"{nome} passou a ser chamada por um cliente; revogar o EXECUTE a quebra. "
            "Dê a ela uma checagem de sessão em vez de reabrir o acesso."
        )


def test_a_porta_oficial_da_janela_continua_aberta() -> None:
    """`guilda_janela_da_turma(bigint)` É chamada pelo console e tem permissão de professor.
    Confundi-la com `guilda_janela_aberta` e revogar as duas derrubaria a aba de guildas."""
    assert "guilda_janela_da_turma" in _rpcs_chamadas()
    assert "guilda_janela_da_turma" not in _M25.ESTREITA


def test_as_quatro_deixam_de_contar_como_expostas() -> None:
    """O efeito medido no portão irmão: depois desta migration, nenhuma das quatro aparece em
    `_expostas()`. É o que faz `test_toda_definer_exposta_confere_a_sessao` voltar ao verde sem
    que ninguém tenha escrito uma linha em `SEM_SESSAO_POR_DECISAO`."""
    expostas = _expostas()
    for assinatura in _HELPERS:
        nome = assinatura.split("(")[0].removeprefix("public.")
        assert nome not in expostas, f"{nome} ainda conta como exposta a authenticated/anon"


def test_o_sql_do_downgrade_nao_mora_no_topo_do_arquivo() -> None:
    """Armadilha real, não hipótese: a primeira versão deste arquivo tinha
    `RECONCEDE = \"\"\"GRANT ...\"\"\"` como constante de módulo. Dois portões decidem quem termina
    exposto lendo o texto e cortando em `def downgrade` — constante no topo cai do lado do
    upgrade, e os dois leram o GRANT de reversão como estado final, concluindo que esta migration
    não revogava nada.

    Então: nenhum `GRANT` antes de `def downgrade` neste arquivo."""
    fonte = (_VERSOES / _ARQUIVO).read_text(encoding="utf-8")
    antes_do_downgrade = fonte.split("def downgrade")[0]
    grants = re.findall(r"^\s*GRANT\s+EXECUTE", antes_do_downgrade, re.M)
    assert not grants, (
        "Ha GRANT antes de `def downgrade`: as varreduras que cortam ali vao ler isto como "
        "estado final e concluir que a migration nao revoga nada."
    )
    # E o downgrade de fato reconcede — ele existe, não é um `pass`.
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_25:20261021_24", sql=True)
    for assinatura in _HELPERS:
        assert f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated;" in output.getvalue(), assinatura
