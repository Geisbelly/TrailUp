"""Quem decide quanto vale um evento e o banco, nao o cliente.

O ranking de pontuacao era zero para todo mundo por dois motivos somados: todo
evento de estudo entrava com `valor = 0`, e o unico com valor era o ciclo da IA,
cuja referencia e um UUID que a view nunca resolve.
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
    API_ROOT / "alembic" / "versions" / "20260909_05_pontuacao_decidida_pelo_banco.py"
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
        _offline_alembic_config(output), "20260909_04:20260909_05", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_pontuacao", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_o_valor_que_o_cliente_manda_e_descartado() -> None:
    """O defeito em uma linha: `registrarEventoPontos` escolhia o valor."""
    sql = _sql()

    assert "BEFORE INSERT ON public.eventos_aluno" in sql
    assert "NEW.valor := public.fn_pontos_do_evento(NEW.tipo);" in sql

    # Tambem no UPDATE: senao bastaria inserir com zero e corrigir depois.
    assert "BEFORE UPDATE OF valor, tipo ON public.eventos_aluno" in sql


def test_o_ciclo_da_ia_deixa_de_valer_pontos() -> None:
    """Eram 6466 dos 6470 pontos do aluno de demonstracao -- e ciclo de
    personalizacao nao e' esforco de quem estuda."""
    modulo = _modulo()

    assert modulo.PONTUACAO["ciclo_iniciado"][0] == 0
    assert modulo.PONTUACAO["ciclo_executado"][0] == 0


def test_estudar_vale_mais_que_abrir_a_tela() -> None:
    modulo = _modulo()
    pontos = {tipo: valor for tipo, (valor, _) in modulo.PONTUACAO.items()}

    assert pontos["atividade_concluida"] > pontos["conteudo_concluido"] > 0
    # Rever conta pouco: sao 86 eventos num aluno so'; a 10 cada, revisar
    # dominaria o ranking.
    assert 0 < pontos["atividade_revisada"] < pontos["conteudo_concluido"]

    for so_abriu in ("topico_aberto", "conteudo_aberto", "atividade_iniciada"):
        assert pontos[so_abriu] == 0, so_abriu


def test_errar_nunca_tira_ponto() -> None:
    """Placar nao pode andar para tras por erro: errar faz parte de aprender, e
    valor negativo quebraria a monotonicidade que a moeda (#142) depende."""
    modulo = _modulo()

    assert modulo.PONTUACAO["atividade_errada"][0] == 0
    assert all(valor >= 0 for valor, _ in modulo.PONTUACAO.values())
    assert "CHECK (pontos >= 0)" in _sql()


def test_evento_creditado_mantem_o_valor_de_quem_concedeu() -> None:
    """Presenca vem da RPC e o premio vem de `conquistas.pontos_recompensa`."""
    sql = _sql()

    assert "IF public.fn_evento_creditado(NEW.tipo) THEN" in sql
    assert "RETURN NEW;" in sql


def test_tipo_desconhecido_vale_zero_em_vez_de_estourar() -> None:
    """Recusar quebraria o fluxo do aluno se um cliente emitisse tipo novo.

    Valendo zero, o `topico_qualquercoisa` que a view resolveria por prefixo
    deixa de render pontos -- o buraco fecha do mesmo jeito.
    """
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.fn_pontos_do_evento" in sql
    assert "SELECT COALESCE(" in sql
    assert "RAISE EXCEPTION" not in sql


def test_a_tabela_e_configuravel_e_nao_gravavel_pelo_cliente() -> None:
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.eventos_pontuacao" in sql
    assert "ALTER TABLE public.eventos_pontuacao ENABLE ROW LEVEL SECURITY" in sql
    # O aluno pode ver quanto vale cada coisa.
    assert "CREATE POLICY eventos_pontuacao_sel" in sql
    assert (
        "REVOKE INSERT, UPDATE, DELETE ON public.eventos_pontuacao FROM anon, authenticated"
        in sql
    )


def test_todo_tipo_conhecido_entra_na_tabela() -> None:
    """A semente e o gatilho saem da mesma estrutura: um tipo sem linha valeria
    zero em silencio, que e' a familia de defeito das conquistas mortas."""
    modulo = _modulo()
    sql = _sql()

    for tipo in modulo.PONTUACAO:
        assert f"('{tipo}'," in sql, tipo


def test_o_historico_e_realinhado() -> None:
    """Os valores gravados vieram do cliente e nao significam nada. Como o rank
    ja mostrava zero, ninguem perde posicao."""
    sql = _sql()

    assert "UPDATE public.eventos_aluno e" in sql
    assert "SET valor = public.fn_pontos_do_evento(e.tipo)" in sql
    # Nao mexe no que foi concedido.
    assert "WHERE NOT public.fn_evento_creditado(e.tipo)" in sql


def test_o_sql_nao_carrega_porcentagem() -> None:
    assert "%" not in _sql()
