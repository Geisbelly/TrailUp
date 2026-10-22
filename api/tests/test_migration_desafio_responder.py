"""`20261021_27`: um ponto de entrada para responder desafio.

A decisão que a `_19` deixou aberta era "unificar os dois responder". **Unificado o ponto de
entrada, não as regras** — e o que estes testes travam é justamente isso: que as duas
implementações continuem separadas, que o despacho use o MESMO predicado das guardas existentes,
e que o retorno não invente chave que o caminho escolhido não produz.
"""

import importlib.util
import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config
from tests.test_rpc_chamada_tem_migracao import _criadas_por_migracao, _rpcs_chamadas

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
_ARQUIVO = "20261021_27_um_ponto_de_entrada_para_responder.py"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M27 = _modulo(_ARQUIVO)


def test_encadeia_depois_da_26() -> None:
    assert _M27.revision == "20261021_27"
    assert _M27.down_revision == "20261021_26"


def test_despacha_pelo_mesmo_predicado_das_guardas() -> None:
    """`EXISTS (... dp.equipe = 2)` é o que `arena_responder` e `guilda_desafio_responder` já
    usam para recusar o caminho errado (`arena_desafio_cooperativo` / `guilda_desafio_e_da_arena`,
    `20261021_19`). Se o despacho usasse outro critério, passaria a existir uma TERCEIRA
    definição de "é da arena" — e a função despacharia para quem recusa."""
    corpo = _M27.CRIA
    assert "dp.equipe = 2" in corpo
    assert "FROM public.desafio_participantes dp" in corpo
    assert "public.arena_responder(p_desafio_id, p_questao_id, p_resposta, p_tempo_ms)" in corpo
    assert "public.guilda_desafio_responder(p_desafio_id, p_questao_id, p_resposta, p_tempo_ms)" in corpo


def test_nao_funde_as_regras_dos_dois_caminhos() -> None:
    """O que esta migration NÃO faz. Tentativas, acúmulo de tempo, condição de fechamento e
    payload diferem por desenho entre os dois caminhos; fundi-los daria um `IF` com duas
    implementações disjuntas dentro, em código corrigido três vezes este mês (`_12`, `_14`,
    `_19`). Se alguém trouxer essas regras para cá, este teste cai."""
    corpo = _M27.CRIA
    for regra in (
        "desafio_tentativas",       # limite por dificuldade: é da guilda
        "ON CONFLICT",              # gravação da resposta: é das duas, cada uma do seu jeito
        "guilda_desafio_respostas", # a tabela de resposta não é tocada aqui
        "fn_desafio_encerrar",      # fechamento: quem decide é cada caminho
        "arena_encerrar",
    ):
        assert regra not in corpo, f"'{regra}' é regra de um dos caminhos e não deve estar no despachante"


def test_o_retorno_acrescenta_competitivo_sem_inventar_chave() -> None:
    """A arena devolve `{correta, registrada}` e o cooperativo `{correta, tentativas,
    tentativas_restantes, faltam, encerrou}`. O despachante soma `competitivo` ao payload de
    quem respondeu — preencher `faltam`/`tentativas_restantes` com zero na arena seria mentira,
    e a tela leria como "sem tentativas" o que não tem tentativa nenhuma."""
    corpo = _M27.CRIA
    assert "|| jsonb_build_object('competitivo', v_competitivo)" in corpo
    assert "tentativas_restantes" not in corpo
    assert "'faltam'" not in corpo


def test_nao_duplica_a_checagem_de_permissao() -> None:
    """Quem recusa é a função que de fato responde, com a mensagem dela. Uma guarda aqui criaria
    duas respostas possíveis para o mesmo "não" — e a do despachante seria sempre a errada, por
    não saber de tentativas nem de convite pendente."""
    corpo = _M27.CRIA
    assert "sem_permissao" not in corpo
    assert "RAISE EXCEPTION" not in corpo


def test_privilegio_e_o_mesmo_das_duas_antigas() -> None:
    corpo = _M27.CRIA
    assert f"REVOKE ALL ON FUNCTION {_M27.ASSINATURA} FROM PUBLIC, anon;" in corpo
    assert f"GRANT EXECUTE ON FUNCTION {_M27.ASSINATURA} TO authenticated, service_role;" in corpo
    assert corpo.index("REVOKE ALL ON FUNCTION") < corpo.index("GRANT EXECUTE ON FUNCTION")


def test_as_duas_antigas_continuam_no_alembic_e_chamadas() -> None:
    """Elas NÃO são revogadas junto: aplicativo já instalado chama as duas pelo nome, e o cliente
    novo só cai nelas quando a `_27` não está aplicada (PGRST202). Revogar é a continuação,
    depois de o app novo estar distribuído."""
    corpo = _M27.CRIA
    assert "REVOKE" not in corpo.replace(f"REVOKE ALL ON FUNCTION {_M27.ASSINATURA} FROM PUBLIC, anon;", "")
    criadas = _criadas_por_migracao()
    chamadas = _rpcs_chamadas()
    for nome in ("arena_responder", "guilda_desafio_responder", "desafio_responder"):
        assert nome in criadas, f"{nome} tem de nascer de migração"
        assert nome in chamadas, f"{nome} deveria continuar sendo chamada pelo cliente"


def test_o_downgrade_remove_so_o_despachante() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_27:20261021_26", sql=True)
    sql = output.getvalue()
    assert "DROP FUNCTION IF EXISTS public.desafio_responder(uuid, bigint, text, integer)" in sql
    for nome in ("arena_responder", "guilda_desafio_responder"):
        assert f"DROP FUNCTION IF EXISTS public.{nome}" not in sql
