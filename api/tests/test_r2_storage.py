"""R2 pela `storage-upload-url`: a API nao assina nada sozinha (#76)."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from app.services import r2_storage
from app.services.r2_storage import (
    ConfigR2,
    FuncaoDeUploadNaoPublicada,
    enviar_para_r2,
    ler_config_r2,
    pedir_url_assinada,
)

CFG = ConfigR2(supabase_url="https://projeto.supabase.co", service_key="chave-de-servico")
CAMINHO = "telemetria/lotes/2026/08/29/abc.json"
URL_ASSINADA = "https://conta.r2.cloudflarestorage.com/trailup/x?X-Amz-Signature=abc"
FUNCAO = "/functions/v1/storage-upload-url"


def _cliente(responder) -> tuple[httpx.AsyncClient, list[httpx.Request]]:
    pedidos: list[httpx.Request] = []

    def _registra(request: httpx.Request) -> httpx.Response:
        pedidos.append(request)
        return responder(request)

    return httpx.AsyncClient(transport=httpx.MockTransport(_registra)), pedidos


def _funcao_que_assina(request: httpx.Request) -> httpx.Response:
    if request.url.path == FUNCAO:
        pedido = json.loads(request.content)
        return httpx.Response(200, json={"url": URL_ASSINADA, "metodo": pedido["metodo"], "bucket": "trailup"})
    return httpx.Response(200)


def test_a_api_nao_le_mais_as_credenciais_do_r2() -> None:
    """Sem `R2_*` no codigo: as credenciais ficam so nos secrets das Edge Functions."""
    from app.core.settings import Settings

    assert not [campo for campo in Settings.model_fields if campo.startswith("r2_")]
    fonte = Path(r2_storage.__file__).read_text(encoding="utf-8")
    assert "hmac" not in fonte and "X-Amz" not in fonte


def test_ler_config_exige_url_e_chave_de_servico() -> None:
    assert ler_config_r2(
        SimpleNamespace(supabase_url="https://projeto.supabase.co/", supabase_service_key="k")
    ) == ConfigR2("https://projeto.supabase.co", "k")
    for parcial in (
        {"supabase_url": None, "supabase_service_key": "k"},
        {"supabase_url": "u", "supabase_service_key": ""},
    ):
        assert ler_config_r2(SimpleNamespace(**parcial)) is None


@pytest.mark.asyncio
async def test_enviar_pede_a_url_e_sobe_direto_no_r2() -> None:
    client, pedidos = _cliente(_funcao_que_assina)
    async with client:
        bucket = await enviar_para_r2(CFG, CAMINHO, b'{"a":1}', "application/json", client=client)

    assert bucket == "trailup"
    pedido, envio = pedidos
    assert pedido.method == "POST" and pedido.url.path == FUNCAO
    assert pedido.headers["authorization"] == "Bearer chave-de-servico"
    assert json.loads(pedido.content) == {"path": CAMINHO, "metodo": "PUT"}
    # O arquivo vai para o R2, nunca para a funcao (egress do Supabase).
    assert envio.method == "PUT" and str(envio.url) == URL_ASSINADA
    assert envio.content == b'{"a":1}' and envio.headers["content-type"] == "application/json"


@pytest.mark.asyncio
async def test_funcao_nao_publicada_e_um_erro_proprio() -> None:
    client, _ = _cliente(lambda _r: httpx.Response(404))
    async with client:
        with pytest.raises(FuncaoDeUploadNaoPublicada):
            await pedir_url_assinada(CFG, CAMINHO, "PUT", client=client)


@pytest.mark.asyncio
async def test_funcao_antiga_que_devolve_put_para_delete_nao_vira_put() -> None:
    """A versao anterior ignora `metodo`: um PUT vazio no lugar do DELETE apagaria o conteudo."""
    client, pedidos = _cliente(
        lambda _r: httpx.Response(200, json={"url": URL_ASSINADA, "metodo": "PUT", "expira_em_segundos": 600})
    )
    async with client:
        with pytest.raises(RuntimeError, match="nao assina DELETE"):
            await pedir_url_assinada(CFG, CAMINHO, "DELETE", client=client)
    assert len(pedidos) == 1


@pytest.mark.asyncio
async def test_resposta_sem_bucket_nao_sobe_nada() -> None:
    client, pedidos = _cliente(lambda _r: httpx.Response(200, json={"url": URL_ASSINADA, "metodo": "PUT"}))
    async with client:
        with pytest.raises(RuntimeError, match="bucket"):
            await enviar_para_r2(CFG, CAMINHO, b"x", "application/json", client=client)
    assert len(pedidos) == 1


@pytest.mark.asyncio
async def test_enviar_lanca_quando_o_r2_recusa() -> None:
    def responder(request: httpx.Request) -> httpx.Response:
        if request.url.path == FUNCAO:
            return _funcao_que_assina(request)
        return httpx.Response(403, text="SignatureDoesNotMatch")

    client, _ = _cliente(responder)
    async with client:
        with pytest.raises(RuntimeError, match="403"):
            await enviar_para_r2(CFG, CAMINHO, b"x", "application/json", client=client)
