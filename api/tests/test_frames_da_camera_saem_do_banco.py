"""Os frames da camera que ficaram gravados antes da sanitizacao (#92, #93).

As duas issues fecharam os dois CAMINHOS DE ESCRITA -- a API passou a gravar o
payload sanitizado tambem no log de decisao, e o fallback do app passou por
`sanitizarCameraParaBanco`. Ninguem limpou o que ja estava gravado, e a leitura
de "issue fechada" escondeu que o dado continuava la.

Medido nesta base antes da limpeza:

    telemetria_lotes                         162 linhas
      com frame_b64 dentro de camera.frames   54 linhas
      peso dessas linhas                     132 MB
    ia_decision_logs                           0 com frame

Depois: 0 lotes com frame, 162 linhas intactas, payloads de 132 MB para 3 MB, e
178 frames com o carimbo de tempo preservado -- saiu a imagem, ficou o instante.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


def _offline_alembic_config(output_buffer: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output_buffer)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    return config


def _sql() -> str:
    output = StringIO()
    migrations.command.upgrade(
        _offline_alembic_config(output), "20260911_08:20260911_09", sql=True
    )
    return output.getvalue()


def test_limpa_os_dois_lugares_onde_o_frame_podia_estar() -> None:
    """Dentro do array e no topo de `camera`. Cobrir so um deixaria a limpeza
    verdadeira pela metade."""
    sql = _sql()

    assert "'$.camera.frames[*].frame_b64'" in sql
    assert "payload->'camera' ? 'frame_b64'" in sql


def test_preserva_a_ordem_dos_frames() -> None:
    """`jsonb_agg` sobre `jsonb_array_elements` sem `ORDER BY` nao promete
    ordem, e o lote e uma sequencia de instantes -- embaralhar destruiria a
    unica coisa que sobra do frame."""
    sql = _sql()

    assert "WITH ORDINALITY AS elem(f, ord)" in sql
    assert "ORDER BY elem.ord" in sql


def test_tira_a_imagem_e_mantem_o_resto_do_frame() -> None:
    """`- 'frame_b64'` remove so a chave da imagem; carimbo de tempo e
    metadados ficam."""
    sql = _sql()

    assert "elem.f - 'frame_b64'" in sql


def test_o_array_vazio_nao_vira_nulo() -> None:
    """`jsonb_agg` sobre conjunto vazio devolve NULL, e `jsonb_set` com NULL
    apagaria a chave inteira em vez de deixar uma lista vazia."""
    sql = _sql()

    assert "COALESCE(" in sql
    assert "'[]'::jsonb" in sql


def test_limpa_tambem_o_log_de_decisao() -> None:
    """Zero linhas hoje, mas e o mesmo tipo de deposito e a #92 nasceu ali."""
    sql = _sql()

    assert "public.ia_decision_logs" in sql
    assert "'$.telemetria.camera.frames[*].frame_b64'" in sql


def test_a_migracao_aborta_se_sobrar_frame() -> None:
    sql = _sql()

    assert "ainda restam " in sql
    assert "ainda ha frame_b64: " in sql


def test_a_conferencia_usa_position_e_nao_like() -> None:
    """O padrao do LIKE precisaria de por-cento, e o renderizador offline do
    Alembic o dobra: o texto chegaria ao Postgres procurando um por-cento
    literal e a conferencia passaria trivialmente, sempre em zero."""
    sql = _sql()

    assert "position('frame_b64' IN payload::text) > 0" in sql
    # `LIKE '` e a sintaxe: o comentario da propria migracao explica por que o
    # LIKE saiu, e casar com a palavra solta acusaria esse comentario. Foi o
    # que aconteceu na primeira versao deste teste -- e a quarta vez que esse
    # padrao aparece nesta rodada.
    assert "LIKE '" not in sql


def test_rodar_de_novo_nao_quebra() -> None:
    """Depois da primeira passada nao ha o que limpar, e isso nao pode ser
    erro -- migracao roda em toda base, inclusive nas que ja nasceram limpas."""
    sql = _sql()

    assert "nenhum lote com frame da camera gravado, nada a limpar" in sql


def test_nao_ha_volta_e_isso_e_deliberado() -> None:
    """Restaurar exigiria backup, e a imagem nunca deveria ter sido gravada."""
    caminho = (
        API_ROOT
        / "alembic"
        / "versions"
        / "20260911_09_frames_da_camera_saem_do_banco.py"
    )
    fonte = caminho.read_text(encoding="utf-8")

    corpo_do_downgrade = fonte[fonte.index("def downgrade()") :]
    assert "op.execute" not in corpo_do_downgrade


def test_o_vacuum_fica_de_fora_de_proposito() -> None:
    """`VACUUM FULL` recuperaria o arquivo, mas nao roda dentro de transacao e
    a migracao roda em uma."""
    sql = _sql()

    assert "VACUUM" not in sql.upper()


def test_o_sql_renderizado_esta_limpo() -> None:
    import re

    sql = _sql()
    assert "%" not in sql
    assert not re.findall(r"(?<!:):[A-Za-z_]\w*", sql)
