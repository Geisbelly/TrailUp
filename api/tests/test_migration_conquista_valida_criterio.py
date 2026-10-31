"""`20261031_01`: o banco recusa conquista com limiar ausente/inválido e aparência fora da lista (#158).

Duas camadas, no molde de `test_migration_conquistas_sem_cascade.py` (de onde vêm os auxiliares):

- **estrutura** (roda sempre, sem banco): o SQL offline do Alembic cria a função, o CHECK e a RPC
  que a chama; o downgrade desfaz os três;
- **ponta a ponta** (só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL):
  banco descartável com o esqueleto de produção, a RPC do console de `20261017_09`, as 27
  conquistas globais com o critério EXATO de produção (lido em 31/10) e esta migration por cima.
"""

from __future__ import annotations

import json

import pytest

from tests.test_migration_conquistas_sem_cascade import (
    DSN,
    DUBLES,
    ESQUELETO,
    PAPEIS,
    PROF,
    PROF2,
    _afrouxa,
    _como,
    _dsn_para,
    _modulo,
    _sql,
    _trecho,
    e2e,
)

ARQUIVO = "20261031_01_conquista_valida_limiar_e_aparencia.py"

if DSN:
    import psycopg


# --------------------------------------------------------------------------- estrutura


def test_upgrade_cria_a_funcao_o_check_e_a_rpc_a_chama() -> None:
    sql = _sql("20261030_02", "20261031_01")

    assert "CREATE OR REPLACE FUNCTION public.fn_conquista_criterio_erro(p_criterio jsonb)" in sql
    assert "IMMUTABLE" in sql
    assert "ADD CONSTRAINT conquistas_criterio_valido CHECK (public.fn_conquista_criterio_erro(criterio) IS NULL)" in sql
    assert "v_erro_criterio := public.fn_conquista_criterio_erro(p_criterio);" in sql
    assert "OR p_criterio ->> 'metrica' = 'evento_medalha' THEN" in sql
    # O resto da RPC continua o de 20261017_09.
    assert "escopo <> 'evento'" in sql
    assert "GRANT EXECUTE ON FUNCTION public.conquista_da_turma_salvar" in sql


def test_downgrade_volta_a_rpc_anterior_e_tira_check_e_funcao() -> None:
    sql = _sql("20261031_01", "20261030_02", down=True)

    assert "DROP CONSTRAINT IF EXISTS conquistas_criterio_valido" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_conquista_criterio_erro(jsonb)" in sql
    rpc = sql.split("CREATE OR REPLACE FUNCTION public.conquista_da_turma_salvar")[1].split("$function$;")[0]
    assert "fn_conquista_criterio_erro" not in rpc


def test_a_paleta_e_os_icones_sao_os_do_console() -> None:
    """Mudou `aparencia.ts` ou `perfilCores.ts`, muda aqui — senão o console salva e o banco recusa."""
    from pathlib import Path

    raiz = Path(__file__).resolve().parents[2] / "frontend" / "src" / "components" / "console"
    aparencia = (raiz / "conquistas" / "aparencia.ts").read_text(encoding="utf-8")
    perfis = (raiz / "dashboard" / "perfilCores.ts").read_text(encoding="utf-8")
    sql = _sql("20261030_02", "20261031_01")

    import re

    paleta = re.search(r"PALETA_DE_CORES = \[([^\]]+)\]", aparencia).group(1)
    for cor in re.findall(r'"(#[0-9a-f]{6})"', paleta):
        assert f"'{cor}'" in sql, cor
    for cor in re.findall(r'marca: "(#[0-9a-f]{6})"', perfis):
        assert f"'{cor}'" in sql, cor
    for icone in re.findall(r'chave: "([a-z]+)"', aparencia):
        assert f"'{icone}'" in sql, icone


# --------------------------------------------------------------------------- ponta a ponta

# As 27 conquistas globais de produção, critério exato (31/10, só leitura).
CRITERIOS_DE_PRODUCAO = [
    {"minimo": 1, "metrica": "eventos_totais"},
    {"metrica": "atividade_rapida", "max_tempo": 2},
    {"metrica": "acertos_percentual", "percentual": 100},
    {"metrica": "dias_seguidos", "dias_seguidos": 3},
    {"metrica": "minutos_totais", "minutos": 120},
    {"metrica": "topicos_visitados", "visitados": "todos"},
    {"resumo": "Visite 5 tópicos diferentes.", "metrica": "topicos_visitados", "visitados": 5},
    {"resumo": "Use a plataforma por 5 dias seguidos.", "metrica": "dias_seguidos", "dias_seguidos": 5},
    {"resumo": "Alcance pelo menos 90% em uma atividade.", "metrica": "acertos_percentual", "percentual": 90},
    {"minimo": 5, "resumo": "Conclua 5 atividades.", "metrica": "atividades_concluidas"},
    {"resumo": "Estude por 7 dias seguidos.", "metrica": "dias_seguidos", "dias_seguidos": 7},
    {"evento": "atividade_revisada", "minimo": 5, "resumo": "Revise 5 atividades.", "metrica": "eventos_do_tipo"},
    {"evento": "topico_concluido", "minimo": 5, "resumo": "Conclua 5 tópicos.", "metrica": "topicos_concluidos"},
    {"resumo": "Use a plataforma por 3 dias seguidos.", "metrica": "dias_seguidos", "dias_seguidos": 3},
    {"resumo": "Complete 100% de uma trilha.", "metrica": "trilha_percentual", "percentual": 100},
    {"minimo": 5, "resumo": "Conclua 5 atividades em até 3 minutos cada.", "metrica": "atividades_rapidas", "max_tempo": 3},
    {"resumo": "Conclua uma trilha com todas as etapas realizadas.", "metrica": "trilha_percentual", "percentual": 100},
    {"resumo": "Complete 100% de uma trilha.", "metrica": "trilha_percentual", "percentual": 100},
    {"resumo": "Conclua uma atividade em menos de 2 minutos.", "metrica": "atividade_rapida", "max_tempo": 2},
    {"minimo": 10, "resumo": "Conclua 10 atividades.", "metrica": "atividades_concluidas"},
    {"resumo": "Use a plataforma por 10 dias seguidos.", "metrica": "dias_seguidos", "dias_seguidos": 10},
    {"minimo": 10, "resumo": "Conclua 10 atividades em até 3 minutos cada.", "metrica": "atividades_rapidas", "max_tempo": 3},
    {"resumo": "Visite todos os tópicos de uma trilha.", "metrica": "topicos_visitados", "visitados": "todos"},
    {"resumo": "Estude por 3 dias seguidos.", "metrica": "dias_seguidos", "dias_seguidos": 3},
    {"resumo": "Acumule 300 minutos de estudo ativo.", "metrica": "minutos_totais", "minutos": 300},
    {"evento": "topico_concluido", "minimo": 1, "resumo": "Conclua 1 tópico.", "metrica": "topicos_concluidos"},
    {"resumo": "Visite 3 tópicos diferentes.", "metrica": "topicos_visitados", "visitados": 3},
]


def _instalacao() -> list[str]:
    medalhas = "20261017_09_evento_medalhas.py"
    return [
        _trecho(
            "20260826_09_rls_posse_por_tabela.py", "CREATE OR REPLACE FUNCTION public.app_classes_do_professor()", "$$;"
        ),
        _trecho(medalhas, "CREATE OR REPLACE FUNCTION public.fn_conquista_metrica_suportada", "$function$;"),
        _trecho(medalhas, "CREATE OR REPLACE FUNCTION public.conquista_da_turma_salvar(", "$function$;"),
    ]


def _seed() -> str:
    linhas = ",\n  ".join(
        f"('Global {i}', 'comum', '{json.dumps(c, ensure_ascii=False)}'::jsonb, 0)"
        for i, c in enumerate(CRITERIOS_DE_PRODUCAO)
    )
    return f"""
INSERT INTO auth.users (id, email) VALUES ('{PROF}', 'prof@teste.invalid'), ('{PROF2}', 'prof2@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{PROF}', 'Prof'), ('{PROF2}', 'Prof 2');
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Mat');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, '{PROF}', 'Turma 1'), (2, 1, '{PROF2}', 'Turma 2');
INSERT INTO public.conquistas (nome, escopo, criterio, pontos_recompensa) VALUES
  {linhas};
"""


@pytest.fixture
def banco():
    import uuid

    nome = f"tu158v_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(_dsn_para(nome), autocommit=True) as c:
            c.execute(PAPEIS)
            c.execute(ESQUELETO.read_text(encoding="utf-8"))
            c.execute(DUBLES)
            for tabela in ("professor", "classe", "materia", "alunos", "conquistas"):
                _afrouxa(c, tabela)
            for sql in _instalacao():
                c.execute(sql)
            c.execute(_seed())
            # As 27 linhas de produção já estão lá: o ADD CONSTRAINT valida contra elas.
            for sql in _sql_de_upgrade():
                c.execute(sql)
            yield c
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _sql_de_upgrade() -> list[str]:
    from tests.test_migration_conquistas_sem_cascade import _sql_de

    return _sql_de(_modulo(ARQUIVO), "upgrade")


def _salvar(c, criterio, *, classe: int = 1, escopo: str = "comum", perfil: str | None = None):
    _como(c, PROF, "prof@teste.invalid")
    try:
        return c.execute(
            "SELECT public.conquista_da_turma_salvar(%s, NULL, 'Conquista X', '', %s, %s, %s::jsonb, 10)",
            (classe, escopo, perfil, json.dumps(criterio)),
        ).fetchone()[0]
    finally:
        _como(c, None)


def _recusa(c, criterio, trecho: str) -> None:
    with pytest.raises(psycopg.errors.InvalidParameterValue) as erro:
        _salvar(c, criterio)
    assert trecho in str(erro.value), str(erro.value)


@e2e
def test_as_27_conquistas_de_producao_passam_no_check(banco) -> None:
    total, invalidas = banco.execute(
        "SELECT count(*), count(*) FILTER (WHERE public.fn_conquista_criterio_erro(criterio) IS NOT NULL) "
        "FROM public.conquistas"
    ).fetchone()
    assert (total, invalidas) == (27, 0)


@e2e
def test_criterio_valido_do_console_e_salvo(banco) -> None:
    validos = [
        {"metrica": "atividades_concluidas", "minimo": 3, "aparencia": {"icone": "trofeu", "cor": "#9b5de5"}},
        {"metrica": "dias_seguidos", "dias_seguidos": 2},
        {"metrica": "minutos_totais", "minutos": 45},
        {"metrica": "acertos_percentual", "percentual": 80, "aparencia": {"icone": "alvo", "cor": "#4FD1C5"}},
        {"metrica": "topicos_visitados", "visitados": "todos"},
        {"metrica": "topicos_visitados", "visitados": "4"},
        {"metrica": "atividade_rapida", "max_tempo": 30},
    ]
    for criterio in validos:
        assert _salvar(banco, criterio) is not None, criterio


@e2e
def test_conquista_de_perfil_aceita_a_cor_assinatura(banco) -> None:
    criterio = {"metrica": "atividades_concluidas", "minimo": 5, "aparencia": {"icone": "chama", "cor": "#d7263d"}}
    _como(banco, PROF, "prof@teste.invalid")
    try:
        assert banco.execute(
            "SELECT public.conquista_da_turma_salvar(1, NULL, 'Ousadia', '', 'perfil', 'daredevil', %s::jsonb, 10)",
            (json.dumps(criterio),),
        ).fetchone()[0]
    finally:
        _como(banco, None)


@e2e
def test_limiar_ausente_que_destravaria_para_todos_e_recusado(banco) -> None:
    _recusa(banco, {"metrica": "atividades_concluidas"}, "mínimo")
    _recusa(banco, {"metrica": "dias_seguidos"}, "dias seguidos")
    _recusa(banco, {"metrica": "minutos_totais"}, "minutos")
    _recusa(banco, {"metrica": "acertos_percentual"}, "percentual")
    _recusa(banco, {"metrica": "topicos_visitados"}, "tópicos")
    _recusa(banco, {"metrica": "atividade_rapida"}, "tempo máximo")


@e2e
def test_limiar_que_estouraria_o_cast_do_gatilho_e_recusado(banco) -> None:
    _recusa(banco, {"metrica": "atividades_concluidas", "minimo": "cinco"}, "mínimo")
    _recusa(banco, {"metrica": "atividades_concluidas", "minimo": 5.5}, "mínimo")
    _recusa(banco, {"metrica": "atividades_concluidas", "minimo": 99999999999}, "mínimo")
    _recusa(banco, {"metrica": "dias_seguidos", "dias_seguidos": "três"}, "dias seguidos")
    _recusa(banco, {"metrica": "topicos_visitados", "visitados": "alguns"}, "tópicos")


@e2e
def test_limiar_zero_negativo_ou_acima_de_100_e_recusado(banco) -> None:
    _recusa(banco, {"metrica": "atividades_concluidas", "minimo": 0}, "mínimo")
    _recusa(banco, {"metrica": "atividades_concluidas", "minimo": -3}, "mínimo")
    _recusa(banco, {"metrica": "minutos_totais", "minutos": 0}, "minutos")
    _recusa(banco, {"metrica": "acertos_percentual", "percentual": 101}, "percentual")
    _recusa(banco, {"metrica": "atividade_rapida", "max_tempo": 0}, "tempo máximo")


@e2e
def test_aparencia_fora_da_lista_e_recusada(banco) -> None:
    base = {"metrica": "atividades_concluidas", "minimo": 3}
    _recusa(banco, {**base, "aparencia": {"icone": "trofeu", "cor": "#ffffff"}}, "Cor fora da paleta")
    _recusa(banco, {**base, "aparencia": {"icone": "caveira", "cor": "#9b5de5"}}, "Ícone inválido")
    _recusa(banco, {**base, "aparencia": "roxo"}, "Ícone inválido")


@e2e
def test_professor_nao_cria_medalha_de_evento(banco) -> None:
    _recusa(banco, {"metrica": "evento_medalha"}, "Métrica não suportada")


@e2e
def test_editar_para_um_criterio_invalido_tambem_e_recusado(banco) -> None:
    conquista = _salvar(banco, {"metrica": "atividades_concluidas", "minimo": 3})
    _como(banco, PROF, "prof@teste.invalid")
    try:
        with pytest.raises(psycopg.errors.InvalidParameterValue):
            banco.execute(
                "SELECT public.conquista_da_turma_salvar(1, %s, 'Conquista X', '', 'comum', NULL, %s::jsonb, 10)",
                (conquista, json.dumps({"metrica": "atividades_concluidas"})),
            )
    finally:
        _como(banco, None)
    criterio = banco.execute("SELECT criterio FROM public.conquistas WHERE id = %s", (conquista,)).fetchone()[0]
    assert criterio["minimo"] == 3


@e2e
def test_o_check_barra_quem_escreve_por_fora_da_rpc(banco) -> None:
    """A API grava como dona; um INSERT direto com critério quebrado não pode chegar ao gatilho."""
    with pytest.raises(psycopg.errors.CheckViolation) as erro:
        banco.execute(
            "INSERT INTO public.conquistas (nome, escopo, criterio, pontos_recompensa) "
            "VALUES ('Sem limiar', 'comum', '{\"metrica\":\"atividades_concluidas\"}'::jsonb, 0)"
        )
    assert "conquistas_criterio_valido" in str(erro.value)


@e2e
def test_downgrade_volta_ao_estado_anterior(banco) -> None:
    from tests.test_migration_conquistas_sem_cascade import _sql_de

    for sql in _sql_de(_modulo(ARQUIVO), "downgrade"):
        banco.execute(sql)
    assert banco.execute("SELECT to_regprocedure('public.fn_conquista_criterio_erro(jsonb)')").fetchone()[0] is None
    # Sem a validação, a RPC volta a aceitar o critério sem limiar (o defeito, de propósito).
    assert _salvar(banco, {"metrica": "atividades_concluidas"}) is not None
