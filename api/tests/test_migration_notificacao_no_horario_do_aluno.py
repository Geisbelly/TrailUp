"""Estrutura da `20261102_01` (horário e texto da notificação por aluno, #66)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = VERSOES / "20261102_01_notificacao_no_horario_do_aluno.py"


def _modulo():
    spec = importlib.util.spec_from_file_location("m_20261102_01", ARQUIVO)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _Coletor:
    def __init__(self) -> None:
        self.sql: list[str] = []

    def execute(self, sql) -> None:
        self.sql.append(str(sql))


def _sql(fn: str = "upgrade") -> str:
    mod = _modulo()
    coletor = _Coletor()
    original = mod.op
    mod.op = coletor
    try:
        getattr(mod, fn)()
    finally:
        mod.op = original
    return "\n".join(coletor.sql)


M = _modulo()
UP = _sql()
DOWN = _sql("downgrade")


def test_encadeia_depois_da_15_de_01_11():
    # Nasceu sobre a _14, como a _15 (#764); as duas entraram juntas e a main ficou com duas
    # cabeças. Esta é a que não está em produção, então é ela que vai para depois da _15.
    assert M.revision == "20261102_01"
    assert M.down_revision == "20261101_15"


def test_upgrade_sem_porcentagem_literal():
    # O SQL offline do Alembic dobra `%` e corrompe plpgsql sem erro (memória do projeto).
    assert "%" not in UP


def test_tabela_de_modelos_nasce_fechada_e_documentada():
    assert "ALTER TABLE public.notificacoes_modelos_texto ENABLE ROW LEVEL SECURITY" in UP
    assert "REVOKE ALL ON TABLE public.notificacoes_modelos_texto FROM PUBLIC, anon, authenticated" in UP
    assert "CREATE POLICY" not in UP
    assert "Sem policy de propósito" in UP
    assert "fica sem policy, de propósito" in M.__doc__


def test_funcoes_internas_sem_execute_para_cliente():
    for assinatura in (
        "notificacoes_fora_do_silencio(text, timestamptz)",
        "notificacoes_perfil_dominante(uuid)",
        "notificacoes_horario_preferido(uuid)",
        "notificacoes_texto_revisao(uuid)",
        "notificacoes_recalcular_rotinas(integer)",
    ):
        assert f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon, authenticated" in UP


def test_todo_perfil_tem_modelo_com_e_sem_topico_dentro_dos_limites():
    perfis = {"seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"}
    assert {perfil for perfil, _ in M.MODELOS} == perfis
    assert {variante for _, variante in M.MODELOS} == {"com_topico", "sem_topico"}
    assert len(M.MODELOS) == 14
    for (perfil, variante), (titulo, corpo) in M.MODELOS.items():
        assert 1 <= len(titulo) <= 60, (perfil, variante)
        # O pior caso: nome de tópico cortado em 60 e "100%".
        render = corpo.replace("{topico}", "x" * 60).replace("{percentual}", "100%")
        assert len(render) <= 200, (perfil, variante)
        if variante == "com_topico":
            assert "{topico}" in corpo and "{percentual}" in corpo
        else:
            assert "{" not in corpo


def test_modelos_com_acento_e_guarda_de_codificacao():
    assert "position('á' in corpo)" in UP
    assert any("ê" in corpo or "á" in corpo for _, corpo in M.MODELOS.values())


def test_escolha_do_aluno_so_quando_hora_muda():
    assert "WHEN EXCLUDED.hora_local IS DISTINCT FROM notificacoes_agendamentos.hora_local" in UP
    assert "CHECK (hora_origem IN ('padrao', 'aluno', 'inferida'))" in UP


def test_login_deixa_de_reescrever_o_texto_da_revisao():
    nova = M.garantir_rotinas_nova()
    # As outras duas rotinas continuam com o texto fixo; só a revisão diária perde a reescrita.
    assert nova.count("titulo = EXCLUDED.titulo") == 2
    assert "trocaria o texto personalizado pelo fixo" in nova


def test_promocao_usa_horario_sugerido_e_silencio():
    assert "NEW.horario_sugerido" in UP
    assert "notificacoes_fora_do_silencio(v_tz, COALESCE(v_hor, now()))" in UP
    assert "v_hor + make_interval(hours => public.notificacoes_cfg_int('expiracao_padrao_horas', 48))" in UP


def test_cron_so_com_pg_cron_e_idempotente():
    assert "IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')" in UP
    assert "cron.unschedule('trailup_notificacoes_recalcular_rotinas')" in UP
    assert "cron.schedule('trailup_notificacoes_recalcular_rotinas', '0 9 * * *'" in UP


def test_downgrade_devolve_as_funcoes_antigas_antes_de_tirar_colunas():
    assert DOWN.index("CREATE OR REPLACE FUNCTION public.notificacoes_ia_promover") < DOWN.index(
        "DROP COLUMN IF EXISTS horario_sugerido"
    )
    assert "horario_sugerido" not in M._funcao(DOWN, "notificacoes_ia_promover", "downgrade")
    assert "hora_origem" not in M._funcao(DOWN, "notificacoes_salvar_rotina", "downgrade")
    assert "cron.unschedule('trailup_notificacoes_recalcular_rotinas')" in DOWN
