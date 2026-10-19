"""O FK sem ON DELETE que anula o FK com ON DELETE sai; o bom fica.

Dois pares de FK na mesma coluna, com semantica conflitante, foram achados
varrendo `pg_constraint` em producao. O Postgres aplica os dois, e o
restritivo ganha: o `ON DELETE CASCADE`/`SET NULL` que alguem escreveu depois
nunca chegou a rodar.

O que estes testes protegem:

1. **So a sombra cai.** Dropar o constraint BOM deixaria a coluna com a
   semantica errada de novo, ou (se os dois cairem) sem integridade
   referencial nenhuma.
2. **A remocao e condicionada aos dois existirem.** Numa base onde o par nunca
   foi criado, remover o unico FK presente seria perda de integridade -- por
   isso o `DO $$ ... IF EXISTS` em vez de `DROP CONSTRAINT IF EXISTS` solto.
3. **O downgrade recria a sombra**, e nao uma versao "melhorada" dela:
   reverter tem que devolver o bloqueio, senao o downgrade mente.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]

INTERVALO = "20261018_10:20261018_11"

# (constraint sombra, constraint que fica)
PARES = (
    ("IADescricao_aluno_id_fkey", "iadescricao_aluno_id_fkey"),
    ("classe_aluno_ultimaAtividade_fkey", "classe_aluno_ultimaatividade_fkey"),
)


def _render(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(config, intervalo, sql=True)
    return output.getvalue()


def test_derruba_as_duas_sombras() -> None:
    sql = _render(INTERVALO)
    for sombra, _mantido in PARES:
        assert f'DROP CONSTRAINT "{sombra}"' in sql, f"{sombra} ficaria de pe"


def test_nao_encosta_no_constraint_que_fica() -> None:
    sql = _render(INTERVALO)
    for _sombra, mantido in PARES:
        assert f'DROP CONSTRAINT "{mantido}"' not in sql, f"{mantido} e o constraint bom"


def test_so_remove_se_os_dois_existirem() -> None:
    """Sem esta guarda, uma base sem o par perderia o unico FK da coluna."""
    sql = _render(INTERVALO)
    for sombra, mantido in PARES:
        assert f"conname = '{mantido}'" in sql, f"nao confere a existencia de {mantido}"
        assert f"conname = '{sombra}'" in sql, f"nao confere a existencia de {sombra}"


def test_nao_mexe_nos_duplicados_de_mesma_semantica() -> None:
    """Os pares `{a, a}` de `conteudo_personalizado` sao custo de escrita, nao
    defeito de comportamento. Entram na #331, nao nesta migracao."""
    sql = _render(INTERVALO)
    for nome in (
        "fk_conteudo_personalizado_aluno",
        "fk_conteudo_personalizado_conteudo",
        "fk_conteudo_personalizado_topico",
        "conteudo_personalizado_aluno_id_fkey",
        "conteudo_personalizado_conteudo_id_fkey",
        "conteudo_personalizado_topico_id_fkey",
    ):
        assert nome not in sql, f"{nome} nao e escopo desta migracao"


def test_downgrade_recria_a_sombra_como_ela_era() -> None:
    sql = _render("20261018_11:20261018_10", downgrade=True)
    for sombra, _mantido in PARES:
        assert f'ADD CONSTRAINT "{sombra}"' in sql, f"{sombra} nao voltaria"
    # Sem ON DELETE: e exatamente isso que fazia o bloqueio.
    assert "ON DELETE" not in sql.split('ADD CONSTRAINT "IADescricao_aluno_id_fkey"')[1].split(";")[0]
