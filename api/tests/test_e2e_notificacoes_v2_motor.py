"""`20261105_04`: o motor ganha categorias, orçamento, intervalos, prioridade pelo perfil e intensidade.

Mesmo banco do e2e da `20261103_12` (motor da `_01`, matriz e foco da `_18`, guarda da `_24`, texto do
perfil da `_12`), com a `20261105_04` por cima. `net.http_post` é o dublê da `_18`: cada push vira uma
linha em `net.posts`. Dados sintéticos.

Alunos da `_semear` da `_18`: A é Socializer (90) com Mastermind (40); B é Socializer (70) com
Conqueror (20); C é Conqueror (85) com Socializer (10). Todos com aparelho e sem janela de silêncio.
"""

from __future__ import annotations

import json

from tests import _f5_banco as f5
from tests import test_e2e_notificacao_fala_com_o_aluno_no_perfil as fala
from tests import test_e2e_notificacao_por_perfil_e_foco as p
from tests import test_e2e_notificacao_so_com_texto_da_guarda as g

pytestmark = f5.e2e

M = f5.modulo("20261105_04_notificacoes_v2_motor.py")
A, B, C = p.A, p.B, p.C


def _banco(*, com_v2: bool = True):
    # O banco do e2e da `20261103_12`, na ordem do histórico, e a `20261105_04` por cima.
    return f5.banco(
        *p.h._motor(),
        *f5.sql_de(p.M01),
        p.ANTES,
        p.RETENCAO,
        p.M_LIMITE.TABELA_CONFIG,
        p.M_LIMITE.FUNCAO_LIMITE,
        *f5.sql_de(p.M),
        *f5.sql_de(g.M),
        *f5.sql_de(fala.M),
        *(f5.sql_de(M) if com_v2 else []),
    )


def _evento(c, aluno, tipo: str, motivo: str | None = None, expira_horas: int | None = None) -> int | None:
    return c.execute(
        "SELECT public.notificacoes_enfileirar_evento(%s, %s, %s, 't ' || %s, 'c', '{}'::jsonb, 0, %s)",
        (aluno, tipo, motivo or tipo, tipo, expira_horas),
    ).fetchone()[0]


def _entregar(c, aluno) -> int:
    return c.execute("SELECT public.notificacoes_entregar(%s, ARRAY['horario','login'])", (aluno,)).fetchone()[0]


def _push_passado(c, aluno, tipo: str, minutos_atras: int, sem_push: bool = False) -> None:
    """Um push que já saiu, para o motor contar."""
    ctx = {"sem_push": "teste"} if sem_push else {}
    c.execute(
        "INSERT INTO public.notificacoes (aluno_id, titulo, corpo, tipo, horario_envio, status, read, origem, contexto)"
        " VALUES (%s, 'x', 'x', %s, now() - make_interval(mins => %s), 'enviada', false, 'motor', %s::jsonb)",
        (aluno, tipo, minutos_atras, json.dumps(ctx)),
    )


def _push_hoje(c, aluno, tipo: str, segundos: int = 0) -> None:
    """Um push no começo do dia UTC de hoje: conta no orçamento, sem depender da hora do teste."""
    c.execute(
        "INSERT INTO public.notificacoes (aluno_id, titulo, corpo, tipo, horario_envio, status, read, origem)"
        " VALUES (%s, 'x', 'x', %s, date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'"
        " + make_interval(secs => %s), 'enviada', false, 'motor')",
        (aluno, tipo, segundos),
    )


def _sem_intervalo_global(c) -> None:
    c.execute("UPDATE public.notificacoes_config SET valor = '0' WHERE chave = 'intervalo_global_min'")


def _posts(c) -> int:
    return c.execute("SELECT count(*) FROM net.posts").fetchone()[0]


def _pendente(c, pid: int) -> dict:
    return c.execute(
        "SELECT status, ultimo_erro, horario > now() AS adiada, contexto FROM public.notificacoes_pendentes WHERE id = %s",
        (pid,),
    ).fetchone()


def _caixa(c, aluno) -> list[tuple]:
    return c.execute(
        "SELECT tipo, contexto->>'sem_push', contexto->>'categoria' FROM public.notificacoes"
        " WHERE aluno_id = %s AND origem = 'motor' AND titulo <> 'x' ORDER BY id",
        (aluno,),
    ).fetchall()


# --------------------------------------------------------------------------- intervalos


def test_intervalo_global_adia_o_segundo_push_e_a_caixa_nao_recebe_os_dois_de_uma_vez():
    with _banco() as c:
        p._semear(c)
        primeiro = _evento(c, C, "missao_nova")
        segundo = _evento(c, C, "evento_abrindo")
        _entregar(c, C)
        caixa, posts = _caixa(c, C), _posts(c)
        estados = [_pendente(c, primeiro)[0], _pendente(c, segundo)]
    assert len(caixa) == 1 and posts == 1
    assert estados[0] == "entregue"
    status, _, adiada, ctx = estados[1]
    assert status == "pendente" and adiada and ctx["adiada_por"] == "intervalo"


def test_prioridade_3_nao_espera_o_intervalo_global():
    with _banco() as c:
        p._semear(c)
        _push_passado(c, C, "missao_nova", minutos_atras=5)
        _evento(c, C, "prazo_2h")
        _entregar(c, C)
        caixa = _caixa(c, C)
    assert caixa == [("prazo_2h", None, "turma")]


def test_intervalo_do_tipo_adia_ate_vencer():
    with _banco() as c:
        p._semear(c)
        _push_passado(c, C, "pausa_saudavel", minutos_atras=60)  # intervalo do tipo: 3 h
        pid = _evento(c, C, "pausa_saudavel", motivo="outra")
        _entregar(c, C)
        status, _, adiada, _ = _pendente(c, pid)
        falta = c.execute(
            "SELECT round(extract(epoch FROM horario - now()) / 60) FROM public.notificacoes_pendentes WHERE id = %s",
            (pid,),
        ).fetchone()[0]
    assert status == "pendente" and adiada
    assert 115 <= falta <= 121  # 3 h depois do push de 1 h atrás


def test_adiamento_alem_da_expiracao_vira_excedente_da_categoria():
    with _banco() as c:
        p._semear(c)
        pid = _evento(c, C, "batalha_resultado", expira_horas=1)  # competição suprime
        _push_passado(c, C, "batalha_resultado", minutos_atras=30)  # 3 h de intervalo > 1 h de vida
        _entregar(c, C)
        status, erro, _, _ = _pendente(c, pid)
    assert (status, erro) == ("suprimida", "intervalo")


# --------------------------------------------------------------------------- orçamento


def test_categoria_que_suprime_corta_no_teto():
    with _banco() as c:
        p._semear(c)
        _sem_intervalo_global(c)
        _push_hoje(c, C, "rank")
        _push_hoje(c, C, "batalha_desafio", 1)  # competição: teto 2
        pid = _evento(c, C, "batalha_resultado")
        _entregar(c, C)
        status, erro, _, _ = _pendente(c, pid)
    assert (status, erro) == ("suprimida", "orcamento_categoria")


def test_categoria_da_turma_vai_para_a_caixa_sem_push_e_nao_conta_no_teto():
    with _banco() as c:
        p._semear(c)
        _sem_intervalo_global(c)
        for i, tipo in enumerate(("missao_nova", "atividade_nova", "conteudo_novo")):  # turma: teto 3
            _push_hoje(c, C, tipo, i)
        _evento(c, C, "evento_terminando")
        _entregar(c, C)
        caixa, posts = _caixa(c, C), _posts(c)
        hoje = c.execute(
            "SELECT COALESCE(sum(notificacoes_dia), 0) FROM public.aluno_atividade_diaria WHERE aluno_id = %s", (C,)
        ).fetchone()[0]
    assert caixa == [("evento_terminando", "orcamento_categoria", "turma")]
    assert posts == 0 and hoje == 0


def test_caixa_sem_push_nao_conta_para_teto_nem_intervalo():
    with _banco() as c:
        p._semear(c)
        _push_passado(c, C, "missao_nova", minutos_atras=5, sem_push=True)
        _evento(c, C, "atividade_nova")
        _entregar(c, C)
        caixa = _caixa(c, C)
    assert caixa == [("atividade_nova", None, "turma")]


def test_recado_do_professor_fura_o_teto_da_categoria_mas_nao_o_global():
    with _banco() as c:
        p._semear(c)
        for i, tipo in enumerate(("missao_nova", "atividade_nova", "conteudo_novo")):
            _push_hoje(c, C, tipo, i)
        _evento(c, C, "recado_professor")
        _entregar(c, C)
        com_categoria_cheia = _caixa(c, C)
    with _banco() as c:
        p._semear(c)
        c.execute(
            "INSERT INTO public.aluno_notificacao_intensidade (aluno_id, nivel, teto) VALUES (%s, 'baixa', 1)", (C,)
        )
        c.execute(
            "INSERT INTO public.aluno_atividade_diaria (aluno_id, dia, notificacoes_dia)"
            " VALUES (%s, public.notificacoes_dia_local('UTC'), 1)",
            (C,),
        )
        _evento(c, C, "recado_professor")
        _entregar(c, C)
        com_teto_global = _caixa(c, C)
    assert com_categoria_cheia == [("recado_professor", None, "turma")]
    assert com_teto_global == [("recado_professor", "teto_diario", "turma")]


def test_sugestao_da_ia_no_teto_e_suprimida_nunca_vai_sem_push():
    with _banco() as c:
        p._semear(c)
        c.execute(
            "INSERT INTO public.aluno_notificacao_intensidade (aluno_id, nivel, teto) VALUES (%s, 'baixa', 1)", (C,)
        )
        c.execute(
            "INSERT INTO public.aluno_atividade_diaria (aluno_id, dia, notificacoes_dia)"
            " VALUES (%s, public.notificacoes_dia_local('UTC'), 1)",
            (C,),
        )
        c.execute(
            "INSERT INTO public.notificacoes_ia (aluno_id, tipo, contexto, titulo, corpo)"
            " VALUES (%s, 'conquista', jsonb_build_object('motivo', 'marco', 'texto_guarda', 1), 't', 'c')",
            (C,),
        )
        _entregar(c, C)
        fila = c.execute(
            "SELECT status, ultimo_erro FROM public.notificacoes_pendentes WHERE aluno_id = %s AND sugestao_id IS NOT NULL",
            (C,),
        ).fetchone()
        caixa = _caixa(c, C)
    # Conquista iria para a caixa sem push; vinda da IA, é suprimida.
    assert fila == ("suprimida", "teto_diario") and caixa == []


# --------------------------------------------------------------------------- perfil prioriza, não corta


def test_socializer_agora_recebe_rank_que_antes_era_cortado():
    with _banco(com_v2=False) as c:
        p._semear(c)
        antes = _evento(c, A, "rank")
    with _banco() as c:
        p._semear(c)
        depois = _evento(c, A, "rank")
        _entregar(c, A)
        caixa = _caixa(c, A)
    assert antes is None
    assert depois is not None and caixa == [("rank", None, "competicao")]


def test_o_tipo_que_combina_com_o_perfil_sai_primeiro():
    with _banco() as c:
        p._semear(c)
        # A é Socializer: amigo_rank pesa 1,0 e rank 0,13; os dois têm base 1.
        _evento(c, A, "rank")
        _evento(c, A, "amigo_rank")
        _entregar(c, A)
        primeiro_de_a = _caixa(c, A)[0][0]
        # C é Conqueror: rank pesa 1,0 e amigo_rank 0.
        _evento(c, C, "amigo_rank")
        _evento(c, C, "rank")
        _entregar(c, C)
        primeiro_de_c = _caixa(c, C)[0][0]
    assert (primeiro_de_a, primeiro_de_c) == ("amigo_rank", "rank")


def test_silenciado_continua_cortado():
    with _banco() as c:
        p._semear(c)
        c.execute("INSERT INTO public.notificacoes_silenciadas (aluno_id, tipo) VALUES (%s, 'rank')", (C,))
        assert _evento(c, C, "rank") is None


# --------------------------------------------------------------------------- chat e convites pelo motor


def _social(c, aluno, chave: str) -> int | None:
    return c.execute(
        "SELECT public.social_notificar_evento(%s, 'Nova mensagem', 'Ana mandou', 'chat_privado', %s, '{}'::jsonb)",
        (aluno, chave),
    ).fetchone()[0]


def test_chat_sai_na_hora_pelo_motor_e_avisa_uma_vez_por_chave():
    with _banco() as c:
        p._semear(c)
        primeiro = _social(c, C, "chat:ana:0")
        repetido = _social(c, C, "chat:ana:0")
        caixa = c.execute(
            "SELECT tipo, origem, contexto->>'categoria' FROM public.notificacoes WHERE aluno_id = %s", (C,)
        ).fetchall()
        posts = _posts(c)
    assert primeiro is not None and repetido is None
    assert caixa == [("chat_privado", "motor", "social")] and posts == 1


def test_chat_em_foco_espera_o_fim_do_foco():
    with _banco() as c:
        p._semear(c)
        p._como(c, C)
        c.execute("SELECT public.notificacoes_iniciar_foco(30)")
        p._dono(c)
        devolvido = _social(c, C, "chat:ana:0")
        caixa = c.execute("SELECT count(*) FROM public.notificacoes WHERE aluno_id = %s", (C,)).fetchone()[0]
        segurada = c.execute(
            "SELECT gatilho FROM public.notificacoes_pendentes WHERE aluno_id = %s AND tipo = 'chat_privado'", (C,)
        ).fetchone()[0]
    assert devolvido is None and caixa == 0 and segurada == "fim_foco"


# --------------------------------------------------------------------------- intensidade


def _intensidade(c, aluno) -> tuple:
    nivel = c.execute("SELECT public.notificacoes_calcular_intensidade(%s)", (aluno,)).fetchone()[0]
    teto = c.execute("SELECT public.notificacoes_teto_do_aluno(%s)", (aluno,)).fetchone()[0]
    return nivel, teto


def test_intensidade_normal_sem_historico():
    with _banco() as c:
        p._semear(c)
        assert _intensidade(c, C) == ("normal", 6)


def test_intensidade_baixa_por_silenciar_e_por_nao_abrir():
    with _banco() as c:
        p._semear(c)
        c.execute(
            "INSERT INTO public.notificacoes_silenciadas (aluno_id, tipo) VALUES (%s, 'rank'), (%s, 'sequencia')",
            (A, A),
        )
        for i in range(12):
            _push_passado(c, B, "revisao_diaria", minutos_atras=60 * 24 * (i % 10) + 60)
        assert _intensidade(c, A) == ("baixa", 3)
        assert _intensidade(c, B) == ("baixa", 3)


def test_intensidade_alta_quem_abre_e_usa_o_app():
    with _banco() as c:
        p._semear(c)
        for i in range(10):
            _push_passado(c, C, "revisao_diaria", minutos_atras=60 * 24 * i + 60)
        c.execute("UPDATE public.notificacoes SET read = true WHERE aluno_id = %s", (C,))
        for d in range(5):
            c.execute(
                "INSERT INTO public.aluno_atividade_diaria (aluno_id, dia, tempo_uso_seg) VALUES (%s, current_date - %s, 600)",
                (C, d),
            )
        assert _intensidade(c, C) == ("alta", 8)
        log = c.execute(
            "SELECT de, para FROM public.aluno_notificacao_intensidade_log WHERE aluno_id = %s", (C,)
        ).fetchall()
        # Recalcular sem mudança não escreve log de novo.
        _intensidade(c, C)
        log_depois = c.execute(
            "SELECT count(*) FROM public.aluno_notificacao_intensidade_log WHERE aluno_id = %s", (C,)
        ).fetchone()[0]
    assert log == [(None, "alta")] and log_depois == 1


def test_empenho_sem_a_view_e_desconhecido_e_nao_derruba_o_calculo():
    with _banco() as c:
        p._semear(c)
        empenho = c.execute("SELECT public.notificacoes_empenho_do_aluno(%s)", (C,)).fetchone()[0]
        resultado = c.execute("SELECT public.notificacoes_recalcular_intensidades()").fetchone()[0]
    assert empenho is None
    assert resultado["falhas"] == 0 and resultado["calculados"] >= 3


def test_cliente_le_o_catalogo_mas_nao_a_intensidade():
    with _banco() as c:
        p._semear(c)
        c.execute("SELECT public.notificacoes_calcular_intensidade(%s)", (C,))
        c.execute("SET ROLE authenticated")
        f5.como(c, C)
        tipos = c.execute("SELECT count(*) FROM public.notificacoes_tipos").fetchone()[0]
        try:
            c.execute("SELECT count(*) FROM public.aluno_notificacao_intensidade")
            leu = True
        except Exception:
            leu = False
    assert tipos >= 25 and not leu


# --------------------------------------------------------------------------- volta


def test_downgrade_devolve_o_motor_e_o_social_de_antes():
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        entregar = c.execute("SELECT prosrc FROM pg_proc WHERE proname = 'notificacoes_entregar'").fetchone()[0]
        social = c.execute("SELECT prosrc FROM pg_proc WHERE proname = 'social_notificar_evento'").fetchone()[0]
        minimo = c.execute(
            "SELECT valor FROM public.notificacoes_config WHERE chave = 'perfil_peso_minimo_pct'"
        ).fetchone()[0]
        tabelas = c.execute("SELECT to_regclass('public.notificacoes_tipos')").fetchone()[0]
    assert "notificacoes_tipos" not in entregar and "teto diario" in entregar
    assert "'social'" in social and minimo == "50" and tabelas is None


def test_upgrade_e_idempotente():
    with _banco() as c:
        for sql in f5.sql_de(M):
            c.execute(sql)
        n = c.execute("SELECT count(*) FROM public.notificacoes_tipos").fetchone()[0]
    assert n == len(M.TIPOS)
