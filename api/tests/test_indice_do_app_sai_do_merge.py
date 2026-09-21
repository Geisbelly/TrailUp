"""A RPC de merge mantem `formatos_gerados`, o indice que o app le.

`formatos_gerados` nao e espelho do status: e a lista que o cliente consulta
para saber o que EXISTE (ver 20260831_02_formatos_gerados_reflete_o_que_existe).
`merge_personalizacao_materiais_v2` e o ponto unico por onde passa toda geracao
de midia -- o microservice chama a RPC, e o BrainHexPDF grava parte a parte pela
mesma RPC -- e o UPDATE dela tocava so `materiais`, `status` e `updated_at`.

Medido no topico 128, perfil mastermind, com as tres midias `completed` e
servidas do Storage: `formatos_gerados = {cards}`. O material existia, publico
e servivel; o app nao sabia.

Provado ao vivo depois da migracao, em transacao desfeita:

    ANTES  ['cards', 'audio', 'markdown']
    DEPOIS ['cards', 'audio', 'markdown', 'apresentacao']

com a segunda chamada nao duplicando, e `cards` seguindo em primeiro.
"""

from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = (
    API_ROOT / "alembic" / "versions" / "20260910_10_indice_do_app_sai_do_merge.py"
)


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
        _offline_alembic_config(output), "20260910_09:20260910_10", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_indice", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_nao_usa_sinal_de_porcentagem() -> None:
    """O renderer offline do Alembic DOBRA o sinal de porcentagem. Um
    `RAISE NOTICE 'x <pct> y', v` sai com o literal duplicado no SQL final --
    foi o motivo de a primeira versao desta migracao usar concatenacao em vez
    de placeholder de formato."""
    assert "%" not in MIGRACAO.read_text(encoding="utf-8")
    assert "%" not in _sql()


def test_identifica_a_funcao_por_tipo_e_nao_por_nome_de_parametro() -> None:
    """`pg_get_function_identity_arguments` devolve os NOMES junto
    ('p_id bigint, p_updates jsonb, ...'), nao so os tipos -- filtrar por
    'bigint, jsonb, text, text' nao casa nada, e a migracao abortou com
    'nao encontrada' na primeira tentativa. `to_regprocedure` casa por tipo e
    devolve NULL quando nao acha, em vez de estourar."""
    sql = _sql()

    assert "to_regprocedure(" in sql
    assert "merge_personalizacao_materiais_v2(bigint,jsonb,text,text)" in sql
    # A CHAMADA, nao a mencao: o comentario da migracao cita o nome da funcao
    # justamente para registrar por que ela nao serve aqui.
    assert "pg_get_function_identity_arguments(" not in sql


def test_substitui_o_corpo_vivo_em_vez_de_recolar_texto_antigo() -> None:
    """Um `CREATE OR REPLACE` com o texto de 20260801_01 colado aqui
    reverteria em silencio qualquer mudanca posterior na funcao.
    `pg_get_functiondef` devolve a definicao completa -- LANGUAGE,
    volatilidade, SECURITY, `SET` --, e `CREATE OR REPLACE` preserva GRANTs."""
    sql = _sql()

    assert "pg_get_functiondef(" in sql
    assert "EXECUTE v_novo" in sql
    # Nao pode haver um CREATE OR REPLACE literal da funcao no SQL rendered:
    # o unico CREATE vem de dentro, do texto lido do catalogo.
    assert "CREATE OR REPLACE FUNCTION public.merge_personalizacao_materiais_v2" not in sql


def test_aborta_quando_a_ancora_nao_e_unica() -> None:
    """`replace` troca TODAS as ocorrencias. Se a ancora aparecer duas vezes, a
    derivacao entraria em lugar que nao e o UPDATE -- melhor abortar."""
    sql = _sql()

    assert "v_ocorrencias <> 1" in sql
    assert "esperava 1 ocorrencia da ancora no corpo vivo" in sql


def test_e_idempotente() -> None:
    """Reaplicar nao pode duplicar a derivacao dentro do corpo."""
    sql = _sql()

    assert "IF position('formatos_gerados' IN v_def) > 0 THEN" in sql
    assert "RETURN;" in sql


def test_uniao_preservando_a_ordem_nunca_substituicao() -> None:
    """`cards` vem da Fase A e NAO esta em `materiais`; substituir apagaria o
    unico formato que o app enxergava. E o primeiro item importa:
    `montarPersonalizacao` usa `inferHeroFormat(formatos_gerados[0])` como
    terceiro fallback do formato heroi. Acrescentar no FIM garante que esta
    correcao nao troca o heroi de ninguem -- diferente do 20260831_02, que
    ordenava alfabeticamente."""
    modulo = _modulo()
    derivacao = modulo._DERIVACAO

    assert "COALESCE(conteudo_personalizado.formatos_gerados, ARRAY[]::text[]) ||" in derivacao
    assert "ORDER BY" not in derivacao
    # Nao reentra o que ja esta la: sem isso, cada merge duplicaria o formato.
    assert "AND NOT (" in derivacao
    assert "= ANY(" in derivacao


def test_lista_de_midia_e_explicita() -> None:
    """Derivar por exclusao ('tudo que nao e erro') deixaria chave de controle
    nova -- `_geracao_falhas`, por exemplo -- entrar no indice sem ninguem
    perceber. O 20260831_02 tomou a mesma decisao, e pelo mesmo motivo."""
    derivacao = _modulo()._DERIVACAO

    assert "ARRAY['markdown', 'audio', 'apresentacao']" in derivacao
    for controle in ("erro", "_geracao_falhas", "cards"):
        assert f"'{controle}'" not in derivacao


def test_conta_url_de_parte_tambem() -> None:
    """Um deck cujo agregado ainda nao fechou tem partes com URL servivel; o
    backfill olhava so o `arquivo_url` do topo e esconderia esse material.
    `jsonb_array_elements` estoura se `partes` nao for array, dai o
    `jsonb_typeof`."""
    derivacao = _modulo()._DERIVACAO

    assert "-> 'partes'" in derivacao
    assert "jsonb_typeof(" in derivacao
    assert "= 'array'" in derivacao
    assert "parte ->> 'arquivo_url' IS NOT NULL" in derivacao


def test_nao_mexe_no_status() -> None:
    """O significado de `status` -- 'o ciclo fechou inteiro' -- e' outra
    decisao, e esta migracao nao a toma: a derivacao entra ao lado da conta que
    ja estava ali."""
    derivacao = _modulo()._DERIVACAO

    assert "v_new_status" not in derivacao
    assert "status =" not in derivacao
    assert "updated_at = NOW()" in derivacao
