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


# ----------------------------------------------------------------------
# `20260920_02` -- search_path das duas funcoes de telemetria
# ----------------------------------------------------------------------

MIGRACAO_SP = "20260920_02_search_path_das_funcoes_de_telemetria.py"


def _stmts_sp(direcao: str = "upgrade") -> list[str]:
    module = _carregar(MIGRACAO_SP)
    executado: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executado.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return executado


def _sql_sp(direcao: str = "upgrade") -> str:
    return "\n".join(_stmts_sp(direcao))


def _so_codigo(sql: str) -> str:
    """O SQL sem comentarios e sem espaco -- e' a identidade que importa."""
    return re.sub(r"\s", "", re.sub(r"--[^\n]*", "", sql))


def test_cadeia_de_revisao_do_search_path():
    module = _carregar(MIGRACAO_SP)
    assert module.revision == "20260920_02"
    assert module.down_revision == "20260920_01"


def test_as_duas_funcoes_ganham_search_path_fixo():
    executavel = _sem_comentarios(_sql_sp())
    assert executavel.count("SET search_path TO 'public', 'pg_temp'") == 2
    assert "public.telemetria_id_do_item_key" in executavel
    assert "public.telemetria_resolver_entidade" in executavel


def test_o_downgrade_devolve_as_duas_sem_a_clausula():
    # `CREATE OR REPLACE` nao aceita "so tire esta clausula": o que nao for
    # redeclarado se perde, entao o downgrade tem de reescrever o corpo inteiro
    # sem o SET -- e com o MESMO corpo, senao ele desfaz mais do que deveria.
    volta = _stmts_sp("downgrade")
    ida = _stmts_sp("upgrade")

    assert "SET search_path" not in _sem_comentarios("\n".join(volta))

    sem_clausula = lambda sql: _so_codigo(sql).replace(  # noqa: E731
        "SETsearch_pathTO'public','pg_temp'", ""
    )
    # As duas primeiras sentencas sao as funcoes, nas duas direcoes; a terceira
    # da ida e a guarda do gatilho, que nao tem par na volta.
    assert [sem_clausula(s) for s in volta[:2]] == [sem_clausula(s) for s in ida[:2]]
    assert len(volta) == 2


def test_o_corpo_e_o_mesmo_da_20260920_01():
    # A armadilha que a `20260912_01` documentou: `CREATE OR REPLACE` sobre
    # funcao que cresceu por emenda apaga regra em silencio. Esta migracao SO
    # pode mudar o `search_path`; se o corpo divergir do da `20260920_01`,
    # alguma regra da resolucao de entidade foi junto.
    corpo_novo = _so_codigo(_sql_sp())
    corpo_anterior = _so_codigo(_sql())

    for marco in (
        "NEW.scope='question'",
        "NEW.scope<>'topic'",
        "NEW.scopeIN('activity','question','material')",
        "'question:'||NEW.questao_id::text",
        "FROMquestoesqWHEREq.id=NEW.questao_id",
        "FROMatividadesaWHEREa.id=NEW.atividade_id",
        "ELSE'row:'||gen_random_uuid()::text",
    ):
        assert marco in corpo_anterior, f"marco sumiu da 20260920_01: {marco}"
        assert marco in corpo_novo, f"a 20260920_02 perdeu: {marco}"


def test_o_upgrade_confere_que_o_gatilho_sobreviveu():
    # Sem o gatilho, `entry_key` fica NULO e a chave unica
    # `(lote_id, scope, entry_key)` deixa de deduplicar -- em silencio.
    executavel = _sem_comentarios(_sql_sp())
    assert "trg_telemetria_resolver_entidade" in executavel
    assert "RAISE EXCEPTION" in executavel


def test_search_path_nao_quebra_gen_random_uuid():
    # `gen_random_uuid()` existe em `pg_catalog` (nucleo, PG13+) E em
    # `extensions` (pgcrypto) nesta base. Fixar o caminho em `public, pg_temp`
    # tira `extensions` da busca, e a funcao continua resolvendo porque
    # `pg_catalog` e pesquisado implicitamente antes de tudo. O corpo nao pode
    # passar a qualifica-la como `extensions.`, que e o "conserto" errado.
    executavel = _sem_comentarios(_sql_sp())
    assert "gen_random_uuid()" in executavel
    assert "extensions.gen_random_uuid" not in executavel


def test_nenhum_literal_vira_bind_parameter_no_search_path():
    for direcao in ("upgrade", "downgrade"):
        suspeitos = re.findall(r"(?<!:):[A-Za-z_]\w*", _sql_sp(direcao))
        assert suspeitos == [], f"{direcao}: {suspeitos}"


# ----------------------------------------------------------------------
# `20260920_03` -- as 26 restantes
# ----------------------------------------------------------------------

MIGRACAO_26 = "20260920_03_search_path_das_26_restantes.py"


def _stmts_26(direcao: str = "upgrade") -> list[str]:
    module = _carregar(MIGRACAO_26)
    executado: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executado.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return executado


def test_cadeia_de_revisao_das_26():
    module = _carregar(MIGRACAO_26)
    assert module.revision == "20260920_03"
    assert module.down_revision == "20260920_02"


def test_usa_alter_function_e_nunca_create_or_replace():
    # O PONTO da migracao. `CREATE OR REPLACE` exige reescrever o corpo inteiro
    # para acrescentar uma clausula, e e' assim que regra some em silencio
    # (`20260912_01`). `ALTER FUNCTION ... SET` nao toca no corpo: medido numa
    # transacao revertida sobre as 26, `prosrc`, `proacl`, `prosecdef` e
    # `provolatile` ficaram identicos nas 26.
    for direcao in ("upgrade", "downgrade"):
        sql = "\n".join(_stmts_26(direcao))
        assert "CREATE OR REPLACE" not in sql.upper()
        assert "ALTER FUNCTION" in sql.upper()


def test_toda_funcao_vem_com_assinatura_completa():
    # Nome cru quebraria no dia em que alguem criar uma sobrecarga, e
    # `ALTER FUNCTION` precisa da assinatura para desambiguar.
    module = _carregar(MIGRACAO_26)
    assert len(module._FUNCOES) == 26
    for assinatura in module._FUNCOES:
        assert assinatura.endswith(")"), assinatura
        assert "(" in assinatura, assinatura


def test_o_upgrade_recusa_deixar_qualquer_funcao_para_tras():
    # A guarda nao confere "as 26 que eu listei", e sim NENHUMA sobrando -- se
    # aparecer funcao nova sem a clausula entre a escrita e a aplicacao, e' aqui
    # que aparece.
    sql = _sem_comentarios("\n".join(_stmts_26()))
    assert "proconfig IS NULL" in sql
    assert "RAISE EXCEPTION" in sql
    assert "search_path mutavel" in sql


def test_sem_if_exists_no_alter():
    # Funcao que sumiu da base significa lista envelhecida. Seguir em silencio
    # devolveria o caminho mutavel sem ninguem perceber; falhar e' barato,
    # porque a migracao e' uma transacao.
    sql = "\n".join(_stmts_26())
    assert "IF EXISTS" not in sql.upper()


def test_o_downgrade_devolve_o_caminho_mutavel():
    volta = _stmts_26("downgrade")
    assert len(volta) == 26
    assert all("RESET search_path" in s for s in volta)


def test_nenhum_literal_vira_bind_parameter_nas_26():
    for direcao in ("upgrade", "downgrade"):
        suspeitos = re.findall(r"(?<!:):[A-Za-z_]\w*", "\n".join(_stmts_26(direcao)))
        assert suspeitos == [], f"{direcao}: {suspeitos}"


# ----------------------------------------------------------------------
# `20260920_04` -- o `anon` sai das SECURITY DEFINER
# ----------------------------------------------------------------------

MIGRACAO_ANON = "20260920_04_anon_sai_das_security_definer.py"


def _stmts_anon(direcao: str = "upgrade") -> list[str]:
    module = _carregar(MIGRACAO_ANON)
    executado: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executado.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return executado


def test_cadeia_de_revisao_do_anon():
    module = _carregar(MIGRACAO_ANON)
    assert module.revision == "20260920_04"
    assert module.down_revision == "20260920_03"


def test_revoga_de_PUBLIC_e_de_anon_juntos():
    # O `anon` tinha o privilegio por DOIS caminhos: grant explicito (`anon=X`)
    # e `PUBLIC` (`=X`) no mesmo `proacl`. Revogar so de um deixa a funcao
    # aberta do mesmo jeito. Forma da `20260826_09`.
    sql = _sem_comentarios("\n".join(_stmts_anon()))
    assert "FROM PUBLIC, anon" in sql


def test_reafirma_authenticated_e_nao_toca_service_role():
    # `service_role` tem grant proprio no `proacl` e nao e alcancado por
    # `REVOKE ... FROM PUBLIC, anon` -- por isso a migracao nao precisa (nem
    # deve) mexer nele. A API, o microservice e o BrainHexPDF dependem disso.
    sql = _sem_comentarios("\n".join(_stmts_anon()))
    assert "GRANT EXECUTE ON FUNCTION %s TO authenticated" in sql
    assert "service_role" not in sql


def test_a_unica_excecao_e_a_chamada_pre_login():
    # Varrendo o monorepo sao 13 RPCs chamadas, e so `fn_auth_email_exists`
    # roda antes de existir sessao (telas de cadastro). Toda outra excecao
    # aberta aqui reabre superficie sem chamador que a justifique.
    module = _carregar(MIGRACAO_ANON)
    assert module._EXCECOES_PRE_LOGIN == ("fn_auth_email_exists",)


def test_o_alvo_e_por_propriedade_e_nao_lista_fixa():
    # O conjunto e "SECURITY DEFINER que `anon` alcanca", nao uma lista de
    # nomes: o `CLAUDE.md` registra que funcao nova NASCE executavel por `anon`,
    # entao lista fixa envelhece na proxima funcao criada.
    sql = _sem_comentarios("\n".join(_stmts_anon()))
    assert "p.prosecdef" in sql
    assert "has_function_privilege('anon'" in sql


def test_gatilho_e_event_trigger_tambem_entram():
    # Oito retornam `trigger` e o Postgres recusa a chamada direta. Mas
    # `rls_auto_enable` retorna `event_trigger` e EXECUTA quando chamada direto
    # por anon (vira no-op) -- presumir que caia na mesma regra estava errado.
    # Revogar nao desliga disparo: gatilho nao consulta EXECUTE.
    sql = _sem_comentarios("\n".join(_stmts_anon()))
    assert "NOT IN ('trigger', 'event_trigger')" not in sql


def test_o_upgrade_recusa_deixar_qualquer_uma_para_tras():
    sql = _sem_comentarios("\n".join(_stmts_anon()))
    assert "RAISE EXCEPTION" in sql
    assert "ainda alcancavel por anon" in sql


def test_o_downgrade_nao_reabre_as_de_gatilho():
    # Assimetria deliberada: o upgrade revoga de 73, a volta devolve 64.
    # Devolver `anon` a funcao de gatilho nao restaura comportamento nenhum.
    volta = _sem_comentarios("\n".join(_stmts_anon("downgrade")))
    assert "NOT IN ('trigger', 'event_trigger')" in volta
    # E nao devolve para as internas de `service_role` (motor de notificacoes),
    # que nunca tiveram `anon` nem `authenticated`.
    assert "has_function_privilege('authenticated'" in volta


def test_nenhum_literal_vira_bind_parameter_no_anon():
    for direcao in ("upgrade", "downgrade"):
        suspeitos = re.findall(r"(?<!:):[A-Za-z_]\w*", "\n".join(_stmts_anon(direcao)))
        assert suspeitos == [], f"{direcao}: {suspeitos}"
