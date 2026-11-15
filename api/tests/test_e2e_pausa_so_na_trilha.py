"""`20261115_02`: a pausa saudável conta o tempo na trilha e só sai com o aluno lá dentro.

Mesmo banco do e2e da `20261105_05` (motor v2 com os controles do aluno), com a `20261115_02` por
cima. O heartbeat é chamado como o PostgREST chamaria: `SET ROLE authenticated` com o `sub` do JWT.
`net.http_post` é o dublê da `_18`: cada push vira uma linha em `net.posts`. Dados sintéticos.

Limiar da pausa: `tempo_uso_limiar_min` = 25 min (1.500 s).
"""

from __future__ import annotations

from sqlalchemy import text

from tests import _f5_banco as f5
from tests import test_e2e_notificacao_por_perfil_e_foco as p
from tests import test_e2e_notificacoes_v2_controles as ctl
from tests import test_e2e_notificacoes_v2_motor as v2

M = f5.modulo("20261115_02_pausa_so_na_trilha.py")
A = p.A
LIMIAR = 25 * 60


def _banco_sem():
    return ctl._banco()


def _banco():
    return f5.banco(
        *p.h._motor(),
        *f5.sql_de(p.M01),
        p.ANTES,
        p.RETENCAO,
        p.M_LIMITE.TABELA_CONFIG,
        p.M_LIMITE.FUNCAO_LIMITE,
        *f5.sql_de(p.M),
        *f5.sql_de(v2.g.M),
        *f5.sql_de(v2.fala.M),
        *f5.sql_de(v2.M),
        *f5.sql_de(ctl.M),
        *f5.sql_de(ctl.M06),
        *f5.sql_de(M),
    )


def _preparar(c) -> None:
    p._semear(c)
    c.execute("SELECT public.notificacoes_garantir_rotinas(%s, 'UTC')", (A,))


def _batida(c, segundos: int, *, trilha: int, na_trilha: bool) -> dict:
    return ctl._rpc(
        c,
        A,
        "SELECT public.notificacoes_heartbeat(p_segundos => %s, p_timezone => 'UTC',"
        " p_segundos_trilha => %s, p_na_trilha => %s)",
        (segundos, trilha, na_trilha),
    )


def _batida_do_app_antigo(c, segundos: int) -> dict:
    return ctl._rpc(c, A, "SELECT public.notificacoes_heartbeat(%s, 'UTC', NULL)", (segundos,))


def _pausas_entregues(c) -> int:
    return c.execute(
        "SELECT count(*) FROM public.notificacoes WHERE aluno_id = %s AND tipo = 'pausa_saudavel'", (A,)
    ).fetchone()[0]


def _pausa_na_fila(c):
    return c.execute(
        "SELECT status, gatilho, horario > now() AS adiada, contexto->>'adiada_por',"
        " expira_em - now() AS validade, ultimo_erro"
        " FROM public.notificacoes_pendentes WHERE aluno_id = %s AND tipo = 'pausa_saudavel'",
        (A,),
    ).fetchone()


def _varrer(c) -> None:
    c.execute("SELECT public.notificacoes_varrer()")


# --------------------------------------------------------------------------- estrutura


def test_estrutura_da_migration() -> None:
    assert M.down_revision == "20261115_01"
    sql = "\n".join(f5.sql_de(M))
    assert "DROP FUNCTION IF EXISTS public.notificacoes_heartbeat(integer, text, bigint);" in sql
    assert "p_na_trilha boolean DEFAULT NULL" in sql
    assert "FROM PUBLIC, anon" in sql
    assert "TO authenticated" in sql


def test_nenhum_trecho_vira_parametro_de_bind() -> None:
    # `op.execute` passa o texto por `text()`: `:palavra` viraria bind e quebraria a migração.
    for fn in ("upgrade", "downgrade"):
        for bloco in f5.sql_de(M, fn):
            assert text(bloco).compile().params == {}, bloco[:120]


# --------------------------------------------------------------------------- onde a pausa sai


@f5.e2e
def test_muito_tempo_no_app_fora_da_trilha_nao_pede_pausa():
    with _banco() as c:
        _preparar(c)
        _batida(c, 1800, trilha=0, na_trilha=False)
        r = _batida(c, 1800, trilha=0, na_trilha=False)
        fila, entregues = _pausa_na_fila(c), _pausas_entregues(c)
    assert r["tempo_uso_seg"] == 3600 and r["tempo_trilha_seg"] == 0
    assert fila is None and entregues == 0


@f5.e2e
def test_tempo_fora_da_trilha_nao_conta_e_a_pausa_sai_na_trilha_ao_bater_o_limiar():
    with _banco() as c:
        _preparar(c)
        _batida(c, 3600, trilha=0, na_trilha=False)  # 1 h no ranking
        _batida(c, 600, trilha=600, na_trilha=True)  # 10 min de trilha: ainda não
        antes = _pausas_entregues(c)
        r = _batida(c, LIMIAR - 600, trilha=LIMIAR - 600, na_trilha=True)
        depois, posts = _pausas_entregues(c), v2._posts(c)
    assert antes == 0
    assert r["tempo_trilha_seg"] == LIMIAR and r["entregues"] == 1
    assert depois == 1 and posts == 1


@f5.e2e
def test_tempo_na_trilha_nunca_passa_do_tempo_da_batida():
    with _banco() as c:
        _preparar(c)
        r = _batida(c, 60, trilha=3600, na_trilha=True)
    assert r["tempo_trilha_seg"] == 60


@f5.e2e
def test_quem_ja_saiu_da_trilha_so_recebe_a_pausa_quando_voltar():
    with _banco() as c:
        _preparar(c)
        _batida(c, LIMIAR - 60, trilha=LIMIAR - 60, na_trilha=True)
        # O último minuto de trilha chega na batida de quem já saiu: cruza o limiar lá fora.
        _batida(c, 60, trilha=60, na_trilha=False)
        fora = (_pausa_na_fila(c), _pausas_entregues(c))
        _batida(c, 60, trilha=60, na_trilha=True)
        dentro = _pausas_entregues(c)
    assert fora == (None, 0)
    assert dentro == 1


@f5.e2e
def test_app_antigo_sem_saber_onde_o_aluno_esta_nao_recebe_pausa():
    with _banco() as c:
        _preparar(c)
        _batida_do_app_antigo(c, 1800)
        r = _batida_do_app_antigo(c, 1800)
        fila, entregues = _pausa_na_fila(c), _pausas_entregues(c)
    # A chamada de 3 argumentos do app antigo continua resolvendo, e o tempo de uso conta.
    assert r["tempo_uso_seg"] == 3600 and r["tempo_trilha_seg"] == 0
    assert fila is None and entregues == 0


@f5.e2e
def test_outros_avisos_continuam_saindo_na_batida_fora_da_trilha():
    with _banco() as c:
        _preparar(c)
        v2._evento(c, A, "missao_nova")
        r = _batida(c, 60, trilha=0, na_trilha=False)
    assert r["entregues"] == 1


# --------------------------------------------------------------------------- adiamento e foco


@f5.e2e
def test_pausa_adiada_continua_esperando_a_trilha_e_a_varredura_nao_a_entrega():
    with _banco() as c:
        _preparar(c)
        v2._push_passado(c, A, "missao_nova", minutos_atras=5)  # intervalo global: 30 min
        _batida(c, LIMIAR, trilha=LIMIAR, na_trilha=True)
        adiada = _pausa_na_fila(c)
        _varrer(c)
        # O intervalo venceu: o push anterior ficou para trás e a pausa ficou pronta.
        c.execute(
            "UPDATE public.notificacoes SET horario_envio = now() - interval '40 minutes' WHERE aluno_id = %s",
            (A,),
        )
        c.execute(
            "UPDATE public.notificacoes_pendentes SET horario = now() - interval '1 minute'"
            " WHERE aluno_id = %s AND tipo = 'pausa_saudavel'",
            (A,),
        )
        _varrer(c)  # antes desta migração, a varredura a entregava aqui
        _batida(c, 60, trilha=0, na_trilha=False)
        fora = _pausas_entregues(c)
        _batida(c, 60, trilha=60, na_trilha=True)
        dentro = _pausas_entregues(c)
    status, gatilho, no_futuro, adiada_por, _, _ = adiada
    assert (status, gatilho, no_futuro, adiada_por) == ("pendente", "tempo_uso", True, "intervalo")
    assert fora == 0
    assert dentro == 1


@f5.e2e
def test_adiamento_antes_do_horario_nao_entrega_nem_na_trilha():
    with _banco() as c:
        _preparar(c)
        v2._push_passado(c, A, "missao_nova", minutos_atras=5)
        _batida(c, LIMIAR, trilha=LIMIAR, na_trilha=True)
        _batida(c, 60, trilha=60, na_trilha=True)
        entregues = _pausas_entregues(c)
    assert entregues == 0


@f5.e2e
def test_em_foco_a_pausa_nao_vira_fim_foco_e_a_saida_do_foco_nao_a_solta_fora_da_trilha():
    with _banco() as c:
        _preparar(c)
        ctl._rpc(c, A, "SELECT public.notificacoes_iniciar_foco(25)")
        _batida(c, LIMIAR, trilha=LIMIAR, na_trilha=True)
        em_foco = (_pausa_na_fila(c), _pausas_entregues(c))
        ctl._rpc(c, A, "SELECT public.notificacoes_encerrar_foco()")
        _varrer(c)
        depois_do_foco = _pausas_entregues(c)
        _batida(c, 60, trilha=60, na_trilha=True)
        na_trilha = _pausas_entregues(c)
    status, gatilho, _, _, validade, _ = em_foco[0]
    assert (status, gatilho, em_foco[1]) == ("pendente", "tempo_uso", 0)
    # Vale `tempo_uso_expiracao_min` (120 min), não as 48 h padrão.
    assert 119 * 60 < validade.total_seconds() <= 120 * 60
    assert depois_do_foco == 0
    assert na_trilha == 1


# --------------------------------------------------------------------------- migração


@f5.e2e
def test_migracao_expira_a_pausa_contada_pelo_tempo_no_app_e_deixa_o_resto():
    with _banco_sem() as c:
        _preparar(c)
        v2._push_passado(c, A, "missao_nova", minutos_atras=5)
        outro = v2._evento(c, A, "atividade_nova")
        _batida_do_app_antigo(c, LIMIAR)  # 25 min de app: a regra antiga enfileira a pausa
        antes = _pausa_na_fila(c)
        for sql in f5.sql_de(M):
            c.execute(sql)
        depois = _pausa_na_fila(c)
        outro_depois = v2._pendente(c, outro)[0]
    assert antes[0] == "pendente" and antes[1] == "horario"  # a regra antiga punha na varredura
    assert (depois[0], depois[5]) == ("expirada", "contada_pelo_tempo_no_app")
    assert outro_depois == "pendente"


@f5.e2e
def test_downgrade_devolve_os_corpos_de_antes():
    funcoes = (
        "public.notificacoes_entregar(uuid, text[])",
        "public.notificacoes_processar_rotinas(uuid, text, integer)",
    )

    def corpos(c):
        return [
            c.execute("SELECT prosrc FROM pg_proc WHERE oid = %s::regprocedure", (f,)).fetchone()[0] for f in funcoes
        ]

    def heartbeat(c):
        return c.execute(
            "SELECT prosrc, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname = 'notificacoes_heartbeat'"
        ).fetchall()

    with _banco_sem() as c:
        antes, hb_antes = corpos(c), heartbeat(c)
        for sql in f5.sql_de(M):
            c.execute(sql)
        meio = corpos(c)
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        depois, hb_depois = corpos(c), heartbeat(c)
        coluna = c.execute(
            "SELECT count(*) FROM information_schema.columns"
            " WHERE table_name = 'aluno_atividade_diaria' AND column_name = 'tempo_trilha_seg'"
        ).fetchone()[0]
        chave = c.execute(
            "SELECT count(*) FROM public.notificacoes_config WHERE chave = 'tempo_uso_expiracao_min'"
        ).fetchone()[0]
    assert meio != antes
    assert depois == antes
    assert [(s.strip(), a) for s, a in hb_depois] == [(s.strip(), a) for s, a in hb_antes]
    assert coluna == 0 and chave == 0
