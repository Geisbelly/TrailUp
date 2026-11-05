"""`20261105_16` (#154, fase 3): pareamento por proximidade de desempenho no duelo do evento.

Banco do e2e da fase 2 (`test_e2e_duelo_no_evento`) com a migration por cima. Turma 2, nove alunos
(G0..G8), com o acerto da matrícula em 0, 10, ..., 80%. Convertido para a escala do Elo (800 a 1200),
fica 800, 850, ..., 1200: cada vizinho está a 50 de distância.
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager

import pytest

from tests import _f5_banco as f5
from tests import test_e2e_duelo_no_evento as fase2
from tests import test_e2e_rank_do_evento as rde

pytestmark = [f5.e2e]

if f5.DSN:
    import psycopg

M = f5.modulo("20261105_16_pareamento_no_evento.py")
G = rde.GRANDE  # turma 2
EU = G[4]  # 40% → 1000


@contextmanager
def _banco(aplica: bool = True):
    with fase2._banco() as c:
        # O banco do ranking já traz rating; aqui o ponto de partida é ninguém ter jogado.
        c.execute("UPDATE public.ranqueada_elo SET partidas = 0")
        for i, aluno in enumerate(G):
            c.execute(
                'UPDATE public.classe_aluno SET "acertosPercentual" = %s WHERE classe_id = 2 AND aluno_id = %s',
                (i * 10, aluno),
            )
        if aplica:
            for sql in f5.sql_de(M):
                c.execute(sql)
        yield c


def _evento(c, *inscritos) -> uuid.UUID:
    evento = rde._evento(c, 2, criterios=("ranqueada",))
    rde._abrir(c, evento)
    rde._inscreve(c, evento, *inscritos)
    return evento


def _sugerir(c, quem, evento, guilda=None) -> dict:
    with c.transaction():
        rde._como_cliente(c, quem)
        return c.execute("SELECT public.evento_sugerir_adversarios(%s, %s)", (evento, guilda)).fetchone()[0]


def _ids(r: dict) -> list[uuid.UUID]:
    return [uuid.UUID(a["aluno_id"]) for a in r["alunos"]]


def _criar(c, quem, evento, adversarios=(), guilda=None, rival=None) -> dict:
    with c.transaction():
        rde._como_cliente(c, quem)
        return c.execute(
            "SELECT public.evento_duelo_criar(%s, p_formato => %s, p_adversarios => %s::uuid[],"
            " p_guilda_id => %s, p_guilda_rival => %s)",
            (evento, "guilda" if guilda else "solo", list(adversarios), guilda, rival),
        ).fetchone()[0]


# --- sugestão --------------------------------------------------------------------------------------


def test_sugere_os_tres_mais_proximos_sem_mostrar_numeros() -> None:
    with _banco() as c:
        evento = _evento(c, *G)
        r = _sugerir(c, EU, evento)
        assert r["k"] == 3
        # 950 e 1050 estão a 50; 900 e 1100 a 100 e empatam: o desempate é pelo id (G2 < G6).
        assert _ids(r) == sorted([G[3], G[5]]) + [G[2]]
        assert all(set(a) == {"aluno_id", "nome"} for a in r["alunos"])


def test_so_inscritos_entram_na_sugestao() -> None:
    with _banco() as c:
        evento = _evento(c, EU, G[0], G[8])
        assert set(_ids(_sugerir(c, EU, evento))) == {G[0], G[8]}


def test_quem_ja_duelou_entra_pelo_elo() -> None:
    with _banco() as c:
        evento = _evento(c, *G)
        c.execute(
            "INSERT INTO public.ranqueada_elo (classe_id, aluno_id, rating, partidas) VALUES (2, %s, 2000, 4)"
            " ON CONFLICT (classe_id, aluno_id) DO UPDATE SET rating = 2000, partidas = 4",
            (G[3],),
        )
        assert G[3] not in _ids(_sugerir(c, EU, evento))
        # Com o critério `acerto`, o Elo é ignorado e G3 volta a ser vizinho.
        c.execute("UPDATE public.app_config SET valor = 'acerto' WHERE chave = 'evento_pareamento_criterio'")
        assert G[3] in _ids(_sugerir(c, EU, evento))


def test_k_e_configuravel() -> None:
    with _banco() as c:
        evento = _evento(c, *G)
        c.execute("UPDATE public.app_config SET valor = '1' WHERE chave = 'evento_pareamento_k'")
        assert len(_sugerir(c, EU, evento)["alunos"]) == 1


def test_quem_nao_se_inscreveu_nao_pede_sugestao() -> None:
    with _banco() as c:
        evento = _evento(c, G[0], G[1])
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="evento_duelo_sem_inscricao"):
            _sugerir(c, EU, evento)


# --- cobrança na criação ----------------------------------------------------------------------------


def test_adversario_fora_da_sugestao_e_recusado() -> None:
    with _banco() as c:
        evento = _evento(c, *G)
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="evento_duelo_fora_da_sugestao"):
            _criar(c, EU, evento, [G[8]])
        assert fase2._desafios(c) == 0
        assert _criar(c, EU, evento, [G[5]])["consequencia"] == "evento"


def test_social_continua_com_escolha_livre() -> None:
    """A cobrança é da `evento_duelo_criar`; a `arena_desafio_criar` não muda."""
    with _banco() as c:
        with c.transaction():
            rde._como_cliente(c, EU)
            r = c.execute("SELECT public.arena_desafio_criar(2, p_adversarios => %s::uuid[])", ([G[8]],)).fetchone()[0]
        assert fase2._desafio(c, r["id"]) == (None, "ranqueada")


# --- guildas ---------------------------------------------------------------------------------------


def _guilda(c, nome: str, *membros) -> uuid.UUID:
    gid = uuid.uuid4()
    f5.afrouxa(c, "guildas")
    c.execute("INSERT INTO public.guildas (id, classe_id, nome, criado_por) VALUES (%s, 2, %s, %s)", (gid, nome, membros[0]))
    for aluno in membros:
        c.execute("INSERT INTO public.guilda_membros (guilda_id, classe_id, aluno_id) VALUES (%s, 2, %s)", (gid, aluno))
    return gid


def test_guildas_pela_media_e_com_limite_de_tamanho() -> None:
    with _banco() as c:
        evento = _evento(c, *G)
        minha = _guilda(c, "Minha", EU, G[5])  # 1000, 1050 → 1025
        perto = _guilda(c, "Perto", G[3], G[6])  # 950, 1100 → 1025
        longe = _guilda(c, "Longe", G[0], G[1])  # 800, 850 → 825
        grande = _guilda(c, "Grande", G[2], G[7], G[8], G[0])  # 4 membros: fora pelo tamanho
        r = _sugerir(c, EU, evento, minha)
        assert [uuid.UUID(g["guilda_id"]) for g in r["guildas"]] == [perto, longe]
        assert grande not in [uuid.UUID(g["guilda_id"]) for g in r["guildas"]]
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="evento_duelo_fora_da_sugestao"):
            _criar(c, EU, evento, guilda=minha, rival=grande)


def test_quem_nao_e_da_guilda_nao_pede_por_ela() -> None:
    with _banco() as c:
        evento = _evento(c, *G)
        outra = _guilda(c, "Outra", G[0], G[1])
        with pytest.raises(psycopg.errors.RaiseException, match="arena_sem_permissao"):
            _sugerir(c, EU, evento, outra)


# --- migration ------------------------------------------------------------------------------------


def test_cliente_nao_le_o_desempenho_de_ninguem() -> None:
    with _banco() as c:
        with c.transaction():
            rde._como_cliente(c, EU)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("SELECT public.fn_evento_desempenho(2, %s)", (G[0],))


def test_downgrade_limpa() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert c.execute("SELECT to_regprocedure('public.evento_sugerir_adversarios(uuid, uuid)')").fetchone()[0] is None
        assert c.execute("SELECT count(*) FROM public.app_config WHERE chave LIKE 'evento_pareamento_%'").fetchone()[0] == 0
        evento = _evento(c, *G)
        # Sem a cobrança, a fase 2 volta a aceitar qualquer inscrito.
        assert _criar(c, EU, evento, [G[8]])["consequencia"] == "evento"
