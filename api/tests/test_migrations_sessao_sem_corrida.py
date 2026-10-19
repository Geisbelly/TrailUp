"""Guardas da `20260923_01` — gravar sessão de estudo sem perder a concorrente.

Mesmo estilo de `test_migrations_sessoes_estudo.py`: inspeciona o SQL gerado
via um FakeOp. O comportamento concorrente em si foi reproduzido num Postgres
real (duas transações na mesma linha); aqui fica travado o que o garante: a
linha de progresso é travada ANTES de a soma ser calculada.
"""

import importlib.util
from pathlib import Path

import pytest

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20260923_01_sessao_estudo_sem_corrida.py"

TABELAS = (
    ("topico_aluno", "topico_id", "p_topico", "'topic'"),
    ("conteudo_aluno", "conteudo_id", "p_conteudo", "'content'"),
    ("atividade_aluno", "atividade_id", "p_atividade", "'activity'"),
)


def _carregar():
    caminho = VERSOES / ARQUIVO
    spec = importlib.util.spec_from_file_location(f"migration_{ARQUIVO}", caminho)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _comandos(direcao: str = "upgrade") -> list[str]:
    module = _carregar()
    executado: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executado.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return executado


def _comando_com(trecho: str) -> str:
    achados = [c for c in _comandos() if trecho in c]
    assert len(achados) == 1, f"esperava um comando com {trecho!r}, achei {len(achados)}"
    return achados[0]


def test_cadeia_de_revisao():
    module = _carregar()
    assert module.revision == "20260923_01"
    assert module.down_revision == "20260922_06"


def test_sessao_trava_a_linha_de_progresso_antes_de_somar():
    # Sem a trava, a segunda de duas chamadas simultâneas calcula a soma com um
    # snapshot anterior ao commit da primeira e grava por cima dela (atividade
    # 1095, 22/09: 7s de sessão gravados e fora de tempo_gasto_min).
    rpc = _comando_com("FUNCTION public.trailup_registrar_sessao_estudo(")
    insercao_da_sessao = rpc.index("INSERT INTO public.estudo_sessoes")
    primeira_soma = rpc.index("SET tempo_gasto_min")
    for tabela, chave, parametro, _ in TABELAS:
        trava = rpc.index(
            f"PERFORM 1 FROM public.{tabela} WHERE aluno_id = p_aluno AND {chave} = {parametro} FOR UPDATE;"
        )
        assert trava < insercao_da_sessao < primeira_soma, tabela


def test_sessao_garante_a_linha_neutra_antes_de_travar():
    # Sem linha não há o que travar nem onde somar; a sessão ficava gravada e
    # nunca chegava a tempo_gasto_min. A linha nasce como o provisionamento a
    # cria: só as chaves, status e percentuais nos defaults ('não iniciado', 0).
    rpc = _comando_com("FUNCTION public.trailup_registrar_sessao_estudo(")
    for tabela, chave, parametro, _ in TABELAS:
        garantia = rpc.index(
            f"INSERT INTO public.{tabela} (aluno_id, {chave}) VALUES (p_aluno, {parametro}) "
            f"ON CONFLICT (aluno_id, {chave}) DO NOTHING;"
        )
        trava = rpc.index(f"PERFORM 1 FROM public.{tabela} WHERE")
        assert garantia < trava, tabela


def test_sessao_continua_idempotente_e_so_para_o_aluno_logado():
    rpc = _comando_com("FUNCTION public.trailup_registrar_sessao_estudo(")
    assert "ON CONFLICT (id) DO NOTHING RETURNING id INTO v_id" in rpc
    assert "IF v_id IS NULL THEN RETURN; END IF;" in rpc
    assert "p_aluno IS DISTINCT FROM auth.uid()" in rpc
    assert "matricula_invalida" in rpc


def test_intervalo_legado_tambem_trava_antes_de_somar():
    # Apps já instalados ainda chamam a RPC antiga; ela recalcula a mesma soma
    # e disputava a linha com a RPC de sessão.
    rpc = _comando_com("FUNCTION public.trailup_registrar_intervalo_estudo(")
    for tabela, chave, parametro, _ in TABELAS:
        trava = rpc.index(
            f"PERFORM 1 FROM public.{tabela} WHERE aluno_id = p_aluno AND {chave} = {parametro} FOR UPDATE;"
        )
        soma = rpc.index(f"UPDATE public.{tabela}")
        assert trava < soma, tabela


def test_remove_sessao_de_conteudo_gemea_de_atividade():
    # Bundle anterior ao a2586981: um bloco de atividade vinculado a conteúdo
    # gravava a MESMA sessão como 'content' e como 'activity'.
    limpeza = _comando_com("DELETE FROM public.estudo_sessoes")
    for condicao in (
        "c.scope = 'content'",
        "a.scope = 'activity'",
        "c.aluno_id = a.aluno_id",
        "c.topico_id = a.topico_id",
        "c.aberto_em = a.aberto_em",
        "c.fechado_em = a.fechado_em",
    ):
        assert condicao in limpeza, condicao


def test_recalcula_as_tres_tabelas_depois_da_limpeza():
    comandos = _comandos()
    limpeza = next(i for i, c in enumerate(comandos) if "DELETE FROM public.estudo_sessoes" in c)
    for tabela, chave, _, escopo in TABELAS:
        recalculo = next(
            i
            for i, c in enumerate(comandos)
            if f"UPDATE public.{tabela} x" in c and "trailup_tempo_sessao_min" in c
        )
        assert limpeza < recalculo, tabela
        assert f"public.trailup_tempo_sessao_min(x.aluno_id, {escopo}" in comandos[recalculo]


def test_downgrade_e_manual():
    module = _carregar()
    with pytest.raises(RuntimeError):
        module.downgrade()
