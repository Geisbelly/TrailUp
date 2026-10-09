"""O consentimento tem de ser provavel pelo servidor (#195, item 1).

O aceite vivia so em `AsyncStorage`. O servidor recebia um booleano
(`telemetria_sessoes.camera_opt_in`) sobrescrito a cada lote, e nao existia
em lugar nenhum versao do termo, data, finalidades nem quem consentiu. Limpar
os dados do app apagava a unica evidencia.

O que estes testes protegem -- cada um e uma propriedade sem a qual isto vira
log, nao prova:

1. **O carimbo do servidor e forcado por trigger.** O cliente tem INSERT aqui
   (e ele que registra o aceite), entao `registrado_em` vindo dele seria
   forjavel.
2. **Nao ha policy de UPDATE nem de DELETE.** Se o aluno pudesse reescrever ou
   apagar o proprio consentimento, nao seria prova. Revogar e INSERT de linha
   nova com `rejected`, nao apagar a antiga.
3. **UNIQUE por (aluno, versao, decisao).** O mobile repete o envio quando a
   rede falha; sem isto cada tentativa viraria uma linha.
4. **A tabela sobrevive ao downgrade.** Apagar no downgrade destruiria a
   evidencia que a migracao existe para guardar.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


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


def _norm(texto: str) -> str:
    return " ".join(texto.split())


def test_carimbo_do_servidor_e_forcado_por_trigger() -> None:
    sql = _norm(_render("20261003_09:20261003_10"))
    assert "NEW.registrado_em := now()" in sql
    assert "BEFORE INSERT ON public.consentimento_telemetria" in sql


def test_sem_policy_de_update_nem_de_delete() -> None:
    sql = _norm(_render("20261003_09:20261003_10")).upper()
    assert "FOR INSERT TO AUTHENTICATED" in sql
    assert "FOR SELECT TO AUTHENTICATED" in sql
    assert "FOR UPDATE" not in sql, "aluno reescrevendo o proprio consentimento"
    assert "FOR DELETE" not in sql, "aluno apagando a propria prova"
    assert "FOR ALL" not in sql


def test_insert_so_do_proprio_aluno() -> None:
    sql = _norm(_render("20261003_09:20261003_10"))
    assert "WITH CHECK (aluno_id = auth.uid())" in sql
    assert "USING (aluno_id = auth.uid())" in sql


def test_reenvio_nao_duplica() -> None:
    sql = _norm(_render("20261003_09:20261003_10"))
    assert "UNIQUE (aluno_id, versao, decidido_em)" in sql


def test_guarda_versao_finalidades_e_os_dois_instantes() -> None:
    sql = _norm(_render("20261003_09:20261003_10"))
    for coluna in ("versao", "preferencias", "decidido_em", "registrado_em", "origem"):
        assert coluna in sql, f"{coluna} ausente"
    # status restrito: linha sem significado nao entra
    assert "CHECK (status IN ('accepted', 'rejected'))" in sql


def test_a_tabela_sobrevive_ao_downgrade() -> None:
    sql = _norm(_render("20261003_10:20261003_09", downgrade=True))
    assert "DROP TRIGGER IF EXISTS trg_consentimento_carimbo" in sql
    assert "DROP TABLE" not in sql.upper(), (
        "apagar a tabela no downgrade destruiria a prova de consentimento"
    )
