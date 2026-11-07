import asyncio

from app.agent.graph.guardrails import (
    GuardrailViolation,
    checar_evidencia_dominio,
    checar_grounding_chat,
    checar_ordem_sequencial,
    checar_topicos_existem,
    checar_vazamento_de_gabarito,
    gerar_validado,
)
from app.schemas.mentor_chat import MentorChatLLMResult
from app.schemas.trilha_config import TrilhaConfig
from app.services.llm import StructuredOutputError


def _topicos():
    return [
        {"id": 10, "ordem": 1},
        {"id": 11, "ordem": 2},
        {"id": 12, "ordem": 3},
    ]


def test_checar_ordem_sequencial_detecta_pulo_de_topico_incompleto() -> None:
    trilha = TrilhaConfig(classe_id=1, topico_foco=12, proximos_topicos=[], justificativa="x")
    contexto = {
        "topicos_classe": _topicos(),
        "progresso_trilha": {"10": {"percentual_concluido": 40}},
    }

    violacao = checar_ordem_sequencial(trilha, contexto)

    assert isinstance(violacao, GuardrailViolation)
    assert violacao.regra == "ordem_sequencial"


def test_checar_ordem_sequencial_aceita_avanco_com_anteriores_completos() -> None:
    trilha = TrilhaConfig(classe_id=1, topico_foco=12, proximos_topicos=[], justificativa="x")
    contexto = {
        "topicos_classe": _topicos(),
        "progresso_trilha": {
            "10": {"percentual_concluido": 100},
            "11": {"percentual_concluido": 100},
        },
    }

    assert checar_ordem_sequencial(trilha, contexto) is None


def test_checar_topicos_existem_detecta_id_inexistente() -> None:
    trilha = TrilhaConfig(classe_id=1, topico_foco=999, proximos_topicos=[10], justificativa="x")
    contexto = {"topicos_classe": _topicos()}

    violacao = checar_topicos_existem(trilha, contexto)

    assert isinstance(violacao, GuardrailViolation)
    assert violacao.regra == "topicos_existem"


def test_checar_topicos_existem_aceita_ids_validos() -> None:
    trilha = TrilhaConfig(classe_id=1, topico_foco=10, proximos_topicos=[11, 12], justificativa="x")
    contexto = {"topicos_classe": _topicos()}

    assert checar_topicos_existem(trilha, contexto) is None


def test_checar_evidencia_dominio_rejeita_avanco_sem_reforco_com_baixo_desempenho() -> None:
    trilha = TrilhaConfig(
        classe_id=1,
        topico_foco=10,
        proximos_topicos=[],
        ajustes=["avancar sem reforco"],
        justificativa="x",
    )
    contexto = {"desempenho_recente": {"media_acertos": 30}}

    violacao = checar_evidencia_dominio(trilha, contexto)

    assert isinstance(violacao, GuardrailViolation)
    assert violacao.regra == "evidencia_dominio"


def test_checar_evidencia_dominio_aceita_avanco_sem_reforco_com_bom_desempenho() -> None:
    trilha = TrilhaConfig(
        classe_id=1,
        topico_foco=10,
        proximos_topicos=[],
        ajustes=["avancar sem reforco"],
        justificativa="x",
    )
    contexto = {"desempenho_recente": {"media_acertos": 80}}

    assert checar_evidencia_dominio(trilha, contexto) is None


class _FakeLLM:
    def __init__(self, respostas: list[object]) -> None:
        self._respostas = list(respostas)
        self.chamadas: list[dict] = []

    async def ainvoke_structured(self, *, prompt_name, payload, schema, **kwargs):
        self.chamadas.append({"prompt_name": prompt_name, "payload": payload})
        proxima = self._respostas.pop(0)
        if isinstance(proxima, Exception):
            raise proxima
        return schema.model_validate(proxima)


def test_gerar_validado_retorna_de_primeira_quando_sem_violacao() -> None:
    llm = _FakeLLM([{"classe_id": 1, "topico_foco": 10, "justificativa": "ok"}])

    resultado = asyncio.run(
        gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={"classe_id": 1},
            schema=TrilhaConfig,
            guardrails=[],
            fallback_factory=lambda: {"classe_id": 1, "justificativa": "fallback"},
        )
    )

    assert resultado.topico_foco == 10
    assert len(llm.chamadas) == 1


def test_gerar_validado_faz_1_retry_com_correcao_quando_guardrail_viola() -> None:
    llm = _FakeLLM(
        [
            {"classe_id": 1, "topico_foco": 10, "justificativa": "primeira tentativa"},
            {"classe_id": 1, "topico_foco": 11, "justificativa": "corrigida"},
        ]
    )

    chamou = {"vezes": 0}

    def guardrail_falha_na_primeira(trilha, _contexto):
        chamou["vezes"] += 1
        if trilha.topico_foco == 10:
            return GuardrailViolation(regra="teste", mensagem="topico errado")
        return None

    resultado = asyncio.run(
        gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={"classe_id": 1},
            schema=TrilhaConfig,
            guardrails=[guardrail_falha_na_primeira],
            fallback_factory=lambda: {"classe_id": 1, "justificativa": "fallback"},
        )
    )

    assert resultado.topico_foco == 11
    assert len(llm.chamadas) == 2
    assert "teste" in llm.chamadas[1]["payload"]["correcao"]


def test_gerar_validado_cai_no_fallback_apos_2_tentativas_e_avisa_violacao() -> None:
    llm = _FakeLLM(
        [
            {"classe_id": 1, "topico_foco": 10, "justificativa": "1"},
            {"classe_id": 1, "topico_foco": 10, "justificativa": "2"},
        ]
    )

    def guardrail_sempre_viola(_trilha, _contexto):
        return GuardrailViolation(regra="teste", mensagem="sempre viola")

    violacoes_avisadas: list[tuple[GuardrailViolation, str]] = []

    async def on_violation(violacao, fase):
        violacoes_avisadas.append((violacao, fase))

    resultado = asyncio.run(
        gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={"classe_id": 1},
            schema=TrilhaConfig,
            guardrails=[guardrail_sempre_viola],
            fallback_factory=lambda: {"classe_id": 1, "justificativa": "fallback"},
            on_violation=on_violation,
        )
    )

    assert resultado.justificativa == "fallback"
    assert len(llm.chamadas) == 2
    assert len(violacoes_avisadas) == 2
    assert violacoes_avisadas[-1][1] == "fallback_final"


def test_gerar_validado_trata_structured_output_error_como_violacao_de_schema() -> None:
    llm = _FakeLLM(
        [
            StructuredOutputError("json invalido"),
            {"classe_id": 1, "topico_foco": 10, "justificativa": "corrigida"},
        ]
    )

    resultado = asyncio.run(
        gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={"classe_id": 1},
            schema=TrilhaConfig,
            guardrails=[],
            fallback_factory=lambda: {"classe_id": 1, "justificativa": "fallback"},
        )
    )

    assert resultado.topico_foco == 10
    assert "json invalido" in llm.chamadas[1]["payload"]["correcao"]


class _FakeJuizLLM:
    def __init__(self, resposta: dict) -> None:
        self._resposta = resposta
        self.chamadas = 0
        self.payloads: list[dict] = []

    async def ainvoke_structured(self, *, prompt_name, payload, schema, **kwargs):
        self.chamadas += 1
        self.payloads.append(payload)
        return schema.model_validate(self._resposta)


def test_checar_grounding_chat_inclui_contexto_personalizacao_como_evidencia() -> None:
    resposta = MentorChatLLMResult(reply="Seu perfil recebeu cards primeiro.", should_close=False, hinted_actions=[])
    contexto_personalizacao = {
        "perfil": "Survivor",
        "formato_prioritario": "cards",
        "formatos_disponiveis": ["cards", "markdown"],
    }
    juiz = _FakeJuizLLM({"viola": False, "motivo": ""})

    violacao = asyncio.run(
        checar_grounding_chat(
            resposta,
            {"llm": juiz, "conteudo_materia": {}, "contexto_personalizacao": contexto_personalizacao},
        )
    )

    assert violacao is None
    assert juiz.payloads[0]["contexto_personalizacao"] == contexto_personalizacao


def test_checar_grounding_chat_detecta_violacao_via_juiz() -> None:
    resposta = MentorChatLLMResult(reply="A resposta certa e 42.", should_close=False, hinted_actions=[])
    juiz = _FakeJuizLLM({"viola": True, "motivo": "entrega resposta pronta"})

    violacao = asyncio.run(
        checar_grounding_chat(resposta, {"llm": juiz, "conteudo_materia": {}})
    )

    assert violacao is not None
    assert violacao.regra == "grounding_chat"
    assert juiz.chamadas == 1


def test_checar_grounding_chat_aceita_resposta_que_guia_sem_entregar() -> None:
    resposta = MentorChatLLMResult(reply="Tente revisar o passo 2 do exemplo.", should_close=False, hinted_actions=[])
    juiz = _FakeJuizLLM({"viola": False, "motivo": ""})

    violacao = asyncio.run(
        checar_grounding_chat(resposta, {"llm": juiz, "conteudo_materia": {}})
    )

    assert violacao is None


def test_checar_grounding_chat_falha_fechada_quando_juiz_indisponivel() -> None:
    resposta = MentorChatLLMResult(reply="qualquer coisa", should_close=False, hinted_actions=[])

    class _JuizQuebrado:
        async def ainvoke_structured(self, **kwargs):
            raise StructuredOutputError("juiz fora do ar")

    violacao = asyncio.run(
        checar_grounding_chat(resposta, {"llm": _JuizQuebrado(), "conteudo_materia": {}})
    )

    assert violacao is not None
    assert violacao.regra == "grounding_indisponivel"
    assert violacao.definitiva is True


def test_checar_evidencia_dominio_usa_dominio_persistido_do_topico() -> None:
    trilha = TrilhaConfig(
        classe_id=1,
        topico_foco=10,
        proximos_topicos=[],
        ajustes=["avancar sem reforco"],
        justificativa="x",
    )
    # media_acertos geral da classe e baixa, mas o dominio PERSISTIDO desse
    # topico especifico e alto - deve prevalecer o dado mais preciso.
    contexto = {
        "desempenho_recente": {"media_acertos": 20},
        "dominio_por_topico": {"10": {"dominio_estimado": 0.9}},
    }

    assert checar_evidencia_dominio(trilha, contexto) is None


def test_checar_evidencia_dominio_rejeita_com_dominio_persistido_baixo() -> None:
    trilha = TrilhaConfig(
        classe_id=1,
        topico_foco=10,
        proximos_topicos=[],
        ajustes=["avancar sem reforco"],
        justificativa="x",
    )
    contexto = {
        "desempenho_recente": {"media_acertos": 90},
        "dominio_por_topico": {"10": {"dominio_estimado": 0.3}},
    }

    violacao = checar_evidencia_dominio(trilha, contexto)

    assert violacao is not None
    assert violacao.regra == "evidencia_dominio"


# --- Guardian: vazamento de gabarito (07/11) ----------------------------------------------------

_GABARITO = [
    {"origem": "card", "pergunta": "O que é o denominador?", "respostas": ["É o número de partes iguais em que o inteiro foi dividido."]},
    {"origem": "questao", "pergunta": "Quanto é metade de 1/2?", "respostas": ["1/4"]},
]


def test_vazamento_de_gabarito_barra_copia_do_verso_e_nao_repete_a_resposta_na_correcao() -> None:
    resposta = MentorChatLLMResult(
        reply="O denominador é o número de partes iguais em que o inteiro foi dividido.",
        should_close=False,
        hinted_actions=[],
    )
    violacao = checar_vazamento_de_gabarito(resposta, {"gabarito_protegido": _GABARITO})
    assert violacao is not None
    assert violacao.regra == "vazamento_gabarito"
    assert violacao.definitiva is False  # o modelo reescreve como dica
    assert "partes iguais" not in violacao.mensagem


def test_vazamento_de_gabarito_olha_tambem_as_secoes() -> None:
    resposta = MentorChatLLMResult.model_validate(
        {
            "reply": "Veja as partes.",
            "should_close": False,
            "hinted_actions": [],
            "secoes": [{"titulo": "Denominador", "texto": "É o número de partes iguais em que o inteiro foi dividido.", "destino": ""}],
        }
    )
    assert checar_vazamento_de_gabarito(resposta, {"gabarito_protegido": _GABARITO}) is not None


def test_vazamento_de_gabarito_deixa_passar_dica() -> None:
    resposta = MentorChatLLMResult(
        reply="Olhe a parte de baixo da fração: o que ela conta? Tente e me diga.", should_close=False, hinted_actions=[]
    )
    assert checar_vazamento_de_gabarito(resposta, {"gabarito_protegido": _GABARITO}) is None
    assert checar_vazamento_de_gabarito(resposta, {}) is None


def test_juiz_recebe_o_gabarito_protegido_antes_da_resposta() -> None:
    resposta = MentorChatLLMResult(reply="Tente dividir a pizza em 4.", should_close=False, hinted_actions=[])
    juiz = _FakeJuizLLM({"viola": False, "motivo": ""})
    asyncio.run(checar_grounding_chat(resposta, {"llm": juiz, "conteudo_materia": {}, "gabarito_protegido": _GABARITO}))
    payload = juiz.payloads[0]
    assert payload["gabarito_protegido"] == _GABARITO
    # A resposta fica por último: o cache do provedor só vale até a primeira diferença.
    assert list(payload)[-1] == "resposta"
