"""O ciclo de vida do R2 (infra/r2/ciclo-de-vida.json, #195) fica coerente com
a retencao do banco e nunca expira objeto que o banco referencia."""

import importlib.util
import json
import re
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
JSON_R2 = RAIZ / "infra" / "r2" / "ciclo-de-vida.json"
MIGRACAO_RETENCAO = RAIZ / "api" / "alembic" / "versions" / "20261024_03_retencao_e_expurgo.py"
TELEMETRIA = RAIZ / "api" / "app" / "repositories" / "telemetria.py"

# Fora do monorepo (imagem so' com api/), nao ha' o JSON para conferir.
pytestmark = pytest.mark.skipif(not JSON_R2.exists(), reason="infra/r2 fora deste checkout")

DIA = 24 * 60 * 60
MARGEM_MINIMA_DIAS = 14
PREFIXOS_QUE_PODEM_EXPIRAR = {"telemetria/lotes/", "telemetria/eventos/"}
# Caminhos que o banco referencia (vw_material_storage_paths, fontes,
# material do aluno em `<uuid>/...`): nenhuma regra de expiracao pode cobri-los.
CAMINHOS_REFERENCIADOS = [
    "brainhex/mastermind/classe-12/aula.md",
    "fontes/classe-12/abc.pdf",
    "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/boss/x.png",
    "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/topico/1_a.pdf",
]


def _regras():
    return json.loads(JSON_R2.read_text(encoding="utf-8"))["rules"]


def _constantes_de_retencao():
    spec = importlib.util.spec_from_file_location("retencao_20261024_03", MIGRACAO_RETENCAO)
    modulo = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(modulo)
    return modulo


def test_formato_da_api_da_cloudflare():
    ids = set()
    for regra in _regras():
        assert regra["id"] not in ids
        ids.add(regra["id"])
        assert regra["enabled"] is True
        assert isinstance(regra["conditions"]["prefix"], str)
        for chave in ("deleteObjectsTransition", "abortMultipartUploadsTransition"):
            if chave in regra:
                cond = regra[chave]["condition"]
                assert cond["type"] == "Age"
                assert isinstance(cond["maxAge"], int) and cond["maxAge"] > 0
        assert set(regra) <= {
            "id",
            "enabled",
            "conditions",
            "deleteObjectsTransition",
            "abortMultipartUploadsTransition",
        }


def test_so_telemetria_expira_e_depois_do_prazo_mais_longo_do_banco():
    retencao = _constantes_de_retencao()
    prazo_banco = max(retencao.DIAS_BRUTA, retencao.DIAS_BRUTA_PESQUISA)
    que_apagam = [r for r in _regras() if "deleteObjectsTransition" in r]
    assert {r["conditions"]["prefix"] for r in que_apagam} == PREFIXOS_QUE_PODEM_EXPIRAR
    for regra in que_apagam:
        dias = regra["deleteObjectsTransition"]["condition"]["maxAge"] / DIA
        assert dias >= prazo_banco + MARGEM_MINIMA_DIAS, regra["id"]


def test_nenhum_caminho_referenciado_pelo_banco_expira():
    for caminho in CAMINHOS_REFERENCIADOS:
        for regra in _regras():
            if "deleteObjectsTransition" in regra:
                assert not caminho.startswith(regra["conditions"]["prefix"]), (caminho, regra["id"])


def test_prefixos_batem_com_o_codigo_que_grava_a_telemetria():
    codigo = TELEMETRIA.read_text(encoding="utf-8")
    gravados = set(re.findall(r'f"(telemetria/[a-z]+/)\{', codigo))
    assert gravados == PREFIXOS_QUE_PODEM_EXPIRAR


def test_uploads_incompletos_sao_abortados_em_todo_o_bucket():
    # `lifecycle set` substitui a regra padrao do R2 (abortar em 7 dias).
    gerais = [r for r in _regras() if r["conditions"]["prefix"] == "" and "abortMultipartUploadsTransition" in r]
    assert gerais and all("deleteObjectsTransition" not in r for r in gerais)
    assert gerais[0]["abortMultipartUploadsTransition"]["condition"]["maxAge"] <= 7 * DIA
