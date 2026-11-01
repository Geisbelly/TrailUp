"""Falas do boss geradas em lote: uma chamada ao modelo por tópico × perfil BrainHex.

Cada conteúdo do tópico ganha um boss com **nome** e **falas** para os momentos da batalha
do app (`mobile/src/context/IAContext.tsx`): entrada, derrota, provocação a cada dano, os
marcos de metade e de um quarto da vida, alerta de tempo, contra-ataque e a mensagem de
vitória do aluno. O resultado vai para `boss_falas` (migração `20261101_11`), que o mobile lê
direto do Supabase — a batalha fala com a API fora do ar, e sem linha valem as falas fixas.

É base por perfil: nada do aluno entra no prompt nem na linha (sem nome, sem desempenho), e a
mesma linha serve a turma inteira daquele perfil. Por isso não há pseudonimização aqui.

Qualquer falha — modelo fora, cota, timeout, resposta fora do formato — deixa o que já estava
gravado (ou nada) e não levanta: falas são enfeite da batalha e não podem custar o material.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.services.llm import JsonLLMService

logger = logging.getLogger(__name__)

PROMPT_NAME = "boss_falas.txt"
# Própria, de propósito: subir `_PERSONALIZACAO_PIPELINE_VERSION` regeraria a mídia de todas as
# turmas. Suba esta quando o prompt ou os momentos mudarem.
BOSS_FALAS_VERSION = "2026-11-01.1"
# O worker é sequencial: uma chamada pendurada travaria a fila de personalização. 90 s não bastava:
# em 01/11 o `gemini-3.6-flash` levou 100 a 133 s para as falas de um tópico, e toda chamada caía
# no timeout. Depois de uma falha o (tópico, perfil) pausa 30 min no worker, então o teto só pesa
# uma vez por pausa.
LLM_TIMEOUT_SEC = 240.0
TRECHO_MAX = 800

PERFIS = ("seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever")
# Só estes perfis enfrentam boss no app (`BATTLE_PROFILES` em
# `mobile/src/utils/brainHexCapabilities.ts`; `test_boss_falas.py` confere a paridade). Gerar
# para os outros quatro seria pagar o modelo por falas que ninguém vê.
PERFIS_COM_BATALHA = frozenset({"survivor", "daredevil", "conqueror"})

# Momento -> (mínimo, máximo) de falas guardadas. Abaixo do mínimo o boss inteiro é descartado:
# metade de um conjunto de falas deixaria o app misturando a voz gerada com a fixa.
MOMENTOS: dict[str, tuple[int, int]] = {
    "entrada": (1, 3),
    "derrota": (1, 3),
    "dano": (2, 6),
    "metade_vida": (1, 3),
    "um_quarto_vida": (1, 3),
    "alerta_tempo": (1, 3),
    "contra_ataque": (1, 3),
    "vitoria": (1, 3),
}
NOME_MAX = 60
FALA_MIN, FALA_MAX = 6, 180

_URL = re.compile(r"https?://|www\.", re.IGNORECASE)
_MARKDOWN = re.compile(r"[*_`#<>\[\]{}]")


def _momento(nome: str) -> Any:
    # O mínimo vai para o JSON Schema que o modelo recebe (minItems), não para a validação local:
    # a saída estruturada do Gemini omitia `derrota` (lista vazia), e o boss inteiro era descartado
    # em `limpar_falas` (01/11, nenhuma fala gravada). `limpar_falas` continua sendo o filtro.
    return Field(default_factory=list, json_schema_extra={"minItems": MOMENTOS[nome][0]})


def _todos_os_momentos_obrigatorios(schema: dict[str, Any]) -> None:
    schema["required"] = ["conteudo_id", "nome", *MOMENTOS]


class FalasDoBoss(BaseModel):
    model_config = ConfigDict(json_schema_extra=_todos_os_momentos_obrigatorios)

    conteudo_id: int
    nome: str
    entrada: list[str] = _momento("entrada")
    derrota: list[str] = _momento("derrota")
    dano: list[str] = _momento("dano")
    metade_vida: list[str] = _momento("metade_vida")
    um_quarto_vida: list[str] = _momento("um_quarto_vida")
    alerta_tempo: list[str] = _momento("alerta_tempo")
    contra_ataque: list[str] = _momento("contra_ataque")
    vitoria: list[str] = _momento("vitoria")


class FalasDoTopico(BaseModel):
    bosses: list[FalasDoBoss] = Field(default_factory=list)


@dataclass
class ResultadoFalas:
    status: str  # "atual" | "gerado" | "parcial" | "failed" | "sem_conteudo" | "sem_tabela" | "sem_batalha"
    gravados: int = 0
    erro: str | None = None


def _limpar_texto(valor: Any, maximo: int) -> str | None:
    texto = re.sub(r"\s+", " ", str(valor or "")).strip().strip('"').strip()
    if not texto or len(texto) > maximo or _URL.search(texto) or _MARKDOWN.search(texto):
        return None
    return texto


def limpar_falas(boss: FalasDoBoss) -> dict[str, Any] | None:
    """Falas que podem ir para o banco, ou None se o boss não tem o mínimo de cada momento."""

    nome = _limpar_texto(boss.nome, NOME_MAX)
    if not nome:
        return None
    falas: dict[str, list[str]] = {}
    for momento, (minimo, maximo) in MOMENTOS.items():
        vistas: list[str] = []
        for bruta in getattr(boss, momento):
            fala = _limpar_texto(bruta, FALA_MAX)
            if fala and len(fala) >= FALA_MIN and fala not in vistas:
                vistas.append(fala)
        if len(vistas) < minimo:
            return None
        falas[momento] = vistas[:maximo]
    return {"nome": nome, "falas": falas}


def hash_do_topico(*, perfil: str, topico: dict[str, Any], conteudos: list[dict[str, Any]]) -> str:
    """Hash do que entra no prompt: igual, a geração é pulada."""

    material = {
        "versao": BOSS_FALAS_VERSION,
        "perfil": perfil,
        "topico": [topico.get("nome"), topico.get("descricao")],
        "conteudos": [
            [int(c["id"]), c.get("titulo"), str(c.get("conteudo") or "")[:TRECHO_MAX]] for c in conteudos
        ],
    }
    bruto = json.dumps(material, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(bruto.encode("utf-8")).hexdigest()


def montar_payload(*, perfil: str, topico: dict[str, Any], conteudos: list[dict[str, Any]]) -> dict[str, Any]:
    # Import tardio: `personalizacao` é um módulo grande e só a assinatura editorial interessa.
    from app.services.personalizacao import _build_profile_editorial_context

    label = perfil.capitalize()
    editorial = _build_profile_editorial_context(label, [{"perfil": label, "afinidade": 1.0}])
    return {
        "perfil": {
            "nome": editorial.get("perfil_dominante"),
            "tom_voz": editorial.get("tom_voz"),
            "ritmo": editorial.get("ritmo"),
            "narrativa_preferencial": editorial.get("narrativa_preferencial"),
            "marcadores_linguisticos": editorial.get("marcadores_linguisticos"),
            "proibicoes_estilo": editorial.get("proibicoes_estilo"),
        },
        "topico": {"nome": topico.get("nome"), "descricao": topico.get("descricao")},
        "conteudos": [
            {
                "conteudo_id": int(c["id"]),
                "titulo": c.get("titulo"),
                "trecho": str(c.get("conteudo") or "")[:TRECHO_MAX],
            }
            for c in conteudos
        ],
        "momentos": {momento: {"minimo": minimo, "maximo": maximo} for momento, (minimo, maximo) in MOMENTOS.items()},
    }


async def tabela_existe(session: AsyncSession) -> bool:
    result = await session.execute(text("SELECT to_regclass('public.boss_falas') IS NOT NULL"))
    return bool(result.scalar_one())


async def _topico(session: AsyncSession, topico_id: int) -> dict[str, Any] | None:
    result = await session.execute(
        text("SELECT id, nome, descricao, classe_id FROM topicos WHERE id = :id"),
        {"id": topico_id},
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def _hashes_gravados(session: AsyncSession, *, topico_id: int, perfil: str) -> dict[int, str]:
    result = await session.execute(
        text("SELECT conteudo_id, source_hash FROM public.boss_falas WHERE topico_id = :topico_id AND perfil = :perfil"),
        {"topico_id": topico_id, "perfil": perfil},
    )
    return {int(row.conteudo_id): str(row.source_hash) for row in result}


async def _gravar(
    session: AsyncSession,
    *,
    classe_id: int,
    topico_id: int,
    conteudo_id: int,
    perfil: str,
    nome: str,
    falas: dict[str, Any],
    source_hash: str,
) -> None:
    await session.execute(
        text(
            """
            INSERT INTO public.boss_falas
              (classe_id, topico_id, conteudo_id, perfil, nome, falas, source_hash, versao, gerado_em)
            VALUES
              (:classe_id, :topico_id, :conteudo_id, :perfil, :nome, CAST(:falas AS jsonb),
               :source_hash, :versao, now())
            ON CONFLICT (conteudo_id, perfil) DO UPDATE SET
              classe_id = EXCLUDED.classe_id,
              topico_id = EXCLUDED.topico_id,
              nome = EXCLUDED.nome,
              falas = EXCLUDED.falas,
              source_hash = EXCLUDED.source_hash,
              versao = EXCLUDED.versao,
              gerado_em = now()
            """
        ),
        {
            "classe_id": classe_id,
            "topico_id": topico_id,
            "conteudo_id": conteudo_id,
            "perfil": perfil,
            "nome": nome,
            "falas": json.dumps(falas, ensure_ascii=False),
            "source_hash": source_hash,
            "versao": BOSS_FALAS_VERSION,
        },
    )


async def gerar_falas_do_topico(
    *,
    session: AsyncSession,
    settings: Settings,
    topico_id: int,
    perfil: str,
    llm: JsonLLMService | None = None,
) -> ResultadoFalas:
    if perfil not in PERFIS:
        return ResultadoFalas(status="failed", erro=f"perfil desconhecido: {perfil}")
    if perfil not in PERFIS_COM_BATALHA:
        return ResultadoFalas(status="sem_batalha")
    if not await tabela_existe(session):
        # Código no ar antes da migração: nada a fazer, sem barulho.
        return ResultadoFalas(status="sem_tabela")

    topico = await _topico(session, topico_id)
    conteudos = await ConteudoClasseRepository(session).buscar_conteudos_topico(topico_id) if topico else []
    if not topico or not conteudos:
        await session.rollback()
        return ResultadoFalas(status="sem_conteudo")

    source_hash = hash_do_topico(perfil=perfil, topico=topico, conteudos=conteudos)
    gravados = await _hashes_gravados(session, topico_id=topico_id, perfil=perfil)
    if all(gravados.get(int(c["id"])) == source_hash for c in conteudos):
        await session.rollback()
        return ResultadoFalas(status="atual")

    payload = montar_payload(perfil=perfil, topico=topico, conteudos=conteudos)
    # Encerra a leitura antes da chamada externa: não segura transação aberta durante a LLM.
    await session.rollback()

    servico = llm or JsonLLMService(settings)
    try:
        resposta = await asyncio.wait_for(
            servico.ainvoke_structured(prompt_name=PROMPT_NAME, payload=payload, schema=FalasDoTopico),
            timeout=LLM_TIMEOUT_SEC,
        )
    except Exception as exc:  # modelo fora, cota, timeout, schema: o que estava gravado fica.
        logger.warning(
            "Falas do boss nao geradas: topico=%s perfil=%s erro=%s", topico_id, perfil, str(exc)[:300]
        )
        return ResultadoFalas(status="failed", erro=str(exc)[:300])

    esperados = {int(c["id"]) for c in conteudos}
    validos: dict[int, dict[str, Any]] = {}
    for boss in resposta.bosses:
        # Conteúdo que não estava no pedido não entra: o modelo não escolhe onde gravar.
        if boss.conteudo_id not in esperados or boss.conteudo_id in validos:
            continue
        limpo = limpar_falas(boss)
        if limpo:
            validos[boss.conteudo_id] = limpo

    for conteudo_id, limpo in validos.items():
        await _gravar(
            session,
            classe_id=int(topico["classe_id"]),
            topico_id=topico_id,
            conteudo_id=conteudo_id,
            perfil=perfil,
            nome=limpo["nome"],
            falas=limpo["falas"],
            source_hash=source_hash,
        )
    await session.commit()

    if len(validos) < len(esperados):
        logger.warning(
            "Falas do boss parciais: topico=%s perfil=%s validos=%s de %s",
            topico_id,
            perfil,
            len(validos),
            len(esperados),
        )
        return ResultadoFalas(status="parcial" if validos else "failed", gravados=len(validos))
    return ResultadoFalas(status="gerado", gravados=len(validos))
