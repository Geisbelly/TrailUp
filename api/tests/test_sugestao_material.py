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
