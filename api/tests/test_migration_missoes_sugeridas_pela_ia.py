"""`20261102_20`: missões sugeridas pela IA — estrutura, autorização e o catálogo que não pode divergir.

O comportamento (pedido com faixa e teto, regras do que entra, log só de acréscimo, RLS, isolamento de
falha) foi exercitado num Postgres real (PGlite) com o esqueleto das tabelas: ver o PR. Aqui fica o que
dá para travar sem banco.
"""

import re
from io import StringIO
from pathlib import Path

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

RAIZ = Path(__file__).resolve().parents[2]
CRITERIO_TS = RAIZ / "frontend" / "src" / "components" / "console" / "missoes" / "criterio.ts"


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261102_19:20261102_20", sql=True)
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261102_20:20261102_19", sql=True)
    return output.getvalue().replace("%%", "%")


def test_a_arvore_continua_com_uma_cabeca_e_vem_depois_da_19() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261102_20").down_revision == "20261102_19"


def test_nada_da_ia_chega_ao_aluno_sem_decisao_e_o_banco_garante() -> None:
    sql = _upgrade_sql()
    assert "CHECK (origem <> 'ia' OR aprovacao <> 'nao_requer')" in sql
    # O worker grava `pendente`, sempre; quem aprova é o professor.
    assert "'missao_concluida', 'pendente', true, v_base, v_ped.id" in sql


def test_quantidade_faixa_e_teto_ficam_em_app_config_e_privados() -> None:
    sql = _upgrade_sql()
    for chave in ("missao_ia_padrao", "missao_ia_min", "missao_ia_max", "missao_ia_pedidos_por_dia"):
        assert f"'{chave}'" in sql
    linhas = [linha for linha in sql.splitlines() if linha.strip().startswith("('missao_ia_")]
    assert len(linhas) == 4 and all(", false)" in linha for linha in linhas)
    # Piso e teto de sanidade: config quebrada não abre a porta.
    assert "LEAST(20, GREATEST(minimo" in sql


def test_o_pedido_e_so_pela_rpc_e_o_cliente_nao_escreve_na_fila() -> None:
    sql = _upgrade_sql()
    assert "GRANT SELECT ON public.missoes_ia_pedidos TO authenticated" in sql
    assert "REVOKE ALL ON public.missoes_ia_pedidos FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT EXECUTE ON FUNCTION public.missao_ia_pedir(bigint, bigint, integer) TO authenticated" in sql
    # A posse vem antes de qualquer leitura.
    assert sql.index("app_classes_do_professor() AS minha(id)") < sql.index("O tópico não é desta turma")


def test_as_funcoes_do_worker_sao_so_de_service_role() -> None:
    sql = _upgrade_sql()
    for assinatura in (
        "fn_missao_ia_reivindicar(integer, integer, bigint[])",
        "fn_missao_ia_contexto(uuid)",
        "fn_missao_ia_registrar(uuid, jsonb)",
        "fn_missao_ia_falhou(uuid, text)",
    ):
        assert f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon, authenticated" in sql, assinatura
        assert f"GRANT EXECUTE ON FUNCTION public.{assinatura} TO service_role" in sql, assinatura


def test_o_log_so_cresce_e_nunca_impede_a_decisao() -> None:
    sql = _upgrade_sql()
    assert "REVOKE ALL ON public.missoes_ia_log FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT SELECT ON public.missoes_ia_log TO authenticated" in sql
    assert "EXCEPTION WHEN OTHERS THEN" in sql and "RAISE WARNING 'missoes_ia_log: %'" in sql
    assert "AFTER INSERT OR UPDATE OF aprovacao ON public.missoes" in sql


def test_o_modelo_nao_recebe_dado_de_aluno() -> None:
    sql = _upgrade_sql()
    contexto = sql[sql.index("fn_missao_ia_contexto(p_pedido_id uuid)") : sql.index("fn_missao_ia_registrar(p_pedido_id uuid")]
    # Só a contagem de alunos; nenhuma coluna de pessoa entra no contexto.
    assert "count(*) FROM public.classe_aluno" in contexto
    for proibido in ("alunos al", "email", "nome_completo", "telemetria", "aluno_id"):
        assert proibido not in contexto, proibido


def test_o_catalogo_do_banco_bate_com_o_do_console() -> None:
    """A chave de parâmetro errada não dá erro: o avaliador lê COALESCE(..., 0) e a missão fecha na hora
    para todo mundo. Os dois lados têm de dizer a mesma coisa."""
    sql = _upgrade_sql()
    banco = {
        m: (chave, int(mx))
        for m, chave, mx in re.findall(r"\('(\w+)', '(\w+)', '[^']+', (\d+)\)", sql[sql.index("fn_missao_ia_catalogo()") :])
    }
    ts = CRITERIO_TS.read_text(encoding="utf-8")
    bloco = ts[ts.index("export const CHAVE_DO_ALVO") :]
    bloco = bloco[: bloco.index("};")]
    chaves = dict(re.findall(r"^\s+(\w+): \"(\w+)\",$", bloco, re.M))
    maximos = {m: int(mx) for m, mx in re.findall(r"chave: \"(\w+)\",\n(?:.*\n)*?\s+max: (\d+),", ts)}
    assert set(banco) == set(chaves) == set(maximos) and len(banco) == 6
    for metrica, (chave, maximo) in banco.items():
        assert chaves[metrica] == chave, metrica
        assert maximos[metrica] == maximo, metrica


def test_o_prompt_explica_cada_metrica_do_catalogo() -> None:
    """Sem a explicação, o modelo lê o nome da métrica e promete escopo que o avaliador não tem
    ("Estude 120 minutos de genética" conta estudo de qualquer assunto, desde sempre). Medido contra o
    Gemini na #857: 8 de 11 propostas amarravam a meta a um tópico. Métrica nova no catálogo precisa
    de uma linha no prompt dizendo o que ela mede."""
    sql = _upgrade_sql()
    metricas = re.findall(r"\('(\w+)', '\w+', '[^']+', \d+\)", sql[sql.index("fn_missao_ia_catalogo()") :])
    prompt = (RAIZ / "api" / "app" / "agent" / "prompts" / "missoes_ia.txt").read_text(encoding="utf-8")
    explicadas = set(re.findall(r'^- "(\w+)": ', prompt, re.M))
    assert len(metricas) == 6 and set(metricas) <= explicadas


def test_o_catalogo_so_tem_metricas_que_o_banco_sabe_avaliar() -> None:
    sql = _upgrade_sql()
    aceitas = {"eventos_totais", "eventos_do_tipo", "atividades_concluidas", "topicos_concluidos", "topicos_visitados",
               "dias_seguidos", "minutos_totais", "acertos_percentual", "trilha_percentual", "atividade_rapida",
               "atividades_rapidas", "evento_medalha"}  # fn_conquista_metrica_suportada
    nomes = set(re.findall(r"\('(\w+)', '\w+', '[^']+', \d+\)", sql[sql.index("fn_missao_ia_catalogo()") :]))
    assert nomes and nomes <= aceitas


def test_regras_que_nao_sao_do_modelo_ficam_no_banco() -> None:
    sql = _upgrade_sql()
    registrar = sql[sql.index("fn_missao_ia_registrar(p_pedido_id uuid") :]
    assert "EXIT WHEN v_gerados >= v_ped.quantidade" in registrar
    assert "https?://|www" in registrar  # link e e-mail
    assert "v_chave = ANY (v_vistos)" in registrar  # título repetido
    assert "o modelo não trouxe nenhuma proposta válida" in registrar


def test_a_comparacao_de_titulo_nao_depende_da_localidade_do_banco() -> None:
    sql = _upgrade_sql()
    chave = sql[sql.index("fn_missao_ia_chave_do_titulo(p_titulo text)") :]
    assert "translate(" in chave and "unaccent" not in chave


def test_o_downgrade_desfaz_na_ordem_certa() -> None:
    sql = _downgrade_sql()
    assert sql.index("DROP TRIGGER IF EXISTS trg_missoes_ia_log") < sql.index("DROP FUNCTION IF EXISTS public.fn_missoes_ia_log()")
    assert sql.index("DROP CONSTRAINT IF EXISTS missoes_pedido_ia_fk") < sql.index("DROP TABLE IF EXISTS public.missoes_ia_pedidos")
    assert sql.index("DROP TABLE IF EXISTS public.missoes_ia_pedidos") < sql.index("DROP COLUMN IF EXISTS pedido_ia_id")
