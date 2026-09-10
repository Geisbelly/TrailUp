"""A classe do evento e resolvida no INSERT e congela.

Fecha a CAUSA das referencias orfas: ate aqui a classe era deduzida na leitura,
entao a atribuicao dependia de o alvo continuar existindo -- e conteudo regerado
apaga atividade. Medido em producao: 66 ids apontando para atividade que nao
existe mais.

O ponto de seguranca: `eventos_aluno_posse_upd` deixa o aluno dar UPDATE nos
proprios eventos, e o gatilho de valor disparava so em `UPDATE OF valor, tipo`.
Uma `classe_id` gravavel seria caminho direto para mover a pontuacao para a
turma que ele quisesse liderar.
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
        _offline_alembic_config(output), "20260910_06:20260910_07", sql=True
    )
    return output.getvalue()


def _sql_downgrade() -> str:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260910_07:20260910_06", sql=True
    )
    return output.getvalue()


def test_a_classe_e_resolvida_no_insert() -> None:
    sql = _sql()

    assert "ADD COLUMN IF NOT EXISTS classe_id bigint" in sql
    assert (
        "NEW.classe_id := public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia);"
        in sql
    )


def test_no_update_a_coluna_e_restaurada_de_old() -> None:
    """Este e o congelamento, e e seguranca: o cliente PODE dar UPDATE nos
    proprios eventos. Sem esta linha ele move a pontuacao de turma."""
    sql = _sql()

    assert "NEW.classe_id := OLD.classe_id;" in sql


def test_o_gatilho_de_update_cobre_todas_as_colunas() -> None:
    """Com a lista `valor, tipo`, um `UPDATE ... SET classe_id = ...` nao
    acionava o gatilho -- e a coluna congelada ficava gravavel."""
    sql = _sql()

    assert "BEFORE UPDATE ON public.eventos_aluno" in sql
    assert "BEFORE UPDATE OF valor, tipo ON public.eventos_aluno" not in sql
    # E a migracao aborta se isso deixar de valer.
    assert "nao cobre todas as colunas: classe_id ficaria gravavel" in sql


def test_o_backfill_roda_antes_do_gatilho() -> None:
    """Com a restauracao de OLD instalada, o `SET classe_id = ...` do backfill
    seria desfeito linha por linha -- foi o que a 20260910_04 e a 20260910_06
    pegaram, cada uma no seu ramo."""
    sql = _sql()

    backfill = sql.index("SET classe_id = public.fn_eventos_aluno_resolve_classe_id")
    gatilho = sql.index("NEW.classe_id := OLD.classe_id;")
    assert backfill < gatilho


def test_o_after_de_conquistas_fica_desligado_no_backfill() -> None:
    """Reavaliar 27 conquistas por linha em ~400 eventos a troco de nada:
    preencher `classe_id` nao muda metrica que conquista alguma leia."""
    sql = _sql()

    assert "DISABLE TRIGGER trg_eventos_aluno_after_upd" in sql
    assert "ENABLE TRIGGER trg_eventos_aluno_after_upd" in sql
    assert sql.index("DISABLE TRIGGER") < sql.index("ENABLE TRIGGER")


def test_a_view_le_a_coluna_em_vez_de_cacar_a_tabela() -> None:
    """Saem a CTE de normalizacao, a extracao de id, a deducao de entidade e
    cinco LEFT JOINs; entra uma coluna."""
    sql = _sql()

    assert "COALESCE(e.classe_id, ca_conq.classe_id) AS classe_id" in sql
    assert "referencias_normalizadas" not in sql
    assert "e.entidade = 'atividade'" not in sql
    assert "LEFT JOIN atividades" not in sql
    assert "LEFT JOIN conteudos" not in sql


def test_o_premio_de_conquista_continua_sem_classe_fixa() -> None:
    """`conquistas.escopo` e `comum` ou `perfil`: o premio vale em todas as
    classes do aluno, entao a coluna fica nula e a view espalha."""
    sql = _sql()

    assert "LEFT JOIN classe_aluno ca_conq" in sql
    assert "ON e.classe_id IS NULL" in sql
    assert "'conquista:'" in sql
    assert "premio de conquista com classe fixa: " in sql


def test_a_fk_nao_apaga_evento() -> None:
    """Classe apagada nao tem rank, entao perder a atribuicao ali nao custa
    nada -- apagar o evento custaria."""
    sql = _sql()

    assert "REFERENCES public.classe (id) ON DELETE SET NULL" in sql
    assert "ON DELETE CASCADE" not in sql


def test_o_indice_paga_a_desnormalizacao() -> None:
    """A view agrupa por (aluno, classe)."""
    assert (
        "CREATE INDEX IF NOT EXISTS eventos_aluno_classe_aluno_idx\n"
        "  ON public.eventos_aluno (classe_id, aluno_id);" in _sql()
    )


def test_a_orfa_passa_a_ser_leitura_de_coluna() -> None:
    """No UPDATE le a classe CONGELADA: conteudo apagado depois nao tira os
    pontos de ninguem, que e o objetivo inteiro desta migracao."""
    sql = _sql()

    assert "AND NEW.classe_id IS NULL THEN" in sql
    # A consulta por linha sai do caminho quente.
    assert (
        "public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia) IS NULL"
        not in sql
    )


def test_a_migracao_confere_o_que_pode_ter_quebrado() -> None:
    sql = _sql()

    assert "classe_id divergente da referencia em " in sql
    assert "evento sem classe ainda pagando: " in sql


def test_o_downgrade_solta_a_coluna_antes_de_derruba_la() -> None:
    """A view referencia `classe_id`: enquanto referenciar, o DROP COLUMN falha
    por dependencia."""
    rendered = _sql_downgrade()

    view = rendered.index("CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas")
    drop = rendered.index("DROP COLUMN IF EXISTS classe_id")
    assert view < drop
    # E a view de volta nao usa a coluna.
    assert "e.classe_id" not in rendered[view:drop]


def test_o_downgrade_devolve_a_deducao_pela_referencia() -> None:
    rendered = _sql_downgrade()

    assert "fn_eventos_aluno_resolve_classe_id(e.tipo, e.referencia)" in rendered
    assert "BEFORE UPDATE OF valor, tipo ON public.eventos_aluno" in rendered
    assert "DROP CONSTRAINT IF EXISTS eventos_aluno_classe_id_fkey" in rendered


def test_o_sql_nao_carrega_porcentagem() -> None:
    assert "%" not in _sql()
    assert "%" not in _sql_downgrade()
