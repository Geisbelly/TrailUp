"""Escrita nova do que o gateway serve vai so' para o R2 (#76).

Medido em 02/11: o audio e o PDF que o fallback Python gerou em 31/10 estavam
no Supabase Storage, e nao no R2 - este caminho nunca tinha sido migrado. O
microservice (`uploadBuffer`) e o BrainHexPDF ja' escreviam no R2.
"""

import pytest

from app.core.settings import Settings
from app.services.r2_storage import ConfigR2
from app.services.storage import SupabaseStorage

BASE = "https://xrebtkmdewolzmpsdwgh.supabase.co"
CAMINHO = "brainhex/mastermind/classe-1/topico-2/audio/material-3.mp3"
URL_DO_GATEWAY = f"{BASE}/functions/v1/storage-redirect?path={CAMINHO}"
R2 = {
    "r2_account_id": "conta",
    "r2_access_key_id": "chave",
    "r2_secret_access_key": "segredo",
    "r2_bucket": "trailup",
}


def _storage(**extra) -> SupabaseStorage:
    sem_r2 = {chave: None for chave in R2}
    return SupabaseStorage(
        Settings(supabase_url=BASE, supabase_service_key="fake-service-key", **{**sem_r2, **extra})
    )


@pytest.fixture
def no_r2(monkeypatch):
    enviados: list[dict] = []

    async def _enviar(cfg, key, corpo, content_type, **kwargs):
        enviados.append({"cfg": cfg, "key": key, "corpo": corpo, "content_type": content_type})

    monkeypatch.setattr("app.services.storage.enviar_para_r2", _enviar)
    return enviados


@pytest.fixture
def supabase_proibido(monkeypatch):
    """Qualquer chamada HTTP direta ao Storage falha o teste."""

    def _cliente(*args, **kwargs):
        raise AssertionError("escreveu no Supabase Storage")

    monkeypatch.setattr("app.services.storage.httpx.AsyncClient", _cliente)


@pytest.mark.asyncio
@pytest.mark.parametrize("metodo", ["upload", "upload_bytes"])
async def test_com_r2_o_material_sobe_so_no_r2_com_a_chave_do_gateway(metodo, no_r2, supabase_proibido) -> None:
    storage = _storage(**R2)

    if metodo == "upload":
        url = await storage.upload(path=CAMINHO, data=b"mp3", content_type="audio/mpeg")
    else:
        url = await storage.upload_bytes(bucket="conteudo_aluno", path=CAMINHO, data=b"mp3", content_type="audio/mpeg")

    assert url == URL_DO_GATEWAY
    assert len(no_r2) == 1
    # A chave no R2 e' o `storage_path` puro: e' o que o gateway assina.
    assert no_r2[0]["key"] == CAMINHO
    assert no_r2[0]["cfg"] == ConfigR2("conta", "chave", "segredo", "trailup")
    assert no_r2[0]["corpo"] == b"mp3"
    assert no_r2[0]["content_type"] == "audio/mpeg"


@pytest.mark.asyncio
async def test_caminho_com_o_bucket_na_frente_vira_a_mesma_chave(no_r2, supabase_proibido) -> None:
    storage = _storage(**R2)

    url = await storage.upload_bytes(
        bucket="conteudo_aluno", path=f"/conteudo_aluno/{CAMINHO}", data=b"x", content_type="audio/mpeg"
    )

    assert url == URL_DO_GATEWAY
    assert no_r2[0]["key"] == CAMINHO


@pytest.mark.asyncio
@pytest.mark.parametrize("metodo", ["upload", "upload_bytes"])
async def test_falha_no_r2_devolve_none_e_nao_cai_para_o_supabase(metodo, monkeypatch, supabase_proibido) -> None:
    # Fallback silencioso na escrita esconderia a migracao: o egress continuaria
    # saindo do Supabase com tudo parecendo certo.
    async def _recusa(*args, **kwargs):
        raise RuntimeError("[r2] upload falhou: 403 SignatureDoesNotMatch")

    monkeypatch.setattr("app.services.storage.enviar_para_r2", _recusa)
    storage = _storage(**R2)

    if metodo == "upload":
        url = await storage.upload(path=CAMINHO, data=b"mp3", content_type="audio/mpeg")
    else:
        url = await storage.upload_bytes(bucket="conteudo_aluno", path=CAMINHO, data=b"mp3", content_type="audio/mpeg")

    assert url is None


@pytest.mark.asyncio
async def test_r2_pela_metade_mantem_o_caminho_antigo(monkeypatch, no_r2) -> None:
    puts: list[str] = []

    class _Resp:
        status_code = 200

        def raise_for_status(self) -> None:
            return None

    class _Cliente:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def put(self, url, content, headers=None):
            puts.append(url)
            return _Resp()

    monkeypatch.setattr("app.services.storage.httpx.AsyncClient", lambda *a, **k: _Cliente())
    storage = _storage(**{**R2, "r2_bucket": None})

    url = await storage.upload_bytes(bucket="conteudo_aluno", path=CAMINHO, data=b"x", content_type="audio/mpeg")

    assert url == URL_DO_GATEWAY
    assert no_r2 == []
    assert puts == [f"{BASE}/storage/v1/object/conteudo_aluno/{CAMINHO}"]


@pytest.mark.asyncio
async def test_bucket_fora_do_gateway_continua_no_supabase(monkeypatch, no_r2) -> None:
    # O gateway so' assina caminho de `vw_material_storage_paths`; um objeto de
    # outro bucket posto no R2 ficaria inalcancavel.
    posts: list[str] = []

    class _Resp:
        def raise_for_status(self) -> None:
            return None

    class _Cliente:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, content=None, headers=None):
            posts.append(url)
            return _Resp()

    monkeypatch.setattr("app.services.storage.httpx.AsyncClient", lambda *a, **k: _Cliente())
    storage = _storage(**R2)

    url = await storage.upload(path="boss/x.png", data=b"png", content_type="image/png", bucket="avatares")

    assert no_r2 == []
    assert posts == [f"{BASE}/storage/v1/object/avatares/boss/x.png"]
    assert url == f"{BASE}/storage/v1/object/public/avatares/boss/x.png"
