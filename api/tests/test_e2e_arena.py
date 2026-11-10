"""A arena de ponta a ponta, com as funções de produção (`20261110_06`).

Postgres local: o esqueleto de 24/10 e, por cima, o retrato da arena de produção de 10/11
(`fixtures/arena_prod_20261110.sql`, 50 funções lidas do catálogo, com os mesmos GRANTs). Toda
chamada do aluno roda como `authenticated`, com o `sub` dele, pela porta que o app usa
(`desafio_responder`), então GRANT de EXECUTE e `auth.uid()` valem como no aparelho.

O que se mede:

- o duelo solo inteiro: criar, aceitar o convite, responder, fechar sozinho na última resposta,
  pagar os pontos (com o piso da derrota) e mover o Elo; `arena_listar` e `arena_desafio` mostram;
- a correção é a da atividade (`fn_questao_confere`): lacuna sem acento, gabarito por letra, por
  posição e "V" — tudo isso dava errado com a igualdade de texto de antes;
- o sorteio só traz o que o banco corrige na hora: dissertativa, código e numérica ficam de fora;
- responder de novo não revela o gabarito;
- recusa fecha sem adversário e sem Elo; o cooperativo também corrige pelo banco;
- o downgrade devolve a igualdade de texto (a lacuna sem acento volta a ser erro).
"""

from __future__ import annotations

import uuid

import psycopg
import pytest

from tests import _f5_banco as f5

pytestmark = f5.e2e

RETRATO = (f5.AQUI / "fixtures" / "arena_prod_20261110.sql").read_text(encoding="utf-8")
M06 = f5.modulo("20261110_06_arena_corrige_pelo_banco.py")
ATIVIDADE = 500
FORA = uuid.UUID(int=99)  # aluno de fora da turma

# id: (tipo da questão, alternativas, gabarito, resposta certa como o app manda)
OBJETIVAS = {
    901: ("multipla", '["Mitocôndria", "Ribossomo", "Núcleo"]', "Mitocôndria", "Mitocôndria"),
    902: ("verdadeiro_falso", '["Verdadeiro", "Falso"]', "verdadeiro", "Verdadeiro"),
    903: ("fill_blank", None, "fotossíntese", "fotossintese"),
}
FORA_DO_SORTEIO = {
    904: ("dissertativa", None, "A energia vem da luz"),
    905: ("codigo", None, "print(1)"),
    906: ("numerica", None, "10"),
}


def _banco(com_migration: bool = True):
    return f5.banco(RETRATO, *(f5.sql_de(M06) if com_migration else ()))


def _questao(c, qid: int, tipo: str, alts: str | None, gabarito: str) -> None:
    c.execute(
        "INSERT INTO public.questoes (id, atividade_id, enunciado, tipo, alternativas, resposta_correta)"
        " OVERRIDING SYSTEM VALUE VALUES (%s, %s, 'Enunciado', %s, %s, %s)",
        (qid, ATIVIDADE, tipo, alts, gabarito),
    )
    # Em produção o espelho é o gatilho `trg_questoes_espelha_gabarito`, fora do esqueleto.
    c.execute("INSERT INTO public.questao_gabarito (questao_id, resposta_correta) VALUES (%s, %s)", (qid, gabarito))


def _semear(c, questoes: dict | None = None) -> None:
    f5.semear_turma(c)
    for t in ("atividades", "questoes", "topico_aluno", "guildas", "guilda_membros"):
        f5.afrouxa(c, t)
    c.execute(
        f"INSERT INTO public.atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES ({ATIVIDADE}, 10, 'Bio')"
    )
    todas = questoes if questoes is not None else {
        **{k: v[:3] for k, v in OBJETIVAS.items()},
        **FORA_DO_SORTEIO,
    }
    for qid, (tipo, alts, gabarito) in todas.items():
        _questao(c, qid, tipo, alts, gabarito)
    # A questão só entra no sorteio liberada para TODOS os participantes: o tópico em andamento.
    for aluno in (f5.A, f5.B, f5.C):
        c.execute(
            "INSERT INTO public.topico_aluno (aluno_id, topico_id, status) VALUES (%s, 10, 'em andamento')", (aluno,)
        )


def _chama(c, quem, sql: str, *args):
    """Uma RPC como o PostgREST a chama: papel `authenticated` e o `sub` do aluno."""
    c.execute("BEGIN")
    try:
        f5.como(c, quem)
        c.execute("SET LOCAL ROLE authenticated")
        valor = c.execute(sql, args).fetchone()[0]
        c.execute("COMMIT")
        return valor
    except Exception:
        c.execute("ROLLBACK")
        raise


def _duelo(c, adversario=f5.B) -> str:
    d = _chama(
        c, f5.A,
        "SELECT public.arena_desafio_criar(1, 'solo', 'precisao', 10, NULL, NULL, ARRAY[%s]::uuid[])",
        adversario,
    )
    return d["id"]


def _responder(c, quem, desafio: str, questao: int, resposta: str) -> dict:
    return _chama(
        c, quem, "SELECT public.desafio_responder(%s::uuid, %s::bigint, %s::text, 1500)", desafio, questao, resposta
    )


def _sorteadas(c, desafio: str) -> list[int]:
    return [
        r[0]
        for r in c.execute(
            "SELECT questao_id FROM public.guilda_desafio_questoes WHERE desafio_id = %s ORDER BY ordem", (desafio,)
        )
    ]


def test_duelo_solo_de_ponta_a_ponta():
    with _banco() as c:
        _semear(c)
        desafio = _duelo(c)
        assert _chama(c, f5.B, "SELECT public.arena_convite_responder(%s::uuid, true)", desafio) == {"estado": "aceito"}

        sorteadas = _sorteadas(c, desafio)
        assert sorted(sorteadas) == sorted(OBJETIVAS)

        # A acerta tudo, como o app manda; B erra tudo.
        for q in sorteadas:
            r = _responder(c, f5.A, desafio, q, OBJETIVAS[q][3])
            assert r == {"correta": True, "registrada": True, "competitivo": True}, (q, r)
        assert c.execute("SELECT status FROM public.guilda_desafios WHERE id = %s", (desafio,)).fetchone()[0] == "aberto"
        for q in sorteadas:
            assert _responder(c, f5.B, desafio, q, "Núcleo")["correta"] is False

        # A última resposta fecha, sem varredura e sem `arena_encerrar` do cliente.
        assert c.execute(
            "SELECT status, resultado, vencedor_equipe FROM public.guilda_desafios WHERE id = %s", (desafio,)
        ).fetchone() == ("encerrado", "vitoria", 1)

        eventos = dict(
            ((str(a), t), int(v))
            for a, t, v in c.execute("SELECT aluno_id, tipo, valor FROM public.eventos_aluno").fetchall()
        )
        assert eventos == {
            (str(f5.A), "desafio_participou"): 3,
            (str(f5.A), "desafio_vencido"): 12,
            (str(f5.B), "desafio_participou"): 3,
            # O piso: a derrota não leva o saldo de duelos de B abaixo de zero.
            (str(f5.B), "desafio_derrota"): 0,
        }
        elo = dict(
            (str(a), (d, r))
            for a, d, r in c.execute("SELECT aluno_id, delta, rating_depois FROM public.ranqueada_elo_partida")
        )
        assert elo == {str(f5.A): (20, 1020), str(f5.B): (-20, 980)}

        # O que as telas leem.
        lista = _chama(c, f5.A, "SELECT public.arena_listar(1)")
        assert [(d["id"], d["status"], d["meu_elo"]["delta"]) for d in lista] == [(desafio, "encerrado", 20)]
        detalhe = _chama(c, f5.B, "SELECT public.arena_desafio(%s::uuid)", desafio)
        assert detalhe["meu_elo"]["delta"] == -20
        assert all(q["correta"] is False and q["resposta_correta"] for q in detalhe["questoes"])


@pytest.mark.parametrize(
    ("tipo", "alts", "gabarito", "resposta"),
    [
        ("fill_blank", None, "fotossíntese", "Fotossintese"),  # caixa e acento
        ("multipla", '["Ribossomo", "Mitocôndria"]', "B", "Mitocôndria"),  # gabarito por letra
        ("multipla", '["Ribossomo", "Mitocôndria"]', "1", "Mitocôndria"),  # gabarito por posição
        ("verdadeiro_falso", '["Verdadeiro", "Falso"]', "V", "Verdadeiro"),
        ("verdadeiro_falso", '["Verdadeiro", "Falso"]', "false", "Falso"),
    ],
)
def test_corrige_como_a_atividade(tipo, alts, gabarito, resposta):
    with _banco() as c:
        _semear(c, {901: (tipo, alts, gabarito)})
        desafio = _duelo(c)
        _chama(c, f5.B, "SELECT public.arena_convite_responder(%s::uuid, true)", desafio)
        assert _responder(c, f5.A, desafio, 901, resposta)["correta"] is True
        assert _responder(c, f5.B, desafio, 901, "outra coisa")["correta"] is False


def test_downgrade_volta_a_igualdade_de_texto():
    """A medida do defeito: sem a migration, a lacuna sem acento é erro."""
    with _banco() as c:
        for sql in f5.sql_de(M06, "downgrade"):
            c.execute(sql)
        assert c.execute("SELECT to_regprocedure('public.fn_questao_cabe_no_desafio(bigint)')").fetchone()[0] is None
        _semear(c, {903: OBJETIVAS[903][:3]})
        desafio = _duelo(c)
        _chama(c, f5.B, "SELECT public.arena_convite_responder(%s::uuid, true)", desafio)
        assert _responder(c, f5.A, desafio, 903, "fotossintese")["correta"] is False


def test_antes_da_migration_a_dissertativa_entra_no_duelo():
    with _banco(com_migration=False) as c:
        _semear(c, {904: FORA_DO_SORTEIO[904]})
        desafio = _duelo(c)
        assert _sorteadas(c, desafio) == [904]


def test_sorteio_so_traz_o_que_o_banco_corrige():
    with _banco() as c:
        _semear(c)
        for _ in range(5):  # o sorteio é aleatório: cinco duelos, nenhum traz as de fora
            desafio = _duelo(c, f5.C if _ % 2 else f5.B)
            assert set(_sorteadas(c, desafio)) == set(OBJETIVAS)
            c.execute("DELETE FROM public.guilda_desafios WHERE id = %s", (desafio,))


def test_turma_so_com_dissertativa_nao_abre_duelo():
    with _banco() as c:
        _semear(c, FORA_DO_SORTEIO)
        with pytest.raises(psycopg.errors.RaiseException, match="arena_sem_questoes_liberadas"):
            _duelo(c)
        assert c.execute("SELECT count(*) FROM public.guilda_desafios").fetchone()[0] == 0


def test_responder_de_novo_nao_revela_o_gabarito():
    with _banco() as c:
        _semear(c)
        desafio = _duelo(c)
        _chama(c, f5.B, "SELECT public.arena_convite_responder(%s::uuid, true)", desafio)
        assert _responder(c, f5.A, desafio, 901, "Núcleo")["correta"] is False
        # O certo, na segunda vez: antes vinha `correta: true` — o oráculo.
        assert _responder(c, f5.A, desafio, 901, "Mitocôndria") == {
            "correta": False, "registrada": False, "competitivo": True,
        }
        assert c.execute(
            "SELECT resposta, correta FROM public.guilda_desafio_respostas WHERE desafio_id = %s AND aluno_id = %s",
            (desafio, f5.A),
        ).fetchall() == [("Núcleo", False)]


def test_recusa_fecha_sem_adversario_e_sem_elo():
    with _banco() as c:
        _semear(c)
        desafio = _duelo(c)
        r = _chama(c, f5.B, "SELECT public.arena_convite_responder(%s::uuid, false)", desafio)
        assert r == {"estado": "recusado", "encerrou": True, "resultado": "sem_adversario"}
        assert c.execute("SELECT count(*) FROM public.ranqueada_elo_partida").fetchone()[0] == 0
        assert c.execute("SELECT count(*) FROM public.eventos_aluno").fetchone()[0] == 0


def test_quem_nao_esta_no_desafio_nao_responde():
    with _banco() as c:
        _semear(c)
        desafio = _duelo(c)
        _chama(c, f5.B, "SELECT public.arena_convite_responder(%s::uuid, true)", desafio)
        with pytest.raises(psycopg.errors.RaiseException, match="arena_sem_permissao"):
            _responder(c, f5.C, desafio, 901, "Mitocôndria")
        # Convidado que ainda não aceitou também não.
        outro = _duelo(c, f5.C)
        with pytest.raises(psycopg.errors.RaiseException, match="arena_sem_permissao"):
            _responder(c, f5.C, outro, _sorteadas(c, outro)[0], "x")


def test_cooperativo_corrige_pelo_banco():
    with _banco() as c:
        _semear(c, {903: OBJETIVAS[903][:3], 904: FORA_DO_SORTEIO[904]})
        # O anúncio no chat da guilda é cifrado em produção por um gatilho que usa a chave do
        # Vault, fora do retrato: aqui as colunas cifradas ficam opcionais.
        c.execute("ALTER TABLE public.guilda_mensagens ALTER COLUMN texto_cifrado DROP NOT NULL,"
                  " ALTER COLUMN conteudo_cifrado DROP NOT NULL")
        guilda = uuid.uuid4()
        c.execute("INSERT INTO public.guildas (id, classe_id, nome, ativa) VALUES (%s, 1, 'Guilda Teste', true)", (guilda,))
        c.execute("INSERT INTO public.guilda_membros (guilda_id, aluno_id) VALUES (%s, %s)", (guilda, f5.A))
        d = _chama(
            c, f5.A, "SELECT public.guilda_desafio_criar(%s::uuid, 'todos', 5, 'normal', 'treino', 'solo')", guilda
        )
        desafio = d["id"] if isinstance(d, dict) else d
        assert _sorteadas(c, str(desafio)) == [903]
        r = _responder(c, f5.A, str(desafio), 903, "fotossintese")
        assert r["correta"] is True and r["competitivo"] is False


def test_cliente_nao_chama_o_filtro_do_sorteio():
    with _banco() as c:
        assert c.execute(
            "SELECT has_function_privilege('authenticated', 'public.fn_questao_cabe_no_desafio(bigint)', 'EXECUTE'),"
            "       has_function_privilege('anon', 'public.fn_questao_cabe_no_desafio(bigint)', 'EXECUTE')"
        ).fetchone() == (False, False)
