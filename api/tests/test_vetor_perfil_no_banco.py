"""Fase 0b: o vetor BrainHex com uma regra só no banco (`20261111_01`).

Representativo = afinidade >= 20 OU (afinidade > 0 E entre os 2 primeiros), na ordem afinidade
desc e nome asc — a regra de `mobile/src/utils/brainHex.ts`, que o banco repetia em cópias
(`fn_perfil_da_missao`, o laço de conquista) e que a fila de base NÃO seguia: ela gerava a base do
1º e do 2º de cada aluno, inclusive o 2º com afinidade 0, e nunca a do 3º representativo — que o
aluno pode escolher como perfil ativo e então via só o conteúdo do professor.
"""

from __future__ import annotations

import random
import uuid
from unittest.mock import AsyncMock

import pytest

from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.services.personalizacao_jobs import (
    JOB_KIND_CLASS_DELTA,
    _build_targets,
    _perfis_presentes_na_turma,
)
from tests import _f5_banco as f5

MIGRATION = "20261111_01_vetor_perfil_no_banco.py"
MISSAO = "20261021_20_missao_diaria_coorte_representativa_e_minutos.py"
_LISTAR = "app.services.personalizacao_jobs.ConteudoClasseRepository.listar_alunos_classe_com_perfil_dominante"
_MAPEAR_TODOS = "app.services.personalizacao_jobs.ConteudoClasseRepository.mapear_todos_conteudos_por_topicos"
PERFIS = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"]


# --------------------------------------------------------------------------- a regra, em Python


def _representativos(vetor: dict[str, float]) -> list[str]:
    ordem = sorted(vetor.items(), key=lambda par: (-par[1], par[0]))
    return [p for pos, (p, af) in enumerate(ordem, start=1) if af >= 20 or (af > 0 and pos <= 2)]


# --------------------------------------------------------------------------- fila de base


def test_base_cobre_todo_perfil_representativo_e_nao_o_segundo_zerado() -> None:
    alunos = [
        # 3º lugar com 20: representativo, o aluno pode escolhê-lo como perfil ativo.
        {
            "aluno_id": "a1",
            "perfil_dominante": "daredevil",
            "perfil_secundario": "achiever",
            "perfis_representativos": ["daredevil", "achiever", "survivor"],
        },
        # 2º lugar com afinidade 0 não é representativo: não há para quem gerar.
        {
            "aluno_id": "a2",
            "perfil_dominante": "seeker",
            "perfil_secundario": "conqueror",
            "perfis_representativos": ["seeker"],
        },
    ]
    assert _perfis_presentes_na_turma(alunos) == ["seeker", "survivor", "daredevil", "achiever"]


def test_aluno_sem_perfil_continua_dando_mastermind() -> None:
    alunos = [{"aluno_id": "a1", "perfil_dominante": "mastermind", "perfil_secundario": None, "perfis_representativos": []}]
    assert _perfis_presentes_na_turma(alunos) == ["mastermind"]


@pytest.mark.asyncio
async def test_alvos_da_base_incluem_o_terceiro_representativo(monkeypatch) -> None:
    alunos = [
        {
            "aluno_id": "a1",
            "perfil_dominante": "daredevil",
            "perfil_secundario": "achiever",
            "perfis_representativos": ["daredevil", "achiever", "survivor"],
        }
    ]
    monkeypatch.setattr(_LISTAR, AsyncMock(return_value=alunos))
    monkeypatch.setattr(_MAPEAR_TODOS, AsyncMock(return_value={117: [125]}))

    targets, _, _ = await _build_targets(session=object(), kind=JOB_KIND_CLASS_DELTA, classe_id=32, topico_ids=[117])

    assert {t["brainhex_profile_key"] for t in targets} == {"daredevil", "achiever", "survivor"}


class _Resultado:
    def __init__(self, linhas):
        self._linhas = linhas

    def mappings(self):
        return self._linhas


class _Sessao:
    def __init__(self, linhas):
        self._linhas = linhas
        self.sql: list[str] = []

    async def execute(self, statement, _params=None):
        self.sql.append(str(statement))
        return _Resultado(self._linhas)


@pytest.mark.asyncio
async def test_repositorio_traz_os_representativos_da_funcao_do_banco() -> None:
    sessao = _Sessao(
        [
            {
                "aluno_id": "a1",
                "perfil_nome": "daredevil",
                "afinidade": 40,
                "perfil_secundario_nome": "achiever",
                "perfis_representativos": ["daredevil", "achiever", "Survivor"],
            },
            {"aluno_id": "a2", "perfil_nome": None, "afinidade": None, "perfil_secundario_nome": None, "perfis_representativos": []},
        ]
    )

    alunos = await ConteudoClasseRepository(sessao).listar_alunos_classe_com_perfil_dominante(7)

    assert alunos[0]["perfis_representativos"] == ["daredevil", "achiever", "survivor"]
    assert alunos[1]["perfis_representativos"] == []
    assert "public.app_perfis_representativos(at.aluno_id)" in sessao.sql[0]


# --------------------------------------------------------------------------- estrutura da migration


def test_migration_cria_as_tres_funcoes_e_reescreve_o_perfil_da_missao() -> None:
    mod = f5.modulo(MIGRATION)
    sql = "\n".join(f5.sql_de(mod))

    assert mod.down_revision == "20261110_11"
    for funcao in ("app_vetor_perfil", "app_perfil_dominante", "app_perfis_representativos"):
        assert f"CREATE OR REPLACE FUNCTION public.{funcao}(p_aluno uuid)" in sql
        assert f"REVOKE ALL ON FUNCTION public.{funcao}(uuid) FROM PUBLIC, anon" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{funcao}(uuid) TO authenticated, service_role" in sql
    # As três respeitam a RLS de quem chama: nada de SECURITY DEFINER nelas.
    assert sql.count("SECURITY INVOKER") == 3
    assert "public.app_perfis_representativos(p_aluno)" in sql.split("FUNCTION public.fn_perfil_da_missao")[1]


def test_downgrade_devolve_o_perfil_da_missao_original() -> None:
    sql = "\n".join(f5.sql_de(f5.modulo(MIGRATION), "downgrade"))
    assert f5.modulo(MISSAO).PERFIL_DA_MISSAO.strip() in sql
    for funcao in ("app_perfis_representativos", "app_perfil_dominante", "app_vetor_perfil"):
        assert f"DROP FUNCTION IF EXISTS public.{funcao}(uuid)" in sql


# --------------------------------------------------------------------------- contra Postgres real


def _semear(c, vetores: dict[uuid.UUID, tuple[dict[str, float], str | None]]) -> None:
    f5.afrouxa(c, "alunos")
    for i, nome in enumerate(PERFIS, start=1):
        c.execute("INSERT INTO public.perfil (id, nome) VALUES (%s, %s) ON CONFLICT DO NOTHING", (i, nome))
    for aluno, (vetor, ativo) in vetores.items():
        c.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s)", (aluno, f"{aluno}@teste.invalid"))
        c.execute("INSERT INTO public.alunos (id, nome, perfil_ativo) VALUES (%s, 'x', %s)", (aluno, ativo))
        for nome, af in vetor.items():
            c.execute(
                "INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES (%s, %s, %s)",
                (aluno, PERFIS.index(nome) + 1, af),
            )


def _vetores_de_teste() -> dict[uuid.UUID, tuple[dict[str, float], str | None]]:
    rng = random.Random(1111)
    casos: list[tuple[dict[str, float], str | None]] = [
        # Os vetores de produção de 11/11 (soma 100, empate 17/17, tudo 10, uma linha só).
        ({"daredevil": 18, "conqueror": 16, "achiever": 14, "mastermind": 14, "seeker": 13, "survivor": 13, "socializer": 12}, None),
        ({"achiever": 17, "seeker": 17, "conqueror": 13, "daredevil": 13, "mastermind": 13, "socializer": 13, "survivor": 13}, "achiever"),
        ({p: 10 for p in PERFIS}, "conqueror"),
        ({"achiever": 40}, None),
        # 2º zerado, 3º com 20, perfil ativo que deixou de ser representativo.
        ({"seeker": 50, "survivor": 0}, "survivor"),
        ({"daredevil": 40, "achiever": 30, "survivor": 20, "seeker": 10}, "survivor"),
        ({}, "seeker"),
    ]
    for _ in range(60):
        vetor = {p: rng.choice([0, 1, 5, 10, 12, 15, 17, 19, 20, 21, 30]) for p in rng.sample(PERFIS, rng.randint(1, 7))}
        casos.append((vetor, rng.choice([None, *PERFIS])))
    return {uuid.UUID(int=1000 + i): caso for i, caso in enumerate(casos)}


@f5.e2e
def test_banco_segue_a_regra_do_app_e_o_perfil_da_missao_nao_muda() -> None:
    antiga = f5.modulo(MISSAO).PERFIL_DA_MISSAO.replace("fn_perfil_da_missao", "fn_perfil_da_missao_antiga")
    vetores = _vetores_de_teste()
    with f5.banco(antiga, *f5.sql_de(f5.modulo(MIGRATION))) as c:
        _semear(c, vetores)
        for aluno, (vetor, _ativo) in vetores.items():
            esperado = _representativos(vetor)
            linha = c.execute(
                "SELECT public.app_perfis_representativos(%s) AS rep, public.app_perfil_dominante(%s) AS dom,"
                " public.fn_perfil_da_missao(%s) AS nova, public.fn_perfil_da_missao_antiga(%s) AS antiga",
                (aluno, aluno, aluno, aluno),
            ).fetchone()
            rep, dom, nova, velha = linha
            assert rep == esperado, vetor
            ordem = sorted(vetor.items(), key=lambda par: (-par[1], par[0]))
            assert dom == (ordem[0][0] if ordem else "mastermind"), vetor
            assert nova == velha, vetor


@f5.e2e
def test_funcoes_respeitam_a_rls_de_quem_chama() -> None:
    aluno, outro = uuid.UUID(int=31), uuid.UUID(int=32)
    with f5.banco(*f5.sql_de(f5.modulo(MIGRATION))) as c:
        _semear(c, {aluno: ({"seeker": 60, "survivor": 40}, None), outro: ({"achiever": 70}, None)})
        c.execute("ALTER TABLE public.aluno_perfil ENABLE ROW LEVEL SECURITY")
        c.execute("DROP POLICY IF EXISTS so_o_dono ON public.aluno_perfil")
        c.execute("CREATE POLICY so_o_dono ON public.aluno_perfil FOR SELECT TO authenticated USING (aluno_id = auth.uid())")
        c.execute("GRANT SELECT ON public.aluno_perfil, public.perfil TO authenticated")
        c.execute("BEGIN")
        f5.como(c, aluno)
        c.execute("SET LOCAL ROLE authenticated")
        assert c.execute("SELECT public.app_perfis_representativos(%s)", (aluno,)).fetchone()[0] == ["seeker", "survivor"]
        # O vetor de outro aluno some pela RLS: sem linha, o dominante é o padrão.
        assert c.execute("SELECT public.app_perfil_dominante(%s)", (outro,)).fetchone()[0] == "mastermind"
        c.execute("ROLLBACK")
