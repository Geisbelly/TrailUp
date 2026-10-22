"""`20261022_03`: missão ganha `categoria` (principal × secundária).

Antes de escrever a coluna, o schema foi medido: `origem` já aceitava `professor`, `escopo` já
separava `aluno`/`guilda`, `perfil_alvo` já tinha CHECK com os 7 perfis e `fn_missao_diaria_gerar`
já direcionava por perfil. Faltava só a categoria -- `slot` é do rodízio diário (1..9) e
significa "qual das do dia", não "quanto pesa na trilha".

O que estes testes protegem é o default (promover as 48 existentes encheria a trilha de destaque
falso) e o fato de a coluna não ter sido amarrada a um escopo.
"""

import importlib.util
import inspect
from pathlib import Path

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
_ARQUIVO = "20261022_03_missao_principal_ou_secundaria.py"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M = _modulo(_ARQUIVO)


def test_encadeia_depois_dos_portoes() -> None:
    assert _M.revision == "20261022_03"
    assert _M.down_revision == "20261022_02"


def test_so_aceita_principal_ou_secundaria() -> None:
    assert "CHECK (categoria = ANY (ARRAY['principal'::text, 'secundaria'::text]))" in _M.COLUNA


def test_o_default_e_secundaria() -> None:
    """As 48 missões que já existem são todas `origem='sistema'` do rodízio diário (medido).
    Default `principal` promoveria todas de uma vez e a trilha nasceria cheia de destaque falso.
    Principal é o que ALGUÉM marcou como principal — o "o professor define" do pedido."""
    assert "DEFAULT 'secundaria'" in _M.COLUNA
    assert "DEFAULT 'principal'" not in _M.COLUNA


def test_a_coluna_nao_e_amarrada_a_um_escopo() -> None:
    """Hoje só `escopo='aluno'` usa categoria -- a trilha. Proibir os outros por CHECK fecharia
    a porta para uma missão principal de guilda sem ganhar nada: o `escopo` já diz onde cada uma
    aparece."""
    assert "escopo" not in _M.COLUNA


def test_e_idempotente() -> None:
    # Reaplicar nao pode estourar: o DROP CONSTRAINT antes do ADD existe para isso.
    assert "ADD COLUMN IF NOT EXISTS categoria" in _M.COLUNA
    assert "DROP CONSTRAINT IF EXISTS missoes_categoria_check" in _M.COLUNA
    assert "CREATE INDEX IF NOT EXISTS missoes_trilha_idx" in _M.INDICE


def test_o_indice_cobre_a_leitura_da_trilha_e_so_o_que_e_lido() -> None:
    # A leitura e' "ativas desta turma, deste escopo, nesta categoria". Missao inativa nunca
    # entra, e deixa-la fora mantem o indice do tamanho do que e' lido.
    assert "(classe_id, escopo, categoria)" in _M.INDICE
    assert "WHERE ativa" in _M.INDICE


def test_downgrade_desfaz_na_ordem_certa() -> None:
    fonte = inspect.getsource(_M.downgrade)
    posicoes = [
        fonte.index("DROP INDEX"),
        fonte.index("DROP CONSTRAINT"),
        fonte.index("DROP COLUMN"),
    ]
    assert posicoes == sorted(posicoes), "a coluna nao pode cair antes do que depende dela"
    # Nada alem da coluna nova: o resto da linha de missao continua intacto.
    assert "DROP TABLE" not in fonte
