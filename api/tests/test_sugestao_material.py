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
