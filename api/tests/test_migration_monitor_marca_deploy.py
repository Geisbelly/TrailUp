"""Texto da `20261105_26`, sem banco: os recortes casam com a origem e nada vira parâmetro de bind."""

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import text

from app.core import build_info

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _migration():
    caminho = VERSOES / "20261105_26_monitor_marca_deploy.py"
    spec = importlib.util.spec_from_file_location("m_20261105_26_teste", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_revisao_encadeia_na_cabeca_anterior():
    m = _migration()
    assert (m.revision, m.down_revision) == ("20261105_26", "20261105_25")


@pytest.mark.parametrize(
    "bloco", ["versao_nova", "aplicar_nova", "painel_novo", "versao_antiga", "aplicar_antiga", "painel_antigo"]
)
def test_nenhum_bloco_vira_bind(bloco):
    assert text(getattr(_migration(), bloco)()).compile().params == {}


def test_marca_vem_antes_de_atualizar_a_versao_e_exige_as_tres_provas():
    corpo = _migration().aplicar_nova()
    assert corpo.index("motivo = 'deploy'") < corpo.index("v_a.ultima_versao := p_versao")
    assert corpo.index("motivo = 'deploy'") < corpo.index("v_a.primeira_falha_em := NULL")
    assert "v_a.ultima_versao IS NOT NULL" in corpo
    assert "v_a.primeira_falha_em IS NOT NULL" in corpo
    assert "make_interval(mins => v_janela_deploy)" in corpo


def test_painel_mostra_o_que_saiu_da_conta():
    corpo = _migration().painel_novo()
    assert "'minutos_deploy'" in corpo and "s.motivo = 'deploy'" in corpo


def test_carimbo_da_imagem(tmp_path, monkeypatch):
    arquivo = tmp_path / "imagem"
    monkeypatch.setattr(build_info, "CARIMBO_DA_IMAGEM", arquivo)
    assert build_info.get_image_stamp() is None  # sem Dockerfile, em dev
    arquivo.write_text("AB" * 20 + "\n", encoding="utf-8")
    assert build_info.get_image_stamp() == "ab" * 20
    arquivo.write_text("nao e hexa", encoding="utf-8")
    assert build_info.get_image_stamp() is None


def test_dockerfile_carimba_depois_de_copiar_o_codigo():
    dockerfile = (VERSOES.parents[1] / "Dockerfile").read_text(encoding="utf-8")
    assert dockerfile.index("COPY . .") < dockerfile.index("> /opt/trailup-imagem")
