"""#191: a resposta do flashcard sai da coluna `descricao`.

O que decidiu a correção foi medição, e é ela que estes testes travam: `metadata.frente`/`verso`
é a fonte (o mobile lê o metadata primeiro), e `descricao` não pode carregar a resposta — um
campo com nome de legenda e conteúdo de resposta convida o próximo consumidor a vazá-la, que foi
exatamente como o flashcard entregou a resposta na frente (#190).

Dois escritores produziam a duplicação — a persistência e o payload em memória que vai na
resposta da API. Consertar só um deixaria a resposta vazando pelo outro, então os dois têm teste.
"""

import importlib.util
import inspect
from io import StringIO
from pathlib import Path

from app.db import migrations
from app.repositories.artefatos_personalizados import ArtefatosPersonalizadosRepository
from app.services import personalizacao as servico
from app.services.personalizacao import _descricao_sem_resposta
from tests.test_migrations import _offline_alembic_config

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
_ARQUIVO = "20261022_01_card_descricao_sem_resposta.py"


def _modulo():
    spec = importlib.util.spec_from_file_location("m20261022_01", _VERSOES / _ARQUIVO)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M = _modulo()


# ── a regra ───────────────────────────────────────────────────────────────────────────────


def test_descricao_igual_ao_verso_vira_vazio() -> None:
    assert _descricao_sem_resposta("É o processo das plantas", "É o processo das plantas") == ""


def test_descricao_propria_e_preservada() -> None:
    """A regra é "não carregar a resposta", não "ficar sempre vazia". Se o gerador algum dia
    mandar uma legenda de verdade, ela passa."""
    assert _descricao_sem_resposta("Dica: pense em luz", "É o processo das plantas") == "Dica: pense em luz"


def test_vazio_continua_vazio_e_nunca_vira_none() -> None:
    """A coluna é `NOT NULL` (medido): devolver `None` aqui quebraria o INSERT."""
    assert _descricao_sem_resposta("", "qualquer verso") == ""
    assert _descricao_sem_resposta("", "") == ""


# ── os dois escritores ────────────────────────────────────────────────────────────────────


def test_a_persistencia_nao_copia_mais_o_verso_para_descricao() -> None:
    fonte = inspect.getsource(ArtefatosPersonalizadosRepository)
    # A forma antiga, que copiava:
    assert 'self._pick_string(card.get("descricao"), verso) or verso' not in fonte
    # A regra nova:
    assert 'descricao = "" if descricao_informada == verso else descricao_informada' in fonte
    # E o `titulo` CONTINUA com a pergunta: ali o nome não engana, e é a reserva do cliente.
    assert 'titulo = self._pick_string(card.get("titulo"), frente)' in fonte


def test_a_fonte_de_verdade_continua_sendo_gravada() -> None:
    """O ponto mais importante: tirar a resposta de `descricao` só é seguro porque ela segue em
    `metadata.verso`. Se este par sair do metadata, o card perde a resposta — e o teste acima
    continuaria verde."""
    fonte = inspect.getsource(ArtefatosPersonalizadosRepository)
    assert '"frente": frente,' in fonte
    assert '"verso": verso,' in fonte


def test_o_payload_em_memoria_tambem_para_de_duplicar() -> None:
    """`personalizacao.py` monta o card que vai na resposta da API. Enquanto ele copiasse o
    verso para `descricao`, a armadilha seguiria viva no payload, mesmo com o banco limpo."""
    fonte = inspect.getsource(servico)
    assert '"descricao": _clean_text(_pick_string(item.get("descricao"), verso), max_chars=320)' not in fonte
    assert '"descricao": _descricao_sem_resposta(' in fonte


# ── a migration de dado ───────────────────────────────────────────────────────────────────


def test_encadeia_depois_da_28_e_e_a_unica_ponta() -> None:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    assert _M.revision == "20261022_01"
    assert _M.down_revision == "20261021_28"
    heads = ScriptDirectory.from_config(
        Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    ).get_heads()
    assert len(heads) == 1, f"a árvore bifurcou: {sorted(heads)}"


def test_normaliza_so_onde_descricao_e_igual_ao_verso() -> None:
    """O predicado é o que torna a migration segura: linha com descrição PRÓPRIA fica intocada.
    Um `UPDATE` sem o `=` apagaria legenda legítima — e não haveria como saber o que havia."""
    sql = _M.NORMALIZA
    assert "descricao = metadata->>'verso'" in sql
    assert "SET descricao = ''" in sql
    # E não mexe no metadata: a resposta continua lá, que é a fonte.
    assert "metadata =" not in sql
    assert "SET metadata" not in sql


def test_o_downgrade_devolve_o_verso_sem_inventar_texto() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261022_01:20261021_28", sql=True)
    sql = output.getvalue()
    assert "SET descricao = metadata->>'verso'" in sql
    # Só onde está vazia e o metadata tem verso — reversão não fabrica conteúdo.
    assert "COALESCE(descricao, '') = ''" in sql
    assert "COALESCE(metadata->>'verso', '') <> ''" in sql
