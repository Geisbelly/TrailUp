"""Mistura de material por conteúdo, parte do banco (fase 2 do roteiro de diversidade de perfis).

Spec `docs/superpowers/specs/2026-11-11-mistura-de-material-por-conteudo-design.md`. Com a chave
ligada, cada conteúdo do tópico pode vir de um perfil representativo diferente; o progresso do
tópico (`trailup_progresso_percurso`) passa a contar o manifesto de qualquer perfil
representativo do aluno, e não só o do perfil ativo. O app grava a decisão em
`personalizacao_exposicao`.
"""

from __future__ import annotations

import json
import uuid

import psycopg
import pytest

from tests import _f5_banco as f5

MIGRATION = "20261111_02_mistura_material_por_conteudo.py"
APROVACAO = "20261110_09_aprovacao_do_personalizado.py"
VETOR = "20261111_01_vetor_perfil_no_banco.py"
PERFIS = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"]


# --------------------------------------------------------------------------- estrutura


def test_cabeca_e_troca_unica_no_ramo_do_manifesto() -> None:
    mod = f5.modulo(MIGRATION)
    assert mod.down_revision == "20261111_01"
    corpo = mod.percurso_com_mistura()
    manifestos, legado = corpo.split("UNION ALL")
    assert "public.app_perfis_representativos(p_aluno)" in manifestos
    assert "cp.brainhex_profile_key=al.perfil_ativo" in manifestos  # conta de demonstração
    # O ramo legado (cliente sem manifesto) continua só com o perfil ativo.
    assert "app_perfis_representativos" not in legado
    assert "cp.brainhex_profile_key=al.perfil_ativo AND cp.aprovacao='aprovado'" in legado


def test_troca_que_nao_casa_para_a_migration(monkeypatch) -> None:
    mod = f5.modulo(MIGRATION)
    monkeypatch.setattr(mod, "PERCURSO_ANTES", "trecho que nao existe")
    with pytest.raises(RuntimeError):
        mod.percurso_com_mistura()


def test_upgrade_cria_chaves_tabela_e_policies() -> None:
    sql = "\n".join(f5.sql_de(f5.modulo(MIGRATION)))
    for chave, valor in (("mistura_material", "desligada"), ("mistura_material_bonus_ativo", "0.5")):
        assert f"'{chave}', '{valor}'" in sql
    assert "ON CONFLICT (chave) DO NOTHING" in sql
    assert "CREATE TABLE IF NOT EXISTS public.personalizacao_exposicao" in sql
    assert "PRIMARY KEY (aluno_id, conteudo_id, perfil, politica)" in sql
    assert "ENABLE ROW LEVEL SECURITY" in sql
    for policy in ("personalizacao_exposicao_aluno_ins", "personalizacao_exposicao_aluno_sel",
                   "personalizacao_exposicao_professor_sel"):
        assert f"CREATE POLICY {policy}" in sql
    assert "GRANT SELECT, INSERT ON public.personalizacao_exposicao TO authenticated" in sql
    assert "REVOKE ALL ON public.personalizacao_exposicao FROM anon, authenticated" in sql
    # Dado de pessoa: o prazo entra no mesmo arquivo (portão da #195, `test_retencao_politica`).
    assert "INSERT INTO public.retencao_politica" in sql
    assert "('personalizacao_exposicao', 'saida_turma'" in sql


def test_downgrade_devolve_o_percurso_da_aprovacao() -> None:
    sql = "\n".join(f5.sql_de(f5.modulo(MIGRATION), "downgrade"))
    assert f5.modulo(APROVACAO).percurso_novo().strip() in sql
    assert "DROP TABLE IF EXISTS public.personalizacao_exposicao" in sql
    assert "DELETE FROM public.app_config" in sql
    assert "DELETE FROM public.retencao_politica WHERE tabela = 'personalizacao_exposicao'" in sql


# --------------------------------------------------------------------------- contra Postgres real


def _antes_da_aprovacao() -> str:
    from tests.test_e2e_aprovacao_do_personalizado import ANTES
    from tests.test_e2e_kpis_por_topico import _trecho

    retencao = _trecho(
        "20261024_03_retencao_e_expurgo.py", "CREATE TABLE IF NOT EXISTS public.retencao_politica (", "\n);"
    )
    return ANTES + retencao


def _semear_vetor(c, aluno: uuid.UUID, vetor: dict[str, float], ativo: str) -> None:
    for i, nome in enumerate(PERFIS, start=1):
        c.execute("INSERT INTO public.perfil (id, nome) VALUES (%s, %s) ON CONFLICT DO NOTHING", (i, nome))
    c.execute("DELETE FROM public.aluno_perfil WHERE aluno_id = %s", (aluno,))
    for nome, afinidade in vetor.items():
        c.execute(
            "INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES (%s, %s, %s)",
            (aluno, PERFIS.index(nome) + 1, afinidade),
        )
    c.execute("UPDATE public.alunos SET perfil_ativo = %s WHERE id = %s", (ativo, aluno))


def _registro_aprovado(c, conteudo: int, perfil: str) -> int:
    from tests.test_e2e_aprovacao_do_personalizado import _decide, _insere

    rid = _insere(c, topico=10, conteudo=conteudo, perfil=perfil)
    assert _decide(c, f5.PROF, [{"id": rid, "versao": 1}], "aprovado") == 1
    return rid


def _manifesto(c, rid: int, itens: list[str], quando: str) -> None:
    f5.como(c, None)
    c.execute(
        "INSERT INTO public.personalizacao_percurso (aluno_id, personalizacao_id, classe_id, topico_id, item_keys, updated_at)"
        " VALUES (%s, %s, 1, 10, %s, %s)",
        (f5.A, rid, json.dumps(itens), quando),
    )


def _total(c) -> int:
    f5.como(c, None)
    return c.execute(
        "SELECT coalesce(sum(total), 0) FROM public.trailup_progresso_percurso(%s, 1) WHERE topico_id = 10",
        (f5.A,),
    ).fetchone()[0]


@pytest.fixture()
def c():
    if not f5.DSN:
        pytest.skip("TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)")
    with f5.banco(_antes_da_aprovacao()) as conn:
        f5.semear_turma(conn)
        f5.afrouxa(conn, "conteudos")
        f5.afrouxa(conn, "personalizacao_item_progresso")
        conn.execute(
            "INSERT INTO public.conteudos (id, topico_id, titulo) OVERRIDING SYSTEM VALUE"
            " VALUES (100, 10, 'C1'), (101, 10, 'C2')"
        )
        for sql in (*f5.sql_de(f5.modulo(APROVACAO)), *f5.sql_de(f5.modulo(VETOR))):
            conn.execute(sql)
        conn.execute("GRANT SELECT ON public.classe, public.classe_aluno TO authenticated")
        for sql in f5.sql_de(f5.modulo(MIGRATION)):
            conn.execute(sql)
        yield conn


@f5.e2e
def test_rota_com_dois_perfis_conta_os_dois_conteudos(c) -> None:
    _semear_vetor(c, f5.A, {"seeker": 60, "survivor": 40}, "seeker")
    _manifesto(c, _registro_aprovado(c, 100, "seeker"), ["texto:1", "audio:1"], "2026-11-11T10:00:00Z")
    _manifesto(c, _registro_aprovado(c, 101, "survivor"), ["texto:1"], "2026-11-11T10:00:00Z")
    assert _total(c) == 3


@f5.e2e
def test_manifesto_velho_de_outro_perfil_no_mesmo_conteudo_nao_conta(c) -> None:
    _semear_vetor(c, f5.A, {"seeker": 60, "survivor": 40}, "seeker")
    _manifesto(c, _registro_aprovado(c, 100, "seeker"), ["texto:1"], "2026-11-11T10:00:00Z")
    _manifesto(c, _registro_aprovado(c, 101, "seeker"), ["texto:1", "audio:1", "slides:1"], "2026-11-10T10:00:00Z")
    _manifesto(c, _registro_aprovado(c, 101, "survivor"), ["texto:1"], "2026-11-11T10:00:00Z")
    assert _total(c) == 2


@f5.e2e
def test_perfil_ativo_fora_dos_representativos_conta(c) -> None:
    _semear_vetor(c, f5.A, {"seeker": 60, "survivor": 40}, "achiever")
    _manifesto(c, _registro_aprovado(c, 100, "achiever"), ["texto:1", "audio:1"], "2026-11-11T10:00:00Z")
    assert _total(c) == 2


@f5.e2e
def test_perfil_fora_da_rota_continua_fora(c) -> None:
    _semear_vetor(c, f5.A, {"seeker": 60, "survivor": 40}, "seeker")
    _manifesto(c, _registro_aprovado(c, 100, "daredevil"), ["texto:1"], "2026-11-11T10:00:00Z")
    assert _total(c) == 0


@f5.e2e
def test_chaves_publicas_e_desligadas(c) -> None:
    linhas = dict(
        c.execute(
            "SELECT chave, valor FROM public.app_config WHERE publico"
            " AND chave IN ('mistura_material', 'mistura_material_bonus_ativo')"
        ).fetchall()
    )
    assert linhas == {"mistura_material": "desligada", "mistura_material_bonus_ativo": "0.5"}
    prazo = c.execute(
        "SELECT acao, dias FROM public.retencao_politica WHERE tabela = 'personalizacao_exposicao'"
    ).fetchall()
    assert prazo == [("saida_turma", 90)]


def _exposicao(aluno: uuid.UUID, perfil: str = "survivor") -> tuple:
    return (aluno, 1, 10, 101, perfil, "proporcional", 0.5, json.dumps({"seeker": 0.6, "survivor": 0.4}), "rota-v1")


INSERE = (
    "INSERT INTO public.personalizacao_exposicao (aluno_id, classe_id, topico_id, conteudo_id, perfil,"
    " politica, prob_politica, pesos, versao_alocador) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
    " ON CONFLICT DO NOTHING"
)


@f5.e2e
def test_exposicao_o_aluno_grava_e_le_so_a_propria(c) -> None:
    f5.como(c, None)
    c.execute(INSERE, _exposicao(f5.B))
    f5.como(c, f5.A)
    c.execute("SET ROLE authenticated")
    try:
        c.execute(INSERE, _exposicao(f5.A))
        c.execute(INSERE, _exposicao(f5.A))  # a segunda vez não duplica nem falha
        assert c.execute("SELECT count(*) FROM public.personalizacao_exposicao").fetchone()[0] == 1
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute(INSERE, _exposicao(f5.B, "seeker"))
    finally:
        c.execute("RESET ROLE")
        f5.como(c, None)


@f5.e2e
def test_exposicao_nao_aceita_turma_alheia_nem_alteracao(c) -> None:
    f5.como(c, f5.A)
    c.execute("SET ROLE authenticated")
    try:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute(INSERE, (f5.A, 999, 10, 101, "survivor", "proporcional", 0.5, "{}", "rota-v1"))
    finally:
        c.execute("RESET ROLE")
    c.execute("SET ROLE authenticated")
    try:
        c.execute(INSERE, _exposicao(f5.A))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("UPDATE public.personalizacao_exposicao SET perfil = 'seeker'")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("DELETE FROM public.personalizacao_exposicao")
    finally:
        c.execute("RESET ROLE")
        f5.como(c, None)


@f5.e2e
def test_exposicao_o_professor_le_a_da_turma(c) -> None:
    f5.como(c, None)
    c.execute(INSERE, _exposicao(f5.A))
    c.execute(INSERE, _exposicao(f5.B))
    f5.como(c, f5.PROF)
    c.execute("SET ROLE authenticated")
    try:
        assert c.execute("SELECT count(*) FROM public.personalizacao_exposicao").fetchone()[0] == 2
    finally:
        c.execute("RESET ROLE")
        f5.como(c, None)


@f5.e2e
def test_exposicao_recusa_perfil_e_politica_desconhecidos(c) -> None:
    f5.como(c, None)
    with pytest.raises(psycopg.errors.CheckViolation):
        c.execute(INSERE, (f5.A, 1, 10, 101, "bardo", "proporcional", 0.5, "{}", "rota-v1"))
    with pytest.raises(psycopg.errors.CheckViolation):
        c.execute(INSERE, (f5.A, 1, 10, 101, "seeker", "aleatoria", 0.5, "{}", "rota-v1"))


@f5.e2e
def test_downgrade_desfaz_sem_erro(c) -> None:
    for sql in f5.sql_de(f5.modulo(MIGRATION), "downgrade"):
        c.execute(sql)
    assert c.execute("SELECT to_regclass('public.personalizacao_exposicao')").fetchone()[0] is None
    assert c.execute("SELECT count(*) FROM public.app_config WHERE chave LIKE 'mistura_material%'").fetchone()[0] == 0
