"""Falas do boss geradas em lote (`app/services/boss_falas.py`, migração `20261101_09`).

O que estes testes protegem:

1. **Só sai do modelo o que o app consegue usar.** Boss sem o mínimo de cada momento é
   descartado inteiro: metade das falas misturaria a voz gerada com a fixa no aparelho.
2. **O modelo não escolhe onde gravar.** `conteudo_id` fora do pedido é ignorado.
3. **Hash igual não chama o modelo.** O worker roda a fase a cada poll; sem isso, cada poll
   pagaria uma chamada por tópico × perfil.
4. **Falha nunca vira exceção nem `failed` no target.** Falas são enfeite da batalha.
5. **A tabela nasce legível para quem está na turma, e só para leitura.**
"""

from __future__ import annotations

import asyncio
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from alembic.config import Config

from app.db import migrations
from app.services import boss_falas, personalizacao_jobs
from app.services.boss_falas import (
    BOSS_FALAS_VERSION,
    MOMENTOS,
    FalasDoBoss,
    FalasDoTopico,
    gerar_falas_do_topico,
    hash_do_topico,
    limpar_falas,
)

API_ROOT = Path(__file__).resolve().parents[1]
TOPICO = {"id": 7, "nome": "Frações", "descricao": "Partes de um inteiro", "classe_id": 68}
CONTEUDOS = [
    {"id": 10, "titulo": "O que é fração", "conteudo": "Numerador e denominador."},
    {"id": 11, "titulo": "Frações equivalentes", "conteudo": "Multiplicar os dois termos."},
]


def _boss(conteudo_id: int, **override) -> FalasDoBoss:
    campos = {
        "conteudo_id": conteudo_id,
        "nome": "Guardiã das Frações",
        "entrada": ["Você acha que divide um inteiro sem mim?"],
        "derrota": ["O denominador era seu desde o início."],
        "dano": ["Esse numerador doeu!", "Equivalência certeira, hein."],
        "metade_vida": ["Metade de mim já virou fração sua."],
        "um_quarto_vida": ["Só me resta um quarto de inteiro."],
        "alerta_tempo": ["O tempo se divide e está acabando."],
        "contra_ataque": ["Recompus meu inteiro. De novo!"],
        "vitoria": ["Você dominou as frações deste conteúdo."],
    }
    campos.update(override)
    return FalasDoBoss(**campos)


# ---------------------------------------------------------------- limpeza


def test_boss_completo_passa_com_todos_os_momentos() -> None:
    limpo = limpar_falas(_boss(10))
    assert limpo is not None
    assert limpo["nome"] == "Guardiã das Frações"
    assert set(limpo["falas"]) == set(MOMENTOS)


@pytest.mark.parametrize("momento", sorted(MOMENTOS))
def test_boss_sem_o_minimo_de_um_momento_e_descartado(momento: str) -> None:
    assert limpar_falas(_boss(10, **{momento: []})) is None


@pytest.mark.parametrize(
    "fala",
    [
        "Veja em https://exemplo.com",
        "Fala com **negrito** aqui",
        "Um [link] escondido",
        "curta",
        "x" * 200,
    ],
)
def test_fala_com_link_markdown_ou_tamanho_fora_e_descartada(fala: str) -> None:
    limpo = limpar_falas(_boss(10, dano=[fala, "Esse numerador doeu!", "Equivalência certeira, hein."]))
    assert limpo is not None
    assert fala not in limpo["falas"]["dano"]


def test_falas_repetidas_e_excesso_sao_cortados() -> None:
    muitas = [f"Golpe número {i} no meu denominador!" for i in range(10)]
    limpo = limpar_falas(_boss(10, dano=["Esse numerador doeu!"] * 3 + muitas))
    assert limpo is not None
    assert len(limpo["falas"]["dano"]) == MOMENTOS["dano"][1]
    assert len(set(limpo["falas"]["dano"])) == len(limpo["falas"]["dano"])


def test_nome_vazio_ou_longo_descarta_o_boss() -> None:
    assert limpar_falas(_boss(10, nome="  ")) is None
    assert limpar_falas(_boss(10, nome="N" * 61)) is None


def test_hash_muda_com_conteudo_perfil_e_versao(monkeypatch) -> None:
    base = hash_do_topico(perfil="conqueror", topico=TOPICO, conteudos=CONTEUDOS)
    assert base == hash_do_topico(perfil="conqueror", topico=TOPICO, conteudos=[dict(c) for c in CONTEUDOS])
    assert base != hash_do_topico(perfil="achiever", topico=TOPICO, conteudos=CONTEUDOS)
    alterado = [CONTEUDOS[0], {**CONTEUDOS[1], "conteudo": "Outro texto."}]
    assert base != hash_do_topico(perfil="conqueror", topico=TOPICO, conteudos=alterado)
    monkeypatch.setattr(boss_falas, "BOSS_FALAS_VERSION", BOSS_FALAS_VERSION + "x")
    assert base != hash_do_topico(perfil="conqueror", topico=TOPICO, conteudos=CONTEUDOS)


def test_payload_nao_leva_nada_do_aluno_e_traz_o_tom_do_perfil() -> None:
    payload = boss_falas.montar_payload(perfil="daredevil", topico=TOPICO, conteudos=CONTEUDOS)
    assert payload["perfil"]["nome"] == "Daredevil"
    assert payload["perfil"]["tom_voz"]
    assert [c["conteudo_id"] for c in payload["conteudos"]] == [10, 11]
    assert set(payload["momentos"]) == set(MOMENTOS)
    assert "aluno" not in str(payload).lower()


def test_prompt_pede_exatamente_os_momentos_do_schema() -> None:
    prompt = (API_ROOT / "app/agent/prompts/boss_falas.txt").read_text(encoding="utf-8")
    for momento in MOMENTOS:
        assert f'"{momento}"' in prompt
    assert set(MOMENTOS) | {"conteudo_id", "nome"} == set(FalasDoBoss.model_fields)


# ---------------------------------------------------------------- orquestração


class _Sessao:
    def __init__(self) -> None:
        self.rollback = AsyncMock()
        self.commit = AsyncMock()


@pytest.fixture
def banco(monkeypatch):
    estado = SimpleNamespace(gravados={}, hashes={}, tabela=True, conteudos=list(CONTEUDOS))

    async def _tabela_existe(_session):
        return estado.tabela

    async def _topico(_session, topico_id):
        return dict(TOPICO) if topico_id == TOPICO["id"] else None

    async def _hashes(_session, *, topico_id, perfil):
        return dict(estado.hashes)

    async def _gravar(_session, **kwargs):
        estado.gravados[kwargs["conteudo_id"]] = kwargs

    class _Repo:
        def __init__(self, _session):
            pass

        async def buscar_conteudos_topico(self, _topico_id):
            return list(estado.conteudos)

    monkeypatch.setattr(boss_falas, "tabela_existe", _tabela_existe)
    monkeypatch.setattr(boss_falas, "_topico", _topico)
    monkeypatch.setattr(boss_falas, "_hashes_gravados", _hashes)
    monkeypatch.setattr(boss_falas, "_gravar", _gravar)
    monkeypatch.setattr(boss_falas, "ConteudoClasseRepository", _Repo)
    return estado


def _llm(resposta=None, erro: Exception | None = None):
    servico = SimpleNamespace(ainvoke_structured=AsyncMock())
    if erro:
        servico.ainvoke_structured.side_effect = erro
    else:
        servico.ainvoke_structured.return_value = resposta
    return servico


@pytest.mark.asyncio
async def test_gera_e_grava_um_boss_por_conteudo(banco) -> None:
    llm = _llm(FalasDoTopico(bosses=[_boss(10), _boss(11, nome="Eco Equivalente")]))
    sessao = _Sessao()
    resultado = await gerar_falas_do_topico(session=sessao, settings=None, topico_id=7, perfil="conqueror", llm=llm)
    assert resultado.status == "gerado" and resultado.gravados == 2
    assert banco.gravados[11]["nome"] == "Eco Equivalente"
    assert banco.gravados[10]["classe_id"] == 68 and banco.gravados[10]["perfil"] == "conqueror"
    esperado = hash_do_topico(perfil="conqueror", topico=TOPICO, conteudos=CONTEUDOS)
    assert {g["source_hash"] for g in banco.gravados.values()} == {esperado}
    # A leitura fecha antes da chamada externa e a escrita é commitada.
    sessao.rollback.assert_awaited()
    sessao.commit.assert_awaited_once()
    assert llm.ainvoke_structured.await_args.kwargs["prompt_name"] == "boss_falas.txt"


@pytest.mark.asyncio
async def test_hash_igual_nao_chama_o_modelo(banco) -> None:
    banco.hashes = {c["id"]: hash_do_topico(perfil="conqueror", topico=TOPICO, conteudos=CONTEUDOS) for c in CONTEUDOS}
    llm = _llm(FalasDoTopico())
    resultado = await gerar_falas_do_topico(session=_Sessao(), settings=None, topico_id=7, perfil="conqueror", llm=llm)
    assert resultado.status == "atual"
    llm.ainvoke_structured.assert_not_awaited()


@pytest.mark.asyncio
async def test_conteudo_novo_no_topico_regera(banco) -> None:
    banco.hashes = {10: hash_do_topico(perfil="conqueror", topico=TOPICO, conteudos=CONTEUDOS[:1])}
    llm = _llm(FalasDoTopico(bosses=[_boss(10), _boss(11)]))
    resultado = await gerar_falas_do_topico(session=_Sessao(), settings=None, topico_id=7, perfil="conqueror", llm=llm)
    assert resultado.status == "gerado"
    llm.ainvoke_structured.assert_awaited_once()


@pytest.mark.asyncio
async def test_modelo_nao_grava_em_conteudo_fora_do_pedido(banco) -> None:
    llm = _llm(FalasDoTopico(bosses=[_boss(10), _boss(999), _boss(10, nome="Duplicado")]))
    resultado = await gerar_falas_do_topico(session=_Sessao(), settings=None, topico_id=7, perfil="conqueror", llm=llm)
    assert set(banco.gravados) == {10}
    assert banco.gravados[10]["nome"] == "Guardiã das Frações"
    assert resultado.status == "parcial" and resultado.gravados == 1


@pytest.mark.asyncio
async def test_falha_do_modelo_nao_levanta_e_nao_grava(banco) -> None:
    llm = _llm(erro=RuntimeError("cota esgotada"))
    resultado = await gerar_falas_do_topico(session=_Sessao(), settings=None, topico_id=7, perfil="conqueror", llm=llm)
    assert resultado.status == "failed" and "cota" in (resultado.erro or "")
    assert banco.gravados == {}


@pytest.mark.asyncio
async def test_timeout_do_modelo_nao_levanta(banco, monkeypatch) -> None:
    monkeypatch.setattr(boss_falas, "LLM_TIMEOUT_SEC", 0.01)

    async def _lento(**_kwargs):
        await asyncio.sleep(1)

    llm = SimpleNamespace(ainvoke_structured=_lento)
    resultado = await gerar_falas_do_topico(session=_Sessao(), settings=None, topico_id=7, perfil="conqueror", llm=llm)
    assert resultado.status == "failed"
    assert banco.gravados == {}


@pytest.mark.asyncio
async def test_sem_tabela_sem_conteudo_ou_perfil_invalido_nao_chama_o_modelo(banco) -> None:
    llm = _llm(FalasDoTopico())
    banco.tabela = False
    assert (await gerar_falas_do_topico(session=_Sessao(), settings=None, topico_id=7, perfil="conqueror", llm=llm)).status == "sem_tabela"
    banco.tabela = True
    banco.conteudos = []
    assert (await gerar_falas_do_topico(session=_Sessao(), settings=None, topico_id=7, perfil="conqueror", llm=llm)).status == "sem_conteudo"
    assert (await gerar_falas_do_topico(session=_Sessao(), settings=None, topico_id=7, perfil="hacker", llm=llm)).status == "failed"
    assert (await gerar_falas_do_topico(session=_Sessao(), settings=None, topico_id=7, perfil="seeker", llm=llm)).status == "sem_batalha"
    llm.ainvoke_structured.assert_not_awaited()


def test_perfis_com_batalha_batem_com_o_app() -> None:
    import re

    fonte = (API_ROOT.parent / "mobile/src/utils/brainHexCapabilities.ts").read_text(encoding="utf-8")
    bloco = re.search(r"BATTLE_PROFILES = new Set<BrainHexProfile>\(\[(.*?)\]\)", fonte, re.S)
    assert bloco, "BATTLE_PROFILES sumiu do app: confira onde a batalha passou a ser decidida"
    assert set(re.findall(r'"(\w+)"', bloco.group(1))) == boss_falas.PERFIS_COM_BATALHA


# ---------------------------------------------------------------- fase do job


class _FabricaDeSessao:
    def __call__(self):
        return self

    async def __aenter__(self):
        return object()

    async def __aexit__(self, *exc):
        return False


def _app() -> SimpleNamespace:
    return SimpleNamespace(state=SimpleNamespace(session_factory=_FabricaDeSessao(), settings=None))


def _target(topico_id: int, perfil: str | None, aluno_id: str | None = None) -> dict:
    return {"topico_id": topico_id, "conteudo_id": topico_id * 10, "brainhex_profile_key": perfil, "aluno_id": aluno_id}


@pytest.mark.asyncio
async def test_fase_do_job_gera_uma_vez_por_topico_e_perfil(monkeypatch) -> None:
    chamadas: list[tuple[int, str]] = []

    async def _gerar(*, session, settings, topico_id, perfil):
        chamadas.append((topico_id, perfil))
        return boss_falas.ResultadoFalas(status="gerado")

    monkeypatch.setattr(personalizacao_jobs, "gerar_falas_do_topico", _gerar)
    targets = [
        _target(1, "survivor"),
        _target(1, "survivor"),  # outro conteúdo do mesmo tópico: mesma chamada
        _target(1, "daredevil"),
        _target(1, "seeker"),  # perfil sem batalha no app: ninguém veria as falas
        _target(2, "survivor", aluno_id="aluno-1"),  # alvo de aluno não é base por perfil
        _target(3, None),  # sem perfil: o normalizador cairia em "mastermind"
    ]
    await personalizacao_jobs._gerar_falas_boss_do_job(
        app=_app(), job={"kind": personalizacao_jobs.JOB_KIND_CLASS_DELTA}, targets=targets
    )
    assert sorted(chamadas) == [(1, "daredevil"), (1, "survivor")]


@pytest.mark.asyncio
async def test_fase_do_job_ignora_kinds_que_nao_sao_base(monkeypatch) -> None:
    gerar = AsyncMock()
    monkeypatch.setattr(personalizacao_jobs, "gerar_falas_do_topico", gerar)
    await personalizacao_jobs._gerar_falas_boss_do_job(
        app=_app(), job={"kind": personalizacao_jobs.JOB_KIND_CLEANUP}, targets=[_target(1, "survivor")]
    )
    gerar.assert_not_awaited()


@pytest.mark.asyncio
async def test_fase_do_job_limita_a_rodada_e_pausa_quem_falhou(monkeypatch) -> None:
    chamadas: list[tuple[int, str]] = []

    async def _gerar(*, session, settings, topico_id, perfil):
        chamadas.append((topico_id, perfil))
        if topico_id == 1:
            raise RuntimeError("provedor fora")
        return boss_falas.ResultadoFalas(status="failed" if topico_id == 2 else "gerado")

    monkeypatch.setattr(personalizacao_jobs, "gerar_falas_do_topico", _gerar)
    app = _app()
    job = {"kind": personalizacao_jobs.JOB_KIND_CLASS_DELTA}
    targets = [_target(t, "conqueror") for t in range(1, 8)]

    await personalizacao_jobs._gerar_falas_boss_do_job(app=app, job=job, targets=targets)
    assert len(chamadas) == personalizacao_jobs._BOSS_FALAS_POR_RODADA

    chamadas.clear()
    await personalizacao_jobs._gerar_falas_boss_do_job(app=app, job=job, targets=targets)
    # Tópicos 1 (exceção) e 2 (failed) esperam a pausa; os outros seguem.
    assert {t for t, _ in chamadas}.isdisjoint({1, 2})


# ---------------------------------------------------------------- migração


def _sql(alvo: str) -> str:
    output = StringIO()
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = "postgresql://user:password@localhost:5432/trailup"
    if alvo == "upgrade":
        migrations.command.upgrade(config, "20261101_08:20261101_09", sql=True)
    else:
        migrations.command.downgrade(config, "20261101_09:20261101_08", sql=True)
    return output.getvalue().lower()


def test_migracao_cria_tabela_com_policy_de_leitura_para_a_turma() -> None:
    sql = _sql("upgrade")
    assert "create table if not exists public.boss_falas" in sql
    assert "unique (conteudo_id, perfil)" in sql
    assert "enable row level security" in sql
    assert "create policy boss_falas_minhas_classes_sel on public.boss_falas" in sql
    assert "for select to authenticated" in sql
    assert "public.app_minhas_classes()" in sql
    # repetir o EXISTS sobre classe_aluno aqui recursaria a RLS
    assert "classe_aluno" not in sql
    assert "revoke all on public.boss_falas from anon" in sql


def test_migracao_nao_abre_escrita_para_o_cliente() -> None:
    sql = _sql("upgrade")
    for proibido in ("for insert", "for update", "for delete", "for all", "grant insert", "grant update"):
        assert proibido not in sql, proibido


def test_downgrade_remove_policy_e_tabela() -> None:
    sql = _sql("downgrade")
    assert "drop policy if exists boss_falas_minhas_classes_sel" in sql
    assert "drop table if exists public.boss_falas" in sql
