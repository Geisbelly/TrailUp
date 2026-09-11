"""A chave de idempotencia do evento: retentar sem pagar duas vezes.

Sem ela, dar fila duravel ao registro de pontos duplicaria pontuacao. O tipo
`atividade` -- o DEFAULT do gravador do mobile -- nao era protegido por nenhum
indice: a segunda entrega da mesma escrita entrava como linha nova e pagava de
novo.

A coluna e anulavel de proposito, e este arquivo guarda isso: e o que garante
que nenhum caller existente muda de comportamento.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


def _offline_alembic_config(output_buffer: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output_buffer)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    return config


def _sql() -> str:
    output = StringIO()
    migrations.command.upgrade(
        _offline_alembic_config(output), "20260911_01:20260911_02", sql=True
    )
    return output.getvalue()


def _sql_downgrade() -> str:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260911_02:20260911_01", sql=True
    )
    return output.getvalue()


def test_a_coluna_e_anulavel() -> None:
    """Anulavel e o que torna a migracao retrocompativel: NULL nao colide com
    NULL em indice unico, entao quem nao manda chave -- todo caller existente e
    o SQL direto -- se comporta exatamente como antes."""
    sql = _sql()

    assert "ADD COLUMN IF NOT EXISTS idempotencia_key uuid" in sql
    assert "idempotencia_key uuid NOT NULL" not in sql


def test_o_indice_e_unico_e_parcial() -> None:
    """Parcial porque so as linhas com chave precisam de protecao; sem o WHERE
    o indice carregaria o historico inteiro sem proteger nada a mais."""
    sql = _sql()

    assert "CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_idempotencia_unico" in sql
    assert "WHERE idempotencia_key IS NOT NULL" in sql


def test_a_migracao_aborta_se_o_indice_nao_for_parcial() -> None:
    """A verificacao nao pode se contentar com "o indice existe": um indice
    total passaria por ela e so apareceria na conta de escrita."""
    sql = _sql()

    assert "o indice de idempotencia nao esta parcial" in sql
    assert "position('WHERE (idempotencia_key IS NOT NULL)' IN indexdef)" in sql


def test_a_chave_identifica_a_tentativa_e_nao_o_par_tipo_referencia() -> None:
    """Tornar (aluno, tipo, referencia) unico proibiria a repeticao legitima --
    rever um conteudo e repetivel por natureza. A unicidade e so da chave."""
    sql = _sql()

    indice = sql[sql.index("eventos_aluno_idempotencia_unico") :]
    corpo = indice[: indice.index(";")]
    assert "(idempotencia_key)" in corpo
    assert "tipo" not in corpo
    assert "referencia" not in corpo


def test_a_coluna_nao_entra_em_conta_de_pontuacao() -> None:
    """Ela e identidade de escrita, nao valor. Quem decide quanto vale um
    evento continua sendo `fn_pontos_do_evento`, e esta migracao nao a toca.

    A assercao busca a CHAMADA (`fn_pontos_do_evento(`), nao o nome: o
    COMMENT ON COLUMN cita a funcao em prosa, e casar com o nome solto daria
    um falso positivo -- o mesmo erro que ja custou caro neste repo, onde um
    grep casou com um comentario `-- Nao toca em tempo_gasto_min` e foi lido
    como atribuicao."""
    sql = _sql()

    assert "fn_pontos_do_evento(" not in sql
    assert "UPDATE public.eventos_aluno" not in sql
    assert "SET valor" not in sql


def test_o_downgrade_desfaz_as_duas_coisas() -> None:
    sql = _sql_downgrade()

    assert "DROP INDEX IF EXISTS public.eventos_aluno_idempotencia_unico" in sql
    assert "DROP COLUMN IF EXISTS idempotencia_key" in sql


def test_o_sql_renderizado_nao_tem_por_cento_duplicado() -> None:
    """O renderizador offline do Alembic dobra `%` para o paramstyle do driver.
    Um `LIKE '%x%'` chegaria ao Postgres como `%%x%%` e o filtro morreria em
    silencio. Vale para o SQL RENDERIZADO -- a prosa do docstring pode ter."""
    assert "%" not in _sql()
    assert "%" not in _sql_downgrade()
