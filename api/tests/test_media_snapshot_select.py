"""A expressao de `media_snapshot` no SELECT nao pode aliasar um nome pontuado.

`list_resumable_jobs_by_payload` montava a coluna com
`.replace("media_snapshot", "j.media_snapshot")` sobre
`"media_snapshot AS media_snapshot"`. O replace troca as DUAS ocorrencias e
gera `j.media_snapshot AS j.media_snapshot` -- `AS j.media_snapshot` e erro de
sintaxe no Postgres ("syntax error at or near '.'").

Consequencia: a consulta NUNCA rodava. E e ela que acha job terminal com alvo
pendente, ou seja, e o que faz a retomada reaproveitar um ciclo aberto em vez de
abrir um novo. Com ela quebrada, toda retentativa comecava do zero -- a "causa
raiz do desperdicio de tokens" que a retomada granular existe para evitar.
Medido na classe 32: 18 jobs `failed` para os topicos 129 e 130.
"""

from __future__ import annotations

from app.repositories.personalizacao_jobs import PersonalizacaoJobsRepository

expr = PersonalizacaoJobsRepository._media_snapshot_select_expr


def test_o_alias_nunca_e_pontuado() -> None:
    """O erro que quebrava a consulta: `AS j.media_snapshot`."""
    for enabled in (True, False):
        for alias in (None, "j", "jobs"):
            sql = expr(enabled=enabled, alias=alias)
            depois_do_as = sql.split(" AS ", 1)[1]
            assert "." not in depois_do_as, sql


def test_com_alias_a_coluna_e_qualificada_e_o_apelido_nao() -> None:
    assert expr(enabled=True, alias="j") == "j.media_snapshot AS media_snapshot"


def test_sem_alias_nada_e_qualificado() -> None:
    assert expr(enabled=True) == "media_snapshot AS media_snapshot"


def test_desabilitado_devolve_jsonb_vazio() -> None:
    """Quando a coluna nao existe no ambiente, o SELECT ainda tem de ter a
    chave -- `_hydrate_job` conta com ela."""
    sql = expr(enabled=False)
    assert sql.endswith(" AS media_snapshot")
    assert "::jsonb" in sql


def test_o_replace_que_havia_produzia_sql_invalido() -> None:
    """Prende o motivo, nao so o resultado: se alguem reintroduzir o replace,
    este teste explica por que ele nao pode voltar."""
    quebrado = expr(enabled=True).replace("media_snapshot", "j.media_snapshot")

    assert quebrado == "j.media_snapshot AS j.media_snapshot"
    assert "." in quebrado.split(" AS ", 1)[1]


def test_a_consulta_de_retomada_usa_o_alias_e_nao_o_replace() -> None:
    """O ponto de uso importa: a expressao correta existia e nao era usada la."""
    import inspect

    bruto = inspect.getsource(
        PersonalizacaoJobsRepository.list_resumable_jobs_by_payload
    )
    # Sem as linhas de comentario: elas CITAM o replace para explicar por que
    # ele saiu, e casariam com a assercao de baixo.
    codigo = "\n".join(
        linha for linha in bruto.splitlines() if not linha.strip().startswith("#")
    )

    assert 'alias="j"' in codigo
    assert 'replace("media_snapshot"' not in codigo
