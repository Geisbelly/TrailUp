"""`20261102_18`: para quem (matriz por perfil, amizade, silenciar) e quando (foco) cada notificação sai (#149).

Postgres local, esqueleto da produção e o motor de notificações como a `20261102_01` o deixa (o
mesmo `_motor()` do e2e dela), com a `20261102_18` por cima. Três dublês, todos declarados aqui:

- `net.http_post` grava o corpo do POST numa tabela: o pg_net não existe no Postgres local, e o que
  se mede é se o push sai, não a Expo;
- `vw_rank_posicoes_por_classe_todas` é uma view sobre uma tabela de posições escritas pelo teste. A
  view de produção é longa e já tem e2e próprio; o job só lê `rank_id`, `classe_id`, `posicao`,
  `id_aluno` e `pontuacao`;
- os CHECKs de `notificacoes_pendentes` da `20260826_03` (o esqueleto não traz CHECK), para a troca
  de restrição ser exercida de verdade.

O cliente entra como o PostgREST entraria: `SET ROLE authenticated` com o `sub` do JWT.
Dados sintéticos.
"""

from __future__ import annotations

import asyncio
from datetime import timedelta

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_notificacao_no_horario_do_aluno as h
from tests.test_e2e_kpis_por_topico import _trecho

pytestmark = f5.e2e

M = f5.modulo("20261102_18_notificacao_por_perfil_e_foco.py")
M01 = h.M
M_LIMITE = f5.modulo("20260909_02_rank_limite_visivel.py")

ANTES = """
ALTER TABLE public.notificacoes_pendentes ADD CONSTRAINT notificacoes_pendentes_gatilho_check
  CHECK (gatilho IN ('horario', 'login', 'tempo_uso'));
ALTER TABLE public.notificacoes_pendentes ADD CONSTRAINT notificacoes_pendentes_status_check
  CHECK (status IN ('pendente', 'entregue', 'expirada', 'cancelada', 'suprimida'));

CREATE SCHEMA net;
CREATE TABLE net.posts (id bigserial PRIMARY KEY, corpo jsonb);
CREATE FUNCTION net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds integer)
RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.posts (corpo) VALUES (http_post.body) RETURNING id $$;

CREATE TABLE public.rank_dubla (rank_id bigint, classe_id bigint, posicao bigint, id_aluno uuid, pontuacao numeric);
CREATE VIEW public.vw_rank_posicoes_por_classe_todas AS
  SELECT rank_id, classe_id, posicao, id_aluno, pontuacao FROM public.rank_dubla;
"""

RETENCAO = _trecho("20261024_03_retencao_e_expurgo.py", "CREATE TABLE IF NOT EXISTS public.retencao_politica (", "\n);")

SOC, MAS, CON = 1, 2, 3
RANK = 1
A, B, C = f5.A, f5.B, f5.C  # A: Socializer, B: Socializer sem amizade com C, C: Conqueror


def _banco():
    return f5.banco(
        *h._motor(),
        *f5.sql_de(M01),
        ANTES,
        RETENCAO,
        M_LIMITE.TABELA_CONFIG,
        M_LIMITE.FUNCAO_LIMITE,
        *f5.sql_de(M),
    )


def _semear(c) -> None:
    f5.semear_turma(c)
    for t in ("topico_aluno", "notificacoes_agendamentos", "social_relacionamentos", "ranks"):
        f5.afrouxa(c, t)
    c.execute(
        f"""
UPDATE public.alunos SET apelido = 'Cacau' WHERE id = '{C}';
INSERT INTO public.perfil (id, nome) OVERRIDING SYSTEM VALUE VALUES
  ({SOC}, 'Socialiser'), ({MAS}, 'Mastermind'), ({CON}, 'Conqueror');
INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES
  ('{A}', {SOC}, 90), ('{A}', {MAS}, 40),
  ('{B}', {SOC}, 70), ('{B}', {CON}, 20),
  ('{C}', {CON}, 85), ('{C}', {SOC}, 10);
INSERT INTO public.rank_tipo (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Pontuação');
INSERT INTO public.ranks (id, tipo_id, classe_id, inicio) OVERRIDING SYSTEM VALUE
  VALUES ({RANK}, 1, {f5.TURMA}, now() - interval '1 day');
INSERT INTO public.social_relacionamentos (aluno_a_id, aluno_b_id, solicitante_id, status) VALUES
  ('{A}', '{C}', '{A}', 'accepted'),
  ('{B}', '{C}', '{B}', 'pending');
"""
    )
    h._sem_silencio(c)
    for aluno in (A, B, C):
        h._token(c, aluno)


def _posicoes(c, **pos: tuple[int, int]) -> None:
    """`_posicoes(c, A=(posição, pontos), ...)`: o ranking de agora."""
    c.execute("DELETE FROM public.rank_dubla")
    alunos = {"A": A, "B": B, "C": C}
    for nome, (posicao, pontos) in pos.items():
        c.execute(
            "INSERT INTO public.rank_dubla VALUES (%s, %s, %s, %s, %s)",
            (RANK, f5.TURMA, posicao, alunos[nome], pontos),
        )


def _caixa(c, aluno) -> list[tuple]:
    return c.execute(
        "SELECT tipo, titulo, corpo FROM public.notificacoes WHERE aluno_id = %s ORDER BY id", (aluno,)
    ).fetchall()


def _pendentes(c, aluno) -> list[tuple]:
    return c.execute(
        "SELECT tipo, status, gatilho, corpo FROM public.notificacoes_pendentes WHERE aluno_id = %s ORDER BY id",
        (aluno,),
    ).fetchall()


def _como(c, aluno) -> None:
    c.execute("SET ROLE authenticated")
    f5.como(c, aluno)


def _dono(c) -> None:
    c.execute("RESET ROLE")
    f5.como(c, None)


def _sugerir(c, aluno, tipo: str, motivo: str, prioridade: int = 0) -> None:
    c.execute(
        "INSERT INTO public.notificacoes_ia (aluno_id, tipo, contexto, titulo, corpo, prioridade)"
        " VALUES (%s, %s, jsonb_build_object('motivo', %s::text), %s, 'c', %s)",
        (aluno, tipo, motivo, f"{tipo}:{motivo}", prioridade),
    )


# --------------------------------------------------------------------------- para quem: a matriz


def test_matriz_decide_pelo_perfil_dominante():
    with _banco() as c:
        _semear(c)
        destino = {
            (nome, tipo): c.execute("SELECT public.notificacoes_destino(%s, %s)", (aluno, tipo)).fetchone()[0]
            for nome, aluno in (("A", A), ("C", C))
            for tipo in ("rank", "amigo_rank", "novo_material", "lembrete")
        }
        # Mastermind tem 0,63 no placar: recebe.
        c.execute(f"UPDATE public.aluno_perfil SET afinidade = 95 WHERE aluno_id = '{A}' AND perfil_id = {MAS}")
        mastermind = c.execute("SELECT public.notificacoes_destino(%s, 'rank')", (A,)).fetchone()[0]
    assert destino[("A", "rank")] == "perfil"  # Socializer: 0,13 no placar
    assert destino[("A", "amigo_rank")] is None
    assert destino[("C", "rank")] is None
    assert destino[("C", "amigo_rank")] == "perfil"
    assert destino[("A", "novo_material")] == "perfil" and destino[("C", "novo_material")] == "perfil"
    assert destino[("A", "lembrete")] is None and destino[("C", "lembrete")] is None  # fora da matriz
    assert mastermind is None


def test_limiar_e_pesos_sao_configuraveis():
    with _banco() as c:
        _semear(c)
        h._cfg(c, "perfil_peso_minimo_pct", 10)
        socializer_com_limiar_baixo = c.execute("SELECT public.notificacoes_destino(%s, 'rank')", (A,)).fetchone()[0]
        h._cfg(c, "perfil_peso_minimo_pct", 50)
        c.execute(
            "UPDATE public.notificacoes_config SET valor = '{\"socializer\": 0.9}' WHERE chave = 'perfil_pesos_rank'"
        )
        com_peso_novo = c.execute("SELECT public.notificacoes_destino(%s, 'rank')", (A,)).fetchone()[0]
        c.execute("UPDATE public.notificacoes_config SET valor = 'não é json' WHERE chave = 'perfil_pesos_rank'")
        matriz_quebrada = c.execute("SELECT public.notificacoes_destino(%s, 'rank')", (C,)).fetchone()[0]
    assert socializer_com_limiar_baixo is None
    assert com_peso_novo is None
    assert matriz_quebrada is None  # matriz ilegível não cala ninguém


def test_promocao_barra_o_tipo_que_o_perfil_nao_recebe():
    with _banco() as c:
        _semear(c)
        _sugerir(c, A, "rank", "m1")
        _sugerir(c, C, "rank", "m1")
        ia = dict(c.execute("SELECT aluno_id, status || ':' || COALESCE(motivo, '') FROM public.notificacoes_ia").fetchall())
        pend_a, pend_c = _pendentes(c, A), _pendentes(c, C)
    assert ia[A] == "suprimida:perfil"
    assert pend_a == []
    assert ia[C].startswith("promovida")
    assert len(pend_c) == 1


# --------------------------------------------------------------------------- rank e amizade


def test_primeira_varredura_so_grava_a_base():
    with _banco() as c:
        _semear(c)
        _posicoes(c, A=(2, 20), B=(3, 10), C=(1, 30))
        r = c.execute("SELECT public.notificacoes_rank_varrer()").fetchone()[0]
        n = c.execute("SELECT count(*) FROM public.notificacoes_pendentes").fetchone()[0]
        base = c.execute("SELECT count(*) FROM public.rank_posicao_anterior").fetchone()[0]
    assert (r["base"], r["proprias"], r["amigos"]) == (3, 0, 0)
    assert n == 0 and base == 3


def test_conqueror_ve_a_propria_subida_e_so_o_amigo_socializer_e_avisado():
    with _banco() as c:
        _semear(c)
        _posicoes(c, A=(1, 30), B=(2, 20), C=(3, 10))
        c.execute("SELECT public.notificacoes_rank_varrer()")
        _posicoes(c, A=(2, 30), B=(3, 20), C=(1, 40))  # C passa A e B; A e B caem
        r = c.execute("SELECT public.notificacoes_rank_varrer()").fetchone()[0]
        caixa_a, caixa_b, caixa_c = _caixa(c, A), _caixa(c, B), _caixa(c, C)
    assert caixa_c == [("rank", "Você subiu no ranking", "Você agora está em 1º lugar (Pontuação).")]
    # A é amiga de C e Socializer: recebe a subida dela, nunca a própria posição.
    assert caixa_a == [("amigo_rank", "Cacau subiu no ranking", "Agora em 1º lugar (Pontuação). Que tal estudar em dupla?")]
    # B também é Socializer, mas o convite com C está pendente: C é estranha para ela.
    assert caixa_b == []
    assert (r["proprias"], r["amigos"], r["entregues"]) == (1, 1, 2)


def test_socializer_nao_e_avisado_da_propria_subida():
    with _banco() as c:
        _semear(c)
        _posicoes(c, A=(3, 10), B=(2, 20), C=(1, 30))
        c.execute("SELECT public.notificacoes_rank_varrer()")
        _posicoes(c, A=(1, 50), B=(3, 20), C=(2, 30))
        c.execute("SELECT public.notificacoes_rank_varrer()")
        caixa_a, caixa_c = _caixa(c, A), _caixa(c, C)
    assert caixa_a == []
    assert caixa_c == []  # C é Conqueror: não recebe `amigo_rank`


def test_amigo_fora_do_corte_nao_e_nomeado():
    with _banco() as c:
        _semear(c)
        c.execute("UPDATE public.app_config SET valor = '1' WHERE chave = 'rank_limite_visivel'")
        _posicoes(c, A=(1, 50), B=(2, 40), C=(3, 10))
        c.execute("SELECT public.notificacoes_rank_varrer()")
        _posicoes(c, A=(1, 50), B=(3, 40), C=(2, 45))  # C sobe, mas fica fora do corte de 1
        c.execute("SELECT public.notificacoes_rank_varrer()")
        caixa_a, caixa_c = _caixa(c, A), _caixa(c, C)
    assert caixa_a == []
    assert [t for t, _, _ in caixa_c] == ["rank"]  # a própria posição é sempre dela


def test_subida_sem_ponto_nao_avisa():
    with _banco() as c:
        _semear(c)
        _posicoes(c, A=(1, 0), B=(2, 0), C=(3, 0))
        c.execute("SELECT public.notificacoes_rank_varrer()")
        _posicoes(c, A=(2, 0), B=(3, 0), C=(1, 0))
        c.execute("SELECT public.notificacoes_rank_varrer()")
        n = c.execute("SELECT count(*) FROM public.notificacoes").fetchone()[0]
    assert n == 0


def test_descida_so_com_a_chave_ligada():
    with _banco() as c:
        _semear(c)
        _posicoes(c, A=(3, 10), B=(2, 20), C=(1, 30))
        c.execute("SELECT public.notificacoes_rank_varrer()")
        _posicoes(c, A=(3, 10), B=(1, 40), C=(2, 30))
        c.execute("SELECT public.notificacoes_rank_varrer()")
        sem = _caixa(c, C)
        h._cfg(c, "rank_notificar_descida", 1)
        _posicoes(c, A=(1, 60), B=(2, 40), C=(3, 30))
        c.execute("SELECT public.notificacoes_rank_varrer()")
        com = _caixa(c, C)
    assert sem == []
    assert com == [("rank", "Sua posição no ranking mudou", "Você está em 3º lugar (Pontuação).")]


def test_uma_por_rank_por_dia_e_a_segunda_reescreve_enquanto_espera():
    with _banco() as c:
        _semear(c)
        c.execute(
            f"INSERT INTO public.aluno_modo_foco (aluno_id, ativo_ate) VALUES ('{C}', now() + interval '1 hour')"
        )
        _posicoes(c, A=(1, 50), B=(2, 40), C=(3, 10))
        c.execute("SELECT public.notificacoes_rank_varrer()")
        _posicoes(c, A=(1, 50), B=(3, 40), C=(2, 45))
        c.execute("SELECT public.notificacoes_rank_varrer()")
        _posicoes(c, A=(2, 50), B=(3, 40), C=(1, 60))
        c.execute("SELECT public.notificacoes_rank_varrer()")
        pend = _pendentes(c, C)
    assert pend == [("rank", "pendente", "fim_foco", "Você agora está em 1º lugar (Pontuação).")]


# --------------------------------------------------------------------------- quando: foco


def test_em_foco_nada_sai_e_a_saida_colapsa_por_tipo():
    with _banco() as c:
        _semear(c)
        _como(c, A)
        foco = c.execute("SELECT public.notificacoes_iniciar_foco(25)").fetchone()[0]
        _dono(c)
        for i in range(3):
            _sugerir(c, A, "lembrete", f"m{i}")
        _sugerir(c, A, "suporte", "s1", prioridade=1)
        c.execute("SELECT public.notificacoes_varrer()")
        durante = (_caixa(c, A), c.execute("SELECT count(*) FROM net.posts").fetchone()[0])
        seguradas = [g for _, _, g, _ in _pendentes(c, A)]
        _como(c, A)
        meu = c.execute("SELECT public.notificacoes_meu_foco()").fetchone()[0]
        saida = c.execute("SELECT public.notificacoes_encerrar_foco()").fetchone()[0]
        _dono(c)
        caixa = c.execute(
            "SELECT tipo, titulo, contexto->>'colapsadas' FROM public.notificacoes WHERE aluno_id = %s ORDER BY id",
            (A,),
        ).fetchall()
        estados = sorted(s for _, s, _, _ in _pendentes(c, A))
        posts = c.execute("SELECT count(*) FROM net.posts").fetchone()[0]
    assert foco["em_foco"] and foco["origem"] == "aluno"
    assert durante == ([], 0)
    assert seguradas == ["fim_foco"] * 4
    assert meu["seguradas"] == 4
    assert saida["entregues"] == 2 and saida["em_foco"] is False
    # Suporte (prioridade 1) sai primeiro; dos três lembretes, sai o mais recente.
    assert caixa == [("suporte", "suporte:s1", None), ("lembrete", "lembrete:m2", "2")]
    assert estados == ["colapsada", "colapsada", "entregue", "entregue"]
    assert posts == 2


def test_saida_do_foco_respeita_o_teto_e_a_expiracao():
    with _banco() as c:
        _semear(c)
        h._cfg(c, "max_por_dia", 1)
        c.execute(
            f"INSERT INTO public.aluno_modo_foco (aluno_id, ativo_ate) VALUES ('{A}', now() + interval '1 hour')"
        )
        _sugerir(c, A, "lembrete", "m1")
        _sugerir(c, A, "suporte", "s1")
        _sugerir(c, A, "conquista", "c1")
        c.execute("SELECT public.notificacoes_varrer()")
        # A conquista envelhece durante o foco.
        c.execute(
            "UPDATE public.notificacoes_pendentes SET expira_em = now() - interval '1 minute'"
            " WHERE aluno_id = %s AND tipo = 'conquista'",
            (A,),
        )
        _como(c, A)
        saida = c.execute("SELECT public.notificacoes_encerrar_foco()").fetchone()[0]
        _dono(c)
        estados = dict((t, s) for t, s, _, _ in _pendentes(c, A))
    assert saida["entregues"] == 1
    assert estados["conquista"] == "expirada"
    assert sorted([estados["lembrete"], estados["suporte"]]) == ["entregue", "suprimida"]


def test_fim_do_foco_por_tempo_entrega_na_varredura():
    with _banco() as c:
        _semear(c)
        c.execute(
            f"INSERT INTO public.aluno_modo_foco (aluno_id, ativo_ate) VALUES ('{A}', now() + interval '1 hour')"
        )
        _sugerir(c, A, "lembrete", "m1")
        c.execute("SELECT public.notificacoes_varrer()")
        antes = _caixa(c, A)
        c.execute(f"UPDATE public.aluno_modo_foco SET ativo_ate = now() - interval '1 minute' WHERE aluno_id = '{A}'")
        r = c.execute("SELECT public.notificacoes_varrer()").fetchone()[0]
        depois = _caixa(c, A)
    assert antes == []
    assert r["entregues"] == 1 and len(depois) == 1


def _atencao(c, aluno, estado: str, score: float | None, minutos_atras: int = 0) -> None:
    c.execute(
        "INSERT INTO public.aluno_estado_atencao (aluno_id, estado, score, atualizado_em)"
        " VALUES (%s, %s, %s, now() - make_interval(mins => %s))"
        " ON CONFLICT (aluno_id) DO UPDATE SET estado = EXCLUDED.estado, score = EXCLUDED.score,"
        " atualizado_em = EXCLUDED.atualizado_em",
        (aluno, estado, score, minutos_atras),
    )


def _foco(c, aluno):
    return c.execute("SELECT public.notificacoes_em_foco(%s)", (aluno,)).fetchone()[0]


def test_foco_por_atencao_segura_e_desconcentrado_libera():
    with _banco() as c:
        _semear(c)
        resultados = {}
        _atencao(c, A, "alta", 0.8)
        resultados["concentrado"] = _foco(c, A)
        _atencao(c, A, "baixa", 0.3)
        resultados["desconcentrado"] = _foco(c, A)
        _atencao(c, A, "moderada", 0.5, minutos_atras=30)
        resultados["velho"] = _foco(c, A)
        _atencao(c, A, "baixa", None)
        resultados["sem_score_baixa"] = _foco(c, A)
        _atencao(c, A, "moderada", None)
        resultados["sem_score_moderada"] = _foco(c, A)
        _atencao(c, A, "alta", 0.8)
        h._cfg(c, "atencao_limiar_baixa_pct", 90)
        resultados["limiar_alto"] = _foco(c, A)
        h._cfg(c, "atencao_limiar_baixa_pct", 40)
        h._cfg(c, "foco_por_atencao", 0)
        resultados["desligado"] = _foco(c, A)
        h._cfg(c, "foco_por_atencao", 1)
        # Concentrado: a sugestão espera; ao desconcentrar, a varredura entrega.
        _sugerir(c, A, "lembrete", "m1")
        c.execute("SELECT public.notificacoes_varrer()")
        segurada = _pendentes(c, A)
        _atencao(c, A, "baixa", 0.2)
        c.execute("SELECT public.notificacoes_varrer()")
        caixa = _caixa(c, A)
    assert resultados == {
        "concentrado": "estudo",
        "desconcentrado": None,
        "velho": None,
        "sem_score_baixa": None,
        "sem_score_moderada": "estudo",
        "limiar_alto": None,
        "desligado": None,
    }
    assert segurada[0][2] == "fim_foco"
    assert len(caixa) == 1


def test_push_direto_nao_sai_em_foco_mas_a_linha_fica():
    with _banco() as c:
        _semear(c)
        nid = c.execute(
            "INSERT INTO public.notificacoes (aluno_id, titulo, corpo, tipo) VALUES (%s, 'chat', 'oi', 'chat')"
            " RETURNING id",
            (A,),
        ).fetchone()[0]
        _atencao(c, A, "alta", 0.9)
        em_foco = c.execute(
            "SELECT public.notificacoes_enviar_push(%s, %s, 'chat', 'oi', '{}'::jsonb, 0)", (A, nid)
        ).fetchone()[0]
        posts_em_foco = c.execute("SELECT count(*) FROM net.posts").fetchone()[0]
        _atencao(c, A, "baixa", 0.1)
        fora = c.execute(
            "SELECT public.notificacoes_enviar_push(%s, %s, 'chat', 'oi', '{}'::jsonb, 0)", (A, nid)
        ).fetchone()[0]
        posts = c.execute("SELECT count(*) FROM net.posts").fetchone()[0]
    assert (em_foco, posts_em_foco) == (0, 0)
    assert (fora, posts) == (1, 1)


def test_foco_do_aluno_tem_teto_de_duracao():
    with _banco() as c:
        _semear(c)
        _como(c, A)
        longo = c.execute("SELECT public.notificacoes_iniciar_foco(10000)").fetchone()[0]
        curto = c.execute("SELECT public.notificacoes_iniciar_foco(1)").fetchone()[0]
        _dono(c)
        agora = c.execute("SELECT now()").fetchone()[0]
    from datetime import datetime

    ate_longo = datetime.fromisoformat(longo["ate"])
    ate_curto = datetime.fromisoformat(curto["ate"])
    assert timedelta(minutes=179) < ate_longo - agora <= timedelta(minutes=181)
    assert timedelta(minutes=4) < ate_curto - agora <= timedelta(minutes=6)


# --------------------------------------------------------------------------- silenciar


def test_silenciar_e_sinal_de_perfil_e_suprime_o_tipo():
    with _banco() as c:
        _semear(c)
        c.execute(
            f"INSERT INTO public.aluno_modo_foco (aluno_id, ativo_ate) VALUES ('{A}', now() + interval '1 hour')"
        )
        _sugerir(c, A, "lembrete", "m1")
        c.execute("SELECT public.notificacoes_varrer()")  # fica segurada (foco)
        nid = c.execute(
            "INSERT INTO public.notificacoes (aluno_id, titulo, corpo, tipo) VALUES (%s, 'x', 'y', 'lembrete')"
            " RETURNING id",
            (A,),
        ).fetchone()[0]
        _como(c, A)
        r1 = c.execute("SELECT public.notificacoes_silenciar_tipo('lembrete', true, %s)", (nid,)).fetchone()[0]
        r2 = c.execute("SELECT public.notificacoes_silenciar_tipo('lembrete', true, %s)", (nid,)).fetchone()[0]
        visiveis = c.execute("SELECT tipo FROM public.notificacoes_silenciadas").fetchall()
        _dono(c)
        pend = _pendentes(c, A)
        _sugerir(c, A, "lembrete", "m2")
        ia = c.execute(
            "SELECT status, motivo FROM public.notificacoes_ia WHERE aluno_id = %s ORDER BY id DESC LIMIT 1", (A,)
        ).fetchone()
        _como(c, A)
        c.execute("SELECT public.notificacoes_silenciar_tipo('lembrete', false)")
        _dono(c)
        log = c.execute(
            "SELECT acao, perfil_dominante, afinidades, notificacao_id FROM public.notificacoes_silenciamento_log"
            " ORDER BY id"
        ).fetchall()
        _sugerir(c, A, "lembrete", "m3")
        ia_depois = c.execute(
            "SELECT status FROM public.notificacoes_ia WHERE aluno_id = %s ORDER BY id DESC LIMIT 1", (A,)
        ).fetchone()[0]
    assert r1["mudou"] is True and r2["mudou"] is False
    assert visiveis == [("lembrete",)]
    assert pend == [("lembrete", "suprimida", "fim_foco", "c")]
    assert ia == ("suprimida", "silenciado")
    assert [(a, p, n) for a, p, _, n in log] == [("silenciou", "socializer", nid), ("reativou", "socializer", None)]
    assert log[0][2] == {"socialiser": 90, "mastermind": 40}
    assert ia_depois == "promovida"


def test_so_tipo_que_passa_pela_fila_pode_ser_silenciado():
    with _banco() as c:
        _semear(c)
        _como(c, A)
        with pytest.raises(psycopg.errors.InvalidParameterValue):
            c.execute("SELECT public.notificacoes_silenciar_tipo('chat')")
        _dono(c)


# --------------------------------------------------------------------------- acesso


def test_cliente_le_so_o_proprio_e_nao_chama_o_motor():
    with _banco() as c:
        _semear(c)
        for aluno in (A, B):
            c.execute(
                "INSERT INTO public.aluno_modo_foco (aluno_id, ativo_ate) VALUES (%s, now() + interval '1 hour')",
                (aluno,),
            )
            c.execute("INSERT INTO public.notificacoes_silenciadas (aluno_id, tipo) VALUES (%s, 'rank')", (aluno,))
        _como(c, B)
        focos = c.execute("SELECT aluno_id FROM public.aluno_modo_foco").fetchall()
        silencios = c.execute("SELECT aluno_id FROM public.notificacoes_silenciadas").fetchall()
        for tabela in ("aluno_estado_atencao", "rank_posicao_anterior"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute(f"SELECT count(*) FROM public.{tabela}")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("UPDATE public.aluno_modo_foco SET ativo_ate = now() + interval '9 hours'")
        for chamada in (
            "SELECT public.notificacoes_em_foco(%s)",
            "SELECT public.notificacoes_destino(%s, 'rank')",
            "SELECT public.notificacoes_entregar(%s)",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute(chamada, (A,))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("SELECT public.notificacoes_rank_varrer()")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute(
                "SELECT public.notificacoes_enfileirar_evento(%s, 'rank', 'x', 't', 'c')", (A,)
            )
        c.execute("RESET ROLE")
        c.execute("SET ROLE anon")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("SELECT public.notificacoes_iniciar_foco()")
        _dono(c)
    assert focos == [(B,)]
    assert silencios == [(B,)]


# --------------------------------------------------------------------------- API grava o estado


def test_api_grava_o_estado_e_desde_so_anda_quando_muda():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.repositories.estado_atencao import EstadoAtencaoRepository

    async def gravar(url: str, *registros: tuple[str, float | None]) -> None:
        engine = create_async_engine(url)
        try:
            sessoes = async_sessionmaker(engine, expire_on_commit=False)
            for estado, score in registros:
                async with sessoes() as s:
                    await EstadoAtencaoRepository(s).registrar(
                        aluno_id=str(A), estado=estado, score=score, ciclo_id="c"
                    )
                    await s.commit()
        finally:
            await engine.dispose()

    with _banco() as c:
        _semear(c)
        url = "postgresql+asyncpg://" + f5._dsn_para(c.info.dbname).split("://", 1)[1]
        asyncio.run(gravar(url, ("alta", 0.81234)))
        desde_1 = c.execute("SELECT desde FROM public.aluno_estado_atencao").fetchone()[0]
        asyncio.run(gravar(url, ("alta", 0.7)))
        linha_2 = c.execute("SELECT desde, score FROM public.aluno_estado_atencao").fetchone()
        asyncio.run(gravar(url, ("baixa", 1.7)))
        linha_3 = c.execute("SELECT desde, estado, score FROM public.aluno_estado_atencao").fetchone()
    assert linha_2[0] == desde_1
    assert float(linha_2[1]) == 0.7
    assert linha_3[0] > desde_1
    assert linha_3[1:] == ("baixa", 1)


# --------------------------------------------------------------------------- downgrade


def test_downgrade_volta_o_motor_e_as_restricoes():
    with _banco() as c:
        _semear(c)
        c.execute(
            f"INSERT INTO public.aluno_modo_foco (aluno_id, ativo_ate) VALUES ('{A}', now() + interval '1 hour')"
        )
        _sugerir(c, A, "lembrete", "m1")
        c.execute("SELECT public.notificacoes_varrer()")  # fica segurada em fim_foco
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        tabelas = c.execute(
            "SELECT count(*) FROM unnest(ARRAY['aluno_modo_foco', 'aluno_estado_atencao', 'notificacoes_silenciadas',"
            " 'notificacoes_silenciamento_log', 'rank_posicao_anterior']) t WHERE to_regclass('public.' || t) IS NOT NULL"
        ).fetchone()[0]
        entregar = c.execute("SELECT prosrc FROM pg_proc WHERE proname = 'notificacoes_entregar'").fetchone()[0]
        gatilho = _pendentes(c, A)[0][2]
        chaves = c.execute(
            "SELECT count(*) FROM public.notificacoes_config WHERE chave LIKE 'perfil_pesos_' || '%%'"
        ).fetchone()[0]
        c.execute("SELECT public.notificacoes_varrer()")
        caixa = _caixa(c, A)
    assert tabelas == 0
    assert "fim_foco" not in entregar
    assert gatilho == "horario"
    assert chaves == 0
    assert len(caixa) == 1


def test_upgrade_e_idempotente():
    with _banco() as c:
        for sql in f5.sql_de(M):
            c.execute(sql)
        pesos = c.execute(
            "SELECT valor FROM public.notificacoes_config WHERE chave = 'perfil_pesos_amigo_rank'"
        ).fetchone()[0]
    assert pesos == '{"socializer": 1.0}'
