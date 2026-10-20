"""A arena volta (`20261021_19`).

O comportamento (criar duelo, aceitar, responder, fechar, Elo mexer; as duas guardas; downgrade)
foi exercitado num Postgres 17 local com as funções de produção, ver o PR. Estes testes travam a
FONTE de cada corpo (md5 de produção) e o LUGAR de cada guarda no SQL gerado.
"""

import hashlib
import importlib.util
import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"

# md5 de `prosrc` na produção, 2026-10-20 (consulta somente leitura).
_MD5_PRODUCAO = {
    "arena_desafio_criar": "66982e934c1d4c5d5f979afc83a200c5",
    "arena_listar": "bd5e8f4ef4bd1d05731763d1a48737b5",
    "arena_convite_responder": "1592bc728d1180d21ab9d2d958d90369",
    "arena_responder": "2c3e1de917945c3055e3cf8191b0b785",
}
# `guilda_desafio_responder` da produção difere do git (`_14`) só em 3 linhas de comentário que a
# produção não tem; sem as linhas de comentário, os dois dão este md5.
_MD5_RESPONDER_GUILDA_SEM_COMENTARIO = "7aa9e499e1528d64da063180cfd77436"
_MD5_VARREDURA_PRODUCAO = "2740f5eb255a6a729f0f6b1f43d78061"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M19 = _modulo("20261021_19_arena_volta.py")


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_18:20261021_19", sql=True)
    return output.getvalue()


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_19:20261021_18", sql=True)
    # O SQL offline dobra o `%` (paramstyle); no banco o driver desfaz.
    return output.getvalue().replace("%%", "%")


def _prosrc(sql: str, nome: str) -> str:
    m = re.search(r"CREATE OR REPLACE FUNCTION public\." + nome + r"\(.*?AS \$function\$(.*?)\$function\$", sql, re.S)
    assert m, nome
    return m.group(1)


def _md5(texto: str) -> str:
    return hashlib.md5(texto.encode()).hexdigest()


def _sem_linhas_de_comentario(corpo: str) -> str:
    return "\n".join(linha for linha in corpo.split("\n") if not linha.strip().startswith("--"))


def test_encadeia_depois_do_elo() -> None:
    assert _M19.revision == "20261021_19"
    assert _M19.down_revision == "20261021_18"


def test_as_versionadas_sao_as_de_producao() -> None:
    for nome in ("arena_desafio_criar", "arena_listar", "arena_convite_responder"):
        assert _md5(_prosrc(_M19.VERSIONADAS, nome)) == _MD5_PRODUCAO[nome], nome


def test_as_versionadas_tem_os_grants_de_producao() -> None:
    for assinatura in (
        "arena_desafio_criar(bigint, text, text, integer, uuid, uuid, uuid[], uuid)",
        "arena_listar(bigint)",
        "arena_convite_responder(uuid, boolean)",
    ):
        assert f"REVOKE ALL ON FUNCTION public.{assinatura}\n  FROM PUBLIC, anon;" in _M19.VERSIONADAS
        assert f"GRANT EXECUTE ON FUNCTION public.{assinatura}\n  TO authenticated;" in _M19.VERSIONADAS


def test_arena_responder_parte_do_corpo_de_producao() -> None:
    assert _md5(_prosrc(_M19.RESPONDER_ARENA_PRODUCAO, "arena_responder")) == _MD5_PRODUCAO["arena_responder"]


def test_arena_responder_recusa_cooperativo_antes_de_gravar() -> None:
    corpo = _prosrc(_M19.responder_arena(), "arena_responder")
    guarda = corpo.index("RAISE EXCEPTION 'arena_desafio_cooperativo' USING ERRCODE = '22023';")
    assert "WHERE p.desafio_id = p_desafio_id AND p.equipe = 2" in corpo
    assert corpo.index("RAISE EXCEPTION 'arena_sem_permissao';") < guarda
    assert guarda < corpo.index("INSERT INTO public.guilda_desafio_respostas")
    # Fora a guarda, nada muda.
    sem_guarda = corpo.replace(_M19._ARENA_GUARDA, _M19._ARENA_ANTES_DA_GUARDA)
    assert _md5(sem_guarda) == _MD5_PRODUCAO["arena_responder"]


def test_responder_da_guilda_anterior_e_o_de_producao() -> None:
    corpo = _prosrc(_M19.responder_guilda_anterior(), "guilda_desafio_responder")
    assert _md5(_sem_linhas_de_comentario(corpo)) == _MD5_RESPONDER_GUILDA_SEM_COMENTARIO


def test_responder_da_guilda_recusa_desafio_da_arena_antes_de_gravar() -> None:
    corpo = _prosrc(_M19.responder_guilda(), "guilda_desafio_responder")
    guarda = corpo.index("RAISE EXCEPTION 'guilda_desafio_e_da_arena' USING ERRCODE = '22023';")
    assert "WHERE dp.desafio_id = p_desafio_id AND dp.equipe = 2" in corpo
    assert corpo.index("RAISE EXCEPTION 'guilda_desafio_sem_permissao';") < guarda
    assert guarda < corpo.index("INSERT INTO public.guilda_desafio_respostas")
    anterior = _prosrc(_M19.responder_guilda_anterior(), "guilda_desafio_responder")
    assert corpo.replace(_M19._GUILDA_GUARDA, _M19._GUILDA_ANTES_DA_GUARDA) == anterior


def test_as_guardas_sao_espelhadas() -> None:
    """Uma recusa exatamente o que a outra aceita: todo desafio tem um e um só caminho."""
    arena = _prosrc(_M19.responder_arena(), "arena_responder")
    guilda = _prosrc(_M19.responder_guilda(), "guilda_desafio_responder")
    assert "IF NOT EXISTS (\n    SELECT 1 FROM public.desafio_participantes p" in arena
    assert "IF EXISTS (\n    SELECT 1 FROM public.desafio_participantes dp" in guilda


def test_arena_desafio_diz_se_e_competitivo() -> None:
    novo = _M19.arena_desafio_com_competitivo()
    assert "'competitivo', EXISTS (SELECT 1 FROM public.desafio_participantes c" in novo
    assert "WHERE c.desafio_id = d.id AND c.equipe = 2)," in novo
    assert "'competitivo'" not in _M19.arena_desafio_anterior()


def test_upgrade_aplica_tudo_e_recarrega() -> None:
    sql = _upgrade_sql()
    for nome in (
        "fn_arena_cobrar_limite_diario",
        "arena_desafio_criar",
        "arena_listar",
        "arena_convite_responder",
        "arena_responder",
        "guilda_desafio_responder",
        "arena_desafio",
        "fn_desafio_varrer_abandonados",
    ):
        assert f"CREATE OR REPLACE FUNCTION public.{nome}(" in sql, nome
    assert "arena_desafio_cooperativo" in sql
    assert "guilda_desafio_e_da_arena" in sql
    assert "NOTIFY pgrst, 'reload schema'" in sql


def test_downgrade_volta_os_tres_corpos_e_nao_exclui_nada() -> None:
    sql = _downgrade_sql()
    # O único DROP é o da assinatura de 3 argumentos que o bloco da `_09` já trazia (e que não
    # existe mais desde ela): nenhuma função da arena sai.
    # O SQL offline põe um `;` a mais depois de comando de uma linha só.
    drops = [linha.rstrip(";") + ";" for linha in sql.splitlines() if linha.startswith("DROP ")]
    assert drops == [
        "DROP FUNCTION IF EXISTS public.guilda_desafio_responder(uuid, bigint, text);",
        "DROP FUNCTION IF EXISTS public.fn_arena_cobrar_limite_diario(uuid, uuid);",
    ]
    for marca in (
        "arena_desafio_cooperativo",
        "guilda_desafio_e_da_arena",
        "'competitivo'",
        "'meu_elo'",
        "arena_convite_expira_min', 1440",
        "PERFORM public.fn_arena_cobrar_limite_diario",
    ):
        assert marca not in sql, marca
    for nome, md5 in _MD5_PRODUCAO.items():
        assert _md5(_prosrc(sql, nome)) == md5, nome
    assert _md5(_prosrc(sql, "fn_desafio_varrer_abandonados")) == _MD5_VARREDURA_PRODUCAO
    assert "DELETE FROM public.app_config" in sql
    assert _prosrc(sql, "guilda_desafio_responder") == _prosrc(
        _M19.responder_guilda_anterior(), "guilda_desafio_responder"
    )


# ── As decisões da Geisbelly (2026-10-20) ──────────────────────────────────────────────────


def _corpo_novo(sql: str, nome: str, producao: str) -> tuple[str, str]:
    return _prosrc(sql, nome), _prosrc(producao, nome)


def test_as_duas_chaves_novas_e_os_padroes() -> None:
    assert "('arena_convite_expira_min', '1440'," in _M19.CONFIG
    assert "('arena_limite_diario_mesmo_adversario', '3'," in _M19.CONFIG
    assert "ON CONFLICT (chave) DO NOTHING;" in _M19.CONFIG
    assert "'arena_convite_expira_min'" in _M19.CONFIG_FORA
    assert "'arena_limite_diario_mesmo_adversario'" in _M19.CONFIG_FORA


def test_decisao_3_a_varredura_da_arena_usa_a_janela_propria() -> None:
    assert _md5(_prosrc(_M19.VARREDURA_PRODUCAO, "fn_desafio_varrer_abandonados")) == _MD5_VARREDURA_PRODUCAO
    corpo = _prosrc(_M19.varredura_com_janela(), "fn_desafio_varrer_abandonados")
    assert "v_min_arena integer := public.fn_app_config_int('arena_convite_expira_min', 1440);" in corpo
    assert "WHERE p.desafio_id = d.id AND p.equipe = 2)" in corpo
    assert "THEN v_min_arena ELSE v_min END, 1))" in corpo
    # Cooperativo continua no `desafio_encerra_apos_min`.
    assert "public.fn_app_config_int('desafio_encerra_apos_min', 30)" in corpo


def test_decisao_4_recusa_fecha_na_hora() -> None:
    novo, producao = _corpo_novo(_M19.convite_com_recusa_e_limite(), "arena_convite_responder", _M19.VERSIONADAS)
    assert _md5(producao) == _MD5_PRODUCAO["arena_convite_responder"]
    assert novo.count("v_fim := public.fn_desafio_encerrar(p_desafio_id);") == 1
    assert "WHERE p.desafio_id = p_desafio_id AND p.equipe = 2 AND p.estado <> 'recusado'" in novo
    # Fecha só depois de gravar a recusa e só no ramo da recusa.
    assert novo.index("SET estado = v_estado") < novo.index("IF p_aceitar THEN") < novo.index("v_fim :=")
    assert "'encerrou', v_fim IS NOT NULL" in novo


def test_decisao_5_limite_ao_criar_e_ao_aceitar() -> None:
    limite = _M19.LIMITE
    assert "public.fn_app_config_int('arena_limite_diario_mesmo_adversario', 3)" in limite
    assert "IF v_limite <= 0 THEN" in limite
    assert "AT TIME ZONE 'America/Sao_Paulo'" in limite
    assert "d.resultado IS DISTINCT FROM 'sem_adversario'" in limite
    assert "px.estado = 'aceito'" in limite and "py.estado = 'aceito'" in limite
    assert "RAISE EXCEPTION 'arena_limite_diario_adversario' USING" in limite
    assert "ERRCODE = '22023'" in limite and "HINT = v_limite::text;" in limite
    # Sem EXECUTE para cliente: é chamada de dentro das DEFINER da arena.
    assert (
        "REVOKE ALL ON FUNCTION public.fn_arena_cobrar_limite_diario(uuid, uuid) FROM PUBLIC, anon, authenticated;"
        in limite
    )
    assert "GRANT" not in limite

    criar, producao = _corpo_novo(_M19.criar_com_limite(), "arena_desafio_criar", _M19.VERSIONADAS)
    chamada = "PERFORM public.fn_arena_cobrar_limite_diario(v_id);"
    assert criar.count(chamada) == 1
    assert criar.rindex("INSERT INTO public.desafio_participantes") < criar.index(chamada) < criar.index("FOR v_q IN")
    assert _md5(producao) == _MD5_PRODUCAO["arena_desafio_criar"]

    convite = _prosrc(_M19.convite_com_recusa_e_limite(), "arena_convite_responder")
    assert convite.count("PERFORM public.fn_arena_cobrar_limite_diario(p_desafio_id, auth.uid());") == 1


def test_decisao_10_meu_elo_so_da_minha_linha() -> None:
    for sql, nome in ((_M19.listar_com_elo(), "arena_listar"), (_M19.arena_desafio_com_competitivo(), "arena_desafio")):
        corpo = _prosrc(sql, nome)
        assert "'meu_elo', (SELECT jsonb_build_object('delta', ep.delta," in corpo, nome
        assert "FROM public.ranqueada_elo_partida ep" in corpo, nome
        assert "WHERE ep.desafio_id = d.id AND ep.aluno_id = auth.uid())," in corpo, nome
    # Fora o `meu_elo`, `arena_listar` é a de produção.
    novo = _prosrc(_M19.listar_com_elo(), "arena_listar")
    assert _md5(novo.replace(_M19._meu_elo("             "), "")) == _MD5_PRODUCAO["arena_listar"]
