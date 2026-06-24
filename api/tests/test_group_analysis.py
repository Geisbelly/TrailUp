import pytest

from app.services.group_analysis import (
    GroupAnalysisService,
    compute_distribuicao,
)


class MappingRows:
    def __init__(self, rows):
        self.rows = rows

    def first(self):
        return self.rows[0] if self.rows else None

    def __iter__(self):
        return iter(self.rows)


class MappingResult:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return MappingRows(self.rows)


class RecordingSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.commits = 0

    async def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        if self.responses:
            return self.responses.pop(0)
        return MappingResult([])

    async def commit(self):
        self.commits += 1


def test_compute_distribuicao_counts_and_predominante() -> None:
    rows = [
        {"perfil": "Achiever", "media_acertos": 80, "percentual_concluido": 60, "nota_media": 8},
        {"perfil": "Achiever", "media_acertos": 70, "percentual_concluido": 50, "nota_media": 7},
        {"perfil": "Seeker", "media_acertos": 90, "percentual_concluido": 40, "nota_media": 9},
        # aluno sem perfil mapeado ainda conta no total.
        {"perfil": None, "media_acertos": 0, "percentual_concluido": 0, "nota_media": 0},
    ]

    summary = compute_distribuicao(rows)

    assert summary["total_alunos"] == 4
    assert summary["perfil_predominante"] == "Achiever"
    assert summary["distribuicao"]["achiever"]["quantidade"] == 2
    assert summary["distribuicao"]["achiever"]["percentual"] == 66.67  # 2 de 3 com perfil
    assert summary["distribuicao"]["seeker"]["quantidade"] == 1
    assert summary["media_desempenho"]["media_acertos"] == 60.0  # (80+70+90+0)/4


def test_compute_distribuicao_normalizes_socialiser_alias() -> None:
    summary = compute_distribuicao([{"perfil": "Socialiser"}])
    assert summary["distribuicao"]["socializer"]["quantidade"] == 1
    assert summary["perfil_predominante"] == "Socializer"


def test_compute_distribuicao_empty_class() -> None:
    summary = compute_distribuicao([])
    assert summary["total_alunos"] == 0
    assert summary["perfil_predominante"] is None
    assert all(item["quantidade"] == 0 for item in summary["distribuicao"].values())


@pytest.mark.asyncio
async def test_group_analysis_service_upsert_persists_summary() -> None:
    session = RecordingSession(
        [
            MappingResult(
                [
                    {"aluno_id": "a1", "perfil": "Conqueror", "media_acertos": 75, "percentual_concluido": 60, "nota_media": 7.5},
                    {"aluno_id": "a2", "perfil": "Conqueror", "media_acertos": 65, "percentual_concluido": 55, "nota_media": 6.5},
                    {"aluno_id": "a3", "perfil": "Mastermind", "media_acertos": 80, "percentual_concluido": 70, "nota_media": 8.0},
                ]
            ),
            MappingResult([{"atualizado_em": "2026-06-24T00:00:00Z"}]),
        ]
    )
    service = GroupAnalysisService(session)

    summary = await service.upsert_summary(7)

    assert summary["classe_id"] == 7
    assert summary["total_alunos"] == 3
    assert summary["perfil_predominante"] == "Conqueror"
    assert summary["atualizado_em"] == "2026-06-24T00:00:00Z"
    # Duas chamadas: SELECT de rows + INSERT ... ON CONFLICT.
    assert len(session.calls) == 2
    insert_sql, insert_params = session.calls[1]
    assert "INSERT INTO classe_perfil_summary" in insert_sql
    assert insert_params["classe_id"] == 7
    assert insert_params["total_alunos"] == 3
