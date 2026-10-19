from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_10:20261021_11", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_11:20261021_10", sql=True)
    return output.getvalue().replace("%%", "%")


def _sem_comentarios(sql: str) -> str:
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


def _criar(sql: str) -> str:
    """Só o corpo de `guilda_desafio_criar`."""
    i = sql.index("CREATE OR REPLACE FUNCTION public.guilda_desafio_criar")
    return sql[i : sql.index("$function$;", i)]


# --------------------------------------------------------------------------------------
# Cooperativo
# --------------------------------------------------------------------------------------
def test_cooperativo_e_nao_ter_equipe_2() -> None:
    """`formato = 'guilda' AND rival IS NULL` não servia: o duelo solo da arena tem equipe 2
    e rival nulo. E solo/dupla/turma cairiam em `sem_adversario` — ninguém venceria nunca."""
    sql = _upgrade_sql()

    assert "SELECT 1 FROM public.desafio_participantes dp" in sql
    assert "AND dp.equipe = 2" in sql
    assert ") INTO v_cooperativo;" in sql
    assert "v_cooperativo := (v_d.formato = 'guilda'" not in _sem_comentarios(sql)


def test_o_resto_do_fechamento_da_fase_8_fica_intacto() -> None:
    """O corpo é recortado do arquivo da fase 8; se algo mais mudar, é acidente."""
    sql = _upgrade_sql()

    for peca in (
        "IF v_d.consequencia <> 'treino' THEN",
        "ARRAY['desafio_derrota']",
        "ON CONFLICT DO NOTHING;",
        "'cooperativo', v_cooperativo",
    ):
        assert peca in sql, f"{peca} saiu do fechamento"
    # E continua sem checagem de sessão (a varredura por cron depende disso).
    miolo = sql[sql.index("FUNCTION public.fn_desafio_encerrar") :]
    miolo = miolo[: miolo.index("$function$;")]
    assert "auth.uid()" not in _sem_comentarios(miolo)


# --------------------------------------------------------------------------------------
# `formato` decide quem joga
# --------------------------------------------------------------------------------------
def test_os_quatro_formatos_sao_aceitos() -> None:
    sql = _upgrade_sql()

    assert "p_formato text DEFAULT 'guilda'" in sql
    for f in ("guilda", "dupla", "solo", "turma"):
        assert f"'{f}'" in sql
    assert "guilda_desafio_formato_invalido" in sql


def test_fora_do_formato_guilda_o_desafio_nasce_sem_guilda() -> None:
    """`guilda_desafios_guilda_do_formato` é `(formato = 'guilda') = (guilda_id IS NOT NULL)`:
    gravar `guilda_id` para solo/dupla/turma viola o CHECK."""
    sql = _upgrade_sql()

    assert "CASE WHEN v_formato = 'guilda' THEN p_guilda_id ELSE NULL END" in sql


def test_cada_formato_matricula_quem_deve() -> None:
    sql = _criar(_upgrade_sql())

    assert "FROM public.guilda_membros m" in sql          # guilda
    assert "FROM public.classe_aluno ca" in sql           # turma
    assert "VALUES (v_id, auth.uid(), 1, 'aceito', now()), (v_id, p_aliado, 1, 'aceito', now())" in sql  # dupla
    # solo: só quem criou
    assert "VALUES (v_id, auth.uid(), 1, 'aceito', now())" in sql


def test_todos_entram_na_equipe_1_e_aceitos() -> None:
    """Não existe fluxo de aceite no caminho vivo, e com `convidado` o fechamento automático
    da fase 8 — que conta só `aceito` — fecharia o desafio sem o parceiro."""
    sql = _criar(_upgrade_sql())

    assert "'convidado'" not in sql
    assert sql.count("1, 'aceito'") >= 4


def test_dupla_sem_aliado_e_recusada() -> None:
    """Sem aliado, `dupla` seria `solo` com outro nome."""
    sql = _upgrade_sql()

    assert "guilda_desafio_aliado_obrigatorio" in sql
    assert "guilda_desafio_aliado_invalido" in sql
    assert "guilda_desafio_aliado_fora_da_turma" in sql
    assert "public.guilda_e_colega(p_aliado, v_g.classe_id)" in sql


def test_aliado_em_formato_que_nao_usa_e_recusado() -> None:
    """Ignorar em silêncio esconderia um erro de quem chama."""
    sql = _criar(_upgrade_sql())

    i_elsif = sql.index("ELSIF p_aliado IS NOT NULL THEN")
    assert "guilda_desafio_aliado_invalido" in sql[i_elsif : i_elsif + 400]


def test_o_modo_passa_a_ser_o_da_tabela() -> None:
    """Medido: `guilda_desafios_modo_check` permite três valores e a RPC da fase 7 aceitava
    cinco. Pedir `duelo` passava a validação e estourava 23514 no INSERT, longe da causa."""
    sql = _criar(_upgrade_sql())

    assert "v_modo NOT IN ('todos', 'velocidade', 'precisao')" in sql
    assert "'duelo'" not in sql
    assert "'duplo'" not in sql


def test_o_titulo_diz_o_formato() -> None:
    sql = _upgrade_sql()

    for titulo in ("Desafio da guilda", "Desafio da turma", "Desafio em dupla", "Desafio solo"):
        assert f"'{titulo}'" in sql


def test_a_criacao_preserva_as_fases_7_8_e_9() -> None:
    sql = _criar(_upgrade_sql())

    for peca in (
        "public.fn_desafio_params_efetivos(v_dif)",          # fase 7
        "INSERT INTO public.desafio_participantes",          # fase 8
        "fn_questao_peso_dificuldade",                       # fase 9
        "ORDER BY s.preferida DESC, random()",               # fase 9
        "LIMIT 30",                                          # fase 9 (ramo normal)
    ):
        assert peca in sql, f"{peca} saiu da criação"


def test_a_assinatura_antiga_sai_antes() -> None:
    """`CREATE OR REPLACE` não troca lista de parâmetros; sem o DROP ficariam duas
    sobrecargas e a chamada do cliente passaria a ser ambígua."""
    sql = _upgrade_sql()

    i_drop = sql.index("DROP FUNCTION IF EXISTS public.guilda_desafio_criar(uuid, text, integer, text, text);")
    i_criar = sql.index("CREATE OR REPLACE FUNCTION public.guilda_desafio_criar")
    assert i_drop < i_criar


def test_so_authenticated_executa() -> None:
    sql = _upgrade_sql()

    assert (
        "REVOKE ALL ON FUNCTION public.guilda_desafio_criar(uuid, text, integer, text, text, text, uuid) FROM PUBLIC, anon;"
        in sql
    )
    assert (
        "GRANT EXECUTE ON FUNCTION public.guilda_desafio_criar(uuid, text, integer, text, text, text, uuid) TO authenticated;"
        in sql
    )


# --------------------------------------------------------------------------------------
# Downgrade
# --------------------------------------------------------------------------------------
def test_downgrade_volta_a_assinatura_e_o_cooperativo_antigo() -> None:
    sql = _downgrade_sql()

    assert "DROP FUNCTION IF EXISTS public.guilda_desafio_criar(uuid, text, integer, text, text, text, uuid);" in sql
    assert "v_cooperativo := (v_d.formato = 'guilda' AND v_d.guilda_rival_id IS NULL);" in sql
    criar = _criar(sql)
    assert "p_formato" not in criar
    assert "p_aliado" not in criar
    # E a fase 9 continua lá: o downgrade desta fase não pode desfazer a anterior.
    assert "fn_questao_peso_dificuldade" in criar
