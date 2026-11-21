"""`20261117_04`: `missao_desafio_responder` corrige, limita e paga uma vez por desafio.

Banco local montado como o e2e da `20261117_03` (`test_e2e_missao_desafio_criar`): o caminho real do
prêmio (`test_e2e_premio_de_missao_na_turma._cadeia()`), a `20261117_01`, a guarda e as policies de
`missoes`, a `20261117_02`, a `20261117_03` e, por cima, a migration daqui. O vetor de perfis vem das
funções da `20261111_01` (`app_vetor_perfil`, `app_perfis_representativos`), que a RPC reaproveita.

O professor cria o desafio pela RPC da `20261117_03`, e o aluno responde como `authenticated`, com as
claims dele, como o PostgREST faria. Dados sintéticos.
"""

from __future__ import annotations

import json
import threading
import time
import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_desafio_na_missao as t2
from tests import test_e2e_missao_desafio_criar as t3
from tests import test_e2e_premio_de_missao_na_turma as t1

e2e = f5.e2e

M = f5.modulo("20261117_04_missao_desafio_responder.py")
M_VETOR = f5.modulo("20261111_01_vetor_perfil_no_banco.py")
M_VISIVEL = f5.modulo("20261110_10_visibilidade_do_topico.py")
M_TRAVA = f5.modulo("20261102_05_trava_da_personalizacao.py")
M_COORTE = f5.modulo("20261102_02_estudo_coorte_e_marcos.py")
# Só a tabela da coorte (os gatilhos e as RPCs da `20261102_02` não entram: a coorte é semeada pelo dono).
_INICIO_COORTE = "CREATE TABLE IF NOT EXISTS public.estudo_coorte ("
TABELA_COORTE = M_COORTE.TABELAS[
    M_COORTE.TABELAS.index(_INICIO_COORTE) : M_COORTE.TABELAS.index(");", M_COORTE.TABELAS.index(_INICIO_COORTE)) + 2
]
CONTEUDO_T2 = 902  # conteúdo da turma 2 (do mesmo professor), para a coorte não retida

TURMA = f5.TURMA
A, B, C = f5.A, f5.B, f5.C
D = uuid.UUID(int=24)  # aluno de outra turma, com o mesmo perfil de A

LOGICA = t3.LOGICA
LOGICA_RESPOSTA = t3.LOGICA_RESPOSTA  # aceitas "16" e "dezesseis"
CRUZADINHA = t3.CRUZADINHA
PALAVRAS = t3.PALAVRAS

PERFIS = ("seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever")


def _banco(com_migration: bool = True, *depois: str):
    return f5.banco(
        *t1._cadeia(),
        *f5.sql_de(t3.M_T1),
        t2.METRICAS,
        t2.TABELA_RETENCAO,
        t3.M_T2.M06.guarda(),
        t2.GATILHO_GUARDA,
        *t2._policies_de_missoes(),
        t3.M_IA.LOG,
        *f5.sql_de(t3.M_T2),
        *f5.sql_de(t3.M),
        M_VETOR.FUNCOES,
        # Visibilidade do tópico (20261110_10): as colunas e os helpers que a policy e o portão leem.
        M_VISIVEL.COLUNAS,
        M_VISIVEL.FUNCOES,
        M_VISIVEL.GRANTS,
        # Trava do estudo (20261102_05): a tabela da coorte e os helpers.
        TABELA_COORTE,
        M_TRAVA.FUNCOES,
        *(f5.sql_de(M) if com_migration else []),
        *depois,
    )


def _semear(c) -> None:
    """A: mastermind 50 e achiever 30 (os dois representativos). B: seeker e survivor. C: sem perfil.
    D: mastermind, matriculado só na turma de outro professor."""
    t3._semear(c)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES ('{D}', 'd@teste.invalid');
INSERT INTO public.alunos (id, nome, email) VALUES ('{D}', 'D', 'd@teste.invalid');
INSERT INTO public.classe_aluno (classe_id, aluno_id, created_at) VALUES ({t2.TURMA_OUTRA}, '{D}', now());
"""
    )
    for i, nome in enumerate(PERFIS, start=1):
        c.execute(
            "INSERT INTO public.perfil (id, nome) OVERRIDING SYSTEM VALUE VALUES (%s, %s)", (i, nome.capitalize())
        )
    vetor = {A: {"mastermind": 50, "achiever": 30, "seeker": 0}, B: {"seeker": 80, "survivor": 20}, D: {"mastermind": 90}}
    # A coluna nasce com default `rascunho` para tópico novo; os tópicos daqui estão publicados.
    c.execute(
        "INSERT INTO public.conteudos (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES (%s, 20, 'Outro')",
        (CONTEUDO_T2,),
    )
    c.execute("UPDATE public.topicos SET publicacao = 'publicado'")
    for aluno, afinidades in vetor.items():
        for nome, afinidade in afinidades.items():
            c.execute(
                "INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES (%s, %s, %s)",
                (aluno, PERFIS.index(nome) + 1, afinidade),
            )


def _criar(c, desafio: dict, resposta: dict, perfis) -> dict[str, int]:
    """O professor cria pela RPC da `20261117_03`; devolve {perfil: missao_id}."""
    return {p: m for m, p, _ in t3._criar(c, f5.PROF, desafio, resposta, list(perfis))}


def _responder(c, quem: uuid.UUID, missao: int, resposta: dict) -> dict:
    with c.transaction():
        t1._como_cliente(c, quem)
        return c.execute(
            "SELECT public.missao_desafio_responder(%s, %s)", (missao, json.dumps(resposta))
        ).fetchone()[0]


def _premios(c, aluno: uuid.UUID = A) -> list[tuple]:
    return c.execute(
        "SELECT classe_id, tipo, referencia, valor FROM public.eventos_aluno"
        " WHERE aluno_id = %s AND tipo LIKE 'desafio_%%' ORDER BY id",
        (aluno,),
    ).fetchall()


def _tentativas(c, aluno: uuid.UUID = A) -> list[tuple]:
    return c.execute(
        "SELECT missao_id, acertou, palavras_certas, palavras_total FROM public.missao_desafio_tentativa"
        " WHERE aluno_id = %s ORDER BY id",
        (aluno,),
    ).fetchall()


def _concluidas(c, aluno: uuid.UUID = A) -> list[tuple]:
    return c.execute(
        "SELECT missao_id, status, progresso, concluida_em IS NOT NULL FROM public.missao_aluno"
        " WHERE aluno_id = %s ORDER BY missao_id",
        (aluno,),
    ).fetchall()


CERTA = {"resposta": "16"}
ERRADA = {"resposta": "15"}


def test_cadeia() -> None:
    assert (M.revision, M.down_revision) == ("20261117_04", "20261117_03")


# ------------------------------------------------------------------------------------- pagamento


@e2e
def test_acerto_paga_uma_vez() -> None:
    with _banco() as c:
        _semear(c)
        ids = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind", "achiever"])
        mm = ids["mastermind"]
        with c.transaction():
            t1._como_cliente(c, A)
            retorno = c.execute(
                "SELECT public.missao_desafio_responder(%s, %s)", (mm, json.dumps(CERTA))
            ).fetchone()[0]
            # O sinal do prêmio voltou a vazio na transação do aluno.
            assert c.execute("SELECT current_setting('app.missao_premiando', true)").fetchone()[0] == ""
        assert retorno == {"acertou": True, "ja_concluida": False, "palavras_certas": None, "palavras_total": None}
        assert _concluidas(c) == [(mm, "concluida", 100, True)]
        # O prêmio tem a turma e o valor de `desafio_logica` (10 pontos, 2 moedas).
        assert _premios(c) == [(TURMA, "desafio_logica", f"missao:{mm}", 10)]
        assert c.execute(
            "SELECT classe_id, delta FROM public.moedas_ledger WHERE aluno_id = %s AND referencia = %s",
            (A, f"missao:{mm}"),
        ).fetchall() == [(TURMA, 2)]
        assert _tentativas(c) == [(mm, True, None, None)]


@e2e
def test_segundo_acerto_ja_concluida() -> None:
    with _banco() as c:
        _semear(c)
        mm = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind"])["mastermind"]
        _responder(c, A, mm, CERTA)
        assert _responder(c, A, mm, {"resposta": " Dezesseis "}) == {
            "acertou": True, "ja_concluida": True, "palavras_certas": None, "palavras_total": None,
        }
        assert len(_premios(c)) == 1
        # Errar depois de concluir continua `ja_concluida` e não desfaz nada.
        assert _responder(c, A, mm, ERRADA)["ja_concluida"] is True
        assert _concluidas(c) == [(mm, "concluida", 100, True)]
        assert [t[1] for t in _tentativas(c)] == [True, True, False]


@e2e
def test_erra_e_depois_acerta_paga() -> None:
    """Tentativa errada não conta como resolvido: só a certa marca `ja_concluida`."""
    with _banco() as c:
        _semear(c)
        mm = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind"])["mastermind"]
        for _ in range(2):
            assert _responder(c, A, mm, ERRADA) == {
                "acertou": False, "ja_concluida": False, "palavras_certas": None, "palavras_total": None,
            }
        assert _responder(c, A, mm, CERTA) == {
            "acertou": True, "ja_concluida": False, "palavras_certas": None, "palavras_total": None,
        }
        assert _premios(c) == [(TURMA, "desafio_logica", f"missao:{mm}", 10)]
        assert _concluidas(c) == [(mm, "concluida", 100, True)]


@e2e
def test_outra_linha_do_grupo_nao_paga() -> None:
    """Foco da revisão 2: resolve pela linha mastermind, troca o ativo e resolve pela achiever."""
    with _banco() as c:
        _semear(c)
        ids = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind", "achiever"])
        c.execute("UPDATE public.alunos SET perfil_ativo = 'mastermind' WHERE id = %s", (A,))
        assert _responder(c, A, ids["mastermind"], CERTA)["ja_concluida"] is False
        c.execute("UPDATE public.alunos SET perfil_ativo = 'achiever' WHERE id = %s", (A,))
        assert _responder(c, A, ids["achiever"], CERTA) == {
            "acertou": True, "ja_concluida": True, "palavras_certas": None, "palavras_total": None,
        }
        assert _premios(c) == [(TURMA, "desafio_logica", f"missao:{ids['mastermind']}", 10)]
        # A linha achiever não vira concluída: o desafio já estava pago pela outra.
        assert _concluidas(c) == [(ids["mastermind"], "concluida", 100, True)]


@e2e
def test_apagar_a_linha_resolvida_nao_paga_de_novo() -> None:
    """O professor apaga a linha pela qual o aluno resolveu; a linha irmã responde `ja_concluida`."""
    with _banco() as c:
        _semear(c)
        ids = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind", "achiever"])
        mm, ac = ids["mastermind"], ids["achiever"]
        assert _responder(c, A, mm, CERTA)["ja_concluida"] is False
        with c.transaction():
            t1._como_cliente(c, f5.PROF)
            c.execute("DELETE FROM public.missoes WHERE id = %s", (mm,))
        # A conclusão da linha sai em cascata; a tentativa fica, sem a missão.
        assert _concluidas(c) == []
        assert _tentativas(c) == [(None, True, None, None)]
        assert _responder(c, A, ac, CERTA) == {
            "acertou": True, "ja_concluida": True, "palavras_certas": None, "palavras_total": None,
        }
        # Um prêmio só, o da linha apagada, que fica no razão.
        assert _premios(c) == [(TURMA, "desafio_logica", f"missao:{mm}", 10)]
        assert _concluidas(c) == []
        # O professor continua vendo as tentativas do grupo, inclusive a da linha apagada.
        assert t2._conta(c, f5.PROF, "SELECT count(*) FROM public.missao_desafio_tentativa") == 2
        assert t2._conta(c, t2.PROF_2, "SELECT count(*) FROM public.missao_desafio_tentativa") == 0
        assert t2._conta(c, A, "SELECT count(*) FROM public.missao_desafio_tentativa") == 2
        # A linha apagada continua contando no limite do grupo.
        grupo = c.execute("SELECT desafio_grupo FROM public.missoes WHERE id = %s", (ac,)).fetchone()[0]
        for _ in range(M.LIMITE_POR_HORA - 2):
            c.execute(
                "INSERT INTO public.missao_desafio_tentativa (missao_id, desafio_grupo, aluno_id, acertou)"
                " VALUES (NULL, %s, %s, false)",
                (grupo, A),
            )
        with pytest.raises(psycopg.errors.RaiseException):
            _responder(c, A, ac, CERTA)


@e2e
def test_tentativa_sai_com_a_conta() -> None:
    """Retenção `vida_da_conta` pela coluna `aluno_id`: com `missao_id` nulo, a FK de `alunos` ainda a leva."""
    with _banco() as c:
        _semear(c)
        ids = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind", "achiever"])
        _responder(c, A, ids["mastermind"], CERTA)
        c.execute("DELETE FROM public.missoes WHERE id = %s", (ids["mastermind"],))
        assert c.execute(
            "SELECT acao, coluna_aluno, motivo FROM public.retencao_politica WHERE tabela = 'missao_desafio_tentativa'"
        ).fetchall() == [("vida_da_conta", "aluno_id", M._MOTIVO)]
        c.execute("DELETE FROM public.alunos WHERE id = %s", (A,))
        assert c.execute("SELECT count(*) FROM public.missao_desafio_tentativa").fetchone()[0] == 0


@e2e
def test_paralelo_paga_uma_vez() -> None:
    """Duas conexões ao mesmo tempo, cada uma por uma linha do grupo: só a trava do grupo as separa
    (o único de `missao_aluno` é por missão, e aqui as missões são diferentes)."""
    with _banco() as c:
        _semear(c)
        ids = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind", "achiever"])
        dsn = f5._dsn_para(c.info.dbname)
        resultado: dict = {}
        with psycopg.connect(dsn) as c1, psycopg.connect(dsn) as c2:
            t1._como_cliente(c1, A)
            primeiro = c1.execute(
                "SELECT public.missao_desafio_responder(%s, %s)", (ids["mastermind"], json.dumps(CERTA))
            ).fetchone()[0]

            def segundo() -> None:
                try:
                    t1._como_cliente(c2, A)
                    resultado["r"] = c2.execute(
                        "SELECT public.missao_desafio_responder(%s, %s)", (ids["achiever"], json.dumps(CERTA))
                    ).fetchone()[0]
                    c2.commit()
                except Exception as erro:  # noqa: BLE001 - levado ao assert abaixo
                    resultado["erro"] = erro

            fio = threading.Thread(target=segundo)
            fio.start()
            esperou = False
            for _ in range(60):
                if c.execute(
                    "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()"
                    " AND wait_event_type = 'Lock' AND wait_event = 'advisory'"
                ).fetchone()[0]:
                    esperou = True
                    break
                time.sleep(0.05)
            c1.commit()
            fio.join(15)
        assert "erro" not in resultado, resultado.get("erro")
        assert primeiro["acertou"] is True and primeiro["ja_concluida"] is False
        assert resultado["r"]["acertou"] is True and resultado["r"]["ja_concluida"] is True
        assert len(_premios(c)) == 1
        assert esperou, "a segunda chamada não esperou a trava do grupo"


@e2e
def test_erro_grava_tentativa_sem_premio() -> None:
    with _banco() as c:
        _semear(c)
        mm = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind"])["mastermind"]
        assert _responder(c, A, mm, ERRADA) == {
            "acertou": False, "ja_concluida": False, "palavras_certas": None, "palavras_total": None,
        }
        assert _tentativas(c) == [(mm, False, None, None)]
        assert _premios(c) == []
        assert _concluidas(c) == []


@e2e
def test_resposta_mal_formada_recusada_sem_gravar() -> None:
    with _banco() as c:
        _semear(c)
        ids = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind"])
        cruz = _criar(c, CRUZADINHA, t3.CRUZADINHA_RESPOSTA, ["mastermind"])
        for missao, resposta in (
            (ids["mastermind"], {}),
            (ids["mastermind"], {"resposta": 16}),
            (ids["mastermind"], {"resposta": "x" * 1001}),
            (cruz["mastermind"], {"palavras": ["BANCO"]}),
            (cruz["mastermind"], {"resposta": "BANCO"}),
        ):
            with pytest.raises(psycopg.errors.InvalidParameterValue):
                _responder(c, A, missao, resposta)
        assert _tentativas(c) == []


@e2e
def test_cruzadinha_com_mais_de_20_chaves_recusada() -> None:
    with _banco() as c:
        _semear(c)
        mm = _criar(c, CRUZADINHA, t3.CRUZADINHA_RESPOSTA, ["mastermind"])["mastermind"]
        palavras = {**PALAVRAS, **{f"{n}h": "X" for n in range(10, 26)}}
        assert len(palavras) == 21
        with pytest.raises(psycopg.errors.InvalidParameterValue):
            _responder(c, A, mm, {"palavras": palavras})
        assert _tentativas(c) == []
        # 20 chaves passam (as que a grade não tem são ignoradas).
        assert _responder(c, A, mm, {"palavras": dict(list(palavras.items())[:20])})["palavras_certas"] == 5


@e2e
def test_cruzadinha_com_palavra_de_mais_de_100_caracteres_recusada() -> None:
    with _banco() as c:
        _semear(c)
        mm = _criar(c, CRUZADINHA, t3.CRUZADINHA_RESPOSTA, ["mastermind"])["mastermind"]
        for valor in ("B" * 101, {"x": "B" * 100}):
            with pytest.raises(psycopg.errors.InvalidParameterValue):
                _responder(c, A, mm, {"palavras": {**PALAVRAS, "zz": valor}})
        assert _tentativas(c) == []
        assert _responder(c, A, mm, {"palavras": {**PALAVRAS, "zz": "B" * 100}})["acertou"] is True


# ---------------------------------------------------------------------------------- cruzadinha


@e2e
def test_cruzadinha_conta_palavras_certas() -> None:
    with _banco() as c:
        _semear(c)
        mm = _criar(c, CRUZADINHA, t3.CRUZADINHA_RESPOSTA, ["mastermind"])["mastermind"]
        resposta = {"palavras": {"1h": "banco", "1v": "Bola", "2v": "NADO", "3v": 7, "zz": "ORA"}}
        retorno = _responder(c, A, mm, resposta)
        assert retorno == {"acertou": False, "ja_concluida": False, "palavras_certas": 2, "palavras_total": 5}
        assert _tentativas(c) == [(mm, False, 2, 5)]
        assert _premios(c) == []
        # Todas certas: paga.
        assert _responder(c, A, mm, t3.CRUZADINHA_RESPOSTA) == {
            "acertou": True, "ja_concluida": False, "palavras_certas": 5, "palavras_total": 5,
        }
        assert _premios(c) == [(TURMA, "desafio_cruzadinha", f"missao:{mm}", 10)]


@e2e
def test_normaliza() -> None:
    """Foco da revisão 4 e a regra da vírgula decimal na resposta curta."""
    with _banco() as c:
        _semear(c)
        coracao = _criar(c, LOGICA, {"aceitas": ["Coração "]}, ["mastermind"])["mastermind"]
        assert _responder(c, A, coracao, {"resposta": "CORACAO"})["acertou"] is True

        virgula = _criar(c, LOGICA, {"aceitas": ["3,5"]}, ["mastermind"])["mastermind"]
        assert _responder(c, A, virgula, {"resposta": "35"})["acertou"] is False
        assert _responder(c, A, virgula, {"resposta": " 3.5 "})["acertou"] is True

        ponto = _criar(c, LOGICA, {"aceitas": ["3.5"]}, ["mastermind"])["mastermind"]
        assert _responder(c, A, ponto, {"resposta": "3,5"})["acertou"] is True

        multipla = _criar(c, t3.MULTIPLA, {"aceitas": ["Dicionário"]}, ["mastermind"])["mastermind"]
        assert _responder(c, A, multipla, {"resposta": "Lista"})["acertou"] is False
        assert _responder(c, A, multipla, {"resposta": "dicionario"})["acertou"] is True

        # A grade é sem acento e sem espaço; a resposta com ou sem eles vale.
        palavras = {**PALAVRAS, "1h": "BÂNCO", "4h": "A LA"}
        cruz = _criar(c, CRUZADINHA, {"palavras": palavras}, ["mastermind"])["mastermind"]
        resposta = {"palavras": {**PALAVRAS, "1h": "banco", "4h": "a  la"}}
        assert _responder(c, A, cruz, resposta)["palavras_certas"] == 5


@e2e
def test_resposta_nunca_volta() -> None:
    with _banco() as c:
        _semear(c)
        logica = _criar(c, LOGICA, {"aceitas": ["dezesseis"]}, ["mastermind"])["mastermind"]
        cruz = _criar(c, CRUZADINHA, t3.CRUZADINHA_RESPOSTA, ["mastermind"])["mastermind"]
        retornos = [
            _responder(c, A, logica, ERRADA),
            _responder(c, A, logica, {"resposta": "dezesseis"}),
            _responder(c, A, cruz, {"palavras": {"1h": "BANCO"}}),
            _responder(c, A, cruz, t3.CRUZADINHA_RESPOSTA),
        ]
        segredos = ["dezesseis", *PALAVRAS.values(), *(p.lower() for p in PALAVRAS.values())]
        for retorno in retornos:
            assert set(retorno) == {"acertou", "ja_concluida", "palavras_certas", "palavras_total"}
            # Só os valores: a chave `palavras_*` contém "ala" sem ter nada a ver com a grade.
            texto = json.dumps(list(retorno.values()))
            assert not any(s in texto for s in segredos), texto


# --------------------------------------------------------------------------------------- acesso


@e2e
def test_outra_turma_recusada() -> None:
    with _banco() as c:
        _semear(c)
        mm = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind"])["mastermind"]
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _responder(c, D, mm, CERTA)
        assert _tentativas(c, D) == [] and _premios(c, D) == []


@e2e
def test_perfil_que_nao_e_do_aluno_recusado() -> None:
    with _banco() as c:
        _semear(c)
        ids = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind", "achiever"])
        for aluno in (B, C):  # B não tem esses perfis; C não tem perfil nenhum
            for missao in ids.values():
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    _responder(c, aluno, missao, CERTA)
            assert _tentativas(c, aluno) == []
        # Controle: o seeker de B passa.
        seeker = _criar(c, LOGICA, LOGICA_RESPOSTA, ["seeker"])["seeker"]
        assert _responder(c, B, seeker, CERTA)["acertou"] is True


@e2e
def test_linha_de_outro_perfil_recusada() -> None:
    """A tem achiever e não seeker: a linha seeker do grupo é recusada, mesmo com a irmã dele no ar."""
    with _banco() as c:
        _semear(c)
        ids = _criar(c, LOGICA, LOGICA_RESPOSTA, ["achiever", "seeker"])
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _responder(c, A, ids["seeker"], CERTA)
        assert _tentativas(c) == []
        # Pela linha do perfil dele, paga, e a conclusão fica nela.
        assert _responder(c, A, ids["achiever"], CERTA)["acertou"] is True
        assert _concluidas(c) == [(ids["achiever"], "concluida", 100, True)]
        assert _premios(c) == [(TURMA, "desafio_logica", f"missao:{ids['achiever']}", 10)]


def _ve(c, quem: uuid.UUID, missao: int) -> bool:
    return t2._conta(c, quem, "SELECT count(*) FROM public.missoes WHERE id = %s", (missao,)) == 1


def _recusa(c, quem: uuid.UUID, missao: int, codigo: str) -> None:
    with pytest.raises(psycopg.errors.InsufficientPrivilege) as erro:
        _responder(c, quem, missao, CERTA)
    assert erro.value.diag.message_primary == codigo


@e2e
def test_topico_nao_publicado_esconde_e_recusa() -> None:
    with _banco() as c:
        _semear(c)
        mm = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind"])["mastermind"]
        comum = t1._missao(c, {"metrica": "atividades_concluidas", "minimo": 1}, "missao_concluida")
        # Publicado: tudo normal.
        assert _ve(c, A, mm) and _ve(c, f5.PROF, mm)
        for estado, quando in (("rascunho", None), ("agendado", "now() + interval '1 day'")):
            c.execute(
                f"UPDATE public.topicos SET publicacao = %s, publicar_em = {quando or 'NULL'} WHERE id = 10", (estado,)
            )
            assert not _ve(c, A, mm), estado
            assert _ve(c, f5.PROF, mm), estado  # o professor dono vê sempre
            assert _ve(c, A, comum), estado  # missão comum não tem conteúdo e não some
            _recusa(c, A, mm, "topico_nao_publicado")
        assert _tentativas(c) == []
        # Agendado que já abriu: aparece e responde.
        c.execute("UPDATE public.topicos SET publicar_em = now() - interval '1 minute' WHERE id = 10")
        assert _ve(c, A, mm)
        assert _responder(c, A, mm, CERTA)["acertou"] is True


@e2e
def test_turma_retida_pelo_estudo_esconde_e_recusa() -> None:
    """Turma 1 retida (intervenção antes do corte); turma 2 liberada (comparação depois do fim)."""
    with _banco() as c:
        _semear(c)
        c.execute("INSERT INTO public.classe_aluno (classe_id, aluno_id, created_at) VALUES (%s, %s, now())", (t2.TURMA_2, A))
        retido = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind"])["mastermind"]
        livre = {p: m for m, p, _ in t3._criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["mastermind"], CONTEUDO_T2)}["mastermind"]
        comum = t1._missao(c, {"metrica": "atividades_concluidas", "minimo": 1}, "missao_concluida")
        c.execute(
            "INSERT INTO public.estudo_coorte (classe_id, estudo, rotulo, braco, baseline_inicio, corte, fim) VALUES"
            " (%s, 'e', 'r1', 'intervencao', current_date - 10, current_date + 10, NULL),"
            " (%s, 'e', 'r2', 'comparacao', current_date - 40, current_date - 30, current_date - 5)",
            (TURMA, t2.TURMA_2),
        )
        assert not _ve(c, A, retido)
        assert _ve(c, f5.PROF, retido)  # o professor dono vê o que vai ser liberado
        assert _ve(c, A, comum)  # missão comum não é intervenção da IA
        _recusa(c, A, retido, "personalizacao_retida")
        assert _tentativas(c) == []
        # A turma não retida segue normal.
        assert _ve(c, A, livre)
        assert _responder(c, A, livre, CERTA)["acertou"] is True
        # No corte, a intervenção libera.
        c.execute("UPDATE public.estudo_coorte SET corte = current_date, baseline_inicio = current_date - 10 WHERE classe_id = %s", (TURMA,))
        assert _ve(c, A, retido)
        assert _responder(c, A, retido, CERTA)["acertou"] is True


@e2e
def test_professor_matriculado_na_turma_retida_ve_e_edita() -> None:
    """Nada impede o professor de estar matriculado na própria turma: a trava não pode tirar dele o desafio."""
    with _banco() as c:
        _semear(c)
        retido = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind"])["mastermind"]
        c.execute(
            "INSERT INTO public.alunos (id, nome, email) VALUES (%s, 'P', 'p@teste.invalid') ON CONFLICT (id) DO NOTHING",
            (f5.PROF,),
        )
        c.execute("INSERT INTO public.classe_aluno (classe_id, aluno_id, created_at) VALUES (%s, %s, now())", (TURMA, f5.PROF))
        c.execute(
            "INSERT INTO public.estudo_coorte (classe_id, estudo, rotulo, braco, baseline_inicio, corte, fim) VALUES"
            " (%s, 'e', 'r1', 'intervencao', current_date - 10, current_date + 10, NULL)",
            (TURMA,),
        )
        assert not _ve(c, A, retido)
        assert _ve(c, f5.PROF, retido)
        with c.transaction():
            t1._como_cliente(c, f5.PROF)
            afetadas = c.execute("UPDATE public.missoes SET ativa = false WHERE id = %s", (retido,)).rowcount
        assert afetadas == 1


@e2e
def test_missao_inativa_recusada() -> None:
    with _banco() as c:
        _semear(c)
        ids = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind", "achiever"])
        with c.transaction():
            t1._como_cliente(c, f5.PROF)
            c.execute("UPDATE public.missoes SET ativa = false WHERE id = %s", (ids["mastermind"],))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _responder(c, A, ids["mastermind"], CERTA)
        assert _tentativas(c) == [] and _premios(c) == []
        # A outra linha do grupo continua de pé.
        assert _responder(c, A, ids["achiever"], CERTA)["acertou"] is True


@e2e
def test_missao_comum_e_janela_recusadas() -> None:
    with _banco() as c:
        _semear(c)
        comum = t1._missao(c, {"metrica": "atividades_concluidas", "minimo": 1}, "missao_concluida")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _responder(c, A, comum, CERTA)
        mm = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind"])["mastermind"]
        with c.transaction():
            t1._como_cliente(c, f5.PROF)
            c.execute("UPDATE public.missoes SET janela_fim = now() - interval '1 day' WHERE id = %s", (mm,))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _responder(c, A, mm, CERTA)


@e2e
def test_professor_dono_e_missao_nula_recusados() -> None:
    with _banco() as c:
        _semear(c)
        mm = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind"])["mastermind"]
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _responder(c, f5.PROF, mm, CERTA)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                t1._como_cliente(c, A)
                c.execute("SELECT public.missao_desafio_responder(NULL, %s)", (json.dumps(CERTA),))
        assert c.execute("SELECT count(*) FROM public.missao_desafio_tentativa").fetchone()[0] == 0


@e2e
def test_sem_sessao_e_anon_recusados() -> None:
    with _banco() as c:
        _semear(c)
        mm = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind"])["mastermind"]
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                c.execute("SET LOCAL ROLE authenticated")
                c.execute("SELECT public.missao_desafio_responder(%s, %s)", (mm, json.dumps(CERTA)))
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="permission denied"):
            with c.transaction():
                t1._como_cliente(c, A, papel="anon")
                c.execute("SELECT public.missao_desafio_responder(%s, %s)", (mm, json.dumps(CERTA)))


# --------------------------------------------------------------------------------------- limite


@e2e
def test_limite_por_hora() -> None:
    with _banco() as c:
        _semear(c)
        ids = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind", "achiever"])
        for i in range(M.LIMITE_POR_HORA):
            # O limite é do grupo: as duas linhas somam.
            _responder(c, A, ids["mastermind" if i % 2 else "achiever"], ERRADA)
        with pytest.raises(psycopg.errors.RaiseException) as erro:
            _responder(c, A, ids["mastermind"], CERTA)
        assert erro.value.diag.sqlstate == "P0001"
        assert erro.value.diag.message_primary == "limite_de_tentativas"
        assert len(_tentativas(c)) == M.LIMITE_POR_HORA
        assert _premios(c) == [] and _concluidas(c) == []
        # Outro desafio não entra na conta.
        outro = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind"])["mastermind"]
        assert _responder(c, A, outro, CERTA)["acertou"] is True


@e2e
def test_limite_e_da_ultima_hora() -> None:
    with _banco() as c:
        _semear(c)
        mm = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind"])["mastermind"]
        grupo = c.execute("SELECT desafio_grupo FROM public.missoes WHERE id = %s", (mm,)).fetchone()[0]
        for _ in range(M.LIMITE_POR_HORA):
            c.execute(
                "INSERT INTO public.missao_desafio_tentativa (missao_id, desafio_grupo, aluno_id, acertou, criado_em)"
                " VALUES (%s, %s, %s, false, now() - interval '61 minutes')",
                (mm, grupo, A),
            )
        assert _responder(c, A, mm, CERTA)["acertou"] is True


# ------------------------------------------------------------------------------- upgrade e downgrade


def _estado(c) -> dict:
    return {
        "funcoes": c.execute(
            "SELECT array_agg(proname ORDER BY proname) FROM pg_proc WHERE pronamespace = 'public'::regnamespace"
            " AND proname IN ('missao_desafio_responder', 'fn_missao_desafio_comparavel')"
        ).fetchone()[0],
        # Toda FK de `missao_id` em `missao_desafio_tentativa`, pelo nome que tiver: tem de ser uma só.
        "fk": c.execute(
            "SELECT array_agg(con.confdeltype::text ORDER BY con.conname) FROM pg_constraint con"
            " JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)"
            " WHERE con.conrelid = 'public.missao_desafio_tentativa'::regclass AND con.contype = 'f'"
            " AND a.attname = 'missao_id'"
        ).fetchone()[0],
        "nulo": c.execute(
            "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'missao_desafio_tentativa'"
            " AND column_name = 'missao_id'"
        ).fetchone()[0],
        "policy": c.execute(
            "SELECT qual FROM pg_policies WHERE policyname = 'missao_desafio_tentativa_professor_sel'"
        ).fetchone()[0],
        "motivo": c.execute(
            "SELECT motivo FROM public.retencao_politica WHERE tabela = 'missao_desafio_tentativa'"
        ).fetchone()[0],
        "indice": c.execute(
            "SELECT count(*) FROM pg_indexes WHERE indexname = 'missao_desafio_tentativa_missao_idx'"
        ).fetchone()[0],
        # A policy restritiva de `missoes` e o índice da cascata do conteúdo.
        "visivel": c.execute(
            "SELECT (SELECT array_agg(permissive) FROM pg_policies WHERE policyname = 'missoes_desafio_visivel_sel'),"
            " (SELECT count(*) FROM pg_indexes WHERE indexname = 'missoes_conteudo_idx')"
        ).fetchone(),
    }


@e2e
def test_upgrade_repete_sem_erro() -> None:
    with _banco() as c:
        antes = _estado(c)
        for sql in f5.sql_de(M):
            c.execute(sql)
        assert _estado(c) == antes
        assert antes["funcoes"] == ["fn_missao_desafio_comparavel", "missao_desafio_responder"]
        assert (antes["fk"], antes["nulo"], antes["motivo"], antes["indice"]) == (["n"], "YES", M._MOTIVO, 1)


@e2e
def test_downgrade_restaura() -> None:
    with _banco(com_migration=False) as c:
        _semear(c)
        antes = _estado(c)
        assert (antes["funcoes"], antes["fk"], antes["nulo"]) == (None, ["c"], "NO")
        for sql in f5.sql_de(M):
            c.execute(sql)
        depois = _estado(c)
        assert depois["policy"] != antes["policy"] and "desafio_grupo" in depois["policy"]
        assert antes["visivel"] == (None, 0) and depois["visivel"] == (["RESTRICTIVE"], 1)
        # Uma tentativa de linha apagada: o downgrade a tira para o NOT NULL voltar.
        ids = _criar(c, LOGICA, LOGICA_RESPOSTA, ["mastermind", "achiever"])
        _responder(c, A, ids["mastermind"], CERTA)
        _responder(c, A, ids["achiever"], ERRADA)
        c.execute("DELETE FROM public.missoes WHERE id = %s", (ids["mastermind"],))
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert _estado(c) == antes
        assert _tentativas(c) == [(ids["achiever"], False, None, None)]
