from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_08:20261021_09", sql=True)
    # O renderizador offline do Alembic DOBRA `%`, e esta migration tem `%ROWTYPE` em três
    # funções. O teste compara com o SQL que vai rodar, não com o renderizado.
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_09:20261021_08", sql=True)
    return output.getvalue().replace("%%", "%")


def _sem_comentarios(sql: str) -> str:
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


# --------------------------------------------------------------------------------------
# A junta 1: a criação registra quem joga
# --------------------------------------------------------------------------------------
def test_a_criacao_registra_os_participantes() -> None:
    """Medido em produção: `guilda_desafio_criar` não escrevia em `desafio_participantes`.
    Como `fn_arena_placar` lê essa tabela, o placar de todo desafio do caminho vivo era
    vazio — ninguém era pago e o painel do professor mostrava `aceitaram: 0`."""
    sql = _upgrade_sql()

    assert "INSERT INTO public.desafio_participantes" in sql
    assert "FROM public.guilda_membros m" in sql
    # Cooperativo: todos do mesmo lado, e já aceitos (quem está na guilda está no desafio).
    assert "SELECT v_id, m.aluno_id, 1, 'aceito', now()" in sql
    assert "m.left_at IS NULL" in sql


def test_a_criacao_preserva_o_que_a_fase_7_poe() -> None:
    """A migration reescreve a função inteira; os eixos e os params da fase 7 têm de ficar."""
    sql = _upgrade_sql()

    for peca in (
        "guilda_desafio_dificuldade_invalida",
        "guilda_desafio_consequencia_invalida",
        "public.fn_desafio_params_efetivos(v_dif)",
        "'dificuldade', v_dif, 'consequencia', v_cons, 'params', v_params",
        "guilda_sem_questoes_liberadas",
    ):
        assert peca in sql, f"{peca} saiu da criação"


# --------------------------------------------------------------------------------------
# A junta 2: a resposta grava tempo e cobra tentativa
# --------------------------------------------------------------------------------------
def test_a_tentativa_passa_a_ser_contada() -> None:
    """A chave única é `(desafio, questao, aluno)` e o `ON CONFLICT` sobrescreve a resposta,
    então sem a coluna não havia onde cobrar `desafio_tentativas_*` da fase 1."""
    sql = _upgrade_sql()

    assert "ADD COLUMN IF NOT EXISTS tentativas integer NOT NULL DEFAULT 1" in sql
    assert "CHECK (tentativas >= 1)" in sql
    assert "tentativas = public.guilda_desafio_respostas.tentativas + 1" in sql


def test_o_limite_de_tentativa_sai_do_preset_da_dificuldade() -> None:
    sql = _upgrade_sql()

    assert "'desafio_tentativas_dificil'" in sql
    assert "'desafio_tentativas_normal'" in sql
    assert "guilda_desafio_sem_tentativas" in sql
    # Conta as tentativas JÁ feitas antes de gravar a nova, senão o limite é sempre furado
    # por um.
    assert sql.index("INTO v_feitas") < sql.index("INSERT INTO public.guilda_desafio_respostas")


def test_o_tempo_acumula_entre_tentativas() -> None:
    """Substituir premiaria a última tentativa, que é sempre a mais rápida — e `velocidade`
    desempata por tempo."""
    sql = _upgrade_sql()

    assert "tempo_ms = COALESCE(public.guilda_desafio_respostas.tempo_ms, 0)" in sql
    assert "+ GREATEST(COALESCE(EXCLUDED.tempo_ms, 0), 0)" in sql


def test_desafio_encerrado_nao_aceita_resposta() -> None:
    """Responder depois do fechamento mudaria o placar de um desafio JÁ PAGO, e o
    `ON CONFLICT DO NOTHING` do pagamento impede o acerto novo de virar prêmio."""
    sql = _upgrade_sql()

    assert "guilda_desafio_encerrado" in sql
    assert sql.index("guilda_desafio_encerrado") < sql.index("INTO v_feitas")


def test_o_tempo_nao_e_cobrado_pelo_banco() -> None:
    """Decisão registrada: sem um registro de "questão aberta em", uma guarda a partir de
    `created_at` do desafio puniria quem abre e responde depois — que é o uso normal."""
    sql = _sem_comentarios(_upgrade_sql())

    assert "desafio_tempo_seg" not in sql, "o limite de tempo é do cliente nesta fase"


# --------------------------------------------------------------------------------------
# A junta 3: o fechamento fica alcançável
# --------------------------------------------------------------------------------------
def test_o_miolo_do_fechamento_nao_checa_sessao() -> None:
    """O cron não tem `auth.uid()`: a checagem de participante levantaria
    `arena_sem_permissao` em toda varredura."""
    sql = _upgrade_sql()
    miolo = sql[sql.index("FUNCTION public.fn_desafio_encerrar(p_desafio_id uuid)") :]
    miolo = miolo[: miolo.index("REVOKE ALL ON FUNCTION public.fn_desafio_encerrar")]

    assert "auth.uid()" not in _sem_comentarios(miolo)
    assert "arena_sem_permissao" not in _sem_comentarios(miolo)
    # E o miolo é o corpo da fase 4: os eixos continuam valendo.
    assert "IF v_d.consequencia <> 'treino' THEN" in miolo
    assert "ARRAY['desafio_derrota']" in miolo


def test_a_porta_do_cliente_mantem_a_checagem() -> None:
    sql = _upgrade_sql()
    porta = sql[sql.index("FUNCTION public.arena_encerrar(p_desafio_id uuid)") :]

    assert "arena_sem_permissao" in porta
    assert "RETURN public.fn_desafio_encerrar(p_desafio_id);" in porta


def test_o_miolo_nao_e_exposto_ao_cliente() -> None:
    sql = _upgrade_sql()

    assert "REVOKE ALL ON FUNCTION public.fn_desafio_encerrar(uuid) FROM PUBLIC, anon, authenticated;" in sql
    assert (
        "REVOKE ALL ON FUNCTION public.fn_desafio_varrer_abandonados() FROM PUBLIC, anon, authenticated;" in sql
    )


def test_a_ultima_resposta_fecha() -> None:
    sql = _upgrade_sql()

    assert "IF v_total > 0 AND v_faltam = 0 THEN" in sql
    assert "v_fechou := public.fn_desafio_encerrar(p_desafio_id);" in sql
    # O que falta é o par (participante aceito × questão), não só "respondi todas as minhas".
    assert "CROSS JOIN public.guilda_desafio_questoes dq" in sql
    assert "dp.estado = 'aceito'" in sql


def test_a_varredura_existe_porque_desistencia_travaria_o_pagamento() -> None:
    """O fechamento automático exige que TODOS tenham respondido: um participante que desiste
    deixaria os outros sem pagamento para sempre."""
    sql = _upgrade_sql()

    assert "cron.schedule('trailup_desafio_varredura', '*/5 * * * *'" in sql
    assert "cron.unschedule('trailup_desafio_varredura')" in sql
    assert "'desafio_encerra_apos_min'" in sql
    assert "make_interval(mins => GREATEST(v_min, 1))" in sql


def test_a_varredura_nao_para_no_primeiro_erro_nem_vira_transacao_gigante() -> None:
    sql = _upgrade_sql()
    varredura = sql[sql.index("FUNCTION public.fn_desafio_varrer_abandonados()") :]
    varredura = varredura[: varredura.index("REVOKE ALL ON FUNCTION public.fn_desafio_varrer")]

    assert "EXCEPTION WHEN OTHERS THEN" in varredura
    assert "RAISE WARNING" in varredura
    assert "LIMIT 200" in varredura


def test_a_chave_de_varredura_nasce_privada() -> None:
    sql = _upgrade_sql()

    bloco = sql[sql.index("INSERT INTO public.app_config") :]
    bloco = bloco[: bloco.index("ON CONFLICT")]
    assert "'desafio_encerra_apos_min'" in bloco
    assert "true)" not in bloco


# --------------------------------------------------------------------------------------
# Downgrade
# --------------------------------------------------------------------------------------
def test_downgrade_restaura_arena_encerrar_antes_de_tirar_o_miolo() -> None:
    """Entre as duas operações a porta do cliente apontaria para função que já não existe."""
    sql = _downgrade_sql()

    i_arena = sql.index("CREATE OR REPLACE FUNCTION public.arena_encerrar(p_desafio_id uuid)")
    i_drop = sql.index("DROP FUNCTION IF EXISTS public.fn_desafio_encerrar(uuid)")
    assert i_arena < i_drop


def test_downgrade_devolve_o_arena_encerrar_da_fase_4_com_a_checagem() -> None:
    """O corpo é recortado do arquivo da fase 4, não copiado à mão: cópia seria uma segunda
    fonte da verdade que envelhece em silêncio."""
    sql = _downgrade_sql()
    arena = sql[sql.index("CREATE OR REPLACE FUNCTION public.arena_encerrar(p_desafio_id uuid)") :]

    assert "arena_sem_permissao" in arena
    assert "IF v_d.consequencia <> 'treino' THEN" in arena


def test_downgrade_tira_a_coluna_e_desagenda() -> None:
    sql = _downgrade_sql()

    assert "cron.unschedule('trailup_desafio_varredura')" in sql
    assert "DROP COLUMN IF EXISTS tentativas" in sql
    assert "DROP FUNCTION IF EXISTS public.guilda_desafio_responder(uuid, bigint, text, integer)" in sql
    assert "DELETE FROM public.app_config WHERE chave = 'desafio_encerra_apos_min'" in sql
