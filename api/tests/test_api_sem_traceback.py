"""Erro inesperado não entrega traceback a quem chamou."""

from fastapi.testclient import TestClient

from app.main import create_app


def test_erro_inesperado_nao_devolve_traceback(settings):
    app = create_app(settings)

    @app.get("/explode")
    async def explode():
        raise RuntimeError("segredo-do-servidor")

    resposta = TestClient(app, raise_server_exceptions=False).get("/explode")

    assert resposta.status_code == 500
    assert "Traceback" not in resposta.text
    assert "segredo-do-servidor" not in resposta.text
