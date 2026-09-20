"""Guardas da `20260920_01` e do gravador de metricas da API.

Como os outros testes de migracao deste repo, este inspeciona o SQL gerado sem
subir Postgres (`test_migrations_tempo_por_lote.py` faz o mesmo). O que da para
garantir aqui e o que custou caro: o CHECK que recusaria toda linha de questao,
a guarda de escopo do gatilho, e o `entry_key` que os dois gravadores escreviam
diferente.
"""

import importlib.util
import re
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
VERSOES = API_ROOT / "alembic" / "versions"
MIGRACAO = "20260920_01_telemetria_por_questao_e_escopo_limpo.py"


def _carregar(nome: str):
    caminho = VERSOES / nome
    spec = importlib.util.spec_from_file_location(f"migration_{nome}", caminho)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _sql(direcao: str = "upgrade") -> str:
    module = _carregar(MIGRACAO)
    executado: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executado.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return "\n".join(executado)


def _sem_comentarios(sql: str) -> str:
    return " ".join(linha.split("--", 1)[0] for linha in sql.splitlines())


def test_cadeia_de_revisao():
    module = _carregar(MIGRACAO)
    assert module.revision == "20260920_01"
    assert module.down_revision == "20260919_01"


def test_o_check_de_escopo_aceita_question():
    # Sem isto TODA linha de questao e recusada com 23514, e o cliente trata
    # erro nao-rede caindo no gravador direto -- que grava na mesma tabela e
    # leva o mesmo 23514. O escopo novo seria invisivel e silencioso.
    executavel = _sem_comentarios(_sql())
    assert "ck_telemetria_time_metric_entries_scope" in executavel
    check = re.search(
        r"CHECK \(scope IN \(([^)]*)\)\)", executavel
    )
    assert check is not None
    for escopo in ("topic", "content", "activity", "question", "material"):
        assert f"'{escopo}'" in check.group(1)


def test_o_gatilho_nao_deixa_o_escopo_receber_id_mais_fino_que_ele():
    # O defeito medido: nove linhas de `scope = 'content'` com o `atividade_id`
    # da ultima atividade aberta no lote, porque o gatilho lia `activity:1063`
    # do `item_key` sem olhar para o escopo da linha.
    executavel = _sem_comentarios(_sql())
    assert "NEW.scope <> 'topic'" in executavel
    assert "NEW.scope IN ('activity', 'question', 'material')" in executavel


def test_o_gatilho_deriva_a_ancestralidade_da_questao():
    # `questoes.atividade_id` e `atividades.topico_id` sao derivaveis de
    # verdade, ao contrario do vinculo atividade->conteudo, que nao existe no
    # schema (`atividades` nao tem `conteudo_id`).
    executavel = _sem_comentarios(_sql())
    assert "FROM questoes q WHERE q.id = NEW.questao_id" in executavel
    assert "FROM atividades a WHERE a.id = NEW.atividade_id" in executavel


def test_a_entry_key_da_questao_existe():
    executavel = _sem_comentarios(_sql())
    assert "'question:' || NEW.questao_id::text" in executavel


def test_a_funcao_de_cinco_argumentos_nao_muda_de_assinatura():
    # Ela e chamada pelo gatilho `trailup_tempo_after_telemetria`. Trocar a
    # assinatura de funcao viva debaixo de um gatilho e o erro que a
    # `20260912_01` documentou; por isso a versao com questao e uma funcao NOVA
    # e a antiga passa a delegar.
    executavel = _sem_comentarios(_sql())
    assert "trailup_tempo_telemetria_min_v2" in executavel
    assert "p_atividade bigint, p_questao bigint" in executavel
    assert "p_aluno, p_scope, p_topico, p_conteudo, p_atividade, NULL" in executavel


def test_a_funcao_nova_nao_nasce_executavel_por_anon():
    # O Supabase concede EXECUTE a PUBLIC por padrao; o linter acusa em
    # `anon_security_definer_function_executable`. Forma da `20260826_09`.
    executavel = _sem_comentarios(_sql())
    assert "REVOKE ALL ON FUNCTION public.trailup_tempo_telemetria_min_v2" in executavel
    assert "FROM PUBLIC, anon" in executavel
    assert "GRANT EXECUTE ON FUNCTION public.trailup_tempo_telemetria_min_v2" in executavel


def test_a_limpeza_so_toca_o_que_a_propria_linha_prova_errado():
    executavel = _sem_comentarios(_sql())
    assert "scope = 'content'" in executavel
    assert "item_key LIKE 'activity:%'" in executavel


def test_nenhum_literal_vira_bind_parameter_do_sqlalchemy():
    # `text()` varre a string CRUA: `'classe:1'` derruba a migracao com
    # "A value is required for bind parameter". Vale inclusive dentro de
    # comentario SQL. `x::text` e seguro (o duplo dois-pontos e cast).
    for direcao in ("upgrade", "downgrade"):
        suspeitos = re.findall(r"(?<!:):[A-Za-z_]\w*", _sql(direcao))
        assert suspeitos == [], f"{direcao}: {suspeitos}"


def test_o_downgrade_desfaz_o_escopo_antes_de_apertar_o_check():
    # Apertar o CHECK com linhas de `question` na tabela derruba o downgrade.
    sql = _sem_comentarios(_sql("downgrade"))
    posicao_update = sql.index("SET scope = 'activity'")
    posicao_check = sql.index("ADD CONSTRAINT ck_telemetria_time_metric_entries_scope")
    assert posicao_update < posicao_check


# ----------------------------------------------------------------------
# O gravador da API
# ----------------------------------------------------------------------


def _fonte_do_gravador() -> str:
    return (API_ROOT / "app" / "repositories" / "telemetria.py").read_text(
        encoding="utf-8"
    )


def test_o_gravador_manda_a_entry_key_do_cliente():
    # O INSERT nao mandava a coluna e deixava o trigger derivar
    # `content:<conteudo_id>`. Dois passos personalizados do MESMO conteudo
    # derivam a mesma chave no mesmo lote, e o segundo caia no
    # `ON CONFLICT ... DO NOTHING` -- o tempo dele sumia. Pelo caminho direto do
    # mobile a chave sempre foi enviada: os dois gravadores gravavam coisas
    # diferentes.
    fonte = _fonte_do_gravador()
    assert '"entry_key": entry.get("key") or None' in fonte
    assert ":entry_key" in fonte


def test_o_gravador_nao_derrama_o_id_do_lote_em_escopo_alheio():
    # O lote carrega o item ABERTO no flush. Como fallback universal, ele
    # carimbava a linha de `topic` com um `conteudo_id` e a de `content` com um
    # `atividade_id` -- nenhum dos dois descreve a linha.
    fonte = _fonte_do_gravador()
    assert 'conteudo_id if scope != "topic" else None' in fonte
    assert 'atividade_id if scope in ("activity", "question", "material") else None' in fonte


def test_o_gravador_conhece_o_escopo_question():
    fonte = _fonte_do_gravador()
    assert '("question", time_metrics.get("questions"))' in fonte
    assert '"questao_id": resolved_questao_id' in fonte


# ----------------------------------------------------------------------
# O limiar de ocio e o que depende dele
# ----------------------------------------------------------------------


def test_o_cansaco_nao_depende_do_intervalo_de_flush():
    # A regra era `idle_sec >= 120` contra o ocio de UM lote, e
    # `buildTimeMetricsSnapshot` apara `idle_sec` pela duracao do lote. Com o
    # intervalo em 60s o absoluto virou inalcancavel -- na base, os unicos lotes
    # que ainda disparariam sao anteriores a mudanca de intervalo.
    from app.services.linear_analysis_pipeline import _ocio_dominou_o_lote

    # Lote de 60s com 40s de ocio: dispara, e disparava com o intervalo antigo
    # tambem.
    assert _ocio_dominou_o_lote(idle_sec=40, dwell_sec=60) is True
    # O mesmo lote sob a regra antiga NAO disparava -- e este e o ponto.
    assert 40 < 120

    # Lote curto demais nao julga: abrir a tela e sair nao e cansaco.
    assert _ocio_dominou_o_lote(idle_sec=30, dwell_sec=30) is False
    # Lote longo com pouco ocio tambem nao.
    assert _ocio_dominou_o_lote(idle_sec=10, dwell_sec=180) is False


def test_o_limiar_de_ocio_do_coletor_e_o_mesmo_do_pipeline():
    # 120s nao e um numero novo: o pipeline ja usava 120 como a fronteira do
    # "parado". Se alguem mexer num sem mexer no outro, `active_sec` e a
    # classificacao de emocao passam a falar de coisas diferentes.
    mobile = (
        API_ROOT.parent / "mobile" / "src" / "context" / "MetricasContext.tsx"
    ).read_text(encoding="utf-8")
    assert "const IDLE_THRESHOLD_MS = 120_000;" in mobile


def test_o_relogio_de_ocio_atravessa_o_flush():
    # `buildEmptyBatch` zerava `lastInteractionAtMs` para o instante do flush, o
    # que dava a cada lote um credito de tempo ativo que o aluno nao produziu --
    # e `active_sec` e o unico insumo de `trailup_tempo_telemetria_min`.
    mobile = (
        API_ROOT.parent / "mobile" / "src" / "context" / "MetricasContext.tsx"
    ).read_text(encoding="utf-8")
    assert "buildEmptyBatch(nowMs, batch.lastInteractionAtMs)" in mobile
    assert "buildEmptyBatch(now.getTime(), batchAnterior?.lastInteractionAtMs)" in mobile
