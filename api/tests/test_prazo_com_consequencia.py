"""O prazo passa a ter consequencia, e o mecanismo entra desligado.

Prazo em TrailUp nao fazia nada -- `prazoDaAtividade.ts`: "Atrasado e AVISO, nao
porta fechada". Medido no banco: 0 das 248 atividades tem `data_entrega`. O
fator de atraso entra em 1.0, que nao muda ponto nenhum, e o piloto liga quando
o professor comecar a marcar prazo.
"""

from __future__ import annotations

import importlib.util
import re
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = API_ROOT / "alembic" / "versions" / "20260912_01_prazo_com_consequencia.py"


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
        _offline_alembic_config(output), "20260911_10:20260912_01", sql=True
    )
    return output.getvalue()


def _corpo_de(assinatura: str, sql: str) -> str:
    """O texto de UMA funcao dentro do SQL renderizado, do CREATE ao `$fn$;`."""
    inicio = sql.index("CREATE OR REPLACE FUNCTION " + assinatura)
    fim = sql.index("$fn$;", inicio)
    return sql[inicio : fim + len("$fn$;")]


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_prazo", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_o_mecanismo_entra_desligado() -> None:
    """1.0 e' multiplicar por um: nenhuma linha da base muda de valor."""
    modulo = _modulo()
    assert modulo.FATOR_PADRAO == "1.0"

    sql = _sql()
    assert "'prazo_atraso_fator'" in sql
    assert "'1.0'" in sql
    # Nada de backfill: ligar depois e' um UPDATE numa linha de configuracao.
    assert "UPDATE public.eventos_aluno" not in sql


def test_o_parser_nao_copia_o_idioma_que_apaga_o_ponto_decimal() -> None:
    """`regexp_replace('0.5', '[^0-9]', '', 'g')` devolve '05' -- conferido no
    Postgres desta base. Seria multiplicar por CINCO em vez de cortar pela
    metade, e sem erro nenhum."""
    sql = _sql()

    assert "'[^0-9.]'" in sql, "o ponto decimal tem de sobreviver ao parser"
    assert "'[^0-9]'" not in sql, "esse e' o idioma das chaves INTEIRAS"
    # Quem edita a linha na mao escreve 0,5.
    assert "translate(v_bruto, ',', '.')" in sql


def test_configuracao_ilegivel_nao_zera_a_pontuacao_de_ninguem() -> None:
    """Falha para o lado de NAO punir: um typo na configuracao nao pode zerar o
    rank inteiro."""
    corpo = _corpo_de("public.app_prazo_atraso_fator()", _sql())

    # Nao parseou -> 1.0. O contrario zeraria o rank inteiro por um typo.
    tratamento = corpo[corpo.index("EXCEPTION WHEN others THEN") :]
    assert tratamento[: tratamento.index("END;")].count("RETURN 1;") == 1

    # Chave ausente tambem vale 1.0, e nao zero.
    assert corpo.count("RETURN 1;") == 3


def test_o_fator_e_aparado_entre_zero_e_um() -> None:
    """Acima de 1 pagaria MAIS por atrasar; abaixo de 0 tiraria ponto, e errar
    nunca anda para tras aqui (`atividade_errada` vale 0, nao -5)."""
    assert "LEAST(1, GREATEST(0, v_fator))" in _sql()


def test_so_referencia_de_atividade_olha_prazo() -> None:
    """Quem decide e' a REFERENCIA, nao o tipo -- uma lista de tipos aqui seria
    uma segunda lista para divergir da de `eventos_pontuacao`. Conferido no
    banco: `conteudo:174`, `topico:3` e o UUID do ciclo saem NULL no regex."""
    sql = _sql()
    assert "'^atividade:([0-9]+)$'" in sql


def test_nao_bloqueia_entrega() -> None:
    """A atividade continua aberta depois do prazo: so paga menos. Bloquear
    prenderia o aluno que voltou depois de uma semana doente."""
    corpo = _corpo_de("public.fn_fator_de_atraso(", _sql())
    assert "RAISE" not in corpo, "recusar o evento quebraria a tela do aluno"


def test_o_atraso_e_o_ultimo_passo_do_gatilho() -> None:
    """Zero vezes qualquer coisa continua zero -- por isso multiplicar no fim
    nao desfaz conclusao repetida, referencia vazia nem classe nula."""
    modulo = _modulo()
    corpo = modulo.CORPO_NOVO

    zera_classe_nula = corpo.index("AND NEW.classe_id IS NULL THEN")
    aplica_atraso = corpo.index("public.fn_fator_de_atraso(")
    assert zera_classe_nula < aplica_atraso

    # E depois do atraso so sobra o RETURN.
    assert corpo[aplica_atraso:].count("NEW.valor := 0;") == 0


def test_o_instante_julgado_e_o_do_evento_nao_o_de_agora() -> None:
    """Senao um UPDATE futuro transformaria em atrasado o que foi entregue no
    prazo. `criado_em` e' gravado por `now()` numa sessao UTC -- conferido."""
    corpo = _modulo().CORPO_NOVO
    assert "NEW.criado_em AT TIME ZONE 'UTC'" in corpo
    assert "COALESCE(NEW.criado_em AT TIME ZONE 'UTC', now())" in corpo


def test_a_substituicao_preserva_o_que_as_migracoes_anteriores_puseram() -> None:
    """A `20260911_05` emendou o corpo NO LUGAR, entao o texto da `20260911_04`
    ja nao e' o que roda -- falta `NEW.motivo := OLD.motivo;`. Um CREATE OR
    REPLACE copiado de la apagaria esse congelamento em silencio."""
    modulo = _modulo()

    assert "NEW.motivo := OLD.motivo;" in modulo.REGRAS_PRESERVADAS
    for regra in modulo.REGRAS_PRESERVADAS:
        assert regra in modulo.CORPO_NOVO, regra
        assert regra in modulo.CORPO_ANTERIOR, regra

    # E a conferencia roda ANTES da substituicao, senao nao protege nada.
    sql = _sql()
    assert sql.index("$confere$") < sql.index(
        "CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_valor_do_banco"
    )
    assert "pg_get_functiondef" in sql


def test_downgrade_tira_o_atraso_e_devolve_o_resto() -> None:
    modulo = _modulo()
    assert "fn_fator_de_atraso" in modulo.CORPO_NOVO
    assert "fn_fator_de_atraso" not in modulo.CORPO_ANTERIOR
    assert modulo.CORPO_ANTERIOR.rstrip().endswith("$function$;")


def test_nenhum_bind_parameter_escondido_no_sql() -> None:
    """`text()` varre a string CRUA: `'classe:1:2026-09-11'` derrubou a
    `20260911_05` com `A value is required for bind parameter '2026'`, e vale
    dentro de comentario tambem."""
    suspeitos = re.findall(r"(?<![:\w$]):([\w$]+)", _sql())
    assert not suspeitos, sorted(set(suspeitos))
