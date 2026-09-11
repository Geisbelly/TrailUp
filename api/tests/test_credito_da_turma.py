"""Credito concedido pelo professor: presenca, participacao e ponto extra de sala.

O defeito que esta migracao fecha antes de qualquer feature nova: a referencia
que a RPC de presenca grava e' `classe:<id>:<AAAA-MM-DD>`, e
`fn_eventos_aluno_referencia_id` pega os digitos do FIM (`'^.*:[0-9]+$'`). A
data tem hifen, entao nao casa, e `classe_id` nascia NULO -- o que tira o evento
da CTE `eventos_por_classe` do rank. Presenca concedida nunca contaria.

Medido em producao depois da correcao, com o bloco desfeito por excecao:
o rank de pontuacao da classe 32 vai de 794 para 802 ao conceder 8 pontos.
Antes, ficaria em 794.
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
        _offline_alembic_config(output), "20260911_04:20260911_05", sql=True
    )
    return output.getvalue()


def _sql_downgrade() -> str:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260911_05:20260911_04", sql=True
    )
    return output.getvalue()


def test_o_resolvedor_le_o_segundo_segmento_da_referencia_de_classe() -> None:
    """E' a correcao que faz o credito chegar ao rank. Tirar os digitos do fim
    devolvia nulo para a data com hifen."""
    sql = _sql()

    assert "split_part(alvo.bruta, ':', 2)" in sql
    assert "WHEN alvo.entidade = 'classe' THEN" in sql


def test_os_outros_prefixos_continuam_pelos_digitos_do_fim() -> None:
    """`topico:`, `conteudo:`, `atividade:` e `conquista:` nao podem mudar de
    comportamento -- a correcao e' so do prefixo de classe."""
    sql = _sql()

    assert "ELSE alvo.ref_id" in sql
    assert "conquista deixou de ter classe nula, e ela e nula de proposito" in sql


def test_o_ponto_extra_exige_motivo() -> None:
    """O motivo e' o rotulo do historico E o que separa duas atividades do mesmo
    dia na deduplicacao: sem ele a segunda cairia no DO NOTHING sem erro, e o
    professor acharia que pagou."""
    sql = _sql()

    assert "participacao_extra exige motivo" in sql


def test_o_ponto_extra_exige_valor() -> None:
    """Presenca tem padrao em `app_config`; atividade de sala nao tem -- cada
    uma vale o que o professor decidir."""
    sql = _sql()

    assert "participacao_extra exige valor" in sql


def test_o_valor_tem_teto_vindo_de_app_config() -> None:
    """`valor` e' a coluna que o rank soma: um zero a mais viraria lider de
    turma sem recurso."""
    sql = _sql()

    assert "credito_extra_maximo" in sql
    assert "passa do teto de" in sql


def test_a_referencia_do_extra_leva_o_slug_do_motivo() -> None:
    """Duas atividades em sala no mesmo dia sao dois creditos. Com a mesma
    referencia, a segunda cairia no DO NOTHING."""
    sql = _sql()

    assert "v_ref := v_ref || ':' || COALESCE(v_slug, md5(v_motivo));" in sql


def test_motivo_que_vira_slug_vazio_ainda_tem_chave_propria() -> None:
    """Um motivo so de simbolos viraria slug vazio, e dois creditos diferentes
    colidiriam. O md5 e' a saida."""
    sql = _sql()

    assert "md5(v_motivo)" in sql


def test_a_posse_da_classe_continua_verificada() -> None:
    """Sem isto um professor daria credito na turma de outro."""
    sql = _sql()

    assert "app_classes_do_professor()" in sql
    assert "nao e sua" in sql


def test_so_tres_tipos_podem_ser_concedidos() -> None:
    """A lista e' fechada de proposito: `fn_evento_creditado` casa por PREFIXO,
    entao um tipo novo comecando com `participacao` passaria a valer o que o
    chamador mandasse."""
    sql = _sql()

    assert (
        "IF p_tipo NOT IN ('presenca_aula', 'participacao_aula', 'participacao_extra') THEN"
        in sql
    )


def test_a_rpc_antiga_delega_em_vez_de_duplicar() -> None:
    """O console ja chama `registrar_presenca_da_turma`. Duas copias dos quatro
    bloqueios (sessao, posse, tipo, valor) divergiriam."""
    sql = _sql()

    assert "SELECT public.registrar_credito_da_turma(" in sql


def test_a_rpc_nao_fica_exposta_ao_anonimo() -> None:
    sql = _sql()

    assert "REVOKE ALL ON FUNCTION public.registrar_credito_da_turma" in sql
    assert "TO authenticated" in sql


def test_o_motivo_congela_no_update() -> None:
    """Sem isto o aluno reescreve a justificativa do proprio credito."""
    sql = _sql()

    assert "NEW.motivo := OLD.motivo;" in sql
    assert "ancora do congelamento nao e unica" in sql


def test_o_congelamento_do_motivo_e_idempotente() -> None:
    """A substituicao por texto precisa de uma sentinela ESPECIFICA da mudanca:
    uma generica passaria a valer para outra coisa e a migracao nao faria
    nada, calada."""
    sql = _sql()

    assert "IF position('NEW.motivo := OLD.motivo;' IN v_def) > 0 THEN" in sql


def test_a_view_do_historico_roda_como_invoker() -> None:
    """View sem `security_invoker` roda como dono e ignora a RLS das tabelas
    base -- era por ai que se lia ranking e telemetria sem login."""
    sql = _sql()

    assert "ALTER VIEW public.vw_creditos_concedidos SET (security_invoker = on)" in sql
    assert "REVOKE ALL ON public.vw_creditos_concedidos FROM PUBLIC, anon" in sql


def test_o_historico_exclui_conquista() -> None:
    """Conquista nao e' concedida a mao e tem classe nula de proposito: listar
    junto misturaria duas coisas com regras diferentes."""
    sql = _sql()

    assert "e.tipo <> 'conquista_desbloqueada'" in sql
    assert "e.concedido_por IS NOT NULL" in sql


def test_a_sonda_usa_classe_real() -> None:
    """O resolvedor termina num join com `classe`: um id inventado devolve nulo
    e o CONFERE acusaria a funcao por um defeito do proprio teste -- foi o que
    aconteceu na primeira tentativa desta migracao."""
    sql = _sql()

    assert "JOIN public.classe c ON c.id = ca.classe_id" in sql
    assert "sem matricula na base, sonda nao executada" in sql


def test_a_sonda_confere_que_o_credito_chega_ao_rank() -> None:
    sql = _sql()

    assert "nao chegaria ao rank" in sql


def test_o_downgrade_nao_repoe_os_corpos_com_defeito() -> None:
    """`registrar_presenca_da_turma` e o resolvedor estavam errados -- presenca
    nascia com classe nula. Reverter seria reintroduzir isso."""
    sql = _sql_downgrade()

    assert "DROP VIEW IF EXISTS public.vw_creditos_concedidos" in sql
    assert "DROP FUNCTION IF EXISTS public.registrar_credito_da_turma" in sql
    assert "CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_resolve_classe_id" not in sql


def test_nenhum_literal_vira_bind_parameter() -> None:
    """`text()` do SQLAlchemy varre a string CRUA e le dois-pontos seguido de
    caractere de palavra como nome de bind -- INCLUSIVE dentro de comentario
    SQL, que ele nao reconhece. `'classe:1:2026-09-11'` derrubou esta migracao
    duas vezes: uma no codigo, uma num comentario explicando o problema."""
    import re

    for sql in (_sql(), _sql_downgrade()):
        suspeitos = re.findall(r"(?<!:):[A-Za-z_]\w*", sql)
        assert not suspeitos, suspeitos


def test_o_sql_renderizado_nao_tem_por_cento() -> None:
    assert "%" not in _sql()
    assert "%" not in _sql_downgrade()
