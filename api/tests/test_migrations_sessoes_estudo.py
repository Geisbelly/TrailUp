"""Guardas da `20260921_01` — sessões de estudo com abertura/fechamento reais.

Mesmo estilo de `test_migrations_tempo_por_lote.py`: inspeciona o SQL gerado
via um FakeOp, sem Postgres real.
"""

import importlib.util
from pathlib import Path

import pytest

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20260921_01_sessoes_estudo_abertura_fechamento.py"


def _carregar(nome: str = ARQUIVO):
    caminho = VERSOES / nome
    spec = importlib.util.spec_from_file_location(f"migration_{nome}", caminho)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _sql(direcao: str = "upgrade") -> str:
    module = _carregar()
    executado: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executado.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return "\n".join(executado)


def test_cadeia_de_revisao():
    module = _carregar()
    assert module.revision == "20260921_01"
    assert module.down_revision == "20260920_10"


def test_tabela_guarda_abertura_e_fechamento():
    sql = _sql()
    assert "CREATE TABLE public.estudo_sessoes" in sql
    assert "aberto_em timestamptz NOT NULL" in sql
    assert "fechado_em timestamptz NOT NULL" in sql
    assert "GENERATED ALWAYS AS" in sql


def test_escopo_consistente_com_a_entidade():
    sql = _sql()
    assert "estudo_sessoes_escopo_consistente" in sql
    assert "scope = 'content'  AND conteudo_id IS NOT NULL" in sql
    assert "scope = 'activity' AND atividade_id IS NOT NULL" in sql


def test_rls_so_deixa_o_aluno_ler_o_proprio_registro():
    sql = _sql()
    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL ON public.estudo_sessoes FROM PUBLIC, anon, authenticated" in sql
    assert "USING (aluno_id = auth.uid())" in sql


def test_conta_soma_a_tabela_nova_nao_a_telemetria():
    sql = _sql()
    definicao = sql[sql.index("FUNCTION public.trailup_tempo_sessao_min") :]
    assert "sum(e.duracao_sec)" in definicao
    assert "FROM public.estudo_sessoes e" in definicao


def _funcao_registrar_sessao(sql: str) -> str:
    inicio = sql.index("FUNCTION public.trailup_registrar_sessao_estudo")
    fim = sql.index("REVOKE ALL ON FUNCTION public.trailup_registrar_sessao_estudo", inicio)
    return sql[inicio:fim]


def test_rpc_nova_so_faz_update_nunca_insert_nas_tabelas_de_progresso():
    rpc = _funcao_registrar_sessao(_sql())
    assert "UPDATE public.topico_aluno" in rpc
    assert "INSERT INTO public.topico_aluno" not in rpc
    assert "INSERT INTO public.conteudo_aluno" not in rpc
    assert "INSERT INTO public.atividade_aluno" not in rpc


def test_rpc_nova_e_idempotente_por_id_de_sessao():
    sql = _sql()
    assert "ON CONFLICT (id) DO NOTHING RETURNING id INTO v_id" in sql
    assert "IF v_id IS NULL THEN RETURN; END IF;" in sql


def test_rpc_nova_valida_matricula_e_pertencimento():
    sql = _sql()
    rpc = sql[sql.index("FUNCTION public.trailup_registrar_sessao_estudo") :]
    assert "matricula_invalida" in rpc
    assert "conteudo_invalido" in rpc
    assert "atividade_invalida" in rpc


def test_downgrade_e_manual():
    module = _carregar()
    with pytest.raises(RuntimeError):
        module.downgrade()
