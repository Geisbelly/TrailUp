from typing import Any

import httpx
import pytest

from app.core.settings import Settings
from app.services.storage import (
    SupabaseStorage,
    build_public_storage_url,
    caminho_do_gateway,
    material_url_de_leitura,
    objeto_do_storage,
)


def test_build_public_storage_url_normaliza_prefixo_bucket_e_encoding() -> None:
    url = build_public_storage_url(
        "https://xrebtkmdewolzmpsdwgh.supabase.co",
        "conteudos",
        "conteudos/aluno 1/114/aula final.pptx",
    )

    assert (
        url
        == "https://xrebtkmdewolzmpsdwgh.supabase.co/storage/v1/object/public/conteudos/aluno%201/114/aula%20final.pptx"
    )


@pytest.mark.asyncio
async def test_download_bytes_faz_fallback_para_url_publica_sem_service_key(monkeypatch) -> None:
    calls: list[tuple[str, dict | None]] = []

    class _DummyResponse:
        def __init__(self, content: bytes) -> None:
            self.content = content

        def raise_for_status(self) -> None:
            return None

    class _DummyClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url: str, headers: dict | None = None):
            calls.append((url, headers))
            return _DummyResponse(b"pptx-bytes")

    monkeypatch.setattr("app.services.storage.httpx.AsyncClient", lambda *args, **kwargs: _DummyClient())

    settings = Settings(
        supabase_url="https://xrebtkmdewolzmpsdwgh.supabase.co",
        supabase_service_key=None,
    )
    storage = SupabaseStorage(settings)

    raw = await storage.download_bytes(
        bucket="conteudos",
        path="conteudos/b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx",
    )

    assert raw == b"pptx-bytes"
    assert len(calls) == 1
    assert (
        calls[0][0]
        == "https://xrebtkmdewolzmpsdwgh.supabase.co/storage/v1/object/public/conteudos/b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx"
    )
    assert calls[0][1] is None


@pytest.mark.asyncio
async def test_upload_bytes_faz_put_autenticado_e_devolve_url_do_gateway(monkeypatch) -> None:
    calls: list[tuple[str, bytes, dict | None]] = []

    class _DummyResponse:
        status_code = 200

        def raise_for_status(self) -> None:
            return None

    class _DummyClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def put(self, url: str, content: bytes, headers: dict | None = None):
            calls.append((url, content, headers))
            return _DummyResponse()

    monkeypatch.setattr("app.services.storage.httpx.AsyncClient", lambda *args, **kwargs: _DummyClient())

    settings = Settings(
        supabase_url="https://xrebtkmdewolzmpsdwgh.supabase.co",
        supabase_service_key="fake-service-key",
    )
    storage = SupabaseStorage(settings)

    url = await storage.upload_bytes(
        bucket="conteudo_aluno",
        path="6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/topico-1/markdown/material-1.md",
        data=b"## Aula\n\nTexto.",
        content_type="text/markdown; charset=utf-8",
    )

    # Fora dos prefixos do R2 (`brainhex/`, `fontes/`) o arquivo segue no
    # Storage. conteudo_aluno e' privado (#195): a URL de leitura e' a do gateway.
    assert url == (
        "https://xrebtkmdewolzmpsdwgh.supabase.co/functions/v1/storage-redirect"
        "?path=6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/topico-1/markdown/material-1.md"
    )
    assert len(calls) == 1
    put_url, content, headers = calls[0]
    assert put_url == (
        "https://xrebtkmdewolzmpsdwgh.supabase.co/storage/v1/object/"
        "conteudo_aluno/6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/topico-1/markdown/material-1.md"
    )
    assert content == b"## Aula\n\nTexto."
    assert headers["content-type"] == "text/markdown; charset=utf-8"
    assert headers["x-upsert"] == "true"
    assert headers["Authorization"] == "Bearer fake-service-key"


@pytest.mark.asyncio
async def test_upload_bytes_sem_service_key_retorna_none(monkeypatch) -> None:
    settings = Settings(
        supabase_url="https://xrebtkmdewolzmpsdwgh.supabase.co",
        supabase_service_key=None,
    )
    storage = SupabaseStorage(settings)

    url = await storage.upload_bytes(
        bucket="conteudo_aluno",
        path="brainhex/mastermind/topico-1/markdown/material-1.md",
        data=b"## Aula",
        content_type="text/markdown",
    )

    assert url is None


@pytest.mark.asyncio
async def test_load_source_preview_preserva_acentos_quando_texto_nao_esta_em_utf8(monkeypatch) -> None:
    settings = Settings(
        supabase_url="https://xrebtkmdewolzmpsdwgh.supabase.co",
        supabase_service_key=None,
    )
    storage = SupabaseStorage(settings)

    texto_original = "Introdução à computação distribuída. Comunicação e ação."
    raw_cp1252 = texto_original.encode("cp1252")

    async def _fake_download_public_bytes(url: str) -> bytes | None:
        del url
        return raw_cp1252

    monkeypatch.setattr(storage, "download_public_bytes", _fake_download_public_bytes)

    preview = await storage.load_source_preview(
        url="https://example.com/fonte.txt",
        mime_type="text/plain",
    )

    assert preview.get("texto_extraido") == texto_original
    assert "Introdução" in str(preview.get("texto_extraido"))


BASE = "https://xrebtkmdewolzmpsdwgh.supabase.co"


def test_public_url_for_bucket_manda_os_privados_ao_gateway_e_o_resto_ao_publico() -> None:
    storage = SupabaseStorage(Settings(supabase_url=BASE, supabase_service_key="k"))
    assert storage.public_url_for_bucket("conteudo_aluno", "fontes/classe-1/topico-2/conteudo-3/a b.pdf") == (
        f"{BASE}/functions/v1/storage-redirect?path=fontes/classe-1/topico-2/conteudo-3/a%20b.pdf"
    )
    assert storage.public_url("brainhex/x/classe-1/m.md") == (
        f"{BASE}/functions/v1/storage-redirect?path=brainhex/x/classe-1/m.md"
    )
    # `conteudos` (material do professor) e' privado desde a 20261024_10.
    assert storage.public_url_for_bucket("conteudos", "u/1/a.pdf") == (
        f"{BASE}/functions/v1/storage-redirect?path=u/1/a.pdf"
    )
    assert storage.public_url_for_bucket("outro_bucket", "u/1/a.pdf") == (
        f"{BASE}/storage/v1/object/public/outro_bucket/u/1/a.pdf"
    )


def test_material_url_de_leitura_converte_so_a_publica_dos_buckets_privados() -> None:
    publica = f"{BASE}/storage/v1/object/public/conteudo_aluno/fontes/classe-1/t/c/a%20b.pdf?download=1"
    assert material_url_de_leitura(BASE, publica) == (
        f"{BASE}/functions/v1/storage-redirect?path=fontes/classe-1/t/c/a%20b.pdf"
    )
    # sem base nas settings, usa a da propria URL
    assert material_url_de_leitura("", publica) == (
        f"{BASE}/functions/v1/storage-redirect?path=fontes/classe-1/t/c/a%20b.pdf"
    )
    # fonte do professor (bucket `conteudos`, privado desde a 20261024_10)
    assert material_url_de_leitura(BASE, f"{BASE}/storage/v1/object/public/conteudos/u/a.pdf") == (
        f"{BASE}/functions/v1/storage-redirect?path=u/a.pdf"
    )
    for intocada in (
        f"{BASE}/functions/v1/storage-redirect?path=brainhex/a.md",
        f"{BASE}/storage/v1/object/public/outro_bucket/u/a.pdf",
        f"{BASE}/storage/v1/object/sign/conteudos/u/a.pdf?token=x",
        "https://exemplo.invalid/a.pdf",
        "",
        None,
    ):
        assert material_url_de_leitura(BASE, intocada) == intocada


@pytest.mark.asyncio
async def test_signed_url_assina_com_service_role_e_devolve_url_absoluta(monkeypatch) -> None:
    calls: list[tuple[str, dict, dict]] = []

    class _Resp:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {"signedURL": "/object/sign/conteudo_aluno/u/boss/a.png?token=t"}

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url: str, json: dict, headers: dict):
            calls.append((url, json, headers))
            return _Resp()

    monkeypatch.setattr("app.services.storage.httpx.AsyncClient", lambda *a, **k: _Client())
    storage = SupabaseStorage(Settings(supabase_url=BASE, supabase_service_key="k"))
    url = await storage.signed_url(bucket="conteudo_aluno", path="u/boss/a.png", expires_in=120)
    assert url == f"{BASE}/storage/v1/object/sign/conteudo_aluno/u/boss/a.png?token=t"
    assert calls == [
        (
            f"{BASE}/storage/v1/object/sign/conteudo_aluno/u/boss/a.png",
            {"expiresIn": 120},
            {"Authorization": "Bearer k", "apikey": "k"},
        )
    ]


@pytest.mark.asyncio
async def test_signed_url_sem_service_key_e_none() -> None:
    storage = SupabaseStorage(Settings(supabase_url=BASE, supabase_service_key=None))
    assert await storage.signed_url(bucket="conteudo_aluno", path="a.png") is None


def test_objeto_do_storage_le_bucket_e_caminho() -> None:
    assert objeto_do_storage(f"{BASE}/storage/v1/object/public/conteudos/u/1/a%20b.pdf?download=1") == (
        "conteudos",
        "u/1/a b.pdf",
    )
    assert objeto_do_storage(f"{BASE}/storage/v1/object/sign/conteudo_aluno/x.pdf?token=t") == (
        "conteudo_aluno",
        "x.pdf",
    )
    for nada in (f"{BASE}/storage/v1/object/public/conteudos/", f"{BASE}/functions/v1/storage-redirect?path=a", "", None):
        assert objeto_do_storage(nada) is None


@pytest.mark.asyncio
async def test_download_public_bytes_de_bucket_privado_usa_a_chave_de_servico(monkeypatch) -> None:
    storage = SupabaseStorage(Settings(supabase_url=BASE, supabase_service_key="k"))
    pedidos: list[tuple[str, str]] = []

    async def _fake_download_bytes(*, bucket: str, path: str) -> bytes | None:
        pedidos.append((bucket, path))
        return b"ok"

    monkeypatch.setattr(storage, "download_bytes", _fake_download_bytes)
    assert await storage.download_public_bytes(f"{BASE}/storage/v1/object/public/conteudos/u/1/a%20b.pdf") == b"ok"
    assert pedidos == [("conteudos", "u/1/a b.pdf")]


# --- Leitura de servidor pelo gateway (#632) ---------------------------------
#
# Desde GATEWAY_EXIGE_LINK_ASSINADO o GET sem assinatura leva 401. A API pede o
# link por POST, com a chave de servico, e o GET vai sem ela: o 302 aponta para o R2.

GATEWAY_ROTA = f"{BASE}/functions/v1/storage-redirect"
CAMINHO_FONTE = "fontes/classe-1/topico-2/conteudo-3/aula.pdf"
LINK_ASSINADO = f"{GATEWAY_ROTA}?path={CAMINHO_FONTE}&u=0&exp=1&sig=segredo-do-link"


class _GatewayFalso:
    """httpx.AsyncClient que responde como o `storage-redirect` publicado."""

    def __init__(self, *, links: dict[str, str] | None = None, status_post: int = 200, status_get: int = 200) -> None:
        self.links = {CAMINHO_FONTE: LINK_ASSINADO} if links is None else links
        self.status_post = status_post
        self.status_get = status_get
        self.posts: list[tuple[str, Any, dict[str, str]]] = []
        self.gets: list[tuple[str, dict[str, str] | None]] = []

    def __call__(self, *args: Any, **kwargs: Any) -> "_GatewayFalso":
        return self

    async def __aenter__(self) -> "_GatewayFalso":
        return self

    async def __aexit__(self, *_: Any) -> bool:
        return False

    async def post(self, url: str, *, json: Any, headers: dict[str, str]) -> httpx.Response:
        self.posts.append((url, json, headers))
        return httpx.Response(
            self.status_post, json={"links": self.links}, request=httpx.Request("POST", url)
        )

    async def get(self, url: str, headers: dict[str, str] | None = None, **_: Any) -> httpx.Response:
        self.gets.append((url, headers))
        return httpx.Response(self.status_get, content=b"bytes da fonte", request=httpx.Request("GET", url))


def _storage_com(monkeypatch, gateway: _GatewayFalso) -> SupabaseStorage:
    monkeypatch.setattr("app.services.storage.httpx.AsyncClient", gateway)
    return SupabaseStorage(Settings(supabase_url=BASE, supabase_service_key="chave-de-servico"))


@pytest.mark.asyncio
async def test_download_bytes_pede_o_link_com_a_chave_e_baixa_sem_ela(monkeypatch) -> None:
    gateway = _GatewayFalso()
    storage = _storage_com(monkeypatch, gateway)

    assert await storage.download_bytes(bucket="conteudo_aluno", path=CAMINHO_FONTE) == b"bytes da fonte"

    [(url, corpo, headers)] = gateway.posts
    assert url == GATEWAY_ROTA
    assert corpo == {"paths": [CAMINHO_FONTE]}
    assert headers["Authorization"] == "Bearer chave-de-servico"
    # Nada de GET sem assinatura, e a chave nao segue no pedido que redireciona para o R2.
    assert gateway.gets == [(LINK_ASSINADO, None)]


@pytest.mark.asyncio
async def test_download_bytes_com_o_gateway_recusando_avisa_e_cai_no_storage(monkeypatch, caplog) -> None:
    gateway = _GatewayFalso(status_post=401)
    storage = _storage_com(monkeypatch, gateway)

    with caplog.at_level("WARNING", logger="app.services.storage"):
        assert await storage.download_bytes(bucket="conteudo_aluno", path=CAMINHO_FONTE) == b"bytes da fonte"

    assert "401" in caplog.text
    assert [url for url, _ in gateway.gets] == [f"{BASE}/storage/v1/object/conteudo_aluno/{CAMINHO_FONTE}"]


@pytest.mark.asyncio
async def test_falha_no_download_nao_poe_a_assinatura_no_log(monkeypatch, caplog) -> None:
    gateway = _GatewayFalso(status_get=500)
    storage = _storage_com(monkeypatch, gateway)

    with caplog.at_level("INFO", logger="app.services.storage"):
        await storage._download_via_gateway(CAMINHO_FONTE)

    assert "500" in caplog.text
    assert "segredo-do-link" not in caplog.text


@pytest.mark.asyncio
async def test_caminho_que_o_gateway_nao_conhece_nao_tenta_baixar(monkeypatch) -> None:
    gateway = _GatewayFalso(links={})
    storage = _storage_com(monkeypatch, gateway)

    assert await storage._download_via_gateway(CAMINHO_FONTE) is None
    assert gateway.gets == []


@pytest.mark.asyncio
async def test_download_public_bytes_baixa_a_url_do_gateway_gravada_em_arquivo_url(monkeypatch) -> None:
    gateway = _GatewayFalso()
    storage = _storage_com(monkeypatch, gateway)

    assert await storage.download_public_bytes(f"{GATEWAY_ROTA}?path={CAMINHO_FONTE}") == b"bytes da fonte"
    assert gateway.gets == [(LINK_ASSINADO, None)]


@pytest.mark.asyncio
async def test_download_public_bytes_nao_leva_a_chave_para_fora_do_projeto(monkeypatch) -> None:
    gateway = _GatewayFalso()
    storage = _storage_com(monkeypatch, gateway)
    de_fora = f"https://outro.supabase.co/functions/v1/storage-redirect?path={CAMINHO_FONTE}"

    assert await storage.download_public_bytes(de_fora) == b"bytes da fonte"
    assert gateway.posts == []
    assert gateway.gets == [(de_fora, None)]


def test_caminho_do_gateway_so_reconhece_o_deste_projeto() -> None:
    assert caminho_do_gateway(BASE, f"{GATEWAY_ROTA}?path=fontes/a%20b.pdf") == "fontes/a b.pdf"
    assert caminho_do_gateway(f"{BASE}/", f"{GATEWAY_ROTA}?path=a.pdf&u=x&sig=y") == "a.pdf"
    for outra in (
        "https://outro.supabase.co/functions/v1/storage-redirect?path=a.pdf",
        f"{BASE}.exemplo.test/functions/v1/storage-redirect?path=a.pdf",
        f"{GATEWAY_ROTA}?outro=1",
        f"{BASE}/storage/v1/object/public/conteudos/a.pdf",
        "",
        None,
    ):
        assert caminho_do_gateway(BASE, outra) is None
    assert caminho_do_gateway("", f"{GATEWAY_ROTA}?path=a.pdf") is None
