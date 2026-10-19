from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_04:20261021_05", sql=True)
    # O renderizador offline do Alembic DOBRA `%`, então `% jsonb_array_length` sai como
    # `%% jsonb_array_length`. O teste compara com o SQL que vai rodar, não com o renderizado,
    # então desfaz o escape. (Esta migration usa `%` em módulo e em regexp_replace.)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_05:20261021_04", sql=True)
    return output.getvalue().replace("%%", "%")


def _sem_comentarios(sql: str) -> str:
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


def test_as_metricas_novas_sao_de_delta() -> None:
    """As 12 métricas existentes são acumuladas (`minutos_totais` é soma de toda a vida), então
    missão diária sobre elas nasce cumprida para aluno ativo. Estas duas contam só o dia."""
    sql = _upgrade_sql()

    assert "'minutos_no_dia'" in sql
    assert "'eventos_no_dia'" in sql
    assert "FROM public.aluno_atividade_diaria d" in sql


def test_nenhum_ramo_existente_mudou() -> None:
    """A migration substitui `fn_avaliar_metrica` inteira; os 11 ramos da fase 3 têm de
    continuar lá, com os mesmos COALESCE e a mesma sentinela."""
    sql = _upgrade_sql()

    for m in (
        "eventos_totais",
        "eventos_do_tipo",
        "atividades_concluidas",
        "topicos_concluidos",
        "topicos_visitados",
        "dias_seguidos",
        "minutos_totais",
        "acertos_percentual",
        "trilha_percentual",
        "atividade_rapida",
        "atividades_rapidas",
        "atividade_especifica",
    ):
        assert f"'{m}'" in sql, f"{m} saiu do avaliador"
    # A sentinela de `atividade_rapida` e o `COALESCE` dela.
    assert "999999" in sql


def test_a_conversao_de_fuso_esta_na_ordem_certa() -> None:
    """`criado_em` é `timestamp without time zone` gravado por now() em sessão UTC. Inverter a
    ordem desliza o dia em três horas."""
    sql = _upgrade_sql()

    assert "e.criado_em AT TIME ZONE 'UTC'" in sql
    assert "AT TIME ZONE COALESCE(NULLIF(p_criterio ->> 'fuso', ''), 'America/Sao_Paulo')" in sql
    # Pelo NOME do fuso, nunca por offset fixo — para sobreviver à volta do horário de verão.
    assert "'-03'" not in sql
    assert "interval '-3" not in sql


def test_o_gerador_e_idempotente_pelo_indice_parcial() -> None:
    """O CLAUDE.md avisa: `ON CONFLICT` sobre índice PARCIAL exige repetir o predicado, senão o
    Postgres não casa o índice e levanta "no unique or exclusion constraint matching"."""
    sql = _upgrade_sql()

    assert "ON CONFLICT (classe_id, coalesce(perfil_alvo, ''), dia, slot) WHERE dia IS NOT NULL" in sql
    assert "DO NOTHING" in sql


def test_a_escolha_do_molde_e_deterministica_e_sem_repetir() -> None:
    """`random()` quebraria a idempotência. E o passo de 1 a partir de um offset da coorte
    garante moldes distintos — módulo independente por slot podia repetir, e o spec pede para
    não repetir métrica no mesmo dia."""
    sql = _upgrade_sql()
    codigo = _sem_comentarios(sql)

    assert "random()" not in codigo
    assert "hashtext(" in codigo
    assert "v_moldes -> ((v_base + v_i) % jsonb_array_length(v_moldes))" in codigo


def test_a_janela_fecha_no_dia() -> None:
    """Sem janela, o laço da fase 5a avaliaria a missão de ontem para sempre: o filtro dele é
    `janela_fim >= now()`."""
    sql = _upgrade_sql()

    assert "v_inicio" in sql and "v_fim" in sql
    assert "janela_inicio, janela_fim" in sql
    assert "AT TIME ZONE v_fuso" in sql


def test_a_diaria_nao_pede_aprovacao() -> None:
    """Aprovação é só para `escopo = 'guilda'`. Se a diária individual precisasse, o desenho de
    meia-noite cairia por depender de alguém acordado às 3h UTC."""
    sql = _upgrade_sql()

    assert "'nao_requer'" in sql
    assert "'sistema', 'aluno'" in sql


def test_cron_a_meia_noite_de_brasilia() -> None:
    sql = _upgrade_sql()

    assert "cron.schedule('trailup_missao_diaria', '0 3 * * *'" in sql
    # Desagenda antes, para reaplicar não duplicar o job.
    assert "cron.unschedule('trailup_missao_diaria')" in sql


def test_config_nasce_privada() -> None:
    sql = _upgrade_sql()

    for chave in (
        "missao_diaria_min",
        "missao_diaria_max",
        "missao_diaria_minutos",
        "missao_diaria_acoes",
        "missao_diaria_atividades",
        "missao_diaria_conteudos",
    ):
        assert f"'{chave}'" in sql
    bloco = sql[sql.index("INSERT INTO public.app_config") :]
    bloco = bloco[: bloco.index("ON CONFLICT")]
    assert "true)" not in bloco, "nenhuma chave de missão diária é pública"


def test_nada_exposto_ao_cliente() -> None:
    sql = _upgrade_sql()

    assert "REVOKE ALL ON FUNCTION public.fn_missao_diaria_gerar(date) FROM PUBLIC, anon, authenticated;" in sql
    assert "REVOKE ALL ON FUNCTION public.fn_app_config_int(text, integer) FROM PUBLIC, anon, authenticated;" in sql
    assert "GRANT EXECUTE" not in sql


def test_downgrade_desagenda_e_limpa() -> None:
    sql = _downgrade_sql()

    assert "cron.unschedule('trailup_missao_diaria')" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_missao_diaria_gerar(date)" in sql
    assert "DELETE FROM public.app_config WHERE chave IN (" in sql


def _guarda_do_upgrade(sql: str) -> str:
    inicio = sql.index("CREATE OR REPLACE FUNCTION public.fn_missoes_guarda()")
    return sql[inicio : sql.index("REVOKE ALL ON FUNCTION public.fn_missoes_guarda()", inicio)]


def _guarda_da_fase_2() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_01:20261021_02", sql=True)
    return _guarda_do_upgrade(output.getvalue().replace("%%", "%"))


def test_a_guarda_aceita_as_metricas_de_delta() -> None:
    """Medido na cadeia inteira em transação abortada: sem isto o primeiro INSERT do gerador
    levantava `Metrica nao suportada: minutos_no_dia` e o cron das 0h não gravava nada."""
    guarda = _guarda_do_upgrade(_upgrade_sql())

    assert "IF v_metrica NOT IN ('atividade_especifica', 'minutos_no_dia', 'eventos_no_dia')" in guarda
    assert "criterio.dia e obrigatorio em %." in guarda
    # A guarda é recriada ANTES do gerador existir e rodar.
    sql = _upgrade_sql()
    assert sql.index("CREATE OR REPLACE FUNCTION public.fn_missoes_guarda()") < sql.index(
        "CREATE OR REPLACE FUNCTION public.fn_missao_diaria_gerar"
    )


def test_a_guarda_so_mudou_na_checagem_de_metrica() -> None:
    """Fora da checagem de métrica e da exigência de `dia`, o corpo é o da fase 2 — nenhum
    congelamento (`NEW.x := OLD.x`) saiu."""
    antiga = _guarda_da_fase_2()
    nova = _guarda_do_upgrade(_upgrade_sql())

    linhas_antigas = [linha for linha in antiga.splitlines() if linha.strip()]
    removidas = [linha for linha in linhas_antigas if linha not in nova.splitlines()]
    assert removidas == ["  IF v_metrica <> 'atividade_especifica'"]


def test_downgrade_devolve_a_guarda_da_fase_2() -> None:
    sql = _downgrade_sql()

    assert _guarda_da_fase_2().strip() in sql
    assert "'minutos_no_dia', 'eventos_no_dia')" not in sql
