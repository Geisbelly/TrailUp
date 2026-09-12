"""O professor define o ganho; o banco decide o valor.

`eventos_pontuacao` ja decide quantos PONTOS vale cada evento desde
`20260909_05`. Aqui ela passa a decidir tambem quantas MOEDAS, com sobreposicao
por turma -- e o gatilho paga uma vez so' por (aluno, tipo, referencia).
"""

from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = API_ROOT / "alembic" / "versions" / "20260912_02_ganho_de_moedas.py"


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
        _offline_alembic_config(output), "20260912_01:20260912_02", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_moedas", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_moeda_mora_ao_lado_do_ponto_nao_dentro_dele() -> None:
    """Moeda com valor proprio permite pagar moeda por algo que nao vale XP, e
    o contrario -- o professor calibra os dois separadamente."""
    sql = _sql()

    assert "ALTER TABLE public.eventos_pontuacao" in sql
    assert "ADD COLUMN IF NOT EXISTS moedas numeric NOT NULL DEFAULT 0" in sql
    assert "CHECK (moedas >= 0)" in sql


def test_revisar_nao_paga_moeda() -> None:
    """Sao 86 eventos de revisao num unico aluno de demonstracao. A 1 moeda
    cada, revisar seria a melhor fonte de renda do sistema."""
    modulo = _modulo()

    assert modulo.MOEDAS["atividade_revisada"] == 0


def test_errar_nao_tira_e_nao_da() -> None:
    """Errar faz parte de aprender; o saldo nao pode andar para tras por isso."""
    modulo = _modulo()

    assert modulo.MOEDAS["atividade_errada"] == 0


def test_estudar_paga_mais_que_abrir_a_tela() -> None:
    modulo = _modulo()

    assert modulo.MOEDAS["atividade_concluida"] > modulo.MOEDAS["conteudo_concluido"]
    assert modulo.MOEDAS["conteudo_concluido"] > 0
    assert modulo.MOEDAS["topico_aberto"] == 0
    assert modulo.MOEDAS["conteudo_aberto"] == 0


def test_o_ciclo_da_ia_nao_paga_moeda() -> None:
    """O ciclo e' da IA, nao do aluno -- era daqui que saiam 6466 dos 6470
    pontos antes do 20260909_05."""
    modulo = _modulo()

    assert modulo.MOEDAS["ciclo_iniciado"] == 0
    assert modulo.MOEDAS["ciclo_executado"] == 0


def test_a_turma_sobrepoe_o_padrao_global() -> None:
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.eventos_pontuacao_classe" in sql
    assert "PRIMARY KEY (classe_id, tipo)" in sql


def test_nulo_significa_herda_o_global() -> None:
    """Quem nao mexe em nada continua com o padrao: nenhuma turma precisa ser
    configurada para funcionar."""
    sql = _sql()

    assert "pontos     numeric NULL" in sql
    assert "moedas     numeric NULL" in sql


def test_so_o_dono_da_classe_escreve_o_ganho_dela() -> None:
    """Via helper SECURITY DEFINER: o predicado que consultasse classe_aluno
    direto entraria em recursao de RLS."""
    sql = _sql()

    assert "CREATE POLICY eventos_pontuacao_classe_professor" in sql
    assert "classe_id IN (SELECT public.app_classes_do_professor())" in sql


def test_o_aluno_ve_quanto_rende_mas_nao_escreve() -> None:
    sql = _sql()

    assert "CREATE POLICY eventos_pontuacao_classe_sel" in sql
    assert (
        "REVOKE INSERT, UPDATE, DELETE ON public.eventos_pontuacao_classe FROM anon"
        in sql
    )
