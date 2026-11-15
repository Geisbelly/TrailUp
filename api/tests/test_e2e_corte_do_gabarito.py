"""`20261110_04`: corte do gabarito (fase 3). O cliente não lê `resposta_correta` nem grava em `questao_aluno`.

Banco local com o esqueleto de produção e o que o caminho real atravessa: as RPCs de tentativa
(`20261101_13`), a guarda da atividade (`20261102_04`) e a correção no banco (`20261108_01`). O
GRANT de partida é o de produção (SELECT na tabela `questoes` inteira para `authenticated`). As
leituras e escritas do aluno rodam como `authenticated` com as claims dele.

O que se mede:

- o aluno lê as colunas de `questoes`, menos o gabarito; `select *` também falha, como no PostgREST;
- a view `vw_aluno_classe_detalhado` continua legível e devolve o gabarito nulo;
- INSERT e UPDATE do cliente em `questao_aluno` são recusados, e `questao_responder` continua gravando;
- a nota da atividade é a média do que o banco corrigiu, e os pontos do app têm teto nela;
- atividade sem questão continua com o acerto do app;
- o downgrade devolve o GRANT da tabela, a view com gabarito e a guarda de prazo.
"""

from __future__ import annotations

from decimal import Decimal

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_guarda_da_atividade_no_banco as guarda
from tests import test_e2e_questao_corrigida_no_banco as correcao
from tests import test_e2e_respostas_ricas as ricas
from tests import test_e2e_tentativas_com_tempo_do_servidor as fase1

pytestmark = f5.e2e

M = f5.modulo("20261110_04_corte_do_gabarito.py")
ATIVIDADE = fase1.ATIVIDADE  # 500, pontuação máxima 10
Q1, Q2 = guarda.QUESTOES  # 701 e 702, as duas da atividade 500
SEM_QUESTAO = 502

# O que a view lê, como em produção (lá o GRANT é de todas as tabelas para `authenticated`).
LEITURA_DA_VIEW = (
    "GRANT SELECT ON public.topicos, public.topico_aluno, public.conteudos, public.conteudo_aluno,"
    " public.atividades, public.atividade_conteudos, public.midias TO authenticated;"
)


def _antes() -> list[str]:
    return [
        guarda.RECALCULO,
        guarda.REVISAO,
        guarda.GRANTS,
        LEITURA_DA_VIEW,
        *f5.sql_de(guarda.M),
        correcao.PRODUCAO,
        *f5.sql_de(correcao.M),
    ]


# A view nasce aqui com a migration; em produção ela já existe com o GRANT, e o
# `CREATE OR REPLACE VIEW` o mantém.
GRANT_DA_VIEW = "GRANT SELECT ON public.vw_aluno_classe_detalhado TO authenticated;"


def _banco():
    return fase1._banco(*_antes(), *f5.sql_de(M), GRANT_DA_VIEW)


def _semear(c) -> None:
    guarda._semear(c)
    c.execute(
        # Palavras, não números: "1" seria lido como o índice de uma alternativa.
        "UPDATE public.questoes SET tipo = 'multipla', alternativas = '[\"dez\", \"vinte\", \"trinta\"]'::jsonb,"
        " resposta_correta = 'vinte' WHERE id IN (%s, %s)",
        (Q1, Q2),
    )
    c.execute("INSERT INTO public.questao_gabarito (questao_id, resposta_correta) SELECT id, resposta_correta FROM public.questoes")
    c.execute(
        "INSERT INTO public.atividades (id, topico_id, titulo, pontuacao_maxima)"
        " OVERRIDING SYSTEM VALUE VALUES (%s, 10, 'Entrega', 10)",
        (SEM_QUESTAO,),
    )
    f5.afrouxa(c, "topico_aluno")
    c.execute("INSERT INTO public.topico_aluno (aluno_id, topico_id) VALUES (%s, 10)", (f5.A,))


def _como(c, sql: str, params=(), quem=f5.A):
    return fase1._como(c, quem, sql, params)


def _responder(c, questao: int, resposta: str) -> dict:
    return _como(c, "SELECT public.questao_responder(%s, %s, 5)", (questao, resposta))[0][0]


def _concluir(c, acertos, pontos, atividade: int = ATIVIDADE) -> dict:
    tentativa = _como(c, "SELECT public.atividade_iniciar_tentativa(%s)", (atividade,))[0][0]["tentativa_id"]
    return _como(
        c,
        "SELECT public.atividade_responder_tentativa(%s, %s, %s, NULL)",
        (tentativa, acertos, pontos),
    )[0][0]


def test_aluno_le_a_questao_mas_nao_o_gabarito() -> None:
    with _banco() as c:
        _semear(c)
        linhas = _como(c, "SELECT id, enunciado, alternativas FROM public.questoes WHERE id = %s", (Q1,))
        assert linhas == [(Q1, "q1", ["dez", "vinte", "trinta"])]
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _como(c, "SELECT resposta_correta FROM public.questoes WHERE id = %s", (Q1,))
        # `select=*` do PostgREST pede a coluna também, e falha inteiro.
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _como(c, "SELECT * FROM public.questoes")


def test_o_grant_cobre_toda_coluna_menos_o_gabarito() -> None:
    with _banco() as c:
        colunas = {
            r[0]
            for r in c.execute(
                "SELECT column_name FROM information_schema.columns"
                " WHERE table_schema = 'public' AND table_name = 'questoes'"
            ).fetchall()
        }
        legiveis = {
            r[0]
            for r in c.execute(
                "SELECT column_name FROM information_schema.column_privileges"
                " WHERE table_schema = 'public' AND table_name = 'questoes'"
                " AND grantee = 'authenticated' AND privilege_type = 'SELECT'"
            ).fetchall()
        }
        assert legiveis == colunas - {"resposta_correta"}
        assert not c.execute(
            "SELECT has_table_privilege('anon', 'public.questoes', 'SELECT')"
            " OR has_column_privilege('anon', 'public.questoes', 'id', 'SELECT')"
        ).fetchone()[0]


def test_a_view_do_app_continua_legivel_sem_gabarito() -> None:
    with _banco() as c:
        _semear(c)
        linhas = _como(
            c,
            "SELECT questao_id, questao_resposta_correta FROM public.vw_aluno_classe_detalhado"
            " WHERE questao_id IS NOT NULL ORDER BY questao_id",
        )
        assert linhas == [(Q1, None), (Q2, None), (703, None)]
        # O `select('*')` de `Classe.loadDetalhado` também passa.
        assert _como(c, "SELECT count(*) FROM public.vw_aluno_classe_detalhado")[0][0] > 0


def test_cliente_nao_grava_em_questao_aluno_e_a_rpc_grava() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="questao_responder"):
            guarda._responder_questao(c, Q1)
        r = _responder(c, Q1, "vinte")
        assert (r["correta"], r["acertos_percentual"]) == (True, 100)
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="questao_responder"):
            _como(c, "UPDATE public.questao_aluno SET acertos_percentual = 100 WHERE aluno_id = %s", (f5.A,))
        assert c.execute("SELECT count(*) FROM public.questao_aluno").fetchone()[0] == 1


def test_a_nota_e_a_que_o_banco_corrigiu_e_os_pontos_tem_teto() -> None:
    with _banco() as c:
        _semear(c)
        _responder(c, Q1, "vinte")  # certa: 100
        _responder(c, Q2, "trinta")  # errada: 0
        # O app diz 100% e 10 pontos; o banco corrigiu 50%, então 5 é o teto.
        r = _concluir(c, 100, 10)
        assert (r["acertos_percentual"], r["pontuacao_obtida"]) == (50, 5)
        meta = c.execute(
            "SELECT avaliacao_metadata -> 'tentativa' FROM public.atividade_aluno WHERE aluno_id = %s AND atividade_id = %s",
            (f5.A, ATIVIDADE),
        ).fetchone()[0]
        assert (meta["acertos_do_app"], meta["pontos_do_app"]) == (100, 10)


def test_o_app_pode_baixar_os_pontos_e_vale_a_ultima_resposta() -> None:
    with _banco() as c:
        _semear(c)
        _responder(c, Q1, "trinta")  # errada; no modo imediato o gabarito aparece
        _responder(c, Q1, "vinte")  # depois de ver o gabarito, o banco grava 20
        _responder(c, Q2, "vinte")  # certa: 100
        r = _concluir(c, 100, 2)  # regra do app tirou pontos: 2 fica abaixo do teto de 6
        assert (r["acertos_percentual"], r["pontuacao_obtida"]) == (60, 2)
        assert guarda._linha(c)[2:] == (Decimal("60"), Decimal("2"))


def test_questao_sem_resposta_conta_zero() -> None:
    with _banco() as c:
        _semear(c)
        _responder(c, Q1, "vinte")
        r = _concluir(c, 100, 10)
        assert (r["acertos_percentual"], r["pontuacao_obtida"]) == (50, 5)


def test_atividade_sem_questao_fica_com_o_acerto_do_app() -> None:
    with _banco() as c:
        _semear(c)
        r = _concluir(c, 80, 8, atividade=SEM_QUESTAO)
        assert (r["acertos_percentual"], r["pontuacao_obtida"]) == (80, 8)


def test_downgrade_devolve_o_estado_da_fase_2() -> None:
    with _banco() as c:
        _semear(c)
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert _como(c, "SELECT resposta_correta FROM public.questoes WHERE id = %s", (Q1,)) == [("vinte",)]
        linhas = _como(
            c,
            "SELECT questao_resposta_correta FROM public.vw_aluno_classe_detalhado WHERE questao_id = %s",
            (Q1,),
        )
        assert linhas == [("vinte",)]
        guarda._responder_questao(c, Q1)  # sem prazo, a guarda da 20261102_04 deixa
        # A soma volta a ser a do app.
        assert _concluir(c, 100, 10)["acertos_percentual"] == 100


def test_por_cima_das_respostas_ricas() -> None:
    """O corte aplicado depois da `20261110_02` (spec B), com as policies de produção dela.

    `config_resposta` é coluna do aluno (ele precisa dela para responder) e entra no GRANT; o
    professor continua gravando a esperada dos tipos novos em `questao_gabarito`, cuja policy lê
    `questoes.atividade_id` como ele; e a correção da edge (`service_role`) passa pela guarda.
    """
    # Em produção `authenticated` tem INSERT/UPDATE em `questao_aluno`; sem isso a recusa viria do
    # GRANT, e não mediria a guarda.
    escrita = "GRANT INSERT, UPDATE ON public.questao_aluno TO authenticated;"
    with f5.banco(*_corpos_das_ricas(), escrita, *f5.sql_de(M)) as c:
        ricas._semear(c)
        assert ricas._aluno(c, f5.A, "SELECT config_resposta FROM public.questoes WHERE id = %s", (ricas.Q_NUM,)) == {
            "dimensao": "velocidade"
        }
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            ricas._aluno(c, f5.A, "SELECT resposta_correta FROM public.questoes WHERE id = %s", (ricas.Q_MULT,))

        ricas._como(
            c, f5.PROF, "authenticated",
            "UPDATE public.questao_gabarito SET resposta_correta = '12 m/s' WHERE questao_id = %s RETURNING questao_id",
            (ricas.Q_NUM,),
        )
        assert ricas._gabarito(c, ricas.Q_NUM)[0] == "12 m/s"

        r = ricas._servico(c, ricas.REGISTRAR, (f5.A, ricas.Q_NUM, "12 m/s", True))
        assert r["correta"] is True
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="questao_responder"):
            ricas._aluno(
                c, f5.A,
                "INSERT INTO public.questao_aluno (aluno_id, questao_id, atividade_id, tentativa, resposta, correta)"
                " VALUES (%s, %s, %s, 9, 'x', true) RETURNING id",
                (f5.A, ricas.Q_NUM, ricas.ATIV_NUM),
            )


def _corpos_das_ricas() -> list[str]:
    """O que o `_banco` do e2e das respostas ricas instala, na mesma ordem."""
    copias = [s for m in ricas.texto_rico.COPIAS for s in f5.sql_de(m)]
    q, tr = ricas.questao, ricas.texto_rico
    return [
        q.PRODUCAO, tr.PRODUCAO, tr.M.GABARITO_EM_TEXTO_PRODUCAO, q._tabela_de_tentativas(), q.PRAZO,
        *f5.sql_de(tr.M_QUESTAO), *copias, tr.GATILHOS, *f5.sql_de(tr.M), *f5.sql_de(ricas.NOTAS_FILA),
        ricas.M.GABARITO_DO_ALUNO_PRODUCAO, ricas.PRODUCAO, *f5.sql_de(ricas.M),
    ]
