"""Orquestração: motor -> banco -> log (persistência da sugestão)."""

import pytest

from app.services.sugestao_ciclo import (
    garantir_sugestao,
    revisar_sugestao,
    revisar_sugestoes_do_ciclo,
)

TODOS = ["markdown", "audio", "cards"]


class RepoFake:
    """Repositório em memória, com a mesma semântica do de verdade.

    Em especial: ``salvar`` incrementa a versão no próprio "UPDATE", como o
    ON CONFLICT do Postgres faz — é isso que os testes precisam exercitar.
    """

    def __init__(self, *, disponivel: bool = True):
        self.disponivel = disponivel
        self.linhas: dict[tuple, dict] = {}
        self.log: list[dict] = []
        self._proximo_id = 1

    @staticmethod
    def _chave(aluno_id, topico_id, conteudo_id):
        return (aluno_id, topico_id, conteudo_id if conteudo_id is not None else -1)

    async def buscar(self, *, aluno_id, topico_id, conteudo_id=None):
        if not self.disponivel:
            return None
        return self.linhas.get(self._chave(aluno_id, topico_id, conteudo_id))

    async def salvar(
        self,
        *,
        aluno_id,
        topico_id,
        conteudo_id,
        classe_id,
        formato_inicial,
        ordem,
        origem,
        evidencia=None,
        versao=None,
    ):
        if not self.disponivel:
            return None
        chave = self._chave(aluno_id, topico_id, conteudo_id)
        existente = self.linhas.get(chave)
        if existente:
            existente.update(
                {
                    "formato_inicial": formato_inicial,
                    "ordem": ordem,
                    "origem": origem,
                    "evidencia": evidencia or {},
                    "versao": int(existente["versao"]) + 1,
                }
            )
            return {"id": existente["id"], "versao": existente["versao"]}

        linha = {
            "id": self._proximo_id,
            "aluno_id": aluno_id,
            "classe_id": classe_id,
            "topico_id": topico_id,
            "conteudo_id": conteudo_id,
            "formato_inicial": formato_inicial,
            "ordem": ordem,
            "origem": origem,
            "evidencia": evidencia or {},
            "versao": versao or 1,
        }
        self._proximo_id += 1
        self.linhas[chave] = linha
        return {"id": linha["id"], "versao": linha["versao"]}

    async def criar(
        self, *, aluno_id, topico_id, conteudo_id, classe_id, formato_inicial, ordem, evidencia=None
    ):
        """``INSERT ... ON CONFLICT DO NOTHING``: quem chega depois fica sem linha."""
        if not self.disponivel:
            return None
        if self._chave(aluno_id, topico_id, conteudo_id) in self.linhas:
            return None
        return await self.salvar(
            aluno_id=aluno_id,
            topico_id=topico_id,
            conteudo_id=conteudo_id,
            classe_id=classe_id,
            formato_inicial=formato_inicial,
            ordem=ordem,
            origem="inicial",
            evidencia=evidencia,
            versao=1,
        )

    async def registrar_log(self, **kwargs):
        if not self.disponivel:
            return None
        self.log.append(kwargs)
        return len(self.log)


def _perfil(nome: str):
    return [{"perfil": nome, "afinidade": 100}]


def _sinal(**kwargs):
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


# --- criação ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_primeira_vez_cria_e_loga_criada():
    repo = RepoFake()

    sugestao = await garantir_sugestao(
        repo,
        aluno_id="a1",
        topico_id=10,
        classe_id=32,
        perfis=_perfil("socializer"),
        formatos_disponiveis=TODOS,
    )

    assert sugestao["formato_inicial"] == "audio"
    assert len(repo.log) == 1
    assert repo.log[0]["acao"] == "criada"
    assert repo.log[0]["ordem_antes"] is None
    assert repo.log[0]["versao"] == 1


@pytest.mark.asyncio
async def test_segunda_chamada_nao_recalcula_nem_loga_de_novo():
    # A sugestão é feita UMA vez; regenerar do zero apagaria a história que a
    # métrica de efetividade precisa.
    repo = RepoFake()
    comum = dict(
        aluno_id="a1", topico_id=10, perfis=_perfil("socializer"), formatos_disponiveis=TODOS
    )

    primeira = await garantir_sugestao(repo, **comum)
    segunda = await garantir_sugestao(repo, **comum)

    assert segunda["ordem"] == primeira["ordem"]
    assert len(repo.log) == 1
    assert repo.linhas[("a1", 10, -1)]["versao"] == 1


@pytest.mark.asyncio
async def test_sem_formato_gerado_nao_grava_linha_vazia():
    repo = RepoFake()

    sugestao = await garantir_sugestao(
        repo, aluno_id="a1", topico_id=10, perfis=_perfil("seeker"), formatos_disponiveis=[]
    )

    assert sugestao is None
    assert repo.linhas == {}
    assert repo.log == []


@pytest.mark.asyncio
async def test_tabela_ausente_nao_derruba_a_geracao():
    # Migração não aplicada: a sugestão simplesmente não acontece.
    repo = RepoFake(disponivel=False)

    sugestao = await garantir_sugestao(
        repo, aluno_id="a1", topico_id=10, perfis=_perfil("seeker"), formatos_disponiveis=TODOS
    )

    assert sugestao is None
    assert repo.log == []


# --- revisão ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_revisao_troca_a_ordem_incrementa_versao_e_loga_antes_e_depois():
    repo = RepoFake()
    await garantir_sugestao(
        repo,
        aluno_id="a1",
        topico_id=10,
        perfis=_perfil("mastermind"),  # começa por markdown
        formatos_disponiveis=["markdown", "audio"],
    )

    decisao = await revisar_sugestao(
        repo,
        aluno_id="a1",
        topico_id=10,
        sinais_por_formato={
            "markdown": _sinal(skimming=True, active_sec=40),
            "audio": _sinal(acertos=85, active_sec=300),
        },
    )

    assert decisao["acao"] == "revisada"
    assert repo.linhas[("a1", 10, -1)]["versao"] == 2
    assert repo.linhas[("a1", 10, -1)]["formato_inicial"] == "audio"

    registro = repo.log[-1]
    assert registro["acao"] == "revisada"
    assert registro["versao"] == 2
    assert [i["formato"] for i in registro["ordem_antes"]] == ["markdown", "audio"]
    assert [i["formato"] for i in registro["ordem_depois"]] == ["audio", "markdown"]


@pytest.mark.asyncio
async def test_mantida_loga_mas_nao_toca_na_sugestao():
    # Um UPDATE aqui incrementaria a versão e faria o histórico parecer cheio de
    # revisões que nunca aconteceram.
    repo = RepoFake()
    await garantir_sugestao(
        repo,
        aluno_id="a1",
        topico_id=10,
        perfis=_perfil("mastermind"),
        formatos_disponiveis=["markdown", "audio"],
    )
    ordem_antes = list(repo.linhas[("a1", 10, -1)]["ordem"])

    decisao = await revisar_sugestao(
        repo,
        aluno_id="a1",
        topico_id=10,
        sinais_por_formato={"markdown": _sinal(skimming=True)},  # evidência de 1 só
    )

    assert decisao["acao"] == "mantida"
    assert repo.linhas[("a1", 10, -1)]["versao"] == 1
    assert repo.linhas[("a1", 10, -1)]["ordem"] == ordem_antes
    assert repo.log[-1]["acao"] == "mantida"
    assert repo.log[-1]["ordem_depois"] is None


@pytest.mark.asyncio
async def test_mantida_tambem_entra_no_historico():
    # Sem registrar "mantida" não há como distinguir um motor estável de um
    # motor que nunca rodou.
    repo = RepoFake()
    await garantir_sugestao(
        repo,
        aluno_id="a1",
        topico_id=10,
        perfis=_perfil("mastermind"),
        formatos_disponiveis=["markdown", "audio"],
    )

    await revisar_sugestao(
        repo, aluno_id="a1", topico_id=10, sinais_por_formato={"markdown": _sinal(skimming=True)}
    )

    assert [r["acao"] for r in repo.log] == ["criada", "mantida"]


@pytest.mark.asyncio
async def test_revisar_sem_sugestao_anterior_nao_inventa_nada():
    repo = RepoFake()

    decisao = await revisar_sugestao(
        repo, aluno_id="a1", topico_id=10, sinais_por_formato={"markdown": _sinal(skimming=True)}
    )

    assert decisao is None
    assert repo.log == []


@pytest.mark.asyncio
async def test_duas_revisoes_seguidas_versionam_em_sequencia():
    repo = RepoFake()
    await garantir_sugestao(
        repo,
        aluno_id="a1",
        topico_id=10,
        perfis=_perfil("mastermind"),
        formatos_disponiveis=["markdown", "audio"],
    )

    sinais_pro_audio = {
        "markdown": _sinal(skimming=True, active_sec=40),
        "audio": _sinal(acertos=85, active_sec=300),
    }
    sinais_pro_texto = {
        "markdown": _sinal(acertos=95, active_sec=400),
        "audio": _sinal(percentual=10, tempo_min=9, active_sec=50),
    }

    await revisar_sugestao(repo, aluno_id="a1", topico_id=10, sinais_por_formato=sinais_pro_audio)
    await revisar_sugestao(repo, aluno_id="a1", topico_id=10, sinais_por_formato=sinais_pro_texto)

    assert repo.linhas[("a1", 10, -1)]["versao"] == 3
    assert [r["versao"] for r in repo.log] == [1, 2, 3]


@pytest.mark.asyncio
async def test_conteudo_id_distingue_alvos_do_mesmo_topico():
    repo = RepoFake()
    comum = dict(
        aluno_id="a1", topico_id=10, perfis=_perfil("socializer"), formatos_disponiveis=TODOS
    )

    await garantir_sugestao(repo, conteudo_id=100, **comum)
    await garantir_sugestao(repo, conteudo_id=200, **comum)

    assert len(repo.linhas) == 2
    assert len(repo.log) == 2


# --- guardas da entrada do ciclo ------------------------------------------
# Passar None como sessão é intencional: se qualquer uma destas guardas deixar
# passar, o teste estoura com AttributeError em vez de silenciosamente ir ao
# banco.


@pytest.mark.asyncio
async def test_ciclo_sem_topico_nao_tenta_revisar():
    # A sugestão é por (aluno, tópico); "a sugestão do aluno em geral" não existe.
    assert (
        await revisar_sugestoes_do_ciclo(
            None,
            aluno_id="a1",
            classe_id=32,
            topico_id=None,
            telemetry_payload={"time_metrics": {"materials": [{"material_tipo": "audio"}]}},
            stage_outputs={},
        )
        is None
    )


@pytest.mark.asyncio
async def test_lote_sem_material_aberto_nao_gera_registro():
    # Registrar "mantida" aqui encheria o histórico de ciclos que não olharam
    # nada, e o churn passaria a medir navegação em vez de decisão.
    assert (
        await revisar_sugestoes_do_ciclo(
            None,
            aluno_id="a1",
            classe_id=32,
            topico_id=10,
            telemetry_payload={"time_metrics": {"materials": []}},
            stage_outputs={},
        )
        is None
    )


@pytest.mark.asyncio
async def test_telemetria_ausente_nao_quebra_o_ciclo():
    assert (
        await revisar_sugestoes_do_ciclo(
            None,
            aluno_id="a1",
            classe_id=32,
            topico_id=10,
            telemetry_payload=None,
            stage_outputs=None,
        )
        is None
    )


# --- evidencia extra ------------------------------------------------------


@pytest.mark.asyncio
async def test_ordem_observada_vai_pro_log_mesmo_quando_mantida():
    # Sem a ordem observada gravada, a aderencia nao seria mensurável depois: a
    # telemetria bruta nao fica guardada indefinidamente.
    repo = RepoFake()
    await garantir_sugestao(
        repo,
        aluno_id="a1",
        topico_id=10,
        perfis=_perfil("mastermind"),
        formatos_disponiveis=["markdown", "audio"],
    )

    await revisar_sugestao(
        repo,
        aluno_id="a1",
        topico_id=10,
        sinais_por_formato={"markdown": _sinal(skimming=True)},
        evidencia_extra={"ordem_observada": ["audio", "markdown"]},
    )

    assert repo.log[-1]["acao"] == "mantida"
    assert repo.log[-1]["evidencia"]["ordem_observada"] == ["audio", "markdown"]


@pytest.mark.asyncio
async def test_evidencia_extra_nao_apaga_a_do_motor():
    repo = RepoFake()
    await garantir_sugestao(
        repo,
        aluno_id="a1",
        topico_id=10,
        perfis=_perfil("mastermind"),
        formatos_disponiveis=["markdown", "audio"],
    )

    await revisar_sugestao(
        repo,
        aluno_id="a1",
        topico_id=10,
        sinais_por_formato={
            "markdown": _sinal(skimming=True, active_sec=40),
            "audio": _sinal(acertos=85, active_sec=300),
        },
        evidencia_extra={"ordem_observada": ["markdown"]},
    )

    evidencia = repo.log[-1]["evidencia"]
    assert evidencia["ordem_observada"] == ["markdown"]
    assert evidencia["formatos_com_evidencia"] == 2
    assert "sinais" in evidencia


def test_rota_de_historico_vem_antes_da_rota_por_topico():
    # "historico" nao e inteiro: com a ordem invertida o FastAPI tentaria casar
    # /sugestao/{aluno}/{topico_id} primeiro e responderia 422 em vez de chegar
    # ao endpoint do console.
    from fastapi.routing import APIRoute

    from app.api.v1.personalizacao import router

    caminhos = [
        rota.path
        for rota in router.routes
        if isinstance(rota, APIRoute) and "/sugestao/" in rota.path
    ]

    assert caminhos.index("/personalizar/sugestao/{aluno_id}/historico") < caminhos.index(
        "/personalizar/sugestao/{aluno_id}/{topico_id}"
    )


# --- #66: corrida na criação, catálogo no log, dificuldade no tópico --------


@pytest.mark.asyncio
async def test_criacao_concorrente_loga_criada_uma_vez_so():
    # Medido em produção (2026-11-01): dois GET simultâneos deixaram a sugestão
    # em versao=2 com origem=inicial e DOIS "criada" no log. A segunda chamada
    # perde a corrida no INSERT e devolve a linha da primeira, sem logar.
    import asyncio

    repo = RepoFake()
    buscar_original = repo.buscar
    entraram = 0
    liberar = asyncio.Event()

    async def buscar_em_paralelo(**kwargs):
        # As duas chamadas leem "não existe" antes de qualquer uma inserir.
        nonlocal entraram
        resultado = await buscar_original(**kwargs)
        if resultado is None and entraram < 2:
            entraram += 1
            if entraram == 2:
                liberar.set()
            await liberar.wait()
        return resultado

    repo.buscar = buscar_em_paralelo
    comum = dict(
        aluno_id="a1", topico_id=10, perfis=_perfil("socializer"), formatos_disponiveis=TODOS
    )

    primeira, segunda = await asyncio.gather(
        garantir_sugestao(repo, **comum), garantir_sugestao(repo, **comum)
    )

    assert [r["acao"] for r in repo.log] == ["criada"]
    assert repo.linhas[("a1", 10, -1)]["versao"] == 1
    assert primeira["ordem"] == segunda["ordem"]


@pytest.mark.asyncio
async def test_log_de_criacao_grava_a_versao_do_catalogo():
    from app.services.evidencias_pedagogicas import CATALOGO_VERSAO

    repo = RepoFake()
    await garantir_sugestao(
        repo, aluno_id="a1", topico_id=10, perfis=_perfil("mastermind"), formatos_disponiveis=TODOS
    )

    assert repo.log[0]["evidencia"]["catalogo_versao"] == CATALOGO_VERSAO
    assert repo.linhas[("a1", 10, -1)]["evidencia"]["catalogo_versao"] == CATALOGO_VERSAO


@pytest.mark.asyncio
async def test_dificuldade_no_topico_sobe_os_cards_e_loga_a_regra():
    repo = RepoFake()
    await garantir_sugestao(
        repo,
        aluno_id="a1",
        topico_id=10,
        perfis=_perfil("mastermind"),
        formatos_disponiveis=["markdown", "audio", "cards"],
    )

    decisao = await revisar_sugestao(
        repo,
        aluno_id="a1",
        topico_id=10,
        sinais_por_formato={},
        desempenho_topico={"media_acertos": 40.0, "itens": 3},
    )

    assert decisao["acao"] == "revisada"
    assert decisao["ordem"][0]["formato"] == "cards"
    assert repo.log[-1]["evidencia"]["desempenho_topico"] == {"media_acertos": 40.0, "itens": 3}
    regras = [ev["regra"] for ev in decisao["ordem"][0]["evidencias"]]
    assert "reexposicao_quiz" in regras


def test_resposta_leva_evidencias_e_descarta_as_malformadas():
    from app.api.v1.personalizacao import _itens_da_sugestao

    itens = _itens_da_sugestao(
        [
            {
                "formato": "cards",
                "posicao": 1,
                "score": 1.2,
                "motivos": ["x"],
                "evidencias": [
                    {"regra": "reexposicao_quiz", "fontes": ["DAT-21"], "confianca": "forte"},
                    {"regra": "quebrada", "fontes": "nao-e-lista"},
                    {"sem": "regra"},
                ],
            },
            # Sugestão gravada antes da #66: sem a chave.
            {"formato": "markdown", "posicao": 2, "score": 1.0},
        ]
    )

    assert [e.regra for e in itens[0].evidencias] == ["reexposicao_quiz"]
    assert itens[1].evidencias == []
