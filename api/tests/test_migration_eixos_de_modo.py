from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261020_06:20261021_01", sql=True)
    return output.getvalue()


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_01:20261020_06", sql=True)
    return output.getvalue()


def test_os_dois_eixos_novos_entram_com_check() -> None:
    sql = _upgrade_sql()

    assert "ADD COLUMN IF NOT EXISTS consequencia text NOT NULL DEFAULT 'ranqueada'" in sql
    assert "ADD COLUMN IF NOT EXISTS dificuldade  text NOT NULL DEFAULT 'normal'" in sql
    assert "CHECK (consequencia = ANY (ARRAY['treino'::text, 'ranqueada'::text, 'evento'::text]))" in sql
    assert "CHECK (dificuldade = ANY (ARRAY['normal'::text, 'dificil'::text]))" in sql


def test_default_de_consequencia_preserva_a_arena_que_ja_pontua() -> None:
    """Medido no banco: `arena_encerrar` escreve `desafio_vencido`/`_empate`/`_participou` em
    `eventos_aluno`, e os tres valem 12/6/3 pontos em `eventos_pontuacao`. Com default
    `treino`, a fase 4 desligaria a pontuacao de todo desafio existente em silencio."""
    sql = _upgrade_sql()

    assert "consequencia text NOT NULL DEFAULT 'ranqueada'" in sql
    assert "DEFAULT 'treino'" not in sql


def _constraints_alteradas(sql: str) -> set[str]:
    """Nomes de constraint que a migration realmente DROPa ou ADDa. Menção em comentário ou
    em `COMMENT ON` não conta — a primeira versão deste teste confundia as duas coisas."""
    import re

    return set(re.findall(r"(?:DROP|ADD) CONSTRAINT(?: IF EXISTS)? ([a-z_]+)", sql))


def test_formato_ganha_turma_sem_tocar_as_outras_constraints() -> None:
    """`guilda_desafios_guilda_do_formato` ja exige guilda_id nulo fora de 'guilda', e
    `_rival_check` ja restringe rival a 'guilda'. As duas dao a coerencia de 'turma' de graca
    — mexer nelas aqui seria risco sem ganho."""
    sql = _upgrade_sql()

    assert "CHECK (formato = ANY (ARRAY['guilda'::text, 'dupla'::text, 'solo'::text, 'turma'::text]))" in sql
    assert _constraints_alteradas(sql) == {
        "guilda_desafios_consequencia_check",
        "guilda_desafios_dificuldade_check",
        "guilda_desafios_formato_check",
    }


def test_dificuldade_nao_virou_valor_de_modo() -> None:
    """O eixo `modo` (como se pontua) nao muda: existe dificil-por-velocidade e
    dificil-por-precisao, e achatar os dois tornaria essas combinacoes inexpressaveis."""
    sql = _upgrade_sql()

    assert "guilda_desafios_modo_check" not in sql
    assert "'velocidade'" not in sql
    assert "'precisao'" not in sql


def test_config_nasce_privada() -> None:
    """`app_config_sel` e `USING (publico)` para anon E authenticated, entao marcar publico
    abriria o parametro para quem nao fez login. O cliente recebe os valores pela RPC."""
    sql = _upgrade_sql()

    for chave in (
        "desafio_tempo_seg_normal",
        "desafio_tempo_seg_dificil",
        "desafio_tentativas_normal",
        "desafio_tentativas_dificil",
        "desafio_aposta_fator_normal",
        "desafio_aposta_fator_dificil",
    ):
        assert f"'{chave}'" in sql
    assert "true)" not in sql[sql.index("INSERT INTO public.app_config") :]
    assert "ON CONFLICT (chave) DO NOTHING" in sql


def test_dificuldade_min_fica_para_depois() -> None:
    """Ela pressupoe marcacao de dificuldade em `questoes`, que nao existe. A decisao entre
    coluna nova e proxy (questao que a turma mais errou) esta aberta."""
    sql = _upgrade_sql()

    assert "desafio_dificuldade_min" not in sql


def test_nao_mexe_nas_rpcs_da_arena() -> None:
    """Fase 1 e so schema. As RPCs inserem sem citar as colunas novas, entao os defaults valem
    e o comportamento nao muda. O `COMMENT ON COLUMN` menciona `arena_encerrar` de proposito,
    para registrar por que o default e `ranqueada` — mencao nao e alteracao."""
    sql = _upgrade_sql()

    assert "CREATE OR REPLACE FUNCTION" not in sql
    assert "DROP FUNCTION" not in sql
    assert "GRANT EXECUTE" not in sql
    assert "REVOKE" not in sql


def test_downgrade_desfaz_tudo() -> None:
    sql = _downgrade_sql()

    assert "DROP COLUMN IF EXISTS consequencia" in sql
    assert "DROP COLUMN IF EXISTS dificuldade" in sql
    assert "CHECK (formato = ANY (ARRAY['guilda'::text, 'dupla'::text, 'solo'::text]))" in sql
    assert "'turma'" not in sql
    assert "DELETE FROM public.app_config WHERE chave IN (" in sql
