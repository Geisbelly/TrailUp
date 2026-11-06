"""A versão do consentimento precisa acompanhar a alteração do texto (#30)."""

import importlib.util
from pathlib import Path

from alembic.script import ScriptDirectory

from tests.test_migrations import _offline_alembic_config

API_ROOT = Path(__file__).resolve().parents[1]
VERSOES = API_ROOT / "alembic" / "versions"


def _modulo():
    path = VERSOES / "20261105_30_consentimento_responsavel_v2.py"
    spec = importlib.util.spec_from_file_location("m_20261105_30_consentimento_v2", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migration_avanca_e_reverte_versao_sem_editar_consents_anteriores() -> None:
    m = _modulo()
    assert m.revision == "20261105_30"
    assert m.down_revision == "20261105_29"
    assert m.VERSAO_ANTIGA == "2026-10-24-resp-v1"
    assert m.VERSAO_NOVA == "2026-11-05-resp-v2"
    assert m.VERSAO_NOVA in m._sql(m.VERSAO_NOVA)
    assert m.VERSAO_ANTIGA in m._sql(m.VERSAO_ANTIGA)
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision(m.revision).down_revision == m.down_revision


def test_clientes_usam_a_versao_vigente_e_nao_alteram_a_de_pesquisa() -> None:
    m = _modulo()
    mobile = (API_ROOT.parent / "mobile/src/utils/consentimentoResponsavel.ts").read_text(encoding="utf-8")
    console = (API_ROOT.parent / "frontend/src/components/console/turmas/termosResponsavel.ts").read_text(encoding="utf-8")
    for texto in (mobile, console):
        assert f'"{m.VERSAO_NOVA}"' in texto
        assert '"2026-10-24-pesq-v1"' in texto
        assert f'"{m.VERSAO_ANTIGA}"' not in texto
