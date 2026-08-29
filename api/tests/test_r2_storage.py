"""Assinatura SigV4 do R2 e a rota do payload de telemetria."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.services.r2_storage import (
    ConfigR2,
    derivar_chave_de_assinatura,
    enviar_para_r2,
    ler_config_r2,
    presign_r2,
)

CFG = ConfigR2(
    account_id="a641a8f84cfc447572688bf59f608368",
    access_key_id="AKIAIOSFODNN7EXAMPLE",
    secret_access_key="segredo-de-teste",
    bucket="trailup",
)
CAMINHO = "telemetria/lotes/2026/08/29/abc.json"
AGORA = datetime(2026, 8, 29, 5, 0, 0, tzinfo=UTC)


def test_cadeia_de_assinatura_bate_com_o_vetor_da_aws() -> None:
    """Confere contra o vetor publicado pela AWS, nao contra a propria conta.

    Esta e a terceira copia do assinador no monorepo (Edge Function e
    microservice sao as outras). Assinatura errada so apareceria como 403 do R2,
    em producao - o vetor conhecido e o que impede uma das copias de degradar em
    silencio.
    """
    chave = derivar_chave_de_assinatura(
        "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20150830", "us-east-1", "iam"
    )
    assert chave.hex() == "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9"


def test_presign_aponta_para_o_host_e_o_bucket_certos() -> None:
    url = presign_r2(CFG, CAMINHO, "PUT", agora=AGORA)
    assert url.startswith("https://a641a8f84cfc447572688bf59f608368.r2.cloudflarestorage.com/trailup/")
    assert f"/trailup/{CAMINHO}" in url
    assert "X-Amz-Algorithm=AWS4-HMAC-SHA256" in url
    assert "%2Fauto%2Fs3%2Faws4_request" in url


def test_o_verbo_muda_a_assinatura() -> None:
    """URL de leitura nao serve para escrever: o metodo entra na canonica."""
    put = presign_r2(CFG, CAMINHO, "PUT", agora=AGORA)
    get = presign_r2(CFG, CAMINHO, "GET", agora=AGORA)
    assert put != get


def test_ler_config_exige_as_quatro_variaveis() -> None:
    completo = {
        "r2_account_id": "conta",
        "r2_access_key_id": "chave",
        "r2_secret_access_key": "segredo",
        "r2_bucket": "trailup",
    }
    assert ler_config_r2(SimpleNamespace(**completo)) == ConfigR2(
        "conta", "chave", "segredo", "trailup"
    )

    # Config pela metade nao pode virar escrita pela metade: quem chama volta
    # ao comportamento antigo em vez de gravar num lugar so.
    for faltante in completo:
        parcial = {**completo, faltante: None}
        assert ler_config_r2(SimpleNamespace(**parcial)) is None, faltante


@pytest.mark.asyncio
async def test_enviar_faz_put_com_corpo_e_content_type() -> None:
    chamadas: list[dict[str, object]] = []

    class ClienteFake:
        async def put(self, url: str, content: bytes, headers: dict[str, str]):
            chamadas.append({"url": url, "content": content, "headers": headers})
            return SimpleNamespace(status_code=200, text="")

    await enviar_para_r2(
        CFG, CAMINHO, b'{"a":1}', "application/json", client=ClienteFake()  # type: ignore[arg-type]
    )

    assert len(chamadas) == 1
    assert chamadas[0]["content"] == b'{"a":1}'
    assert chamadas[0]["headers"] == {"Content-Type": "application/json"}
    assert "X-Amz-Signature=" in str(chamadas[0]["url"])


@pytest.mark.asyncio
async def test_enviar_lanca_quando_o_r2_recusa() -> None:
    class ClienteFake:
        async def put(self, url: str, content: bytes, headers: dict[str, str]):
            return SimpleNamespace(status_code=403, text="SignatureDoesNotMatch")

    with pytest.raises(RuntimeError, match="403"):
        await enviar_para_r2(
            CFG, CAMINHO, b"x", "application/json", client=ClienteFake()  # type: ignore[arg-type]
        )
