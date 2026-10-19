from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_03:20261021_04", sql=True)
    return output.getvalue()


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_04:20261021_03", sql=True)
    return output.getvalue()


def _sem_comentarios(sql: str) -> str:
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


def _gatilho(sql: str) -> str:
    return sql[sql.index("CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud") :]


def test_o_laco_de_missao_reusa_os_agregados() -> None:
    """O comportamento do laço foi medido ao vivo; este teste cobre o LUGAR dele. Se ele
    chamasse `fn_agregados_do_aluno` por conta, voltaria o custo que a fase 3 evitou."""
    gatilho = _gatilho(_upgrade_sql())

    assert gatilho.count("public.fn_agregados_do_aluno(") == 1
    # As duas avaliações partem do mesmo `v_agregados`.
    assert gatilho.count("public.fn_avaliar_metrica(v_aluno_id, v_agregados") == 2


def test_o_laco_vem_depois_da_conquista_e_dentro_de_exception() -> None:
    """Falha de missão não pode desfazer o evento nem a conquista — padrão de
    `fn_enqueue_student_enrollment_job`."""
    gatilho = _gatilho(_upgrade_sql())

    conquista = gatilho.index("FOR v_conquista IN")
    missao = gatilho.index("FOR v_missao IN")
    assert conquista < missao, "o laço de missão tem de vir depois do de conquista"

    # O laço está dentro de um BEGIN cujo EXCEPTION avisa e segue.
    trecho = gatilho[gatilho.rindex("BEGIN", 0, missao) : gatilho.index("RETURN NEW;", missao)]
    assert "EXCEPTION WHEN OTHERS THEN" in trecho
    assert "RAISE WARNING" in trecho
    assert "avaliacao de missao do aluno" in trecho


def test_guarda_de_recursao_do_premio() -> None:
    """A guarda da conquista funciona porque `conquista_desbloqueada` casa o prefixo de
    `fn_evento_creditado`. O prêmio de missão NÃO pode casar: creditado faz
    `trg_eventos_aluno_valor_do_banco` congelar o valor, e o da missão tem de vir de
    `fn_pontos_do_evento`. Daí o sinal de sessão."""
    gatilho = _gatilho(_upgrade_sql())

    # Volta cedo quando o sinal está ligado.
    assert "COALESCE(current_setting('app.missao_premiando', true), '') = 'on'" in gatilho
    # Liga antes do INSERT do prêmio e DESLIGA depois: `set_config(..., true)` vale pela
    # transação toda, então deixá-lo ligado faria o resto da transação parar de avaliar.
    assert "set_config('app.missao_premiando', 'on', true)" in gatilho
    assert gatilho.count("set_config('app.missao_premiando', '', true)") >= 2, (
        "tem de desligar depois do INSERT e tambem no EXCEPTION"
    )
    # O prêmio não vira tipo creditado.
    assert "fn_evento_creditado(v_premio)" not in gatilho


def test_filtros_do_laco_de_missao() -> None:
    gatilho = _gatilho(_upgrade_sql())
    laco = gatilho[gatilho.index("FOR v_missao IN") : gatilho.index("END LOOP;", gatilho.index("FOR v_missao IN"))]

    assert "m.ativa" in laco
    assert "m.aprovacao = ANY (ARRAY['nao_requer'::text, 'aprovada'::text])" in laco
    assert "m.janela_inicio IS NULL OR m.janela_inicio <= now()" in laco
    assert "m.janela_fim    IS NULL OR m.janela_fim    >= now()" in laco
    assert "lower(m.perfil_alvo) IN (SELECT nome FROM representativos)" in laco
    # Já concluída não reavalia: é o que impede o prêmio duplicado.
    assert "ma.status = 'concluida'" in laco
    assert "NOT EXISTS (" in laco


def test_premio_e_idempotente_na_posse() -> None:
    gatilho = _gatilho(_upgrade_sql())

    assert "ON CONFLICT (aluno_id, missao_id) DO UPDATE" in gatilho
    assert "'missao:' || v_missao.id::text" in gatilho


def test_o_cte_de_perfil_e_repetido_nao_extraido() -> None:
    """Extraí-lo exigiria mexer na consulta de conquista, o que invalidaria a equivalência
    medida na fase 3 — por um ganho de estilo."""
    gatilho = _gatilho(_upgrade_sql())

    assert gatilho.count("WITH representativos AS (") == 2


def test_conquista_segue_intacta() -> None:
    gatilho = _gatilho(_upgrade_sql())

    assert "IF public.fn_evento_creditado(v_tipo) THEN" in gatilho
    assert "c.ativa IS NOT FALSE" in gatilho
    assert "c.classe_id IS NULL" in gatilho
    assert "IF v_premiar THEN" in gatilho
    assert "'Nova conquista desbloqueada!'" in gatilho


def test_nao_cria_nem_altera_tabela() -> None:
    """Fase 5a é só o gatilho: `missoes` e `missao_aluno` vieram da fase 2."""
    codigo = _sem_comentarios(_upgrade_sql())

    assert "CREATE TABLE" not in codigo
    assert "ALTER TABLE" not in codigo
    assert "CREATE POLICY" not in codigo


def test_downgrade_tira_o_laco_e_mantem_a_conquista() -> None:
    sql = _downgrade_sql()

    assert "CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud" in sql
    assert "FOR v_missao IN" not in sql
    assert "app.missao_premiando" not in sql
    # A conquista continua lá, e ainda usando o avaliador compartilhado da fase 3.
    assert "public.fn_avaliar_metrica(v_aluno_id, v_agregados" in sql
    assert "public.fn_agregados_do_aluno(v_aluno_id, v_classe_id)" in sql
