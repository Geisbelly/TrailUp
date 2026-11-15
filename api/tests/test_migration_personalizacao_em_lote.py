"""Estrutura da `20261115_03` (geração personalizada em lote pelo banco).

O job que a RPC cria, a deduplicação e a retomada foram medidos num Postgres descartável com o
esqueleto de produção (`test_e2e_personalizacao_em_lote.py`). Aqui fica o que não pode regredir no
texto, e a paridade com a API que não dá para medir sem ela.
"""

from __future__ import annotations

import re

from sqlalchemy import text

from app.services import personalizacao_jobs as jobs
from tests import _f5_banco as f5

M = f5.modulo("20261115_03_personalizacao_em_lote.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def test_encadeia_depois_da_pausa_so_na_trilha():
    assert M.revision == "20261115_03"
    assert M.down_revision == "20261115_02"


def test_sem_porcentagem_nem_bind():
    # `%` vira `%%` no SQL offline do Alembic, e `:palavra` vira parâmetro no text().
    assert "%" not in UP and "%" not in DOWN
    for bloco in (M.SQL, M.SQL_PAYLOAD, M.GRANTS):
        assert text(bloco).compile().params == {}


def test_kinds_sao_os_manuais_de_base_por_perfil():
    for kind in ("manual_profile_generate", "manual_profile_generate_all"):
        assert f"'{kind}'" in UP
        assert kind in jobs._KINDS_MANUAIS
        assert kind in jobs.KINDS_BASE_POR_PERFIL


def test_mesma_trava_da_api():
    # travar_enfileiramento: f"personalizacao_enfileirar:{kind}:{classe_id}:{aluno_id}", aluno None.
    assert "pg_advisory_xact_lock(hashtextextended(\n    'personalizacao_enfileirar:' || v_kind || ':' || p_classe_id || ':' || 'None', 0))" in UP


def test_perfis_na_ordem_e_normalizacao_da_api():
    ordem = re.search(r"ARRAY\[('seeker'[^\]]+)\]", UP).group(1)
    assert tuple(p.strip(" '") for p in ordem.split(",")) == jobs._BRAINHEX_PROFILE_KEYS
    assert "WHEN 'socialiser' THEN 'socializer'" in UP
    for chave in jobs._BRAINHEX_PROFILE_KEYS:
        assert f"WHEN '{chave}' THEN '{chave}'" in UP


def test_posse_antes_de_ler():
    for funcao in ("personalizacao_perfis_da_turma", "personalizacao_gerar_em_lote"):
        corpo = UP[UP.index(f"FUNCTION public.{funcao}(") :]
        corpo = corpo[: corpo.index("$function$;")]
        # A primeira tabela que a função lê é a lista de turmas do professor.
        primeira_leitura = re.search(r"FROM public\.([a-z_]+)", corpo).group(1)
        assert primeira_leitura == "app_classes_do_professor"
        assert "NOT IN" not in corpo


def test_so_authenticated_executa():
    assert "REVOKE ALL ON FUNCTION public.personalizacao_gerar_em_lote(bigint, bigint[], bigint[], text[]) FROM PUBLIC, anon;" in UP
    assert "GRANT EXECUTE ON FUNCTION public.personalizacao_gerar_em_lote(bigint, bigint[], bigint[], text[]) TO authenticated, service_role;" in UP
    assert "GRANT EXECUTE ON FUNCTION public.personalizacao_perfis_da_turma(bigint) TO authenticated, service_role;" in UP
    for interna in (
        "fn_personalizacao_perfil_normalizado(text)",
        "fn_personalizacao_ordem_do_perfil(text)",
        "fn_personalizacao_ids_do_payload(jsonb, text)",
        "fn_personalizacao_perfis_do_payload(jsonb)",
    ):
        assert f"REVOKE ALL ON FUNCTION public.{interna} FROM PUBLIC, anon, authenticated;" in UP


def test_alvo_de_base_e_template_sem_dono():
    assert "SELECT v_job.id, NULL, alvo.topico_id, alvo.conteudo_id, perfil.chave,\n         true, 'pending', 0" in UP


def test_downgrade_desfaz_tudo():
    for funcao in (
        "personalizacao_gerar_em_lote(bigint, bigint[], bigint[], text[])",
        "personalizacao_perfis_da_turma(bigint)",
        "fn_personalizacao_perfis_do_payload(jsonb)",
        "fn_personalizacao_ids_do_payload(jsonb, text)",
        "fn_personalizacao_ordem_do_perfil(text)",
        "fn_personalizacao_perfil_normalizado(text)",
    ):
        assert f"DROP FUNCTION IF EXISTS public.{funcao}" in DOWN
