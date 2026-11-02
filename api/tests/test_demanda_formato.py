"""O formato que cada conteúdo pede (`app/services/demanda_formato.py`).

O que estes testes protegem:

1. **A regra fixa é conservadora.** Só sinal estrutural (anexo, tabela, código, fórmula) vira
   ``essencial``; palavra solta no texto dá no máximo ``ajuda``. Texto corrido não pede nada.
2. **Nível inventado pelo modelo nunca vira camada.** Vira ``indiferente``.
3. **Hash igual com análise do modelo não chama o modelo**; análise da regra fixa não conta
   como atual, para o modelo ser tentado de novo depois da pausa.
4. **Falha do modelo nunca levanta**: cai na regra fixa, e não apaga análise antiga do modelo.
5. **O modelo não escolhe onde gravar**, e a análise do professor nunca é sobrescrita.
6. **O agregado do tópico é o que o motor lê**: o conteúdo que depende de diagrama põe a
   apresentação antes da preferência do aluno.
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import demanda_formato, personalizacao_jobs
from app.services.demanda_formato import (
    DEMANDA_FORMATO_VERSION,
    DIMENSOES,
    DemandaDoConteudo,
    DemandaDoTopico,
    DimensaoAvaliada,
    agregar_do_topico,
    analisar_demanda_do_topico,
    demanda_heuristica,
    hash_do_topico,
    limpar_demanda,
    montar_payload,
)
from app.services.sugestao_material import NIVEIS_DEMANDA, sugerir_ordem_material

API_ROOT = Path(__file__).resolve().parents[1]
TOPICO = {"id": 7, "nome": "Geometria plana", "descricao": "Figuras e áreas", "classe_id": 68}
CONTEUDOS = [
    {"id": 10, "titulo": "Triângulos", "tipo": "texto", "conteudo": "Soma dos ângulos internos.", "metadata": None},
    {"id": 11, "titulo": "Área", "tipo": "texto", "conteudo": "Base vezes altura.", "metadata": None},
]


def _niveis(demanda: dict) -> dict[str, str]:
    return {dim: valor["nivel"] for dim, valor in demanda.items()}


def _item(conteudo_id: int, **niveis: str) -> DemandaDoConteudo:
    campos = {dim: DimensaoAvaliada(nivel=niveis.get(dim, "indiferente"), motivo=f"motivo {dim}") for dim in DIMENSOES}
    return DemandaDoConteudo(conteudo_id=conteudo_id, **campos)


# ---------------------------------------------------------------- regra fixa


def test_texto_corrido_nao_pede_formato_nenhum() -> None:
    demanda = demanda_heuristica({"conteudo": "A Revolução Francesa começou em 1789 com a crise fiscal."})
    assert set(_niveis(demanda).values()) == {"indiferente"}


@pytest.mark.parametrize(
    ("conteudo", "dimensao"),
    [
        ({"conteudo": "Veja a figura.", "metadata": {"files": [{"name": "Celula.PNG"}]}}, "visual"),
        ({"conteudo": "", "metadata": {"files": [{"name": "aula.pptx"}]}}, "visual"),
        ({"conteudo": "| Camada | Espessura |\n|---|---|\n| Crosta | 35 km |"}, "visual"),
        ({"conteudo": "```python\nprint('oi')\n```"}, "escrito"),
        ({"conteudo": "A área é $A = b \\times h$."}, "escrito"),
        ({"conteudo": "Velocidade: v = 20 m/s."}, "escrito"),
        ({"conteudo": "", "metadata": {"files": [{"name": "listening.mp3"}]}}, "sonoro"),
    ],
)
def test_sinal_estrutural_marca_essencial(conteudo: dict, dimensao: str) -> None:
    assert demanda_heuristica(conteudo)[dimensao]["nivel"] == "essencial"


def test_texto_da_fonte_do_arquivo_entra_na_regra() -> None:
    conteudo = {"conteudo": None, "tipo": "arquivo", "textos_fonte": ["| a | b |\n|---|---|\n| 1 | 2 |"]}
    assert demanda_heuristica(conteudo)["visual"]["nivel"] == "essencial"


def test_palavra_solta_no_texto_so_ajuda() -> None:
    demanda = demanda_heuristica(
        {"conteudo": "Observe o gráfico e o diagrama. Pratique a pronúncia e resolva os exercícios."}
    )
    assert _niveis(demanda) == {"visual": "ajuda", "escrito": "indiferente", "sonoro": "ajuda", "pratica": "ajuda"}
    assert all(demanda[d]["motivo"] for d in ("visual", "sonoro", "pratica"))


def test_uma_palavra_visual_so_nao_basta() -> None:
    assert demanda_heuristica({"conteudo": "O gráfico da economia caiu."})["visual"]["nivel"] == "indiferente"


# ---------------------------------------------------------------- modelo


def test_schema_enviado_ao_modelo_restringe_o_nivel() -> None:
    schema = DemandaDoTopico.model_json_schema()
    assert schema["$defs"]["DimensaoAvaliada"]["properties"]["nivel"]["enum"] == list(NIVEIS_DEMANDA)
    assert set(schema["$defs"]["DemandaDoConteudo"]["required"]) == {"conteudo_id", *DIMENSOES}


def test_nivel_inventado_vira_indiferente_sem_motivo() -> None:
    item = _item(10, visual="crucial", escrito="ESSENCIAL ")
    demanda = limpar_demanda(item)
    assert demanda["visual"] == {"nivel": "indiferente", "motivo": ""}
    assert demanda["escrito"]["nivel"] == "essencial"
    assert demanda["sonoro"] == {"nivel": "indiferente", "motivo": ""}


def test_payload_nao_leva_nada_do_aluno() -> None:
    payload = montar_payload(topico=TOPICO, conteudos=CONTEUDOS)
    assert set(payload) == {"topico", "dimensoes", "niveis", "conteudos"}
    assert [c["conteudo_id"] for c in payload["conteudos"]] == [10, 11]
    assert "aluno" not in str(payload).lower()


def test_prompt_cita_as_dimensoes_e_os_niveis() -> None:
    prompt = (API_ROOT / "app" / "agent" / "prompts" / "demanda_formato.txt").read_text(encoding="utf-8")
    for termo in (*DIMENSOES, *NIVEIS_DEMANDA, "conteudo_id", "motivo"):
        assert f'"{termo}"' in prompt, termo


def test_hash_muda_com_texto_arquivo_e_versao(monkeypatch) -> None:
    base = hash_do_topico(topico=TOPICO, conteudos=CONTEUDOS)
    outro_texto = [dict(CONTEUDOS[0], conteudo="Outro texto."), CONTEUDOS[1]]
    com_arquivo = [dict(CONTEUDOS[0], metadata={"files": [{"name": "fig.png"}]}), CONTEUDOS[1]]
    com_fonte = [dict(CONTEUDOS[0], textos_fonte=["texto do pdf"]), CONTEUDOS[1]]
    hashes = {base}
    for conteudos in (outro_texto, com_arquivo, com_fonte):
        hashes.add(hash_do_topico(topico=TOPICO, conteudos=conteudos))
    monkeypatch.setattr(demanda_formato, "DEMANDA_FORMATO_VERSION", "outra")
    hashes.add(hash_do_topico(topico=TOPICO, conteudos=CONTEUDOS))
    assert len(hashes) == 5


# ---------------------------------------------------------------- agregado


def _linha(conteudo_id: int, origem: str = "modelo", **niveis: str) -> dict:
    return {
        "conteudo_id": conteudo_id,
        "origem": origem,
        "source_hash": "h",
        "versao": DEMANDA_FORMATO_VERSION,
        "demanda": {d: {"nivel": niveis.get(d, "indiferente"), "motivo": f"{d} de {conteudo_id}"} for d in DIMENSOES},
    }


def test_agregado_usa_o_nivel_mais_forte_do_topico() -> None:
    agregado = agregar_do_topico(
        [_linha(11, visual="ajuda", pratica="ajuda"), _linha(10, visual="essencial", pratica="ajuda")]
    )
    visual = agregado["dimensoes"]["visual"]
    assert visual == {"nivel": "essencial", "motivo": "visual de 10", "conteudos": [10]}
    assert agregado["dimensoes"]["pratica"]["conteudos"] == [10, 11]
    assert agregado["dimensoes"]["sonoro"] == {"nivel": "indiferente", "motivo": "", "conteudos": []}
    assert agregado["origem"] == "modelo" and agregado["versao"] == DEMANDA_FORMATO_VERSION


def test_agregado_marca_origem_mista_e_muda_a_assinatura() -> None:
    a = agregar_do_topico([_linha(10, visual="essencial"), _linha(11, origem="heuristica")])
    b = agregar_do_topico([_linha(10, visual="ajuda"), _linha(11, origem="heuristica")])
    assert a["origem"] == "misto"
    assert a["assinatura"] != b["assinatura"]
    assert agregar_do_topico([]) is None


def test_agregado_e_o_que_o_motor_le() -> None:
    # Aluno com perfil que abre por texto; o tópico depende de diagrama.
    agregado = agregar_do_topico([_linha(10, visual="essencial")])
    sugestao = sugerir_ordem_material(
        perfis=[{"perfil": "Mastermind", "afinidade": 90}],
        formatos_disponiveis=["markdown", "apresentacao", "audio"],
        demanda=agregado,
    )
    assert sugestao["formato_inicial"] == "apresentacao"


# ---------------------------------------------------------------- orquestração


class _Sessao:
    def __init__(self) -> None:
        self.rollback = AsyncMock()
        self.commit = AsyncMock()


@pytest.fixture
def banco(monkeypatch):
    estado = SimpleNamespace(gravadas={}, gravados={}, tabela=True, conteudos=list(CONTEUDOS), fontes={})

    async def _tabela_existe(_session):
        return estado.tabela

    async def _topico(_session, topico_id):
        return dict(TOPICO) if topico_id == TOPICO["id"] else None

    async def _textos(_session, ids):
        return {k: v for k, v in estado.fontes.items() if k in ids}

    async def _gravadas(_session, *, topico_id):
        return dict(estado.gravadas)

    async def _gravar(_session, **kwargs):
        estado.gravados[kwargs["conteudo_id"]] = kwargs

    class _Repo:
        def __init__(self, _session):
            pass

        async def buscar_conteudos_topico(self, _topico_id):
            return list(estado.conteudos)

    monkeypatch.setattr(demanda_formato, "tabela_existe", _tabela_existe)
    monkeypatch.setattr(demanda_formato, "_topico", _topico)
    monkeypatch.setattr(demanda_formato, "_textos_das_fontes", _textos)
    monkeypatch.setattr(demanda_formato, "_gravadas", _gravadas)
    monkeypatch.setattr(demanda_formato, "_gravar", _gravar)
    monkeypatch.setattr(demanda_formato, "ConteudoClasseRepository", _Repo)
    return estado


def _llm(resposta=None, erro: Exception | None = None):
    servico = SimpleNamespace(ainvoke_structured=AsyncMock())
    if erro:
        servico.ainvoke_structured.side_effect = erro
    else:
        servico.ainvoke_structured.return_value = resposta
    return servico


def _hash(banco) -> str:
    conteudos = [{**c, "textos_fonte": banco.fontes.get(c["id"], [])} for c in banco.conteudos]
    return hash_do_topico(topico=TOPICO, conteudos=conteudos)


@pytest.mark.asyncio
async def test_analisa_e_grava_um_por_conteudo(banco) -> None:
    llm = _llm(DemandaDoTopico(conteudos=[_item(10, visual="essencial"), _item(11, escrito="ajuda")]))
    sessao = _Sessao()
    resultado = await analisar_demanda_do_topico(session=sessao, settings=None, topico_id=7, llm=llm)
    assert resultado.status == "gerado" and resultado.gravados == 2
    assert banco.gravados[10]["origem"] == "modelo"
    assert banco.gravados[10]["demanda"]["visual"]["nivel"] == "essencial"
    assert banco.gravados[11]["classe_id"] == 68
    assert {g["source_hash"] for g in banco.gravados.values()} == {_hash(banco)}
    # A leitura fecha antes da chamada externa e a escrita é commitada.
    sessao.rollback.assert_awaited()
    sessao.commit.assert_awaited()


@pytest.mark.asyncio
async def test_texto_do_arquivo_do_professor_vai_no_pedido(banco) -> None:
    banco.fontes = {10: ["Texto extraído do PDF."]}
    llm = _llm(DemandaDoTopico(conteudos=[_item(10), _item(11)]))
    await analisar_demanda_do_topico(session=_Sessao(), settings=None, topico_id=7, llm=llm)
    payload = llm.ainvoke_structured.await_args.kwargs["payload"]
    assert "Texto extraído do PDF." in payload["conteudos"][0]["trecho"]


@pytest.mark.asyncio
async def test_hash_igual_com_analise_do_modelo_nao_chama_o_modelo(banco) -> None:
    banco.gravadas = {c["id"]: {"origem": "modelo", "source_hash": _hash(banco)} for c in CONTEUDOS}
    llm = _llm(DemandaDoTopico())
    resultado = await analisar_demanda_do_topico(session=_Sessao(), settings=None, topico_id=7, llm=llm)
    assert resultado.status == "atual"
    llm.ainvoke_structured.assert_not_awaited()


@pytest.mark.asyncio
async def test_regra_fixa_nao_conta_como_atual(banco) -> None:
    banco.gravadas = {c["id"]: {"origem": "heuristica", "source_hash": _hash(banco)} for c in CONTEUDOS}
    llm = _llm(DemandaDoTopico(conteudos=[_item(10), _item(11)]))
    resultado = await analisar_demanda_do_topico(session=_Sessao(), settings=None, topico_id=7, llm=llm)
    assert resultado.status == "gerado"
    assert {g["origem"] for g in banco.gravados.values()} == {"modelo"}


@pytest.mark.asyncio
async def test_analise_do_professor_nunca_e_refeita(banco) -> None:
    banco.gravadas = {10: {"origem": "professor", "source_hash": "antigo"}}
    llm = _llm(DemandaDoTopico(conteudos=[_item(10, visual="essencial"), _item(11)]))
    await analisar_demanda_do_topico(session=_Sessao(), settings=None, topico_id=7, llm=llm)
    assert set(banco.gravados) == {11}
    assert [c["conteudo_id"] for c in llm.ainvoke_structured.await_args.kwargs["payload"]["conteudos"]] == [10, 11]


@pytest.mark.asyncio
async def test_falha_do_modelo_cai_na_regra_fixa_sem_levantar(banco) -> None:
    banco.conteudos = [dict(CONTEUDOS[0], metadata={"files": [{"name": "triangulo.png"}]}), CONTEUDOS[1]]
    resultado = await analisar_demanda_do_topico(
        session=_Sessao(), settings=None, topico_id=7, llm=_llm(erro=RuntimeError("429 cota"))
    )
    assert resultado.status == "heuristica" and resultado.gravados == 2
    assert "429" in (resultado.erro or "")
    assert banco.gravados[10]["origem"] == "heuristica"
    assert banco.gravados[10]["demanda"]["visual"]["nivel"] == "essencial"


@pytest.mark.asyncio
async def test_falha_do_modelo_nao_troca_analise_antiga_do_modelo_pela_regra(banco) -> None:
    banco.gravadas = {10: {"origem": "modelo", "source_hash": "antigo"}}
    resultado = await analisar_demanda_do_topico(
        session=_Sessao(), settings=None, topico_id=7, llm=_llm(erro=TimeoutError())
    )
    assert resultado.status == "heuristica"
    assert set(banco.gravados) == {11}


@pytest.mark.asyncio
async def test_modelo_nao_grava_em_conteudo_fora_do_pedido(banco) -> None:
    llm = _llm(DemandaDoTopico(conteudos=[_item(10), _item(99, visual="essencial")]))
    resultado = await analisar_demanda_do_topico(session=_Sessao(), settings=None, topico_id=7, llm=llm)
    assert 99 not in banco.gravados
    # O 11 ficou sem resposta do modelo: regra fixa, e o resultado é parcial.
    assert resultado.status == "parcial"
    assert banco.gravados[11]["origem"] == "heuristica"


@pytest.mark.asyncio
async def test_sem_tabela_ou_sem_conteudo_nao_chama_o_modelo(banco) -> None:
    llm = _llm(DemandaDoTopico())
    banco.tabela = False
    assert (await analisar_demanda_do_topico(session=_Sessao(), settings=None, topico_id=7, llm=llm)).status == "sem_tabela"
    banco.tabela = True
    assert (await analisar_demanda_do_topico(session=_Sessao(), settings=None, topico_id=8, llm=llm)).status == "sem_conteudo"
    llm.ainvoke_structured.assert_not_awaited()


# ---------------------------------------------------------------- fase do worker


class _FabricaDeSessao:
    def __call__(self):
        return self

    async def __aenter__(self):
        return object()

    async def __aexit__(self, *exc):
        return False


def _app() -> SimpleNamespace:
    return SimpleNamespace(state=SimpleNamespace(session_factory=_FabricaDeSessao(), settings=None))


def _target(topico_id: int | None, perfil: str | None = "survivor", aluno_id: str | None = None) -> dict:
    return {"topico_id": topico_id, "brainhex_profile_key": perfil, "aluno_id": aluno_id}


@pytest.mark.asyncio
async def test_fase_do_job_analisa_uma_vez_por_topico(monkeypatch) -> None:
    chamadas: list[int] = []

    async def _analisar(*, session, settings, topico_id):
        chamadas.append(topico_id)
        return demanda_formato.ResultadoDemanda(status="gerado")

    monkeypatch.setattr(personalizacao_jobs, "analisar_demanda_do_topico", _analisar)
    targets = [_target(1, "survivor"), _target(1, "seeker"), _target(2, None, aluno_id="a1"), _target(None)]
    await personalizacao_jobs._analisar_demanda_do_job(
        app=_app(), job={"kind": personalizacao_jobs.JOB_KIND_ENROLLMENT}, targets=targets
    )
    assert chamadas == [1, 2]


@pytest.mark.asyncio
async def test_fase_do_job_ignora_limpeza(monkeypatch) -> None:
    analisar = AsyncMock()
    monkeypatch.setattr(personalizacao_jobs, "analisar_demanda_do_topico", analisar)
    await personalizacao_jobs._analisar_demanda_do_job(
        app=_app(), job={"kind": personalizacao_jobs.JOB_KIND_CLEANUP}, targets=[_target(1)]
    )
    analisar.assert_not_awaited()


@pytest.mark.asyncio
async def test_fase_do_job_limita_a_rodada_e_pausa_quem_caiu_na_regra(monkeypatch) -> None:
    chamadas: list[int] = []

    async def _analisar(*, session, settings, topico_id):
        chamadas.append(topico_id)
        if topico_id == 1:
            raise RuntimeError("banco fora")
        return demanda_formato.ResultadoDemanda(status="heuristica" if topico_id == 2 else "gerado")

    monkeypatch.setattr(personalizacao_jobs, "analisar_demanda_do_topico", _analisar)
    app = _app()
    job = {"kind": personalizacao_jobs.JOB_KIND_CLASS_DELTA}
    targets = [_target(t) for t in range(1, 8)]

    await personalizacao_jobs._analisar_demanda_do_job(app=app, job=job, targets=targets)
    assert chamadas == [1, 2, 3][: personalizacao_jobs._DEMANDA_FORMATO_POR_RODADA]

    chamadas.clear()
    await personalizacao_jobs._analisar_demanda_do_job(app=app, job=job, targets=targets)
    assert {1, 2}.isdisjoint(chamadas)
