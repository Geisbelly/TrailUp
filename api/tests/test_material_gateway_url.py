"""URL de material gerado aponta para o gateway `storage-redirect`, nunca direto
para o Supabase Storage.

O material novo so' existe no R2 (o microservice sobe la'). A URL publica do
Storage dava 404, e os hidratadores da API a reconstruiam a partir do
`storage_path` por cima da URL do gateway que o microservice tinha gravado.
"""

from app.api.v1.personalizacao import _resolve_public_asset_fields
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.materiais import MateriaisRepository
from app.services.storage import build_material_url

BASE = "https://proj.supabase.co"
CAMINHO = "seeker/classe-54/topico-131/conteudo-192/generation-abc/material-3675_d5-parte-01.md"
GATEWAY = f"{BASE}/functions/v1/storage-redirect?path={CAMINHO}"
DIRETA = f"{BASE}/storage/v1/object/public/conteudo_aluno/{CAMINHO}"


def test_material_do_bucket_conteudo_aluno_usa_o_gateway() -> None:
    assert build_material_url(BASE, "conteudo_aluno", CAMINHO) == GATEWAY


def test_prefixo_do_bucket_no_caminho_e_removido() -> None:
    assert build_material_url(BASE, "conteudo_aluno", f"conteudo_aluno/{CAMINHO}") == GATEWAY


def test_outro_bucket_continua_com_url_publica_direta() -> None:
    # O gateway so' conhece caminhos de material (vw_material_storage_paths) e
    # so' cai no bucket conteudo_aluno; fonte do professor nao passa por ele.
    assert (
        build_material_url(BASE, "conteudos", "aluno 1/aula.pptx")
        == f"{BASE}/storage/v1/object/public/conteudos/aluno%201/aula.pptx"
    )


def test_sem_base_ou_caminho_devolve_none() -> None:
    assert build_material_url("", "conteudo_aluno", CAMINHO) is None
    assert build_material_url(BASE, "conteudo_aluno", "") is None


def test_hidratador_da_rota_nao_troca_gateway_pela_url_direta(monkeypatch) -> None:
    monkeypatch.setattr("app.api.v1.personalizacao._SUPABASE_PUBLIC_BASE_URL", BASE)
    url, caminho, _ = _resolve_public_asset_fields(
        arquivo_url=GATEWAY, storage_path=CAMINHO, metadata={}
    )
    assert url == GATEWAY
    assert caminho == CAMINHO


def test_hidratador_da_rota_corrige_url_direta_ja_gravada(monkeypatch) -> None:
    monkeypatch.setattr("app.api.v1.personalizacao._SUPABASE_PUBLIC_BASE_URL", BASE)
    url, _, _ = _resolve_public_asset_fields(
        arquivo_url=DIRETA, storage_path=CAMINHO, metadata={}
    )
    assert url == GATEWAY


def test_repositorio_de_personalizacao_hidrata_com_gateway() -> None:
    repo = ConteudoPersonalizadoRepository.__new__(ConteudoPersonalizadoRepository)
    repo._public_base_url = BASE
    hidratado = repo._hydrate_materiais_urls(
        {"markdown": {"arquivo_url": DIRETA, "storage_path": CAMINHO}}
    )
    assert hidratado["markdown"]["arquivo_url"] == GATEWAY


def test_repositorio_de_materiais_resolve_com_gateway() -> None:
    repo = MateriaisRepository.__new__(MateriaisRepository)
    repo._public_base_url = BASE
    url, caminho, _ = repo._resolve_asset_fields(
        tipo="markdown", arquivo_url=GATEWAY, storage_path=CAMINHO, metadata={}
    )
    assert url == GATEWAY
    assert caminho == CAMINHO
