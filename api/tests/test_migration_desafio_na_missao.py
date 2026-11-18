"""`20261117_02`: a missão guarda um desafio, com gabarito que o aluno não lê (estrutura da migration)."""

from __future__ import annotations

import importlib.util
import re
import types
from pathlib import Path

from sqlalchemy import text

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20261117_02_desafio_na_missao.py"


def _modulo(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_desafio_{nome[:11]}", VERSOES / nome)
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


def _compacto(sql: str) -> str:
    return re.sub(r"\s+", " ", sql)


def test_cadeia() -> None:
    mod = _mod()
    assert (mod.revision, mod.down_revision) == ("20261117_02", "20261117_01")


def test_check_do_desafio() -> None:
    sql = _compacto(_sql())
    assert (
        "CHECK (desafio IS NULL OR (escopo = 'aluno' AND conteudo_id IS NOT NULL AND desafio_grupo IS NOT NULL))"
        in sql
    )
    assert "desafio->>'tipo' IN ('logica','cruzadinha')" in sql
    # Cruzadinha com 4 a 10 palavras, e as colunas do desafio só existem juntas.
    assert "BETWEEN 4 AND 10" in sql
    assert "CHECK (desafio IS NOT NULL OR (conteudo_id IS NULL AND desafio_grupo IS NULL))" in sql
    assert "REFERENCES public.conteudos(id) ON DELETE CASCADE" in sql


def test_tabelas_nascem_com_policy() -> None:
    sql = _sql()
    for tabela in ("missao_desafio_gabarito", "missao_desafio_tentativa"):
        assert f"CREATE TABLE IF NOT EXISTS public.{tabela}" in sql
        assert f"ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY" in sql
        assert re.search(rf"CREATE POLICY \w+ ON public\.{tabela}\s+FOR SELECT TO authenticated", sql)
        assert f"REVOKE ALL ON public.{tabela} FROM PUBLIC, anon, authenticated;" in sql
        assert f"GRANT SELECT ON public.{tabela} TO authenticated;" in sql
        # Nenhuma policy de escrita: só a RPC (SECURITY DEFINER) escreve.
        assert not re.search(rf"CREATE POLICY \w+ ON public\.{tabela}\s+FOR (ALL|INSERT|UPDATE|DELETE)", sql)


def test_recompensas_pagam_como_a_diaria() -> None:
    """Ruling de 17/11: `missao_concluida` paga 0/0 em produção, então os desafios pagam o que a diária
    paga (10 pontos e 2 moedas), em vez de copiar `missao_concluida`."""
    sql = _compacto(_sql())
    assert "INSERT INTO public.eventos_pontuacao (tipo, pontos, moedas, descricao) VALUES" in sql
    assert "('desafio_logica', 10, 2," in sql
    assert "('desafio_cruzadinha', 10, 2," in sql
    assert "ON CONFLICT (tipo) DO NOTHING" in sql
    assert "WHERE tipo = 'missao_concluida'" not in sql


def test_guarda_restringe_recompensa_aos_tipos_de_premio() -> None:
    mod = _mod()
    t1 = _modulo("20261117_01_premio_de_missao_na_turma.py")
    assert mod.TIPOS_DE_PREMIO == t1.TIPOS_DE_PREMIO
    lista = ", ".join(f"'{t}'" for t in t1.TIPOS_DE_PREMIO)
    assert f"NEW.recompensa_tipo NOT IN ({lista})" in mod.guarda()


def test_guarda_parte_da_cadeia_e_aceita_a_metrica_desafio() -> None:
    mod = _mod()
    g = mod.guarda()
    # O resto da guarda é o da 20261103_06, trocado por âncora.
    assert mod.M06.guarda() != g
    assert "'item_no_dia', 'desafio')" in g
    assert "current_setting('app.desafio_gravando', true)" in g
    assert "ERRCODE = '42501'" in g
    for coluna in ("desafio", "desafio_grupo", "conteudo_id", "criterio", "escopo", "classe_id"):
        assert f"NEW.{coluna} := OLD.{coluna};" in _compacto(g)


def test_avaliador_ignora_desafio() -> None:
    mod = _mod()
    assert mod.ITEM.count("AND m.desafio IS NULL") == 1
    assert all("AND m.desafio IS NULL" in depois for _, depois in mod.TROCAS_GATILHO)
    # A âncora do laço existe uma vez no texto que a 20261117_01 deixa.
    gatilho = mod.gatilho_depois_da_17_01()
    for antes, _ in mod.TROCAS_GATILHO:
        assert gatilho.count(antes) == 1


def test_nenhum_bind_escondido() -> None:
    """`text()` lê `:palavra` como parâmetro; nenhum comando da migration pode ter um."""
    for fn in ("upgrade", "downgrade"):
        for comando in _comandos(fn):
            assert text(comando).compile().params == {}, comando[:120]


def test_downgrade_desfaz() -> None:
    sql = _sql("downgrade")
    assert "DROP TABLE IF EXISTS public.missao_desafio_tentativa" in sql
    assert "DROP TABLE IF EXISTS public.missao_desafio_gabarito" in sql
    assert "DROP COLUMN IF EXISTS desafio" in sql
    assert _mod().M06.guarda() in sql
