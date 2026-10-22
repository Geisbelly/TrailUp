"""`20261022_02`: os portões de Social e Ranking saem do cliente e viram view por turma.

O defeito medido: aluno com 2 conteúdos e 1 tópico concluídos via as duas abas com cadeado, e o
modal dizia "conclua o primeiro bloco para liberar" para quem já tinha concluído. A conta era do
cliente, em duas consultas, e qualquer erro virava zero.

O que estes testes protegem é o que não dá para ver lendo o SQL de corrido: o recorte por
`auth.uid()` (sem ele a view devolve linha de colega), o `security_invoker` (sem ele a view
ignora a RLS das tabelas base), o rótulo do enum sem acento, e o GRANT que não inclui `anon`.
"""

import importlib.util
from pathlib import Path

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
_ARQUIVO = "20261022_02_portoes_por_turma_no_banco.py"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M = _modulo(_ARQUIVO)


def test_encadeia_depois_da_20261022_01() -> None:
    assert _M.revision == "20261022_02"
    assert _M.down_revision == "20261022_01"


def test_a_view_roda_como_quem_chama() -> None:
    """Sem `security_invoker` a view roda como `postgres` e IGNORA a RLS das tabelas base --
    viraria um oráculo do progresso de qualquer aluno. É a regra do CLAUDE.md para view nova."""
    assert "WITH (security_invoker = on)" in _M.VIEW


def test_recorta_pelo_proprio_aluno() -> None:
    """A base é `classe_aluno`, e a policy de lá deixa o aluno ver os COLEGAS de turma de
    propósito (o ranking depende disso). Medido sem este filtro: 4 linhas para um aluno com 3
    turmas, uma delas de outro aluno."""
    assert "WHERE m.aluno_id = auth.uid()" in _M.VIEW


def test_e_por_turma_e_nao_por_aluno() -> None:
    # `conteudo_aluno` e `topico_aluno` nao tem `classe_id`: a turma so' aparece pelo caminho
    # conteudo -> topico -> classe. Perder qualquer um dos joins volta a conta a ser global.
    assert "JOIN public.topicos t ON t.id = c.topico_id" in _M.VIEW
    assert "JOIN public.topicos t ON t.id = ta.topico_id" in _M.VIEW
    assert "GROUP BY ca.aluno_id, t.classe_id" in _M.VIEW
    assert "GROUP BY ta.aluno_id, t.classe_id" in _M.VIEW
    assert "m.classe_id" in _M.VIEW


def test_toda_matricula_tem_linha() -> None:
    """A base é `classe_aluno` com LEFT JOIN: turma sem progresso nenhum precisa de linha, com
    os portões fechados. Com INNER JOIN a turma nova sumiria da view e o cliente não saberia
    distinguir "fechado" de "ainda não carregou"."""
    assert "FROM public.classe_aluno m" in _M.VIEW
    assert _M.VIEW.count("LEFT JOIN") == 2


def test_o_rotulo_do_enum_nao_tem_acento() -> None:
    """`status_atividade` é `não iniciado`, `em andamento`, `concluido` -- conferido em
    `pg_enum`. Os dois primeiros têm acento e o terceiro não; escrever "concluído" aqui
    compilaria e nunca casaria com linha nenhuma."""
    assert "'concluido'::public.status_atividade" in _M.VIEW
    assert "concluído" not in _M.VIEW


def test_o_predicado_aceita_os_dois_caminhos_de_conclusao() -> None:
    # O status e' escrito pelo trigger de progresso e o percentual por outro caminho; exigir os
    # dois perderia linha legitima.
    assert _M.VIEW.count("OR ca.percentual_concluido >= 100") == 1
    assert _M.VIEW.count("OR ta.percentual_concluido >= 100") == 1


def test_anon_nao_le_portao_de_ninguem() -> None:
    assert "REVOKE ALL ON public.vw_portoes_do_aluno FROM PUBLIC, anon;" in _M.PRIVILEGIOS
    assert "GRANT SELECT ON public.vw_portoes_do_aluno TO authenticated, service_role;" in _M.PRIVILEGIOS
    assert "anon" not in _M.PRIVILEGIOS.split("GRANT")[1]


def test_downgrade_remove_so_a_view() -> None:
    import inspect

    fonte = inspect.getsource(_M.downgrade)
    assert "DROP VIEW IF EXISTS public.vw_portoes_do_aluno;" in fonte
    # Nada de DROP em tabela: a view e' derivada, e reverter nao pode levar dado junto.
    assert "DROP TABLE" not in fonte
