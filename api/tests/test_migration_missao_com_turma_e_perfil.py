"""`20261103_06`: turma e perfil da missão editáveis, menos na diária do sistema."""

import importlib.util
import types
from pathlib import Path

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _mod():
    spec = importlib.util.spec_from_file_location("m_20261103_06", VERSOES / "20261103_06_missao_com_turma_e_perfil.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _sql(fn: str = "upgrade") -> str:
    mod = _mod()
    coletados: list[str] = []
    mod.op = types.SimpleNamespace(execute=lambda sql: coletados.append(str(sql)))
    getattr(mod, fn)()
    return "\n".join(coletados)


def test_cadeia() -> None:
    mod = _mod()
    assert (mod.revision, mod.down_revision) == ("20261103_06", "20261103_05")


def test_turma_e_perfil_so_congelam_na_diaria_do_sistema() -> None:
    sql = _sql()
    assert "IF OLD.origem = 'sistema' OR OLD.dia IS NOT NULL THEN\n      NEW.classe_id   := OLD.classe_id;\n      NEW.perfil_alvo := OLD.perfil_alvo;" in sql
    # Nenhum congelamento incondicional sobrou.
    assert sql.count("NEW.classe_id   := OLD.classe_id;") == 1
    assert sql.count("NEW.perfil_alvo := OLD.perfil_alvo;") == 1


def test_guilda_sem_perfil_e_entrega_na_mesma_turma() -> None:
    sql = _sql()
    assert "NEW.escopo = 'guilda' AND NEW.perfil_alvo IS NOT NULL" in sql
    assert "t.classe_id = NEW.classe_id" in sql


def test_o_resto_da_guarda_e_o_da_05() -> None:
    mod = _mod()
    anterior = mod.guarda_anterior()
    nova = mod.guarda()
    for trecho in ("item_no_dia precisa de criterio.item", "Missao de guilda soma o progresso dos membros",
                   "IF OLD.origem = 'sistema' THEN", "recompensa_tipo % nao existe"):
        assert trecho in anterior and trecho in nova


def test_downgrade_volta_a_guarda_da_05() -> None:
    assert _sql("downgrade").count("NEW.classe_id   := OLD.classe_id;") == 1
    assert "NEW.escopo = 'guilda' AND NEW.perfil_alvo IS NOT NULL" not in _sql("downgrade")
