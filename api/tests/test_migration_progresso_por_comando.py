"""`20261022_04`: o recálculo de progresso sai de por-linha para por-comando.

O sintoma era `{"statusCode":"544","error":"DatabaseTimeout"}` no cliente, com três
`UPDATE personalizacao_item_progresso` simultâneos levando de 0,6 a 3,8 s e 32 de 60 conexões
ocupadas.

Três suspeitas foram medidas e DESCARTADAS antes de sobrar a certa: o volume (19 linhas,
224 kB), a RLS (49,3 ms sem contra 44,6 ms com) e o lote (20 linhas num INSERT saem a 4,4 ms
cada, mais barato que uma sozinha). O que restou foi o trigger `FOR EACH ROW` reescrevendo a
MESMA linha de `topico_aluno` uma vez por item — desperdício sozinho, contenção sob
concorrência.

Medido lado a lado, na mesma transação e já aquecido: UPDATE de 20 linhas custa **72,2 ms** por
linha contra **20,8 ms** por comando, com `topico_aluno.percentual_concluido` **igual nos dois**
(100). O que estes testes protegem é o que não dá para ver lendo o SQL: a ramificação por
`TG_OP` e a cobertura dos três eventos.
"""

import importlib.util
import inspect
from pathlib import Path

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
_ARQUIVO = "20261022_04_progresso_recalcula_por_comando.py"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M = _modulo(_ARQUIVO)


def test_encadeia_depois_da_categoria() -> None:
    assert _M.revision == "20261022_04"
    assert _M.down_revision == "20261022_03"


def test_os_tres_eventos_tem_trigger() -> None:
    """Um trigger com tabela de transição cobre UM evento. Esquecer o DELETE deixaria o
    progresso congelado quando um item sai do percurso."""
    for evento in ["AFTER INSERT", "AFTER UPDATE", "AFTER DELETE"]:
        assert evento in _M.TRIGGERS, evento
    assert _M.TRIGGERS.count("FOR EACH STATEMENT") == 3
    assert "FOR EACH ROW" not in _M.TRIGGERS


def test_cada_trigger_declara_so_a_tabela_que_existe() -> None:
    # INSERT nao tem `antigas`; DELETE nao tem `novas`. So o UPDATE tem as duas.
    # Pelo CREATE, nao pelo DROP que vem antes com o mesmo nome.
    insert = _M.TRIGGERS.split("CREATE TRIGGER trg_pip_progresso_insert")[1].split(";")[0]
    delete = _M.TRIGGERS.split("CREATE TRIGGER trg_pip_progresso_delete")[1].split(";")[0]
    assert "NEW TABLE AS novas" in insert and "OLD TABLE" not in insert
    assert "OLD TABLE AS antigas" in delete and "NEW TABLE" not in delete
    assert "NEW TABLE AS novas OLD TABLE AS antigas" in _M.TRIGGERS


def test_a_funcao_ramifica_por_tg_op() -> None:
    """A tabela de transição só EXISTE no evento que a declarou. Um corpo único lendo as duas
    passa na migration e levanta "relation does not exist" no primeiro INSERT do aluno — em
    tempo de execução, não de criação."""
    assert "IF TG_OP IN ('INSERT', 'UPDATE') THEN" in _M.FUNCAO
    assert "IF TG_OP IN ('UPDATE', 'DELETE') THEN" in _M.FUNCAO


def test_recalcula_uma_vez_por_par_distinto() -> None:
    # E' o ponto todo: N itens do mesmo topico davam N reescritas da mesma linha.
    assert "SELECT DISTINCT aluno_id, topico_id" in _M.FUNCAO
    assert _M.FUNCAO.count("trailup_recalcular_topico_aluno") == 1
    assert _M.FUNCAO.count("trailup_recalcular_classe_aluno") == 1


def test_nao_toca_nas_funcoes_de_recalculo() -> None:
    """O resultado não muda: recalcular uma vez por comando dá o mesmo número, porque a conta lê
    o estado FINAL da tabela, não o delta. Se esta migration redefinisse as funções de cálculo,
    seria outra mudança escondida nesta."""
    assert "CREATE OR REPLACE FUNCTION public.trailup_recalcular" not in _M.FUNCAO
    assert "CREATE OR REPLACE FUNCTION public.trailup_recalcular" not in _M.TRIGGERS


def test_nao_mexe_nas_outras_duas_tabelas() -> None:
    """`conteudo_aluno` e `atividade_aluno` continuam por linha de propósito: o app escreve nelas
    uma de cada vez, sem rajada para amortizar."""
    for tabela in ["conteudo_aluno", "atividade_aluno"]:
        assert tabela not in _M.TRIGGERS, tabela


def test_downgrade_devolve_o_trigger_por_linha() -> None:
    fonte = inspect.getsource(_M.downgrade)
    assert "FOR EACH ROW EXECUTE FUNCTION public.trailup_progresso_after_item()" in fonte
    for nome in ["trg_pip_progresso_insert", "trg_pip_progresso_update", "trg_pip_progresso_delete"]:
        assert f"DROP TRIGGER IF EXISTS {nome}" in fonte, nome
