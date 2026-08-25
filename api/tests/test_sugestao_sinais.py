"""Ponte telemetria -> sinais por formato."""

from app.services.sugestao_sinais import (
    formato_do_material,
    indexar_progresso_por_conteudo,
    sinais_por_formato,
)


def _material(tipo, *, conteudo_id=1, active=60.0, dwell=None, bloco=1):
    return {
        "key": f"material:content:{conteudo_id}:{tipo}:{bloco}",
        "material_key": f"material:content:{conteudo_id}:{tipo}:{bloco}",
        "material_tipo": tipo,
        "conteudo_id": conteudo_id,
        "active_sec": active,
        "dwell_sec": dwell if dwell is not None else active,
    }


# --- resolução de formato --------------------------------------------------


def test_tipos_do_app_viram_formatos_canonicos():
    assert formato_do_material(material_tipo="texto") == "markdown"
    assert formato_do_material(material_tipo="apresentacao-slides") == "apresentacao"
    assert formato_do_material(material_tipo="documento") == "pdf"


def test_material_key_resolve_quando_o_tipo_nao_veio():
    # Lotes antigos não mandavam material_tipo.
    assert (
        formato_do_material(material_key="material:content:12:markdown:3") == "markdown"
    )


def test_tipo_que_nao_e_formato_sugerivel_fica_de_fora():
    # Mapear vídeo para "apresentacao" criaria evidência sobre um formato que o
    # aluno nunca abriu.
    assert formato_do_material(material_tipo="video") is None
    assert formato_do_material(material_tipo="embed") is None
    assert formato_do_material(material_tipo="") is None


def test_material_ignorado_nao_entra_nos_sinais():
    sinais = sinais_por_formato(
        materiais_telemetria=[_material("video"), _material("markdown", conteudo_id=2)]
    )

    assert list(sinais) == ["markdown"]


# --- tempo ----------------------------------------------------------------


def test_tempo_do_mesmo_formato_em_conteudos_diferentes_soma():
    sinais = sinais_por_formato(
        materiais_telemetria=[
            _material("markdown", conteudo_id=1, active=60),
            _material("markdown", conteudo_id=2, active=90),
        ]
    )

    assert sinais["markdown"]["active_sec"] == 150.0


def test_tempo_min_usa_dwell_nao_active():
    # O freio de abandono pergunta "quanto tempo ficou na tela sem avançar" —
    # descontar o tempo parado ali esconderia justamente o abandono.
    sinais = sinais_por_formato(
        materiais_telemetria=[_material("audio", active=60, dwell=600)]
    )

    assert sinais["audio"]["tempo_min"] == 10.0


def test_sem_tempo_na_tela_nao_inventa_tempo_min():
    sinais = sinais_por_formato(
        materiais_telemetria=[_material("audio", active=0, dwell=0)]
    )

    assert sinais["audio"]["tempo_min"] is None


# --- ritmo ----------------------------------------------------------------


def test_flag_de_ritmo_do_pipeline_chega_no_formato():
    sinais = sinais_por_formato(
        materiais_telemetria=[_material("markdown")],
        ritmo_por_material=[
            {"material_key": "material:content:1:markdown:1", "flag": "skimming"}
        ],
    )

    assert sinais["markdown"]["skimming"] is True
    assert sinais["markdown"]["leitura_lenta"] is False


def test_ritmo_adequado_nao_liga_nenhuma_flag():
    sinais = sinais_por_formato(
        materiais_telemetria=[_material("markdown")],
        ritmo_por_material=[
            {"material_key": "material:content:1:markdown:1", "flag": "ritmo_adequado"}
        ],
    )

    assert sinais["markdown"]["skimming"] is False
    assert sinais["markdown"]["leitura_lenta"] is False


def test_flag_dominante_e_a_de_mais_tempo_ativo():
    # Um material aberto por 3s e marcado como skimming não deveria apagar 5min
    # de leitura lenta no mesmo formato.
    sinais = sinais_por_formato(
        materiais_telemetria=[
            _material("markdown", conteudo_id=1, active=3, bloco=1),
            _material("markdown", conteudo_id=2, active=300, bloco=2),
        ],
        ritmo_por_material=[
            {"material_key": "material:content:1:markdown:1", "flag": "skimming"},
            {"material_key": "material:content:2:markdown:2", "flag": "leitura_lenta"},
        ],
    )

    assert sinais["markdown"]["leitura_lenta"] is True
    assert sinais["markdown"]["skimming"] is False


# --- atribuição de desempenho ---------------------------------------------


def test_conteudo_visto_em_um_formato_so_entrega_desempenho():
    sinais = sinais_por_formato(
        materiais_telemetria=[_material("markdown", conteudo_id=7)],
        progresso_por_conteudo={7: {"acertos": 90, "percentual": 100}},
    )

    assert sinais["markdown"]["acertos"] == 90.0
    assert sinais["markdown"]["percentual"] == 100.0


def test_conteudo_visto_em_dois_formatos_nao_credita_nenhum():
    # Não existe dado que diga qual dos dois produziu o acerto; espalhar o mesmo
    # número daria bônus de "desempenho alto" ao formato que só estava aberto.
    sinais = sinais_por_formato(
        materiais_telemetria=[
            _material("markdown", conteudo_id=7),
            _material("audio", conteudo_id=7),
        ],
        progresso_por_conteudo={7: {"acertos": 90, "percentual": 100}},
    )

    assert sinais["markdown"]["acertos"] is None
    assert sinais["audio"]["acertos"] is None


def test_desempenho_ambiguo_nao_apaga_o_comportamento():
    # Ritmo e tempo continuam sendo per-formato de verdade, e é com eles que a
    # revisão decide quando o desempenho não é atribuível.
    sinais = sinais_por_formato(
        materiais_telemetria=[
            _material("markdown", conteudo_id=7, active=30),
            _material("audio", conteudo_id=7, active=300),
        ],
        progresso_por_conteudo={7: {"acertos": 90}},
        ritmo_por_material=[
            {"material_key": "material:content:7:markdown:1", "flag": "skimming"}
        ],
    )

    assert sinais["markdown"]["skimming"] is True
    assert sinais["audio"]["active_sec"] == 300.0


def test_formato_com_conteudo_exclusivo_e_compartilhado_usa_so_o_exclusivo():
    sinais = sinais_por_formato(
        materiais_telemetria=[
            _material("markdown", conteudo_id=1),  # só markdown
            _material("markdown", conteudo_id=2),  # markdown + audio
            _material("audio", conteudo_id=2),
        ],
        progresso_por_conteudo={1: {"acertos": 40}, 2: {"acertos": 100}},
    )

    assert sinais["markdown"]["acertos"] == 40.0


def test_progresso_ausente_nao_vira_zero():
    # Zero seria lido como desempenho péssimo e derrubaria o formato.
    sinais = sinais_por_formato(
        materiais_telemetria=[_material("markdown", conteudo_id=7)],
        progresso_por_conteudo={},
    )

    assert sinais["markdown"]["acertos"] is None
    assert sinais["markdown"]["percentual"] is None


def test_material_sem_conteudo_id_nao_bloqueia_o_resto():
    sinais = sinais_por_formato(
        materiais_telemetria=[
            {"material_tipo": "cards", "active_sec": 50, "dwell_sec": 50},
            _material("markdown", conteudo_id=3),
        ],
        progresso_por_conteudo={3: {"acertos": 70}},
    )

    assert sinais["cards"]["active_sec"] == 50.0
    assert sinais["markdown"]["acertos"] == 70.0


# --- estabilidade ---------------------------------------------------------


def test_saida_sai_em_ordem_canonica():
    # O snapshot vai pro log; ordem instável faria dois ciclos idênticos
    # parecerem diferentes.
    sinais = sinais_por_formato(
        materiais_telemetria=[
            _material("cards", conteudo_id=1),
            _material("audio", conteudo_id=2),
            _material("markdown", conteudo_id=3),
        ]
    )

    assert list(sinais) == ["markdown", "audio", "cards"]


def test_lote_vazio_devolve_dicionario_vazio():
    assert sinais_por_formato() == {}


# --- indexação do progresso -----------------------------------------------


def test_indexa_progresso_por_conteudo_a_partir_do_item_key():
    indexado = indexar_progresso_por_conteudo(
        [{"item_key": "content:12", "acertos_percentual": 80, "percentual_concluido": 100}]
    )

    assert indexado == {12: {"acertos": 80.0, "percentual": 100.0}}


def test_item_que_nao_e_conteudo_fica_de_fora():
    # Atividade e questão não são material que a sugestão ordena.
    indexado = indexar_progresso_por_conteudo(
        [
            {"item_key": "atividade:3", "acertos_percentual": 10},
            {"item_key": "questao:9", "acertos_percentual": 20},
        ]
    )

    assert indexado == {}


def test_conteudo_repetido_mantem_o_registro_mais_recente():
    # A consulta vem ordenada por updated_at DESC, então o primeiro é o atual.
    indexado = indexar_progresso_por_conteudo(
        [
            {"item_key": "content:5", "acertos_percentual": 90},
            {"item_key": "content:5", "acertos_percentual": 10},
        ]
    )

    assert indexado[5]["acertos"] == 90.0


def test_item_key_malformado_nao_quebra():
    indexado = indexar_progresso_por_conteudo(
        [{"item_key": "content:abc"}, {"item_key": "content:"}, {"item_key": None}]
    )

    assert indexado == {}
