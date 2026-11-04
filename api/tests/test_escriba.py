from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.api.deps import get_session, require_professor
from app.schemas.escriba import EscribaSaida, PerguntaEscriba, RespostaEscriba, SecaoSaida
from app.services.escriba import (
    DESTINOS_DO_CONSOLE,
    TUTORIAIS_DO_CONSOLE,
    EscribaIndisponivel,
    EscribaService,
    TurmaNaoPermitida,
    _linha,
    guia_do_produto,
    pergunta_de_produto,
)
from app.services.llm import StructuredOutputError
from tests.conftest import FakeSession

TURMAS = [{"id": 54, "descricao": "SPD - 3N"}, {"id": 56, "descricao": "Redes"}]


def _servico(monkeypatch, llm=None) -> tuple[EscribaService, AsyncMock]:
    llm = llm or AsyncMock()
    service = EscribaService(FakeSession(), llm)
    monkeypatch.setattr(service, "turmas_do_professor", AsyncMock(return_value=TURMAS))
    contexto = AsyncMock(side_effect=lambda turma, agora: {"turma": turma["descricao"], "alunos": []})
    monkeypatch.setattr(service, "contexto_da_turma", contexto)
    return service, contexto


# ---------------------------------------------------------------- serviço


@pytest.mark.asyncio
async def test_turma_de_outro_professor_e_recusada_antes_de_ler_qualquer_dado(monkeypatch) -> None:
    service, contexto = _servico(monkeypatch)

    with pytest.raises(TurmaNaoPermitida):
        await service.perguntar("prof-1", PerguntaEscriba(pergunta="Quem precisa de atenção?", classe_id=999))

    contexto.assert_not_awaited()
    service.llm.ainvoke_structured.assert_not_awaited()


@pytest.mark.asyncio
async def test_turma_propria_so_manda_ela_ao_modelo(monkeypatch) -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = EscribaSaida(resposta="  Ana precisa de atenção.  ")
    service, contexto = _servico(monkeypatch, llm)

    r = await service.perguntar(
        "prof-1",
        PerguntaEscriba(pergunta="Quem precisa de atenção?", classe_id=56, historico=[{"papel": "professor", "texto": "oi"}]),
    )

    assert r.resposta == "Ana precisa de atenção."
    assert r.turmas == [56]
    payload = llm.ainvoke_structured.await_args.kwargs["payload"]
    assert [t["turma"] for t in payload["turmas"]] == ["Redes"]
    assert payload["historico"] == [{"papel": "professor", "texto": "oi"}]
    assert llm.ainvoke_structured.await_args.kwargs["prompt_name"] == "escriba.txt"


@pytest.mark.asyncio
async def test_sem_turma_escolhida_le_so_as_turmas_do_professor(monkeypatch) -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = EscribaSaida(resposta="ok")
    service, _ = _servico(monkeypatch, llm)

    r = await service.perguntar("prof-1", PerguntaEscriba(pergunta="Como estão as turmas?"))

    assert r.turmas == [54, 56]
    service.turmas_do_professor.assert_awaited_once_with("prof-1")


@pytest.mark.asyncio
async def test_professor_sem_turma_nao_chama_o_modelo(monkeypatch) -> None:
    service, _ = _servico(monkeypatch)
    service.turmas_do_professor.return_value = []

    r = await service.perguntar("prof-1", PerguntaEscriba(pergunta="Oi"))

    assert r.turmas == []
    service.llm.ainvoke_structured.assert_not_awaited()


@pytest.mark.asyncio
async def test_modelo_fora_do_ar_nao_inventa_resposta(monkeypatch) -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.side_effect = StructuredOutputError("sem provedor")
    service, _ = _servico(monkeypatch, llm)

    with pytest.raises(EscribaIndisponivel):
        await service.perguntar("prof-1", PerguntaEscriba(pergunta="Oi", classe_id=54))


@pytest.mark.asyncio
async def test_turmas_do_professor_filtra_pelo_professor_autenticado() -> None:
    session = FakeSession()

    class Resultado:
        def mappings(self):
            return []

    async def executar(stmt, params=None):
        session.executed.append((stmt, params))
        return Resultado()

    session.execute = executar  # type: ignore[method-assign]
    await EscribaService(session, AsyncMock()).turmas_do_professor("prof-1")

    stmt, params = session.executed[0]
    assert "WHERE professor_id = CAST(:professor_id AS uuid)" in str(stmt)
    assert params == {"professor_id": "prof-1"}


# ---------------------------------------------------------------- endpoint


@pytest.fixture
def api_professor(app, professor_user):
    async def sessao_falsa():
        yield FakeSession()

    app.dependency_overrides[require_professor] = lambda: professor_user
    app.dependency_overrides[get_session] = sessao_falsa
    yield
    app.dependency_overrides.clear()


def test_endpoint_recusa_turma_de_outro_professor(client, api_professor, monkeypatch) -> None:
    monkeypatch.setattr(EscribaService, "turmas_do_professor", AsyncMock(return_value=TURMAS))
    llm = AsyncMock()
    monkeypatch.setattr("app.services.llm.JsonLLMService.ainvoke_structured", llm)

    resposta = client.post("/api/v1/escriba/perguntar", json={"pergunta": "Como está a turma?", "classe_id": 999})

    assert resposta.status_code == 403
    llm.assert_not_awaited()


def test_endpoint_responde_sobre_turma_propria(client, api_professor, monkeypatch) -> None:
    perguntar = AsyncMock(
        return_value=RespostaEscriba(resposta="Tudo certo.", turmas=[54], gerado_em=datetime(2026, 9, 29, tzinfo=UTC))
    )
    monkeypatch.setattr(EscribaService, "perguntar", perguntar)

    resposta = client.post("/api/v1/escriba/perguntar", json={"pergunta": "Como está a turma?", "classe_id": 54})

    assert resposta.status_code == 200
    assert resposta.json()["resposta"] == "Tudo certo."
    assert perguntar.await_args.args[0] == "prof-1"


def test_endpoint_modelo_indisponivel_vira_503(client, api_professor, monkeypatch) -> None:
    monkeypatch.setattr(EscribaService, "perguntar", AsyncMock(side_effect=EscribaIndisponivel("x")))

    resposta = client.post("/api/v1/escriba/perguntar", json={"pergunta": "Oi"})

    assert resposta.status_code == 503
    assert resposta.json()["detail"]["code"] == "escriba_indisponivel"


@pytest.mark.asyncio
@pytest.mark.idade_real
@pytest.mark.parametrize("classe_id", [54, None])
async def test_turma_com_aluno_sem_idade_confirmada_responde_ao_professor(monkeypatch, classe_id) -> None:
    # Medido na turma 68 (2 alunos, um sem data de nascimento): a rota de menor
    # (#195) barrava a Lumi. Decisão de 04/11/2026: a regra vale para o aluno
    # usar a IA, não para o professor. Aqui toda turma "teria" menor, e a
    # chamada tem de sair fora da rota de menor.
    from app.services import roteamento_ia

    async def _menor(session, aluno_ids):
        return roteamento_ia.ROTA_MENOR

    monkeypatch.setattr(roteamento_ia, "decidir_rota", _menor)
    rotas: list[bool] = []

    async def _modelo(**_kwargs):
        rotas.append(roteamento_ia.rota_de_menor_ativa())
        return EscribaSaida(resposta="A turma vai bem.")

    llm = AsyncMock()
    llm.ainvoke_structured.side_effect = _modelo
    service, _ = _servico(monkeypatch, llm)
    monkeypatch.setattr(
        service,
        "contexto_da_turma",
        AsyncMock(side_effect=lambda turma, agora: {"turma": turma["descricao"], "alunos": [{"ref": "A1"}], "_nomes_por_ref": {}}),
    )

    r = await service.perguntar("prof-1", PerguntaEscriba(pergunta="Quem precisa de atenção?", classe_id=classe_id))

    assert r.resposta == "A turma vai bem."
    assert rotas and not any(rotas)


def test_endpoint_valida_a_pergunta(client, api_professor) -> None:
    assert client.post("/api/v1/escriba/perguntar", json={"pergunta": ""}).status_code == 422
    assert client.post("/api/v1/escriba/perguntar", json={"pergunta": "x" * 501}).status_code == 422


def test_endpoint_exige_professor(client, app, aluno_user) -> None:
    from app.api.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: aluno_user
    try:
        assert client.post("/api/v1/escriba/perguntar", json={"pergunta": "Oi"}).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_nota_zero_das_views_vira_sem_dado() -> None:
    linha = _linha({"perfil_nome": "seeker", "media_nota": 0, "taxa_acertos_pct": "12.3188", "total_alunos_segmento": 1})
    assert linha == {"perfil_nome": "seeker", "media_nota": None, "taxa_acertos_pct": 12.3, "total_alunos_segmento": 1.0}
    assert _linha({"media_nota_turma": "7.25"})["media_nota_turma"] == 7.2


# ---------------------------------------------------------------- guia do produto


@pytest.mark.parametrize(
    ("pergunta", "produto"),
    [
        ("como usar a aba de economia?", True),
        ("Como faço para registrar presença?", True),
        ("onde fica a loja?", True),
        ("o que o aluno vê no app?", True),
        ("Como funciona a privacidade dos dados?", True),
        ("Quem precisa de atenção?", False),
        ("Onde a turma mais erra?", False),
        ("como está a Ana na economia?", False),
        ("o que o A3 precisa?", False),
        ("Qual a média de acertos?", False),
        ("Como funciona o ranking? A Ana Souza reclamou", False),
        ("Oi", False),
        ("Ana faltou, como registro presença?", False),
        ("Explique a aba Economia", True),
    ],
)
def test_pergunta_de_produto_e_conservadora(pergunta, produto) -> None:
    assert pergunta_de_produto(pergunta) is produto


@pytest.mark.asyncio
async def test_pergunta_de_produto_nao_le_turma_nem_manda_dado_de_aluno(monkeypatch) -> None:
    # O caso medido: "como usar a aba de economia?" na turma 68 (um aluno sem
    # data de nascimento). Não precisa de dado de aluno nenhum.
    from app.schemas.escriba import MensagemEscriba

    llm = AsyncMock()
    llm.ainvoke_structured.return_value = EscribaSaida(resposta="Em Economia > Valores...")
    service, contexto = _servico(monkeypatch, llm)

    r = await service.perguntar(
        "prof-1",
        PerguntaEscriba(
            pergunta="como usar a aba de economia?",
            classe_id=54,
            historico=[
                MensagemEscriba(papel="escriba", texto="Ana precisa de apoio no tópico 2."),
                MensagemEscriba(papel="professor", texto="e a loja, como funciona?"),
            ],
        ),
    )

    contexto.assert_not_awaited()
    payload = llm.ainvoke_structured.await_args.kwargs["payload"]
    assert payload["turmas"] == []
    assert "Economia" in payload["guia_do_produto"]
    assert [m["texto"] for m in payload["historico"]] == ["e a loja, como funciona?"]
    assert r.resposta.startswith("Em Economia") and r.turmas == []


@pytest.mark.asyncio
async def test_pergunta_de_produto_em_turma_alheia_continua_recusada(monkeypatch) -> None:
    service, contexto = _servico(monkeypatch)

    with pytest.raises(TurmaNaoPermitida):
        await service.perguntar("prof-1", PerguntaEscriba(pergunta="como usar a aba de economia?", classe_id=999))

    service.llm.ainvoke_structured.assert_not_awaited()


@pytest.mark.asyncio
async def test_pergunta_sobre_a_turma_tambem_leva_o_guia(monkeypatch) -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = EscribaSaida(resposta="ok")
    service, contexto = _servico(monkeypatch, llm)

    await service.perguntar("prof-1", PerguntaEscriba(pergunta="Quem precisa de atenção?", classe_id=54))

    contexto.assert_awaited_once()
    assert llm.ainvoke_structured.await_args.kwargs["payload"]["guia_do_produto"] == guia_do_produto()


def test_guia_cobre_toda_aba_de_turma_do_console() -> None:
    """Aba nova no console sem trecho no guia = Lumi que não sabe explicá-la."""
    import re
    from pathlib import Path

    fonte = (Path(__file__).resolve().parents[2] / "frontend/src/pages/consoleSections.ts").read_text(encoding="utf-8")
    so_do_dono = set(re.findall(r'"(\w+)"', fonte.split("VIEWS_SO_DO_DONO")[1].split(";")[0]))
    secoes = re.findall(r'\{ view: "(\w+)", slug: "([\w-]*)" \}', fonte)
    assert secoes, "formato de CONSOLE_SECTIONS mudou"
    guia = guia_do_produto()
    faltando = [view for view, slug in secoes if view not in so_do_dono and f"(/console{'/' + slug if slug else ''})" not in guia]
    assert faltando == []


# ---------------------------------------------------------------- destinos


@pytest.mark.asyncio
@pytest.mark.parametrize("pergunta", ["como usar a aba de economia?", "Quem precisa de atenção?"])
async def test_destinos_saem_filtrados_pela_lista_fechada(monkeypatch, pergunta) -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = EscribaSaida(
        resposta="Abra Economia > Valores.",
        destinos=["economia.valores", "ECONOMIA.VALORES", "/console/admin", "aprovacoes", "trilha", "notas", "eventos"],
    )
    service, _ = _servico(monkeypatch, llm)

    r = await service.perguntar("prof-1", PerguntaEscriba(pergunta=pergunta, classe_id=54))

    # Sem repetidos e sem o que não é do console (ou é só do dono).
    assert r.destinos == ["economia.valores", "trilha", "notas", "eventos"]


@pytest.mark.asyncio
async def test_sem_destinos_do_modelo_o_botao_sai_do_texto(monkeypatch) -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = EscribaSaida(
        resposta="Em Economia > Prazos e tempo ajuste os limites. Depois, em Turmas, confira as matrículas e veja as Notas e Metas."
    )
    service, _ = _servico(monkeypatch, llm)

    r = await service.perguntar("prof-1", PerguntaEscriba(pergunta="como usar a aba de economia?", classe_id=54))

    # "Notas" e "Metas" sem "em"/"aba"/"Economia >" são palavras da frase, não botões.
    assert r.destinos == ["economia.prazos", "classes"]


@pytest.mark.asyncio
async def test_secoes_saem_com_o_destino_de_cada_uma_e_a_resposta_fica_inteira(monkeypatch) -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = EscribaSaida(
        resposta="A economia tem três partes.",
        secoes=[
            SecaoSaida(titulo="Valores", texto="Ajuste pontos e moedas."),
            SecaoSaida(titulo="Vender itens", texto="Em Economia > Loja defina preços.", destino="/console/admin"),
            SecaoSaida(titulo="Fundo", texto="Meta coletiva.", destino="economia.fundo"),
            SecaoSaida(titulo="", texto="sem título some"),
            SecaoSaida(titulo="Próximo passo", texto="Revise antes de abrir as atividades."),
        ],
    )
    service, _ = _servico(monkeypatch, llm)

    r = await service.perguntar("prof-1", PerguntaEscriba(pergunta="como usar a aba de economia?", classe_id=54))

    assert r.introducao == "A economia tem três partes."
    assert [(s.titulo, s.destino) for s in r.secoes] == [
        ("Valores", "economia.valores"),
        ("Vender itens", "economia.loja"),
        ("Fundo", "economia.fundo"),
        ("Próximo passo", None),
    ]
    assert r.destinos == ["economia.valores", "economia.loja", "economia.fundo"]
    # Histórico e console antigo leem só `resposta`: nada das seções pode faltar nela.
    assert "Vender itens: Em Economia > Loja defina preços." in r.resposta


def test_ref_vira_nome_dentro_da_secao() -> None:
    from app.services.escriba import _montar_resposta

    saida = EscribaSaida(resposta="Dois alunos.", secoes=[SecaoSaida(titulo="A1 parado", texto="A1 está sem acessar.")])
    r = _montar_resposta(saida, [54], datetime.now(UTC), {"A1": "Ana"})

    assert r.secoes[0].titulo == "Ana parado"
    assert r.secoes[0].texto == "Ana está sem acessar."
    assert "A1" not in r.resposta


@pytest.mark.asyncio
@pytest.mark.parametrize(("do_modelo", "esperado"), [("criar_turma", "criar_turma"), (" CRIAR_TURMA ", "criar_turma"), ("hackear", None), ("", None)])
async def test_tutorial_sai_filtrado_pelo_catalogo(monkeypatch, do_modelo, esperado) -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = EscribaSaida(resposta="Vou te mostrar.", tutorial=do_modelo)
    service, _ = _servico(monkeypatch, llm)

    r = await service.perguntar("prof-1", PerguntaEscriba(pergunta="como criar uma turma?", classe_id=54))

    assert r.tutorial == esperado


def test_tutoriais_batem_com_o_catalogo_do_console() -> None:
    import re
    from pathlib import Path

    fonte = (Path(__file__).resolve().parents[2] / "frontend/src/components/console/escriba/tutoriais.ts").read_text(encoding="utf-8")
    assert set(re.findall(r'^\s*id: "(\w+)",$', fonte, re.MULTILINE)) == TUTORIAIS_DO_CONSOLE


def test_modelo_e_obrigado_a_preencher_as_chaves() -> None:
    # Chave fora de "required" o modelo pode omitir sem erro (#761).
    assert set(EscribaSaida.model_json_schema()["required"]) >= {"secoes", "destinos", "tutorial"}


def test_destinos_batem_com_as_abas_do_console() -> None:
    """A lista do Python é a do console: views de turma de CONSOLE_SECTIONS e as
    sub-abas de ABAS_DA_ECONOMIA (economiaRegras.ts). Aba nova sem destino = Lumi sem botão para ela."""
    import re
    from pathlib import Path

    raiz = Path(__file__).resolve().parents[2] / "frontend/src"
    secoes = (raiz / "pages/consoleSections.ts").read_text(encoding="utf-8")
    so_do_dono = set(re.findall(r'"(\w+)"', secoes.split("VIEWS_SO_DO_DONO")[1].split(";")[0]))
    views = {v for v in re.findall(r'\{ view: "(\w+)"', secoes) if v not in so_do_dono}
    economia = (raiz / "components/console/economia/economiaRegras.ts").read_text(encoding="utf-8")
    abas = set(re.findall(r'\{ id: "(\w+)", rotulo:', economia.split("const ABAS_DA_ECONOMIA")[1].split("];")[0]))
    assert views and abas
    assert DESTINOS_DO_CONSOLE == views | {f"economia.{a}" for a in abas}
