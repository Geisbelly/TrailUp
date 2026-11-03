"""`20261103_10`: a IA não repete métrica de missão que ainda espera o professor.

O e2e roda a `20261102_20` inteira e esta por cima, num Postgres de verdade
(`TRAILUP_E2E_RETENCAO_DATABASE_URL`), e chama `fn_missao_ia_registrar` como o worker chama.
"""

import json
import uuid

import pytest
from alembic.script import ScriptDirectory

from tests._f5_banco import DSN, afrouxa, banco, modulo, sql_de
from tests.test_migrations import _offline_alembic_config

mod = modulo("20261103_10_missao_ia_metrica_pendente.py")
original = modulo("20261102_20_missoes_sugeridas_pela_ia.py")

e2e = pytest.mark.skipif(not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL não definida")


def test_uma_cabeca_e_vem_depois_das_molduras() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261103_10").down_revision == "20261103_09"


def test_so_troca_o_corpo_da_funcao() -> None:
    (sql,) = sql_de(mod)
    assert sql.count("CREATE OR REPLACE FUNCTION") == 1
    assert "fn_missao_ia_registrar(p_pedido_id uuid, p_propostas jsonb)" in sql
    assert "REVOKE ALL ON FUNCTION public.fn_missao_ia_registrar(uuid, jsonb) FROM PUBLIC, anon, authenticated;" in sql
    assert "TO service_role;" in sql
    assert "CREATE TABLE" not in sql and "POLICY" not in sql


def test_as_regras_antigas_continuam() -> None:
    (sql,) = sql_de(mod)
    for regra in ("v_chave = ANY (v_vistos)", "v_alvo > v_cat.maximo", "https?://", "nenhuma proposta válida"):
        assert regra in sql


def test_o_downgrade_volta_a_funcao_da_20261102_20() -> None:
    (sql,) = sql_de(mod, "downgrade")
    assert sql in original.WORKER
    assert "v_metricas" not in sql


# --------------------------------------------------------------------------- e2e

PRE = """
CREATE OR REPLACE FUNCTION public.app_classes_do_professor() RETURNS SETOF bigint LANGUAGE sql STABLE AS
$$ SELECT id FROM public.classe WHERE professor_id = auth.uid() $$;
"""

PROF = uuid.UUID(int=41)


@pytest.fixture
def c():
    with banco(PRE, *sql_de(original), *sql_de(mod)) as conn:
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
        "INSERT INTO public.missoes_ia_pedidos (classe_id, quantidade, solicitado_por) VALUES (%s, %s, %s) RETURNING id",
        (classe, quantidade, PROF),
    ).fetchone()[0]


def _proposta(titulo: str, metrica: str, alvo: int) -> dict:
    return {"titulo": titulo, "descricao": f"{titulo} para fixar o conteúdo.", "metrica": metrica, "alvo": alvo}


def _registrar(c, pedido, propostas) -> int:
    return c.execute(
        "SELECT public.fn_missao_ia_registrar(%s, %s::jsonb)", (pedido, json.dumps(propostas))
    ).fetchone()[0]


def _metricas(c, classe: int) -> list[str]:
    return [
        r[0]
        for r in c.execute(
            "SELECT criterio->>'metrica' FROM public.missoes WHERE classe_id = %s AND origem = 'ia' ORDER BY titulo",
            (classe,),
        ).fetchall()
    ]


@e2e
def test_dois_pedidos_na_mesma_passada_nao_repetem_metrica(c):
    """O caso de produção: dois pedidos da turma, processados um depois do outro sem se verem."""
    p1, p2 = _pedido(c), _pedido(c)
    assert _registrar(c, p1, [_proposta("Estude por 10 dias seguidos", "dias_seguidos", 10)]) == 1
    gerados = _registrar(
        c,
        p2,
        [
            _proposta("Mantenha o foco por 5 dias seguidos", "dias_seguidos", 5),
            _proposta("Conclua 4 atividades", "atividades_concluidas", 4),
        ],
    )
    assert gerados == 1
    assert sorted(_metricas(c, 1)) == ["atividades_concluidas", "dias_seguidos"]


@e2e
def test_metrica_repetida_dentro_do_mesmo_pedido_fica_so_a_primeira(c):
    p = _pedido(c)
    gerados = _registrar(
        c,
        p,
        [
            _proposta("Estude por 7 dias seguidos", "dias_seguidos", 7),
            _proposta("Estude por 3 dias seguidos", "dias_seguidos", 3),
            _proposta("Conclua 2 tópicos", "topicos_concluidos", 2),
        ],
    )
    assert gerados == 2
    assert sorted(_metricas(c, 1)) == ["dias_seguidos", "topicos_concluidos"]


@e2e
def test_aprovada_ou_recusada_nao_bloqueia_e_outra_turma_nao_conta(c):
    p = _pedido(c)
    _registrar(c, p, [_proposta("Estude por 7 dias seguidos", "dias_seguidos", 7)])
    c.execute("UPDATE public.missoes SET aprovacao = 'aprovada' WHERE classe_id = 1")
    # Aprovada: progressão é permitida.
    assert _registrar(c, _pedido(c), [_proposta("Estude por 14 dias seguidos", "dias_seguidos", 14)]) == 1
    # Pendente na turma 1 não impede a turma 2.
    assert _registrar(c, _pedido(c, 2), [_proposta("Estude por 5 dias seguidos", "dias_seguidos", 5)]) == 1


@e2e
def test_tudo_repetido_segue_como_nenhuma_proposta_valida(c):
    _registrar(c, _pedido(c), [_proposta("Estude por 7 dias seguidos", "dias_seguidos", 7)])
    p2 = _pedido(c)
    with pytest.raises(Exception, match="nenhuma proposta válida"):
        _registrar(c, p2, [_proposta("Estude por 4 dias seguidos", "dias_seguidos", 4)])
    assert c.execute("SELECT status FROM public.missoes_ia_pedidos WHERE id = %s", (p2,)).fetchone()[0] == "pendente"
