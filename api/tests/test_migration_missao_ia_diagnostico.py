"""Diagnóstico agregado da saída do modelo e dos descartes de `fn_missao_ia_registrar`.

O Postgres local descarta o que não passa nas regras do banco e registra só
contagens por tentativa; nenhum texto da proposta é copiado para o diagnóstico.
"""

from __future__ import annotations

import json
import uuid

import pytest
from alembic.script import ScriptDirectory

from tests._f5_banco import DSN, afrouxa, banco, modulo, sql_de
from tests.test_migrations import _offline_alembic_config

mod = modulo("20261103_11_missao_ia_diagnostico.py")
m10 = modulo("20261103_10_missao_ia_metrica_pendente.py")
original = modulo("20261102_20_missoes_sugeridas_pela_ia.py")

e2e = pytest.mark.skipif(not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL não definida")

PRE = """
CREATE OR REPLACE FUNCTION public.app_classes_do_professor() RETURNS SETOF bigint LANGUAGE sql STABLE AS
$$ SELECT id FROM public.classe WHERE professor_id = auth.uid() $$;
"""

PROF = uuid.UUID(int=41)


def test_uma_cabeca_e_versao_segue_a_guarda_de_metrica() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261103_11").down_revision == "20261103_10"


def test_diagnostico_tem_so_contagens_e_motivos_agregados() -> None:
    sql = "\n".join(sql_de(mod))
    assert "CREATE TABLE public.missoes_ia_execucoes" in sql
    assert "motivos_descarte" in sql and "jsonb NOT NULL DEFAULT '{}'::jsonb" in sql
    assert "propostas_modelo" in sql
    assert "propostas_enviadas" in sql
    assert "REVOKE ALL ON public.missoes_ia_execucoes FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT SELECT ON public.missoes_ia_execucoes TO service_role" in sql
    assert "CREATE POLICY" not in sql
    assert "proposta_texto" not in sql and "payload jsonb" not in sql
    assert "fn_missao_ia_registrar_diagnostico(uuid, jsonb, integer) TO service_role" in sql
    assert "fn_missao_ia_registrar(uuid, jsonb) TO service_role" in sql


def test_funcao_antiga_e_preservada_e_downgrade_volta_a_10() -> None:
    sql = "\n".join(sql_de(mod))
    assert "CREATE OR REPLACE FUNCTION public.fn_missao_ia_registrar(p_pedido_id uuid, p_propostas jsonb)" in sql
    assert "fn_missao_ia_registrar_diagnostico(p_pedido_id, p_propostas, NULL)" in sql
    downgrade = "\n".join(sql_de(mod, "downgrade"))
    assert downgrade.startswith(m10.registrar_sql())
    assert "DROP FUNCTION IF EXISTS public.fn_missao_ia_registrar_diagnostico(uuid, jsonb, integer)" in downgrade
    assert "DROP TABLE IF EXISTS public.missoes_ia_execucoes" in downgrade


@pytest.fixture
def c():
    with banco(PRE, *sql_de(original), *sql_de(m10), *sql_de(mod)) as conn:
        for tabela in ("professor", "classe", "materia", "missoes"):
            afrouxa(conn, tabela)
        conn.execute(
            f"""
INSERT INTO auth.users (id, email) VALUES ('{PROF}', 'p@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{PROF}', 'P');
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Mat');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE
  VALUES (1, 1, '{PROF}', 'T1'), (2, 1, '{PROF}', 'T2');
"""
        )
        yield conn


def _pedido(c, classe: int = 1, quantidade: int = 3) -> uuid.UUID:
    return c.execute(
        """INSERT INTO public.missoes_ia_pedidos (classe_id, quantidade, solicitado_por, tentativas)
           VALUES (%s, %s, %s, 1) RETURNING id""",
        (classe, quantidade, PROF),
    ).fetchone()[0]


def _proposta(titulo: str, metrica: str, alvo: object, *, descricao: str | None = None) -> dict:
    return {
        "titulo": titulo,
        "descricao": descricao or f"{titulo} para fixar o conteúdo.",
        "metrica": metrica,
        "alvo": alvo,
    }


def _registrar(c, pedido, propostas: list[dict], propostas_modelo: int | None) -> int:
    return c.execute(
        """SELECT public.fn_missao_ia_registrar_diagnostico(%s, %s::jsonb, %s)""",
        (pedido, json.dumps(propostas), propostas_modelo),
    ).fetchone()[0]


def _diagnostico(c, pedido):
    return c.execute(
        """SELECT tentativa, propostas_modelo, propostas_enviadas, propostas_processadas,
                  propostas_aceitas, propostas_descartadas, motivos_descarte,
                  propostas_nao_processadas, propostas_nao_enviadas
             FROM public.missoes_ia_execucoes WHERE pedido_id=%s""",
        (pedido,),
    ).fetchone()


@e2e
def test_separa_quantidade_do_modelo_dos_descartes_do_banco(c):
    pedido = _pedido(c)
    propostas = [
        _proposta("Estude por 5 dias", "dias_seguidos", 5),
        _proposta("Estude por 5 dias", "topicos_concluidos", 2),
        _proposta("Mantenha foco 5d", "dias_seguidos", 4),
        _proposta("Conclua tópicos", "metrica_inexistente", 2),
        _proposta("Alvo inválido", "topicos_concluidos", "muitos"),
        _proposta("Leia a página", "topicos_concluidos", 1, descricao="Acesse https://exemplo.test"),
        _proposta("X", "topicos_concluidos", 1),
        _proposta("Descrição curta", "topicos_concluidos", 1, descricao="curto"),
        "não é um objeto",
    ]

    assert _registrar(c, pedido, propostas, propostas_modelo=9) == 1
    assert _diagnostico(c, pedido) == (
        1,
        9,
        9,
        9,
        1,
        8,
        {
            "titulo_repetido": 1,
            "metrica_repetida_no_pedido": 1,
            "metrica_fora_catalogo": 1,
            "alvo_invalido": 1,
            "link_ou_email": 1,
            "titulo_fora_limite": 1,
            "descricao_fora_limite": 1,
            "formato_invalido": 1,
        },
        0,
        0,
    )


@e2e
def test_registra_motivo_de_metrica_pendente_mesmo_quando_nada_e_aceito(c):
    primeiro = _pedido(c)
    assert _registrar(c, primeiro, [_proposta("Estude por 7 dias", "dias_seguidos", 7)], 1) == 1

    segundo = _pedido(c)
    repetidas = [
        _proposta("Estude por 3 dias", "dias_seguidos", 3),
        _proposta("Estude por 4 dias", "dias_seguidos", 4),
    ]
    assert _registrar(c, segundo, repetidas, propostas_modelo=2) == 0
    assert _diagnostico(c, segundo) == (1, 2, 2, 2, 0, 2, {"metrica_ja_pendente": 2}, 0, 0)
    assert c.execute("SELECT status FROM public.missoes_ia_pedidos WHERE id=%s", (segundo,)).fetchone()[0] == "pendente"


@e2e
def test_registra_o_corte_local_e_as_propostas_nao_processadas(c):
    pedido = _pedido(c, quantidade=1)
    propostas = [
        _proposta("Estude por 5 dias", "dias_seguidos", 5),
        _proposta("Conclua 2 tópicos", "topicos_concluidos", 2),
        _proposta("Conclua 4 atividades", "atividades_concluidas", 4),
    ]

    assert _registrar(c, pedido, propostas, propostas_modelo=10) == 1
    assert _diagnostico(c, pedido) == (1, 10, 3, 1, 1, 0, {}, 2, 7)


@e2e
def test_recusa_contagem_do_modelo_menor_que_a_lista_enviada(c):
    pedido = _pedido(c)
    propostas = [_proposta("Estude por 5 dias", "dias_seguidos", 5)]

    with pytest.raises(Exception, match="quantidade de propostas do modelo incoerente"):
        _registrar(c, pedido, propostas, propostas_modelo=0)
    assert _diagnostico(c, pedido) is None


@e2e
def test_funcao_de_dois_argumentos_mantem_o_comportamento_anterior(c):
    pedido = _pedido(c)
    c.execute(
        """SELECT public.fn_missao_ia_registrar(%s, %s::jsonb)""",
        (pedido, json.dumps([_proposta("Estude por 5 dias", "dias_seguidos", 5)])),
    )
    assert c.execute("SELECT count(*) FROM public.missoes WHERE pedido_ia_id=%s", (pedido,)).fetchone()[0] == 1

    pedido_sem_validas = _pedido(c)
    with pytest.raises(Exception, match="nenhuma proposta válida"):
        c.execute(
            """SELECT public.fn_missao_ia_registrar(%s, %s::jsonb)""",
            (pedido_sem_validas, json.dumps([_proposta("Texto", "dias_seguidos", 5)])),
        )
    assert c.execute(
        "SELECT count(*) FROM public.missoes_ia_execucoes WHERE pedido_id=%s", (pedido_sem_validas,)
    ).fetchone()[0] == 0


@e2e
def test_downgrade_remove_diagnostico_e_deixa_a_funcao_10(c):
    for sql in sql_de(mod, "downgrade"):
        c.execute(sql)

    assert c.execute("SELECT to_regclass('public.missoes_ia_execucoes')").fetchone()[0] is None
    assert not c.execute(
        "SELECT to_regprocedure('public.fn_missao_ia_registrar_diagnostico(uuid,jsonb,integer)')"
    ).fetchone()[0]
    assert c.execute(
        "SELECT to_regprocedure('public.fn_missao_ia_registrar(uuid,jsonb)')"
    ).fetchone()[0] is not None
