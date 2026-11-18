"""`20261117_01`: o prêmio de missão grava a turma e só o banco grava prêmio."""

from __future__ import annotations

import importlib.util
import re
import types
from pathlib import Path

from sqlalchemy import text

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20261117_01_premio_de_missao_na_turma.py"

COM_TURMA = "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor, criado_em)"
SEM_TURMA = "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)"


def _modulo(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_premio_{nome[:11]}", VERSOES / nome)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _mod():
    return _modulo(ARQUIVO)


def _comandos(fn: str = "upgrade") -> list[str]:
    mod = _mod()
    coletados: list[str] = []
    mod.op = types.SimpleNamespace(execute=lambda sql: coletados.append(str(sql)))
    getattr(mod, fn)()
    return coletados


def _sql(fn: str = "upgrade") -> str:
    return "\n".join(_comandos(fn))


def _sem_ancoras(sql: str) -> str:
    """O texto que a troca no banco PROCURA (`$a$...$a$`) não é o que fica gravado."""
    return re.sub(r"\$a\$.*?\$a\$", "", sql, flags=re.S)


def test_cadeia() -> None:
    mod = _mod()
    assert (mod.revision, mod.down_revision) == ("20261117_01", "20261116_02")


def test_premio_grava_a_turma() -> None:
    sql = _sql()
    # Os quatro gravadores: laço do gatilho de eventos, `item_no_dia`, `minutos_no_dia` e a guilda.
    assert sql.count(COM_TURMA) == 4
    assert "VALUES (v_aluno_id, v_missao.classe_id, v_premio, 'missao:' || v_missao.id::text, 0, now());" in sql
    assert sql.count(
        "VALUES (v_aluno_id, v_missao.classe_id, v_missao.recompensa_tipo, 'missao:' || v_missao.id::text, 0, now());"
    ) == 2
    assert "VALUES (v_membro.aluno_id, v_m.classe_id, v_m.recompensa_tipo, 'missao:' || p_missao::text, 0, now());" in sql
    # Os laços passam a ler a turma da missão.
    assert sql.count("SELECT m.id, m.criterio, m.recompensa_tipo, m.classe_id\n") == 2
    assert "             m.recompensa_tipo,\n             m.classe_id\n" in sql
    # Nenhum INSERT de prêmio sem turma sobra no que fica gravado.
    assert SEM_TURMA not in _sem_ancoras(sql)


def test_resolvedor_aprende_missao() -> None:
    sql = _sem_ancoras(_sql())
    assert "WHEN 'missao' THEN 'missao'" in sql
    assert "WHEN alvo.entidade IN ('classe', 'item', 'missao') THEN" in sql
    assert "LEFT JOIN public.missoes m_m  ON com_classe.entidade = 'missao'    AND m_m.id = com_classe.id_alvo;" in sql
    assert "t_i.classe_id, cl.id, m_m.classe_id)" in sql


def test_ancoras_existem_uma_vez_na_cadeia_do_git() -> None:
    mod = _mod()
    gatilho = mod.gatilho_de_eventos_do_git()
    for antes, _ in mod.TROCAS_GATILHO:
        assert gatilho.count(antes) == 1
    resolvedor = mod.resolvedor_do_git()
    for antes, _ in mod.TROCAS_RESOLVEDOR:
        assert resolvedor.count(antes) == 1


def test_gatilho_recusa_premio_do_cliente() -> None:
    sql = _sql()
    corpo = re.search(
        r"CREATE OR REPLACE FUNCTION public\.fn_eventos_aluno_premio_so_do_banco\(\).*?\$function\$;", sql, re.S
    ).group(0)
    assert "SECURITY INVOKER" in corpo
    assert "current_user NOT IN ('authenticated', 'anon')" in corpo
    assert "COALESCE(current_setting('app.missao_premiando', true), '') = 'on'" in corpo
    assert "('missao_concluida', 'missao_diaria_concluida', 'desafio_logica', 'desafio_cruzadinha')" in corpo
    # So' a lista fixa: um ramo por `missoes.recompensa_tipo` recusaria estudo (recompensa de estudo).
    assert "EXISTS" not in corpo
    assert "FROM public.missoes" not in corpo
    assert "ERRCODE = '42501'" in corpo
    assert re.search(
        r"CREATE TRIGGER trg_eventos_aluno_premio_so_do_banco\s+BEFORE INSERT ON public\.eventos_aluno", sql
    )


def test_downgrade_restaura() -> None:
    mod = _mod()
    sql = _sql("downgrade")
    assert "DROP TRIGGER IF EXISTS trg_eventos_aluno_premio_so_do_banco ON public.eventos_aluno" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_eventos_aluno_premio_so_do_banco()" in sql
    # Os três corpos que vêm do git voltam como as migrations anteriores os deixaram.
    assert mod.M05.GATILHO_ITEM in sql
    assert mod.M20.MINUTOS in sql
    assert mod.M13.avaliar_novo() in sql
    assert COM_TURMA not in _sem_ancoras(sql)
    # As trocas no banco voltam pelo caminho inverso: procuram o texto novo e devolvem o antigo.
    assert "position($m$20261117_01$m$ IN v_def) = 0" in sql


def test_sql_sem_bind_acidental() -> None:
    """`text()` leria `:palavra` como parâmetro, e o psycopg direto não pega isso."""
    for fn in ("upgrade", "downgrade"):
        for comando in _comandos(fn):
            assert text(comando).compile().params == {}, comando[:200]
