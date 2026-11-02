"""Motor determinístico de sugestão de material por aluno."""

from app.services.sugestao_material import (
    FORMATOS_CANONICOS,
    sugerir_ordem_material,
)

TODOS = ["markdown", "audio", "apresentacao", "cards", "pdf"]


def _perfil(nome: str, afinidade: float = 100) -> list[dict]:
    return [{"perfil": nome, "afinidade": afinidade}]


def _ordem(resultado: dict) -> list[str]:
    return [item["formato"] for item in resultado["ordem"]]


def test_socializador_comeca_por_audio():
    # O áudio do Socializador é diálogo entre dois guardiões — é o formato dele.
    resultado = sugerir_ordem_material(perfis=_perfil("socializer"), formatos_disponiveis=TODOS)

    assert resultado["formato_inicial"] == "audio"


def test_estrategista_comeca_por_texto():
    resultado = sugerir_ordem_material(perfis=_perfil("mastermind"), formatos_disponiveis=TODOS)

    assert resultado["formato_inicial"] == "markdown"


def test_aventureiro_comeca_por_apresentacao():
    resultado = sugerir_ordem_material(perfis=_perfil("daredevil"), formatos_disponiveis=TODOS)

    assert resultado["formato_inicial"] == "apresentacao"


def test_realizador_e_conquistador_comecam_por_cards():
    for nome in ("achiever", "conqueror"):
        resultado = sugerir_ordem_material(perfis=_perfil(nome), formatos_disponiveis=TODOS)
        assert resultado["formato_inicial"] == "cards", nome


def test_cada_posicao_traz_o_motivo_que_a_sustenta():
    resultado = sugerir_ordem_material(perfis=_perfil("survivor"), formatos_disponiveis=TODOS)

    primeiro = resultado["ordem"][0]
    assert primeiro["formato"] == "markdown"
    assert any("passo a passo" in motivo for motivo in primeiro["motivos"])
    assert any("Sobrevivente" in motivo for motivo in primeiro["motivos"])


def test_so_sugere_formato_que_existe():
    # Sugerir áudio num tópico sem áudio mandaria o aluno num beco sem saída.
    resultado = sugerir_ordem_material(
        perfis=_perfil("socializer"), formatos_disponiveis=["markdown", "cards"]
    )

    assert _ordem(resultado) == ["markdown", "cards"]
    assert resultado["formato_inicial"] == "markdown"


def test_sem_formato_disponivel_nao_inventa_sugestao():
    resultado = sugerir_ordem_material(perfis=_perfil("seeker"), formatos_disponiveis=[])

    assert resultado == {"formato_inicial": None, "ordem": []}


def test_usa_o_vetor_inteiro_de_afinidades_nao_so_o_dominante():
    # Dominante Estrategista (texto) com forte Aventureiro (apresentação) tem
    # que ordenar diferente de um Estrategista puro.
    puro = sugerir_ordem_material(
        perfis=_perfil("mastermind", 80), formatos_disponiveis=TODOS
    )
    misto = sugerir_ordem_material(
        perfis=[
            {"perfil": "mastermind", "afinidade": 80},
            {"perfil": "daredevil", "afinidade": 75},
        ],
        formatos_disponiveis=TODOS,
    )

    assert _ordem(puro) != _ordem(misto)


def test_modo_imediato_sobe_cards_e_desce_texto_longo():
    sem_modo = sugerir_ordem_material(perfis=_perfil("mastermind"), formatos_disponiveis=TODOS)
    imediato = sugerir_ordem_material(
        perfis=_perfil("mastermind"), formatos_disponiveis=TODOS, modo_operacao="imediato"
    )

    def score(resultado, formato):
        return next(i["score"] for i in resultado["ordem"] if i["formato"] == formato)

    assert score(imediato, "cards") > score(sem_modo, "cards")
    assert score(imediato, "markdown") < score(sem_modo, "markdown")


def test_modo_analitico_registra_o_motivo():
    resultado = sugerir_ordem_material(
        perfis=_perfil("mastermind"), formatos_disponiveis=TODOS, modo_operacao="analitico"
    )

    markdown = next(i for i in resultado["ordem"] if i["formato"] == "markdown")
    assert any("analítico" in motivo for motivo in markdown["motivos"])


def test_modo_desconhecido_nao_quebra_nem_altera():
    padrao = sugerir_ordem_material(perfis=_perfil("seeker"), formatos_disponiveis=TODOS)
    esquisito = sugerir_ordem_material(
        perfis=_perfil("seeker"), formatos_disponiveis=TODOS, modo_operacao="modo-que-nao-existe"
    )

    assert _ordem(padrao) == _ordem(esquisito)


def test_e_reproduzivel_mesma_entrada_mesma_ordem():
    # Condição da métrica de efetividade: comparar versões só faz sentido se a
    # mesma entrada sempre produzir a mesma sugestão.
    entrada = dict(
        perfis=[
            {"perfil": "seeker", "afinidade": 60},
            {"perfil": "survivor", "afinidade": 60},
        ],
        formatos_disponiveis=TODOS,
        modo_operacao="exploratorio",
    )

    primeira = sugerir_ordem_material(**entrada)
    for _ in range(5):
        assert sugerir_ordem_material(**entrada) == primeira


def test_empate_desempata_pela_ordem_canonica():
    # Perfil sem preferência marcante entre dois formatos empatados: a ordem
    # canônica decide, não a ordem de iteração do dicionário.
    resultado = sugerir_ordem_material(perfis=[], formatos_disponiveis=TODOS)

    assert _ordem(resultado) == list(FORMATOS_CANONICOS)


def test_perfil_desconhecido_e_ignorado_sem_quebrar():
    resultado = sugerir_ordem_material(
        perfis=[{"perfil": "ninja", "afinidade": 90}], formatos_disponiveis=TODOS
    )

    assert resultado["formato_inicial"] is not None
    assert len(resultado["ordem"]) == len(TODOS)


def test_afinidade_invalida_ou_fora_da_faixa_nao_distorce():
    for afinidade in ("abc", None, -50, 5000):
        resultado = sugerir_ordem_material(
            perfis=[{"perfil": "mastermind", "afinidade": afinidade}],
            formatos_disponiveis=TODOS,
        )
        assert len(resultado["ordem"]) == len(TODOS), afinidade


def test_aceita_perfil_como_string_simples():
    resultado = sugerir_ordem_material(perfis=["socializer"], formatos_disponiveis=TODOS)

    assert resultado["formato_inicial"] == "audio"


def test_posicoes_sao_sequenciais_a_partir_de_um():
    resultado = sugerir_ordem_material(perfis=_perfil("seeker"), formatos_disponiveis=TODOS)

    assert [item["posicao"] for item in resultado["ordem"]] == [1, 2, 3, 4, 5]


def test_formato_desconhecido_na_lista_disponivel_e_ignorado():
    resultado = sugerir_ordem_material(
        perfis=_perfil("seeker"), formatos_disponiveis=["markdown", "hologram"]
    )

    assert _ordem(resultado) == ["markdown"]


# --- Revisão (fase 2) ------------------------------------------------------

from app.services.sugestao_material import (  # noqa: E402
    LIMIAR_MUDANCA_PADRAO,
    revisar_ordem_material,
)


def _ordem_base() -> list[dict]:
    """Ordem inicial de um Estrategista: texto na frente, áudio atrás."""
    return [
        {"formato": "markdown", "posicao": 1, "score": 1.0, "motivos": ["Estrategista: profundidade e estrutura"]},
        {"formato": "audio", "posicao": 2, "score": 0.3, "motivos": []},
    ]


def _sinal(**kwargs) -> dict:
    base = {
        "skimming": False,
        "leitura_lenta": False,
        "acertos": None,
        "percentual": None,
        "active_sec": 0.0,
        "tempo_min": None,
    }
    base.update(kwargs)
    return base


def test_sem_evidencia_suficiente_mantem_e_diz_por_que():
    decisao = revisar_ordem_material(
        ordem_atual=_ordem_base(),
        sinais_por_formato={"markdown": _sinal(skimming=True)},
    )

    assert decisao["acao"] == "mantida"
    assert "evidência insuficiente" in decisao["motivos"][0]
    # A decisão de NÃO mexer também é registrada: sem isso não se distingue um
    # motor estável de um motor que nunca rodou.
    assert decisao["evidencia"]["formatos_com_evidencia"] == 1


def test_skimming_no_texto_derruba_e_audio_assume():
    decisao = revisar_ordem_material(
        ordem_atual=_ordem_base(),
        sinais_por_formato={
            "markdown": _sinal(skimming=True, active_sec=40),
            "audio": _sinal(acertos=80, active_sec=300),
        },
    )

    assert decisao["acao"] == "revisada"
    assert [i["formato"] for i in decisao["ordem"]] == ["audio", "markdown"]
    assert any("passou os olhos" in m for m in decisao["motivos"])


def test_leitura_lenta_com_bom_desempenho_nao_e_penalizada():
    # O formato funciona, o aluno só leva mais tempo. Penalizar aqui empurraria
    # para baixo justamente o material que está dando resultado.
    decisao = revisar_ordem_material(
        ordem_atual=_ordem_base(),
        sinais_por_formato={
            "markdown": _sinal(leitura_lenta=True, acertos=85, active_sec=200),
            "audio": _sinal(acertos=50, active_sec=200),
        },
    )

    assert [i["formato"] for i in decisao["ordem"]] == ["markdown", "audio"]
    assert any("bom desempenho" in m for m in decisao["motivos"])


def test_leitura_lenta_com_desempenho_ruim_penaliza():
    lento_ruim = revisar_ordem_material(
        ordem_atual=_ordem_base(),
        sinais_por_formato={
            "markdown": _sinal(leitura_lenta=True, acertos=30, active_sec=200),
            "audio": _sinal(acertos=40, active_sec=200),
        },
    )

    markdown = next(i for i in lento_ruim["ordem"] if i["formato"] == "markdown")
    assert markdown["score"] < 1.0


def test_material_abandonado_desce():
    decisao = revisar_ordem_material(
        ordem_atual=_ordem_base(),
        sinais_por_formato={
            # Tempo gasto sem avançar é abandono, não dificuldade momentânea.
            "markdown": _sinal(percentual=10, tempo_min=8, active_sec=200),
            "audio": _sinal(percentual=90, acertos=80, active_sec=200),
        },
    )

    assert decisao["acao"] == "revisada"
    assert decisao["ordem"][0]["formato"] == "audio"
    assert any("abandonado" in m for m in decisao["motivos"])


def test_percentual_baixo_com_pouco_tempo_nao_conta_como_abandono():
    # Aluno abriu e saiu em 1 minuto: não deu tempo de ser abandono.
    decisao = revisar_ordem_material(
        ordem_atual=_ordem_base(),
        sinais_por_formato={
            "markdown": _sinal(percentual=10, tempo_min=1, active_sec=60),
            "audio": _sinal(percentual=20, tempo_min=1, active_sec=60),
        },
    )

    assert decisao["acao"] == "mantida"


def test_mudanca_abaixo_do_limiar_nao_vira_revisao():
    # Reordenar por diferença mínima faz o material "pular de lugar" sem motivo
    # perceptível e polui a métrica com revisões que não significam nada.
    quase_empate = [
        {"formato": "markdown", "posicao": 1, "score": 0.50, "motivos": []},
        {"formato": "audio", "posicao": 2, "score": 0.49, "motivos": []},
    ]

    # Penalidade pequena (leitura lenta sem desempenho = 0.25) inverte a ordem
    # nesse quase-empate, mas fica abaixo do limiar pedido.
    decisao = revisar_ordem_material(
        ordem_atual=quase_empate,
        sinais_por_formato={
            "markdown": _sinal(leitura_lenta=True, acertos=40, active_sec=100),
            "audio": _sinal(acertos=50, active_sec=100),
        },
        limiar_mudanca=0.4,
    )

    assert decisao["acao"] == "mantida"
    assert "abaixo do limiar" in decisao["motivos"][0]
    assert [i["formato"] for i in decisao["ordem"]] == ["markdown", "audio"]


def test_sinais_que_nao_mudam_a_ordem_registram_mantida():
    decisao = revisar_ordem_material(
        ordem_atual=_ordem_base(),
        sinais_por_formato={
            "markdown": _sinal(acertos=90, active_sec=300),
            "audio": _sinal(acertos=40, active_sec=100),
        },
    )

    assert decisao["acao"] == "mantida"
    assert decisao["evidencia"]["ordem_mudou"] is False


def test_motivos_da_revisao_somam_aos_originais():
    decisao = revisar_ordem_material(
        ordem_atual=_ordem_base(),
        sinais_por_formato={
            "markdown": _sinal(skimming=True, active_sec=40),
            "audio": _sinal(acertos=85, active_sec=300),
        },
    )

    markdown = next(i for i in decisao["ordem"] if i["formato"] == "markdown")
    # O log precisa mostrar por que o formato entrou E por que desceu depois.
    assert "Estrategista: profundidade e estrutura" in markdown["motivos"]
    assert any("passou os olhos" in m for m in markdown["motivos"])


def test_evidencia_e_snapshot_com_os_numeros_que_a_decisao_viu():
    sinais = {
        "markdown": _sinal(skimming=True, active_sec=40),
        "audio": _sinal(acertos=85, active_sec=300),
    }

    decisao = revisar_ordem_material(ordem_atual=_ordem_base(), sinais_por_formato=sinais)

    assert decisao["evidencia"]["sinais"] == sinais
    assert decisao["evidencia"]["limiar_mudanca"] == LIMIAR_MUDANCA_PADRAO
    assert "maior_delta" in decisao["evidencia"]


def test_formato_sem_sinal_mantem_o_score_original():
    ordem = _ordem_base() + [{"formato": "cards", "posicao": 3, "score": 0.5, "motivos": []}]

    decisao = revisar_ordem_material(
        ordem_atual=ordem,
        sinais_por_formato={
            "markdown": _sinal(skimming=True, active_sec=40),
            "audio": _sinal(acertos=85, active_sec=300),
        },
    )

    cards = next(i for i in decisao["ordem"] if i["formato"] == "cards")
    assert cards["score"] == 0.5


def test_sem_ordem_anterior_nao_inventa_revisao():
    decisao = revisar_ordem_material(ordem_atual=[], sinais_por_formato={})

    assert decisao["acao"] == "mantida"
    assert decisao["ordem"] == []
    assert "sem sugestão anterior" in decisao["motivos"][0]


def test_posicoes_sao_recalculadas_apos_revisar():
    decisao = revisar_ordem_material(
        ordem_atual=_ordem_base(),
        sinais_por_formato={
            "markdown": _sinal(skimming=True, active_sec=40),
            "audio": _sinal(acertos=85, active_sec=300),
        },
    )

    assert [i["posicao"] for i in decisao["ordem"]] == [1, 2]


def test_revisao_e_reproduzivel():
    entrada = dict(
        ordem_atual=_ordem_base(),
        sinais_por_formato={
            "markdown": _sinal(skimming=True, active_sec=40),
            "audio": _sinal(acertos=85, active_sec=300),
        },
    )

    primeira = revisar_ordem_material(**entrada)
    for _ in range(3):
        assert revisar_ordem_material(**entrada) == primeira


def test_grafia_britanica_do_socializador_nao_e_descartada():
    # A API grava "Socialiser" em vários pontos; sem o alias o perfil sairia do
    # vetor de afinidades em silêncio e o áudio perderia o peso que o define.
    britanica = sugerir_ordem_material(
        perfis=[{"perfil": "Socialiser", "afinidade": 100}],
        formatos_disponiveis=["markdown", "audio", "cards"],
    )
    americana = sugerir_ordem_material(
        perfis=[{"perfil": "Socializer", "afinidade": 100}],
        formatos_disponiveis=["markdown", "audio", "cards"],
    )

    assert britanica["formato_inicial"] == "audio"
    assert britanica["ordem"] == americana["ordem"]


# --- #66: evidência em cada item -------------------------------------------

from app.services.evidencias_pedagogicas import CATALOGO_VERSAO  # noqa: E402


def _regras(item: dict) -> list[str]:
    return [ev["regra"] for ev in item.get("evidencias") or []]


def test_peso_por_perfil_sai_como_hipotese_sem_evidencia():
    # A base de evidências não achou efeito de casar formato com perfil
    # (DAT-14, 35, 40): o motor pode usar, mas não pode apresentar como fato.
    resultado = sugerir_ordem_material(perfis=_perfil("socializer"), formatos_disponiveis=TODOS)

    primeiro = resultado["ordem"][0]
    ev = next(e for e in primeiro["evidencias"] if e["regra"] == "perfil_formato")
    assert ev["confianca"] == "hipotese"
    assert "DAT-14" in ev["fontes"]
    assert ev["dados"]["afinidades"] == {"socializer": 100}


def test_modo_de_operacao_vira_evidencia_so_onde_mexe():
    resultado = sugerir_ordem_material(
        perfis=_perfil("mastermind"), formatos_disponiveis=TODOS, modo_operacao="imediato"
    )

    por_formato = {item["formato"]: item for item in resultado["ordem"]}
    assert "modo_operacao" in _regras(por_formato["cards"])
    assert "modo_operacao" not in _regras(por_formato["apresentacao"])


def test_evidencia_do_aluno_traz_os_numeros_que_a_decisao_viu():
    ordem = [
        {"formato": "markdown", "posicao": 1, "score": 1.0, "motivos": [], "evidencias": []},
        {"formato": "audio", "posicao": 2, "score": 0.8, "motivos": [], "evidencias": []},
    ]
    decisao = revisar_ordem_material(
        ordem_atual=ordem,
        sinais_por_formato={
            "markdown": _sinal(skimming=True, active_sec=30, percentual=20, tempo_min=5),
            "audio": _sinal(acertos=90, active_sec=300),
        },
    )

    por_formato = {item["formato"]: item for item in decisao["ordem"]}
    ev_texto = next(
        e for e in por_formato["markdown"]["evidencias"] if e["regra"] == "engajamento_comportamental"
    )
    assert ev_texto["dados"]["skimming"] is True
    assert ev_texto["dados"]["active_sec"] == 30.0
    assert ev_texto["dados"]["percentual"] == 20.0
    ev_audio = next(
        e for e in por_formato["audio"]["evidencias"] if e["regra"] == "desempenho_do_aluno"
    )
    assert ev_audio["dados"] == {"acertos": 90.0}
    assert ev_audio["confianca"] == "dado_do_aluno"
    assert decisao["evidencia"]["catalogo_versao"] == CATALOGO_VERSAO


def test_leitura_lenta_com_bom_desempenho_e_motivo_mas_nao_evidencia():
    # Explica por que NÃO desceu; não moveu o score, então não é evidência.
    ordem = [
        {"formato": "markdown", "posicao": 1, "score": 1.0, "motivos": [], "evidencias": []},
        {"formato": "audio", "posicao": 2, "score": 0.8, "motivos": [], "evidencias": []},
    ]
    decisao = revisar_ordem_material(
        ordem_atual=ordem,
        sinais_por_formato={
            "markdown": _sinal(leitura_lenta=True, acertos=70, active_sec=100),
            "audio": _sinal(active_sec=100),
        },
    )

    texto = next(i for i in decisao["ordem"] if i["formato"] == "markdown")
    assert "engajamento_comportamental" not in _regras(texto)


def test_emocao_nao_reordena_material():
    # DAT-45: telemetria mede engajamento, não emoção; nenhuma regra liga
    # emoção a formato. Campo de emoção no sinal é ignorado.
    ordem = [
        {"formato": "markdown", "posicao": 1, "score": 1.0, "motivos": [], "evidencias": []},
        {"formato": "audio", "posicao": 2, "score": 0.8, "motivos": [], "evidencias": []},
    ]
    sinais = {"markdown": _sinal(active_sec=100), "audio": _sinal(active_sec=100)}
    com_emocao = {
        formato: {**sinal, "emocao": "frustrated", "estado_mental": "anxious"}
        for formato, sinal in sinais.items()
    }

    sem = revisar_ordem_material(ordem_atual=ordem, sinais_por_formato=sinais)
    com = revisar_ordem_material(ordem_atual=ordem, sinais_por_formato=com_emocao)

    assert [i["formato"] for i in com["ordem"]] == [i["formato"] for i in sem["ordem"]]
    assert com["acao"] == sem["acao"]


# --- reexposição (DAT-21) ---------------------------------------------------


def _ordem_estrategista():
    return sugerir_ordem_material(
        perfis=[{"perfil": "mastermind", "afinidade": 100}, {"perfil": "seeker", "afinidade": 90}],
        formatos_disponiveis=["markdown", "apresentacao", "cards"],
    )["ordem"]


def test_dificuldade_no_topico_leva_cards_ao_topo_mesmo_com_varios_perfis():
    decisao = revisar_ordem_material(
        ordem_atual=_ordem_estrategista(),
        sinais_por_formato={},
        desempenho_topico={"media_acertos": 35, "itens": 4},
    )

    assert decisao["acao"] == "revisada"
    assert decisao["ordem"][0]["formato"] == "cards"
    ev = next(e for e in decisao["ordem"][0]["evidencias"] if e["regra"] == "reexposicao_quiz")
    assert ev["confianca"] == "forte"
    assert "DAT-21" in ev["fontes"]
    assert ev["dados"] == {"media_acertos": 35.0, "itens": 4}


def test_reexposicao_nao_se_acumula_entre_revisoes():
    primeira = revisar_ordem_material(
        ordem_atual=_ordem_estrategista(),
        sinais_por_formato={},
        desempenho_topico={"media_acertos": 35, "itens": 4},
    )
    segunda = revisar_ordem_material(
        ordem_atual=primeira["ordem"],
        sinais_por_formato={},
        desempenho_topico={"media_acertos": 30, "itens": 5},
    )

    assert segunda["acao"] == "mantida"
    cards = next(i for i in segunda["ordem"] if i["formato"] == "cards")
    assert _regras(cards).count("reexposicao_quiz") == 1


def test_um_tropeco_nao_e_dificuldade():
    decisao = revisar_ordem_material(
        ordem_atual=_ordem_estrategista(),
        sinais_por_formato={},
        desempenho_topico={"media_acertos": 0, "itens": 1},
    )

    assert decisao["acao"] == "mantida"


def test_acerto_suficiente_nao_aciona_reexposicao():
    decisao = revisar_ordem_material(
        ordem_atual=_ordem_estrategista(),
        sinais_por_formato={},
        desempenho_topico={"media_acertos": 80, "itens": 5},
    )

    assert decisao["acao"] == "mantida"


def test_sem_cards_gerados_dificuldade_nao_inventa_formato():
    ordem = sugerir_ordem_material(
        perfis=_perfil("mastermind"), formatos_disponiveis=["markdown", "audio"]
    )["ordem"]
    decisao = revisar_ordem_material(
        ordem_atual=ordem,
        sinais_por_formato={},
        desempenho_topico={"media_acertos": 20, "itens": 3},
    )

    assert decisao["acao"] == "mantida"
    assert {i["formato"] for i in decisao["ordem"]} == {"markdown", "audio"}


# --- Perfil relativo, modo real e camadas (recomendação conteúdo × aluno) ----

from app.services.sugestao_material import (  # noqa: E402
    CAMADA_CONTEUDO,
    CAMADA_NECESSIDADE,
    CAMADA_PREFERENCIA,
    normalizar_modo,
)

# Vetor do quiz como ele sai em produção (01/11): quase plano.
_AVENTUREIRO_PLANO = [
    {"perfil": "daredevil", "afinidade": 18},
    {"perfil": "achiever", "afinidade": 16},
    {"perfil": "mastermind", "afinidade": 14},
    {"perfil": "survivor", "afinidade": 14},
    {"perfil": "seeker", "afinidade": 13},
    {"perfil": "socializer", "afinidade": 13},
    {"perfil": "conqueror", "afinidade": 12},
]
QUATRO = ["markdown", "audio", "apresentacao", "cards"]


def _demanda(**dimensoes) -> dict:
    return {
        "origem": "modelo",
        "versao": "t",
        "assinatura": "x",
        "dimensoes": {
            dimensao: {"nivel": nivel, "motivo": f"motivo {dimensao}", "conteudos": [7]}
            for dimensao, nivel in dimensoes.items()
        },
    }


def test_vetor_quase_plano_e_decidido_pelo_dominante():
    # Somando o vetor cru, os seis secundários abafavam o dominante: o
    # Aventureiro abria por texto. Pesando o que passa da fatia uniforme, abre
    # pela apresentação, que é o formato dele.
    resultado = sugerir_ordem_material(perfis=_AVENTUREIRO_PLANO, formatos_disponiveis=QUATRO)

    assert resultado["formato_inicial"] == "apresentacao"
    ev = next(e for e in resultado["ordem"][0]["evidencias"] if e["regra"] == "perfil_formato")
    assert ev["dados"]["pesos_relativos"]["daredevil"] == 1.0
    assert "conqueror" not in ev["dados"]["afinidades"]  # abaixo da fatia uniforme


def test_vetor_perfeitamente_plano_cai_na_ordem_canonica():
    # Os sete iguais: nenhum perfil passa da fatia uniforme. (Três perfis a 14 e
    # os outros quatro a zero NÃO é plano: os três se destacam.)
    plano = [{"perfil": item["perfil"], "afinidade": 14} for item in _AVENTUREIRO_PLANO]
    resultado = sugerir_ordem_material(perfis=plano, formatos_disponiveis=QUATRO)

    assert _ordem(resultado) == ["markdown", "audio", "apresentacao", "cards"]
    assert all(not item["evidencias"] for item in resultado["ordem"])


def test_modo_gravado_no_banco_e_reconhecido():
    assert normalizar_modo("Conteúdo Primeiro") == "conteudo_primeiro"
    assert normalizar_modo("Pergunta Primeiro") == "pratica_primeiro"
    assert normalizar_modo("Misto") == "misto"

    base = sugerir_ordem_material(perfis=_perfil("mastermind"), formatos_disponiveis=QUATRO)
    pergunta = sugerir_ordem_material(
        perfis=_perfil("mastermind"), formatos_disponiveis=QUATRO, modo_operacao="Pergunta Primeiro"
    )
    misto = sugerir_ordem_material(
        perfis=_perfil("mastermind"), formatos_disponiveis=QUATRO, modo_operacao="Misto"
    )

    def score(resultado, formato):
        return next(i["score"] for i in resultado["ordem"] if i["formato"] == formato)

    assert score(pergunta, "cards") > score(base, "cards")
    assert _ordem(misto) == _ordem(base)
    cards = next(i for i in pergunta["ordem"] if i["formato"] == "cards")
    assert "modo_operacao" in _regras(cards)


def test_formato_essencial_do_conteudo_passa_na_frente_da_preferencia():
    # Socializador prefere áudio, mas o conteúdo depende de diagrama.
    resultado = sugerir_ordem_material(
        perfis=_perfil("socializer"),
        formatos_disponiveis=QUATRO,
        demanda=_demanda(visual="essencial"),
    )

    assert _ordem(resultado)[0] == "apresentacao"
    primeiro = resultado["ordem"][0]
    assert primeiro["camada"] == CAMADA_CONTEUDO
    ev = next(e for e in primeiro["evidencias"] if e["regra"] == "demanda_do_conteudo")
    assert ev["dados"]["nivel"] == "essencial"
    assert ev["dados"]["conteudos"] == [7]
    assert primeiro["motivo_aluno"].startswith("Este conteúdo se entende melhor vendo")
    # Dentro da camada de preferência, o áudio do Socializador continua à frente.
    assert _ordem(resultado)[1] == "audio"


def test_conteudo_escrito_e_visual_abre_com_os_dois_juntos_na_ordem_do_aluno():
    estrategista = sugerir_ordem_material(
        perfis=_perfil("mastermind"),
        formatos_disponiveis=QUATRO,
        demanda=_demanda(visual="essencial", escrito="essencial"),
    )
    aventureiro = sugerir_ordem_material(
        perfis=_perfil("daredevil"),
        formatos_disponiveis=QUATRO,
        demanda=_demanda(visual="essencial", escrito="essencial"),
    )

    assert _ordem(estrategista)[:2] == ["markdown", "apresentacao"]
    assert _ordem(aventureiro)[:2] == ["apresentacao", "markdown"]


def test_conteudo_que_ajuda_pesa_sem_virar_camada():
    sem = sugerir_ordem_material(perfis=_perfil("mastermind"), formatos_disponiveis=QUATRO)
    com = sugerir_ordem_material(
        perfis=_perfil("mastermind"), formatos_disponiveis=QUATRO, demanda=_demanda(sonoro="ajuda")
    )
    audio_sem = next(i for i in sem["ordem"] if i["formato"] == "audio")
    audio_com = next(i for i in com["ordem"] if i["formato"] == "audio")

    assert audio_com["camada"] == CAMADA_PREFERENCIA
    assert audio_com["ajuste_conteudo"] > 0
    assert audio_com["posicao"] < audio_sem["posicao"]


def test_indiferente_ou_nivel_desconhecido_nao_mexe():
    base = sugerir_ordem_material(perfis=_perfil("seeker"), formatos_disponiveis=QUATRO)
    for nivel in ("indiferente", "talvez", None):
        resultado = sugerir_ordem_material(
            perfis=_perfil("seeker"), formatos_disponiveis=QUATRO, demanda=_demanda(visual=nivel)
        )
        assert _ordem(resultado) == _ordem(base), nivel


def test_essencial_nao_gerado_vira_necessidade_e_nao_inventa_formato():
    resultado = sugerir_ordem_material(
        perfis=_perfil("seeker"),
        formatos_disponiveis=["markdown", "audio"],
        demanda=_demanda(visual="essencial"),
    )

    assert set(_ordem(resultado)) == {"markdown", "audio"}
    faltando = [n for n in resultado["necessidades"] if n["id"] == "formato_essencial_faltando"]
    assert faltando == [
        {"id": "formato_essencial_faltando", "dimensao": "visual", "formatos": ["apresentacao"], "motivo": "motivo visual"}
    ]


def test_dificuldade_fica_acima_do_que_o_conteudo_pede():
    resultado = sugerir_ordem_material(
        perfis=_perfil("mastermind"),
        formatos_disponiveis=QUATRO,
        demanda=_demanda(visual="essencial"),
        desempenho_topico={"media_acertos": 30, "itens": 3},
    )

    assert _ordem(resultado)[:2] == ["cards", "apresentacao"]
    assert resultado["ordem"][0]["camada"] == CAMADA_NECESSIDADE
    assert resultado["ordem"][0]["motivo_aluno"].startswith("Você teve dificuldade")
    assert resultado["necessidades"][0]["id"] == "dificuldade_no_topico"


def test_demanda_que_chega_depois_revisa_mesmo_sem_telemetria():
    inicial = sugerir_ordem_material(perfis=_perfil("socializer"), formatos_disponiveis=QUATRO)
    decisao = revisar_ordem_material(
        ordem_atual=inicial["ordem"],
        sinais_por_formato={},
        demanda=_demanda(visual="essencial"),
    )

    assert decisao["acao"] == "revisada"
    assert decisao["ordem"][0]["formato"] == "apresentacao"
    assert any("apresentacao: o conteúdo pede ver" in m for m in decisao["motivos"])
    assert decisao["evidencia"]["demanda_do_conteudo"]["dimensoes"] == {"visual": "essencial"}


def test_mudar_de_camada_sem_mudar_a_ordem_tambem_e_revisao():
    # Cards já estavam em primeiro pelo perfil; a dificuldade muda o "por quê".
    inicial = sugerir_ordem_material(perfis=_perfil("achiever"), formatos_disponiveis=QUATRO)
    assert _ordem(inicial)[0] == "cards"

    decisao = revisar_ordem_material(
        ordem_atual=inicial["ordem"],
        sinais_por_formato={},
        desempenho_topico={"media_acertos": 20, "itens": 2},
    )

    assert decisao["acao"] == "revisada"
    assert decisao["evidencia"]["ordem_mudou"] is False
    assert decisao["ordem"][0]["motivo_aluno"].startswith("Você teve dificuldade")


def test_dificuldade_superada_devolve_os_cards_e_registra_por_que():
    com_dificuldade = revisar_ordem_material(
        ordem_atual=_ordem_estrategista(),
        sinais_por_formato={},
        desempenho_topico={"media_acertos": 35, "itens": 4},
    )
    superada = revisar_ordem_material(
        ordem_atual=com_dificuldade["ordem"],
        sinais_por_formato={},
        desempenho_topico={"media_acertos": 85, "itens": 6},
    )

    assert superada["acao"] == "revisada"
    assert superada["ordem"][0]["formato"] == "markdown"
    assert "cards: dificuldade superada, volta à ordem do aluno" in superada["motivos"]
    cards = next(i for i in superada["ordem"] if i["formato"] == "cards")
    assert "reexposicao_quiz" not in _regras(cards)


def test_conteudo_que_deixa_de_pedir_o_formato_e_registrado():
    com = sugerir_ordem_material(
        perfis=_perfil("socializer"), formatos_disponiveis=QUATRO, demanda=_demanda(visual="essencial")
    )
    sem = revisar_ordem_material(
        ordem_atual=com["ordem"], sinais_por_formato={}, demanda=_demanda(visual="indiferente")
    )

    assert sem["acao"] == "revisada"
    assert sem["ordem"][0]["formato"] == "audio"
    assert "apresentacao: o conteúdo deixou de pedir este formato" in sem["motivos"]


def test_observacao_de_estado_mental_fica_no_log_e_nao_reordena():
    ordem = sugerir_ordem_material(perfis=_perfil("mastermind"), formatos_disponiveis=QUATRO)["ordem"]
    decisao = revisar_ordem_material(
        ordem_atual=ordem,
        sinais_por_formato={},
        observacoes={"estado_negativo_recorrente": {"kind": "anxious", "ocorrencias": 3}},
    )

    assert decisao["acao"] == "mantida"
    assert [i["formato"] for i in decisao["ordem"]] == [i["formato"] for i in ordem]
    assert decisao["evidencia"]["observacoes"]["estado_negativo_recorrente"]["kind"] == "anxious"


def test_revisao_nao_muta_a_ordem_recebida():
    ordem = sugerir_ordem_material(perfis=_perfil("mastermind"), formatos_disponiveis=QUATRO)["ordem"]
    import copy

    original = copy.deepcopy(ordem)
    revisar_ordem_material(
        ordem_atual=ordem,
        sinais_por_formato={},
        desempenho_topico={"media_acertos": 10, "itens": 3},
        demanda=_demanda(visual="essencial"),
    )

    assert ordem == original


def test_sem_motivo_reconhecivel_motivo_aluno_e_nulo():
    resultado = sugerir_ordem_material(perfis=[], formatos_disponiveis=QUATRO)

    assert all(item["motivo_aluno"] is None for item in resultado["ordem"])
