"""Escrita nova do que o gateway serve vai so' para o R2, pela URL que o Supabase assina (#76).

Medido em 02/11: o PDF e o audio que o caminho Python gerou em 31/10 e em 02/11
estavam no Supabase Storage, e nao no R2. As credenciais do R2 ficam so' nos
secrets das Edge Functions: a API pede a `storage-upload-url` uma URL de PUT e
sobe o arquivo direto nela.
"""

import re
from pathlib import Path

import pytest

from app.core.settings import Settings
from app.services.storage import FUNCAO_DE_UPLOAD, PREFIXOS_DO_R2, SupabaseStorage

BASE = "https://xrebtkmdewolzmpsdwgh.supabase.co"
CAMINHO = "brainhex/mastermind/classe-1/topico-2/audio/material-3.mp3"
URL_DO_GATEWAY = f"{BASE}/functions/v1/storage-redirect?path={CAMINHO}"
URL_DA_FUNCAO = f"{BASE}/functions/v1/{FUNCAO_DE_UPLOAD}"
URL_ASSINADA = "https://conta.r2.cloudflarestorage.com/trailup/x?X-Amz-Signature=abc"
PEDIDO_TS = (
    Path(__file__).resolve().parents[2] / "frontend" / "supabase" / "functions" / "storage-upload-url" / "pedido.ts"
)


class _Resp:
    def __init__(self, status_code: int = 200, corpo: dict | None = None) -> None:
        self.status_code = status_code
        self._corpo = corpo or {}

    def json(self) -> dict:
        return self._corpo

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _Cliente:
    """Funcao de upload, R2 e Storage falsos; registra cada chamada."""

    def __init__(self, chamadas: list, *, funcao: _Resp, r2: _Resp) -> None:
        self.chamadas = chamadas
        self.funcao = funcao
        self.r2 = r2

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json=None, content=None, headers=None):
        self.chamadas.append(("POST", url, json, headers))
        if url == URL_DA_FUNCAO:
            return self.funcao
        return _Resp()  # upload antigo no Storage

    async def put(self, url, content=None, headers=None):
        self.chamadas.append(("PUT", url, content, headers))
        if url == URL_ASSINADA:
            return self.r2
        return _Resp()  # upload antigo no Storage


@pytest.fixture
def rede(monkeypatch):
    estado = {"funcao": _Resp(200, {"url": URL_ASSINADA}), "r2": _Resp(200), "chamadas": []}

    def _fabrica(*args, **kwargs):
        return _Cliente(estado["chamadas"], funcao=estado["funcao"], r2=estado["r2"])

    monkeypatch.setattr("app.services.storage.httpx.AsyncClient", _fabrica)
    return estado


def _storage() -> SupabaseStorage:
    return SupabaseStorage(Settings(supabase_url=BASE, supabase_service_key="fake-service-key"))


async def _subir(storage: SupabaseStorage, metodo: str, caminho: str = CAMINHO, bucket: str = "conteudo_aluno"):
    if metodo == "upload":
        return await storage.upload(path=caminho, data=b"mp3", content_type="audio/mpeg", bucket=bucket)
    return await storage.upload_bytes(bucket=bucket, path=caminho, data=b"mp3", content_type="audio/mpeg")


@pytest.mark.asyncio
@pytest.mark.parametrize("metodo", ["upload", "upload_bytes"])
async def test_pede_a_url_ao_supabase_e_sobe_direto_no_r2(metodo, rede) -> None:
    url = await _subir(_storage(), metodo)

    assert url == URL_DO_GATEWAY
    assert [c[:2] for c in rede["chamadas"]] == [("POST", URL_DA_FUNCAO), ("PUT", URL_ASSINADA)]
    _, _, corpo, headers = rede["chamadas"][0]
    # A chave no R2 e' o `storage_path` puro: e' o que o gateway assina.
    assert corpo == {"path": CAMINHO}
    assert headers["Authorization"] == "Bearer fake-service-key"
    _, _, enviado, headers_put = rede["chamadas"][1]
    assert enviado == b"mp3"
    # O PUT vai ao R2 sem a chave de servico.
    assert headers_put == {"Content-Type": "audio/mpeg"}


@pytest.mark.asyncio
async def test_caminho_com_o_bucket_na_frente_vira_a_mesma_chave(rede) -> None:
    url = await _subir(_storage(), "upload_bytes", caminho=f"/conteudo_aluno/{CAMINHO}")

    assert url == URL_DO_GATEWAY
    assert rede["chamadas"][0][2] == {"path": CAMINHO}


@pytest.mark.asyncio
@pytest.mark.parametrize("metodo", ["upload", "upload_bytes"])
@pytest.mark.parametrize(
    "falha",
    [
        {"funcao": _Resp(500, {"error": "Upload para o R2 nao configurado."})},
        {"funcao": _Resp(401, {"error": "So' a chave de servico pede URL de upload."})},
        {"funcao": _Resp(200, {})},
        {"r2": _Resp(403)},
    ],
)
async def test_falha_devolve_none_e_nao_cai_para_o_supabase(metodo, falha, rede) -> None:
    # Fallback silencioso na escrita esconderia a migracao: o egress continuaria
    # saindo do Supabase com tudo parecendo certo.
    rede.update(falha)

    url = await _subir(_storage(), metodo)

    assert url is None
    assert all("/storage/v1/object/" not in c[1] for c in rede["chamadas"])


@pytest.mark.asyncio
@pytest.mark.parametrize("metodo", ["upload", "upload_bytes"])
async def test_funcao_nao_publicada_segue_o_caminho_antigo(metodo, rede) -> None:
    # 404 so' vem da plataforma (a funcao nunca responde 404): publicar a API
    # antes da funcao nao pode derrubar a geracao.
    rede["funcao"] = _Resp(404, {"code": "NOT_FOUND", "message": "Requested function was not found"})

    url = await _subir(_storage(), metodo)

    assert url == URL_DO_GATEWAY
    assert rede["chamadas"][-1][1] == f"{BASE}/storage/v1/object/conteudo_aluno/{CAMINHO}"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("bucket", "caminho"),
    [
        # O gateway so' assina caminho de `vw_material_storage_paths`.
        ("avatares", "brainhex/x.png"),
        # A funcao so' assina os prefixos do material e da fonte.
        ("conteudo_aluno", "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/topico-1/pdf/material.pdf"),
    ],
)
async def test_fora_do_r2_continua_no_supabase(bucket, caminho, rede) -> None:
    await _subir(_storage(), "upload", caminho=caminho, bucket=bucket)

    assert [c[1] for c in rede["chamadas"]] == [f"{BASE}/storage/v1/object/{bucket}/{caminho}"]


@pytest.mark.asyncio
async def test_sem_chave_de_servico_nao_sobe(rede) -> None:
    storage = SupabaseStorage(Settings(supabase_url=BASE, supabase_service_key=None))

    assert await _subir(storage, "upload_bytes") is None
    assert rede["chamadas"] == []


def test_prefixos_batem_com_os_da_edge_function() -> None:
    if not PEDIDO_TS.exists():
        pytest.skip("frontend fora deste checkout")
    bloco = re.search(r"PREFIXOS_PERMITIDOS = \[(.*?)\]", PEDIDO_TS.read_text(encoding="utf-8"), re.S)
    assert bloco
    assert tuple(re.findall(r'"([^"]+)"', bloco.group(1))) == PREFIXOS_DO_R2
