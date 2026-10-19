from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_09:20261021_10", sql=True)
    # O renderizador offline do Alembic DOBRA `%` (`%ROWTYPE` em `guilda_desafio_criar`).
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_10:20261021_09", sql=True)
    return output.getvalue().replace("%%", "%")


def _sem_comentarios(sql: str) -> str:
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


def test_nao_marcada_e_null_nao_media() -> None:
    """Um default `'media'` afirmaria uma dificuldade que ninguém informou — e toda questão
    gerada por IA antes de a IA aprender o campo passaria a mentir que foi avaliada."""
    sql = _upgrade_sql()

    assert "ADD COLUMN IF NOT EXISTS dificuldade text;" in sql
    assert "DEFAULT 'media'" not in sql
    assert "dificuldade IS NULL OR dificuldade = ANY" in sql


def test_os_tres_niveis_e_so_eles() -> None:
    sql = _upgrade_sql()
    check = sql[sql.index("questoes_dificuldade_check\nCHECK") if False else sql.index("ADD CONSTRAINT questoes_dificuldade_check") :]
    check = check[: check.index(";")]

    for nivel in ("facil", "media", "dificil"):
        assert f"'{nivel}'::text" in check


def test_nao_marcada_pesa_o_MEIO_nao_zero() -> None:
    """Mandar o não-marcado para o fim da fila faria o desafio difícil de um banco sem
    anotação preferir justamente as fáceis marcadas."""
    sql = _upgrade_sql()
    peso = sql[sql.index("FUNCTION public.fn_questao_peso_dificuldade") :]
    peso = peso[: peso.index("$function$;")]

    # NULL cai em 'media' antes do CASE, e nível desconhecido cai no ELSE — os dois no meio.
    assert "'media')" in peso
    assert "ELSE 2" in peso
    assert "WHEN 'dificil' THEN 3" in peso
    assert "WHEN 'facil'   THEN 1" in peso


def test_e_preferencia_nao_filtro() -> None:
    """Filtro deixaria o modo difícil inutilizável até o banco estar anotado — e em silêncio,
    porque `guilda_sem_questoes_liberadas` fala de liberação, não de dificuldade."""
    sql = _upgrade_sql()
    codigo = _sem_comentarios(sql)

    # A dificuldade entra na ORDEM, nunca num WHERE.
    assert "ORDER BY s.preferida DESC, random()" in codigo
    assert "WHERE" in codigo
    for proibido in (
        "AND q.dificuldade =",
        "AND q.dificuldade IN",
        "WHERE q.dificuldade",
        "fn_questao_peso_dificuldade(q.dificuldade) >=\n           WHERE",
    ):
        assert proibido not in codigo, f"dificuldade virou filtro: {proibido}"


def test_o_grupo_preferido_continua_sorteado() -> None:
    """Sem o `random()` dentro do grupo, o mesmo desafio sairia toda vez."""
    sql = _upgrade_sql()

    assert "ORDER BY s.preferida DESC, random()" in sql


def test_so_o_dificil_paga_o_custo_de_ver_a_turma_inteira() -> None:
    """Com o `LIMIT 30` antes da ordenação a preferência olharia 30 questões arbitrárias; sem
    ele, `fn_questao_liberada` roda para toda questão da turma. Normal fica como está."""
    sql = _upgrade_sql()

    assert "IF v_dif = 'dificil' THEN" in sql
    bloco = sql[sql.index("IF v_dif = 'dificil' THEN") :]
    dificil, normal = bloco.split("ELSE", 1)
    normal = normal[: normal.index("END IF;")]

    assert "LIMIT 30" not in dificil, "o difícil não pode limitar antes de ordenar"
    assert "LIMIT 30" in normal, "o normal tem de manter o caminho de hoje"
    assert "preferida" not in normal


def test_a_chave_nasce_privada() -> None:
    sql = _upgrade_sql()

    bloco = sql[sql.index("INSERT INTO public.app_config") :]
    bloco = bloco[: bloco.index("ON CONFLICT")]
    assert "'desafio_dificuldade_min'" in bloco
    assert "true)" not in bloco


def test_a_criacao_preserva_as_fases_7_e_8() -> None:
    """A migration reescreve a função inteira: os eixos (7) e o registro de participantes (8)
    têm de continuar lá, senão esta fase desfaz as duas."""
    sql = _upgrade_sql()

    for peca in (
        "INSERT INTO public.desafio_participantes",
        "SELECT v_id, m.aluno_id, 1, 'aceito', now()",
        "public.fn_desafio_params_efetivos(v_dif)",
        "guilda_desafio_dificuldade_invalida",
        "guilda_desafio_consequencia_invalida",
        "'jogadores', v_jogadores",
    ):
        assert peca in sql, f"{peca} saiu da criação"


def test_downgrade_troca_a_selecao_antes_de_tirar_a_coluna() -> None:
    """Na ordem inversa a função ficaria um instante consultando coluna que já não existe."""
    sql = _downgrade_sql()

    i_criar = sql.index("CREATE OR REPLACE FUNCTION public.guilda_desafio_criar")
    i_drop = sql.index("DROP COLUMN IF EXISTS dificuldade")
    assert i_criar < i_drop
    # E a versão restaurada não cita a coluna nem a função de peso. O recorte para no fim do
    # CORPO: entre ele e o DROP COLUMN está o `DROP FUNCTION ... peso_dificuldade`, que
    # mencionaria o nome sem a função usá-lo.
    corpo = sql[i_criar : sql.index("$function$;", i_criar)]
    assert "preferida" not in corpo
    assert "fn_questao_peso_dificuldade" not in corpo
    assert "LIMIT 30" in corpo


def test_downgrade_tira_tudo() -> None:
    sql = _downgrade_sql()

    assert "DROP FUNCTION IF EXISTS public.fn_questao_peso_dificuldade(text)" in sql
    assert "DELETE FROM public.app_config WHERE chave = 'desafio_dificuldade_min'" in sql
    assert "DROP CONSTRAINT IF EXISTS questoes_dificuldade_check" in sql
