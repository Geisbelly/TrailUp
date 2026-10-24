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
        Config = object

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
        Config = object

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


def test_no_windows_pede_a_fabrica_de_selector_ao_uvicorn_novo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#520: do uvicorn 0.36 em diante o loop sai da fabrica, nao da politica."""

    class ConfigComFabrica:
        def get_loop_factory(self) -> None:  # pragma: no cover - so a presenca importa
            return None

    monkeypatch.setattr(run_api.sys, "platform", "win32")
    assert run_api.loop_do_uvicorn(ConfigComFabrica) == "asyncio:SelectorEventLoop"


def test_uvicorn_antigo_e_fora_do_windows_ficam_com_o_padrao(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class ConfigAntiga:
        pass

    class ConfigComFabrica:
        def get_loop_factory(self) -> None:  # pragma: no cover
            return None

    monkeypatch.setattr(run_api.sys, "platform", "win32")
    assert run_api.loop_do_uvicorn(ConfigAntiga) is None, (
        "uvicorn sem fabrica propria nao conhece 'modulo:atributo' em loop"
    )
    monkeypatch.setattr(run_api.sys, "platform", "linux")
    assert run_api.loop_do_uvicorn(ConfigComFabrica) is None


def test_a_fabrica_chega_ao_uvicorn_run(monkeypatch: pytest.MonkeyPatch) -> None:
    recebido: dict[str, object] = {}

    monkeypatch.setattr(run_api, "aplicar_politica_de_loop", lambda: None)
    monkeypatch.setattr(run_api, "loop_do_uvicorn", lambda _c: "asyncio:SelectorEventLoop")

    class UvicornFalso:
        Config = object

        @staticmethod
        def run(_alvo: str, **kwargs: object) -> None:
            recebido.update(kwargs)

    monkeypatch.setitem(sys.modules, "uvicorn", UvicornFalso)
    run_api.main([])
    assert recebido["loop"] == "asyncio:SelectorEventLoop"


def test_a_fabrica_do_uvicorn_instalado_monta_selector() -> None:
    """Confere com o uvicorn de verdade que o valor resolve para um selector."""
    import asyncio

    import uvicorn

    if not hasattr(uvicorn.Config, "get_loop_factory"):
        pytest.skip("uvicorn sem fabrica de loop (< 0.36)")
    fabrica = uvicorn.Config("app.main:app", loop=run_api.FABRICA_SELECTOR).get_loop_factory()
    assert fabrica is not None
    loop = fabrica()
    try:
        assert isinstance(loop, asyncio.SelectorEventLoop)
    finally:
        loop.close()
