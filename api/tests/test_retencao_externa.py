"""Worker da fila externa da retencao (#195): unidade + ponta a ponta opcional."""

from __future__ import annotations

import os
import uuid
from types import SimpleNamespace

import httpx
import pytest

from app.services import retencao_externa as rx


def _settings(**extra):
    base = dict(
        supabase_url="https://exemplo.invalid",
        supabase_service_key="chave-falsa",
        openai_api_key="sk-falsa",
        r2_account_id="conta",
        r2_access_key_id="id",
        r2_secret_access_key="segredo",
        r2_bucket="bucket-r2",
        retencao_externa_idade_minima_segundos=0,
        retencao_externa_lote=50,
        retencao_externa_interval_seconds=300,
    )
    base.update(extra)
    return SimpleNamespace(**base)


@pytest.fixture
def capturadas(monkeypatch):
    pedidos: list[httpx.Request] = []
    respostas: dict[str, int] = {}

    def responder(request: httpx.Request) -> httpx.Response:
        pedidos.append(request)
        return httpx.Response(respostas.get(request.url.path, 200), json={})

    original = httpx.AsyncClient

    def cliente(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(responder)
        return original(*args, **kwargs)

    monkeypatch.setattr(rx.httpx, "AsyncClient", cliente)
    return pedidos, respostas


def test_espera_exponencial_com_teto() -> None:
    assert rx._espera(1) == 60
    assert rx._espera(3) == 240
    assert rx._espera(30) == 86400


def test_chave_de_uso() -> None:
    assert rx._chave_de_uso({"destino": "r2", "ref": '{"sessao_id": "x"}'}) == "r2_telemetria"
    assert rx._chave_de_uso({"destino": "r2", "ref": {}}) == "material"
    assert rx._chave_de_uso({"destino": "storage", "ref": {}}) == "material"
    assert rx._chave_de_uso({"destino": "openai", "ref": {}}) == "openai"


async def test_storage_tira_o_bucket_do_caminho(capturadas) -> None:
    pedidos, _ = capturadas
    r = await rx.ApagadorHttp(_settings()).storage("conteudo_aluno", "conteudo_aluno/a/b.pdf")
    assert r == "apagado"
    assert pedidos[0].method == "DELETE"
    assert pedidos[0].url.path == "/storage/v1/object/conteudo_aluno"
    assert b'"prefixes":["a/b.pdf"]' in pedidos[0].content.replace(b" ", b"")


async def test_404_conta_como_ausente(capturadas) -> None:
    _, respostas = capturadas
    uid = str(uuid.uuid4())
    respostas[f"/auth/v1/admin/users/{uid}"] = 404
    assert await rx.ApagadorHttp(_settings()).auth_user(uid) == "ausente"


async def test_openai_apaga_do_vector_store_e_o_arquivo(capturadas) -> None:
    pedidos, _ = capturadas
    await rx.ApagadorHttp(_settings()).openai("vs_1", "file_1")
    assert [p.url.path for p in pedidos] == ["/v1/vector_stores/vs_1/files/file_1", "/v1/files/file_1"]


async def test_r2_recusa_bucket_alheio(capturadas) -> None:
    with pytest.raises(ValueError):
        await rx.ApagadorHttp(_settings()).r2("outro-bucket", "k")
    pedidos, _ = capturadas
    assert await rx.ApagadorHttp(_settings()).r2("", "telemetria/x.json") == "apagado"
    assert pedidos[-1].method == "DELETE" and pedidos[-1].url.host.endswith("r2.cloudflarestorage.com")


async def test_sem_credencial_nao_chama_ninguem(capturadas) -> None:
    pedidos, _ = capturadas
    with pytest.raises(rx.ConfiguracaoAusente):
        await rx.ApagadorHttp(_settings(supabase_service_key=None)).auth_user("x")
    with pytest.raises(rx.ConfiguracaoAusente):
        await rx.ApagadorHttp(_settings(r2_bucket=None)).r2("", "k")
    assert pedidos == []


def test_desligado_por_padrao() -> None:
    from app.core.settings import Settings

    assert Settings.model_fields["retencao_externa_enabled"].default is False


# ---------------------------------------------------------------- ponta a ponta

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL", "")


class _Falso:
    def __init__(self, falhar: set[str] | None = None) -> None:
        self.chamadas: list[tuple[str, str, str]] = []
        self.falhar = falhar or set()

    async def _registra(self, destino: str, a: str, b: str) -> str:
        self.chamadas.append((destino, a, b))
        if b in self.falhar:
            raise RuntimeError("falhou https://assinada?X-Amz-Signature=segredo")
        return "apagado"

    async def r2(self, bucket, chave):
        return await self._registra("r2", bucket, chave)

    async def storage(self, bucket, caminho):
        return await self._registra("storage", bucket, caminho)

    async def openai(self, vs, file_id):
        return await self._registra("openai", vs, file_id)

    async def auth_user(self, user_id):
        return await self._registra("auth_user", "", user_id)


@pytest.mark.skipif(not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido")
async def test_worker_contra_postgres_local() -> None:
    from urllib.parse import urlsplit

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from tests import test_e2e_retencao_expurgo as e2e

    with e2e._banco() as c:
        sessao = e2e._telemetria(c, e2e.COMUM, 1)
        c.execute(
            f"""
            INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref) VALUES
              ('r2', 'b', 'telemetria/eventos/{sessao}.json', '{{"sessao_id": "{sessao}"}}'),
              ('r2', 'b', 'telemetria/eventos/livre.json', '{{"sessao_id": "{sessao}"}}'),
              ('storage', 'conteudo_aluno', 'quebra.pdf', '{{}}'),
              ('auth_user', '', '{e2e.INATIVO}', '{{}}');
            """
        )
        banco = c.info.dbname
        partes = urlsplit(e2e.DSN)
        url = partes._replace(scheme="postgresql+asyncpg", path=f"/{banco}").geturl()
        engine = create_async_engine(url)
        try:
            fabrica = async_sessionmaker(engine, expire_on_commit=False)
            falso = _Falso(falhar={"quebra.pdf"})
            contagem = await rx.processar_fila_uma_vez(fabrica, falso, _settings())
        finally:
            await engine.dispose()

        assert contagem == {"apagado": 1, "ausente": 0, "ainda_referenciado": 1, "cancelado": 1, "erro": 1}
        assert ("r2", "b", "telemetria/eventos/livre.json") in falso.chamadas
        assert not any(ch[2].endswith(f"{sessao}.json") for ch in falso.chamadas)
        assert not any(ch[0] == "auth_user" for ch in falso.chamadas)
        erro = c.execute(
            "SELECT ultimo_erro, processado_em, tentativas FROM public.retencao_fila_externa WHERE caminho = 'quebra.pdf'"
        ).fetchone()
        assert erro[1] is None and erro[2] == 1
        assert "segredo" not in erro[0]


def test_exclusao_de_professor_usa_o_pedido_como_licenca() -> None:
    # 20261024_07: o usuario do Auth de professor sai pelo pedido dele, nao pelo aviso de inatividade.
    assert rx._chave_de_uso({"destino": "auth_user", "ref": {"motivo": "exclusao_professor"}}) == "auth_user_professor"
    assert rx._chave_de_uso({"destino": "auth_user", "ref": '{"motivo": "conta_inativa"}'}) == "auth_user"
    assert "exclusao_conta_professor" in str(rx.AINDA_USADO_SQL["auth_user_professor"])


async def test_worker_chama_o_envio_de_avisos() -> None:
    chamadas: list[str] = []

    class _Resultado:
        def scalar(self):
            return '{"modo": "aplicar", "enviados": 2}'

    class _Sessao:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        def begin(self):
            return self

        async def execute(self, sql, *args):
            chamadas.append(str(sql))
            return _Resultado()

    assert await rx.enviar_avisos_inatividade(lambda: _Sessao()) == {"modo": "aplicar", "enviados": 2}
    assert chamadas == ["SELECT public.retencao_avisos_email()"]
