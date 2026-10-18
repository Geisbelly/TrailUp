"""O launcher troca a politica de event loop ANTES do uvicorn (#173).

No Windows, `psycopg` async exige `SelectorEventLoop` e o Python usa
`ProactorEventLoop` por padrao. O detalhe que decide o desenho: o uvicorn cria
o loop e SO DEPOIS importa o modulo do app, entao `set_event_loop_policy` no
topo de `app/main.py` nao trocaria o loop em execucao -- medido, nao deduzido.

Estes testes rodam em qualquer plataforma: `sys.platform` e a `asyncio` entram
monkeypatchados. O que nao da para testar daqui e o comportamento real do
`psycopg` sob o Proactor; isso so uma maquina Windows prova.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import run_api  # noqa: E402


def test_fora_do_windows_nao_mexe_na_politica(monkeypatch: pytest.MonkeyPatch) -> None:
    chamadas: list[object] = []
    monkeypatch.setattr(run_api.sys, "platform", "linux")
    monkeypatch.setattr(
        run_api.asyncio, "set_event_loop_policy", lambda p: chamadas.append(p)
    )
    assert run_api.aplicar_politica_de_loop() is None
    assert chamadas == [], "trocar a politica fora do Windows e efeito colateral gratuito"


def test_no_windows_aplica_a_politica_de_selector(monkeypatch: pytest.MonkeyPatch) -> None:
    chamadas: list[str] = []

    class PoliticaFalsa:
        pass

    class AsyncioFalso:
        WindowsSelectorEventLoopPolicy = PoliticaFalsa

        @staticmethod
        def set_event_loop_policy(p: object) -> None:
            chamadas.append(type(p).__name__)

    monkeypatch.setattr(run_api.sys, "platform", "win32")
    # Nao da para monkeypatchar o atributo DENTRO do asyncio real: para salvar
    # o valor antigo o monkeypatch faz getattr, e fora do Windows esse getattr
    # levanta NameError (o `__getattr__` lazy tenta `asyncio.windows_events`).
    monkeypatch.setattr(run_api, "asyncio", AsyncioFalso)
    assert run_api.aplicar_politica_de_loop() == "WindowsSelectorEventLoopPolicy"
    assert chamadas == ["PoliticaFalsa"]


def test_a_politica_vem_antes_do_uvicorn(monkeypatch: pytest.MonkeyPatch) -> None:
    """A ordem E a correcao. Invertida, o launcher nao serve para nada."""
    ordem: list[str] = []

    monkeypatch.setattr(
        run_api, "aplicar_politica_de_loop", lambda: (ordem.append("politica"), None)[1]
    )

    class UvicornFalso:
        @staticmethod
        def run(*_args: object, **_kwargs: object) -> None:
            ordem.append("uvicorn")

    monkeypatch.setitem(sys.modules, "uvicorn", UvicornFalso)
    assert run_api.main([]) == 0
    assert ordem == ["politica", "uvicorn"]


def test_repassa_host_porta_e_reload(monkeypatch: pytest.MonkeyPatch) -> None:
    recebido: dict[str, object] = {}

    monkeypatch.setattr(run_api, "aplicar_politica_de_loop", lambda: None)

    class UvicornFalso:
        @staticmethod
        def run(alvo: str, **kwargs: object) -> None:
            recebido["alvo"] = alvo
            recebido.update(kwargs)

    monkeypatch.setitem(sys.modules, "uvicorn", UvicornFalso)
    run_api.main(["--host", "127.0.0.1", "--port", "8123", "--reload"])
    assert recebido["alvo"] == "app.main:app"
    assert recebido["host"] == "127.0.0.1"
    assert recebido["port"] == 8123
    assert recebido["reload"] is True


def test_uvicorn_e_importado_dentro_do_main() -> None:
    """Importar uvicorn no topo do modulo desfaria a garantia de ordem."""
    fonte = (Path(run_api.__file__)).read_text(encoding="utf-8")
    topo = fonte.split("def aplicar_politica_de_loop", 1)[0]
    assert "import uvicorn" not in topo, (
        "uvicorn importado no topo: a politica tem de valer antes de qualquer"
        " coisa do uvicorn ser montada"
    )
