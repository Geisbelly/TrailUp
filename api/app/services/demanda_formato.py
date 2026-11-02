"""O formato que cada conteúdo pede para ser entendido: uma análise por tópico, no worker.

A preferência do aluno não decide tudo. Um diagrama de circuito precisa ser visto, uma fórmula
precisa estar escrita, pronúncia precisa ser ouvida. É o conteúdo que determina isso, não o
perfil. Este módulo classifica cada conteúdo do tópico em quatro dimensões, cada uma ligada a
formatos do motor de sugestão (``FORMATOS_POR_DIMENSAO``):

* ``visual`` → apresentação;
* ``escrito`` → texto;
* ``sonoro`` → áudio;
* ``pratica`` → cards.

Cada dimensão recebe um nível: ``essencial`` (sem o formato o conteúdo não se entende),
``ajuda`` ou ``indiferente``. O motor (``sugestao_material``) põe o essencial antes da
preferência do aluno e soma um bônus ao que ajuda.

Duas fontes, marcadas em ``origem``:

* ``modelo``: uma chamada ao modelo por tópico, no mesmo molde das falas do boss. Usa versão
  própria e é pulada quando o ``source_hash`` bate. Nunca marca target como ``failed``.
* ``heuristica``: regra fixa (anexo de imagem ou áudio, tabela, código, fórmula, pronúncia). Só
  grava quando o modelo falha e o conteúdo não tem análise do modelo. Não conta como atual, então
  a próxima rodada depois da pausa tenta o modelo de novo.

Análise do professor (``origem = 'professor'``) nunca é sobrescrita. É base por conteúdo: nada do
aluno entra no prompt nem na linha.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.services.llm import JsonLLMService
from app.services.sugestao_material import FORMATOS_POR_DIMENSAO, NIVEIS_DEMANDA

logger = logging.getLogger(__name__)

PROMPT_NAME = "demanda_formato.txt"
# Própria, de propósito: subir `_PERSONALIZACAO_PIPELINE_VERSION` regeraria a mídia de todas as
# turmas. Suba esta quando o prompt ou as dimensões mudarem.
DEMANDA_FORMATO_VERSION = "2026-11-02.1"
# Mesmo motivo das falas do boss: o worker é sequencial e uma chamada pendurada travaria a fila.
LLM_TIMEOUT_SEC = 120.0
TRECHO_MAX = 2500
MOTIVO_MAX = 200

DIMENSOES = tuple(FORMATOS_POR_DIMENSAO)
ORIGENS = ("modelo", "heuristica", "professor")
_ORDEM_NIVEL = {nivel: indice for indice, nivel in enumerate(NIVEIS_DEMANDA)}


class DimensaoAvaliada(BaseModel):
    nivel: str = Field(json_schema_extra={"enum": list(NIVEIS_DEMANDA)})
    motivo: str = ""


class DemandaDoConteudo(BaseModel):
    conteudo_id: int
    visual: DimensaoAvaliada
    escrito: DimensaoAvaliada
    sonoro: DimensaoAvaliada
    pratica: DimensaoAvaliada


class DemandaDoTopico(BaseModel):
    conteudos: list[DemandaDoConteudo] = Field(default_factory=list)


@dataclass
class ResultadoDemanda:
    status: str  # "atual" | "gerado" | "parcial" | "heuristica" | "sem_conteudo" | "sem_tabela"
    gravados: int = 0
    erro: str | None = None


# ---------------------------------------------------------------- texto do conteúdo


def _texto_do_conteudo(conteudo: dict[str, Any]) -> str:
    """Texto do professor e, para conteúdo-arquivo, o texto extraído da fonte."""
    partes = [str(conteudo.get("conteudo") or "")]
    partes.extend(str(t) for t in conteudo.get("textos_fonte") or [] if t)
    return "\n".join(p for p in partes if p.strip())


def _arquivos(conteudo: dict[str, Any]) -> list[str]:
    metadata = conteudo.get("metadata") if isinstance(conteudo.get("metadata"), dict) else {}
    nomes = [str(f.get("name") or "") for f in metadata.get("files") or [] if isinstance(f, dict)]
    return [n.lower() for n in nomes if n]


# ---------------------------------------------------------------- heurística


_EXT_VISUAL = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp4", ".mov", ".webm", ".ppt", ".pptx")
_EXT_SONORO = (".mp3", ".wav", ".ogg", ".m4a", ".aac")
_TABELA = re.compile(r"^\s*\|.*\|\s*$\n^\s*\|[\s:|-]+\|\s*$", re.MULTILINE)
_CODIGO = re.compile(r"```|^\s{4,}\S.*[;{}()]\s*$", re.MULTILINE)
_FORMULA = re.compile(r"\$[^$\n]+\$|\\frac|\\sqrt|\b[a-zA-Z]\s*\^\s*\d|\b[a-z]\s*=\s*[-+]?\d|[=≠≤≥]\s*\d+\s*[+\-×÷*/]\s*\d")
_PALAVRAS_VISUAL = re.compile(
    r"\b(diagrama|gr[aá]fico|figura|mapa|esquema|imagem|ilustra|geometr|[aâ]ngulo|tri[aâ]ngulo|"
    r"circuito|fluxograma|eixo|plano cartesiano|anatomia|organograma|linha do tempo)\w*",
    re.IGNORECASE,
)
_PALAVRAS_SONORO = re.compile(
    r"\b(pron[uú]ncia|pronunci|fon[eé]tic|entona|sotaque|listening|ritmo musical|melodia|"
    r"escuta|ouvir|rima|s[ií]laba t[oô]nica)\w*",
    re.IGNORECASE,
)
_PALAVRAS_PRATICA = re.compile(
    r"\b(exerc[ií]cio|calcule|resolva|pratique|passo a passo|procedimento|treine|aplique|memoriz)\w*",
    re.IGNORECASE,
)


def _avaliar(nivel: str, motivo: str) -> dict[str, str]:
    return {"nivel": nivel, "motivo": motivo}


def demanda_heuristica(conteudo: dict[str, Any]) -> dict[str, dict[str, str]]:
    """Regra fixa para quando o modelo não responde. Conservadora de propósito.

    Só marca ``essencial`` com sinal estrutural (anexo de imagem, vídeo ou áudio, tabela, código,
    fórmula). Palavra solta no texto dá no máximo ``ajuda``: "gráfico" numa frase não quer dizer
    que o conteúdo dependa de um gráfico.
    """
    texto = _texto_do_conteudo(conteudo)
    arquivos = _arquivos(conteudo)
    demanda = {dim: _avaliar("indiferente", "") for dim in DIMENSOES}

    if any(n.endswith(_EXT_VISUAL) for n in arquivos):
        demanda["visual"] = _avaliar("essencial", "o conteúdo traz imagem, vídeo ou slides anexados")
    elif _TABELA.search(texto):
        demanda["visual"] = _avaliar("essencial", "o conteúdo é organizado em tabela")
    elif len(set(m.lower() for m in _PALAVRAS_VISUAL.findall(texto))) >= 2:
        demanda["visual"] = _avaliar("ajuda", "o conteúdo fala de elementos visuais")

    if _CODIGO.search(texto):
        demanda["escrito"] = _avaliar("essencial", "o conteúdo tem código para ler com calma")
    elif _FORMULA.search(texto):
        demanda["escrito"] = _avaliar("essencial", "o conteúdo tem fórmulas para ler com calma")
    elif len(texto) >= 1500:
        demanda["escrito"] = _avaliar("ajuda", "o conteúdo é longo e detalhado")

    if any(n.endswith(_EXT_SONORO) for n in arquivos):
        demanda["sonoro"] = _avaliar("essencial", "o conteúdo traz áudio anexado")
    elif _PALAVRAS_SONORO.search(texto):
        demanda["sonoro"] = _avaliar("ajuda", "o conteúdo trata de som ou pronúncia")

    if _PALAVRAS_PRATICA.search(texto):
        demanda["pratica"] = _avaliar("ajuda", "o conteúdo pede prática")
    return demanda


# ---------------------------------------------------------------- modelo


def limpar_demanda(item: DemandaDoConteudo) -> dict[str, dict[str, str]]:
    """Demanda que pode ir para o banco. Nível fora do vocabulário vira ``indiferente``.

    Rebaixar em vez de descartar: as outras dimensões do mesmo conteúdo continuam valendo, e
    nível inventado nunca vira camada no motor.
    """
    demanda: dict[str, dict[str, str]] = {}
    for dimensao in DIMENSOES:
        avaliada: DimensaoAvaliada = getattr(item, dimensao)
        nivel = str(avaliada.nivel or "").strip().lower()
        motivo = re.sub(r"\s+", " ", str(avaliada.motivo or "")).strip()[:MOTIVO_MAX]
        if nivel not in _ORDEM_NIVEL:
            nivel, motivo = "indiferente", ""
        demanda[dimensao] = _avaliar(nivel, motivo if nivel != "indiferente" else "")
    return demanda


def hash_do_topico(*, topico: dict[str, Any], conteudos: list[dict[str, Any]]) -> str:
    """Hash do que entra no prompt: igual, a análise é pulada."""
    material = {
        "versao": DEMANDA_FORMATO_VERSION,
        "topico": [topico.get("nome"), topico.get("descricao")],
        "conteudos": [
            [int(c["id"]), c.get("titulo"), c.get("tipo"), _texto_do_conteudo(c)[:TRECHO_MAX], _arquivos(c)]
            for c in conteudos
        ],
    }
    bruto = json.dumps(material, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(bruto.encode("utf-8")).hexdigest()


def montar_payload(*, topico: dict[str, Any], conteudos: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "topico": {"nome": topico.get("nome"), "descricao": topico.get("descricao")},
        "dimensoes": {dim: list(formatos) for dim, formatos in FORMATOS_POR_DIMENSAO.items()},
        "niveis": list(NIVEIS_DEMANDA),
        "conteudos": [
            {
                "conteudo_id": int(c["id"]),
                "titulo": c.get("titulo"),
                "tipo": c.get("tipo"),
                "arquivos": _arquivos(c),
                "trecho": _texto_do_conteudo(c)[:TRECHO_MAX],
            }
            for c in conteudos
        ],
    }


# ---------------------------------------------------------------- agregado para o motor


def agregar_do_topico(linhas: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Junta a análise dos conteúdos do tópico no formato que ``sugestao_material`` lê.

    Por dimensão vale o nível mais forte entre os conteúdos: se um conteúdo do tópico depende de
    diagrama, o tópico depende. ``conteudos`` diz quais, e ``motivo`` vem do primeiro deles.
    ``assinatura`` muda quando qualquer análise muda; é o que o log grava para auditar com que
    análise a ordem foi decidida.
    """
    linhas = [linha for linha in linhas if isinstance(linha.get("demanda"), dict)]
    if not linhas:
        return None
    linhas = sorted(linhas, key=lambda linha: int(linha["conteudo_id"]))
    dimensoes: dict[str, dict[str, Any]] = {}
    for dimensao in DIMENSOES:
        melhor = len(NIVEIS_DEMANDA) - 1
        motivo = ""
        ids: list[int] = []
        for linha in linhas:
            dado = linha["demanda"].get(dimensao) or {}
            ordem = _ORDEM_NIVEL.get(str(dado.get("nivel") or "").lower(), len(NIVEIS_DEMANDA) - 1)
            if ordem < melhor:
                melhor, motivo, ids = ordem, str(dado.get("motivo") or ""), [int(linha["conteudo_id"])]
            elif ordem == melhor and ordem < len(NIVEIS_DEMANDA) - 1:
                ids.append(int(linha["conteudo_id"]))
        dimensoes[dimensao] = {"nivel": NIVEIS_DEMANDA[melhor], "motivo": motivo, "conteudos": ids}

    origens = {str(linha.get("origem") or "") for linha in linhas}
    origem = origens.pop() if len(origens) == 1 else "misto"
    versoes = sorted({str(linha.get("versao") or "") for linha in linhas})
    assinatura = hashlib.sha256(
        json.dumps(
            [[int(linha["conteudo_id"]), linha.get("origem"), linha.get("source_hash"), linha["demanda"]] for linha in linhas],
            ensure_ascii=False,
            sort_keys=True,
            default=str,
        ).encode("utf-8")
    ).hexdigest()[:16]
    return {
        "origem": origem,
        "versao": versoes[0] if len(versoes) == 1 else versoes,
        "assinatura": assinatura,
        "dimensoes": dimensoes,
    }


# ---------------------------------------------------------------- banco


async def tabela_existe(session: AsyncSession) -> bool:
    result = await session.execute(text("SELECT to_regclass('public.conteudo_demanda_formato') IS NOT NULL"))
    return bool(result.scalar_one())


async def _topico(session: AsyncSession, topico_id: int) -> dict[str, Any] | None:
    result = await session.execute(
        text("SELECT id, nome, descricao, classe_id FROM topicos WHERE id = :id"),
        {"id": topico_id},
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def _textos_das_fontes(session: AsyncSession, conteudo_ids: list[int]) -> dict[int, list[str]]:
    """Texto extraído dos arquivos do professor, por conteúdo. Só fonte da classe, nunca do aluno."""
    if not conteudo_ids:
        return {}
    result = await session.execute(
        text(
            """
            SELECT conteudo_id, descricao
            FROM public.fontes_personalizacao
            WHERE conteudo_id = ANY(CAST(:ids AS bigint[]))
              AND visibilidade = 'classe'
              AND NULLIF(BTRIM(descricao), '') IS NOT NULL
              AND descricao !~* '^https?://'
            ORDER BY conteudo_id, id
            """
        ),
        {"ids": conteudo_ids},
    )
    textos: dict[int, list[str]] = {}
    for row in result:
        textos.setdefault(int(row.conteudo_id), []).append(str(row.descricao))
    return textos


async def _gravadas(session: AsyncSession, *, topico_id: int) -> dict[int, dict[str, Any]]:
    result = await session.execute(
        text(
            "SELECT conteudo_id, origem, source_hash FROM public.conteudo_demanda_formato "
            "WHERE topico_id = :topico_id"
        ),
        {"topico_id": topico_id},
    )
    return {int(row.conteudo_id): {"origem": row.origem, "source_hash": row.source_hash} for row in result}


async def ler_do_topico(session: AsyncSession, topico_id: int) -> dict[str, Any] | None:
    """Agregado do tópico para o motor, ou None sem análise (ou sem a tabela ainda)."""
    if not await tabela_existe(session):
        return None
    result = await session.execute(
        text(
            "SELECT conteudo_id, demanda, origem, source_hash, versao "
            "FROM public.conteudo_demanda_formato WHERE topico_id = :topico_id"
        ),
        {"topico_id": topico_id},
    )
    return agregar_do_topico([dict(row) for row in result.mappings()])


async def _gravar(
    session: AsyncSession,
    *,
    classe_id: int,
    topico_id: int,
    conteudo_id: int,
    demanda: dict[str, Any],
    origem: str,
    source_hash: str,
) -> None:
    # `WHERE origem <> 'professor'` no próprio UPSERT: a escolha do professor vence mesmo que ele
    # a grave durante a chamada ao modelo.
    await session.execute(
        text(
            """
            INSERT INTO public.conteudo_demanda_formato
              (classe_id, topico_id, conteudo_id, demanda, origem, source_hash, versao, gerado_em)
            VALUES
              (:classe_id, :topico_id, :conteudo_id, CAST(:demanda AS jsonb), :origem,
               :source_hash, :versao, now())
            ON CONFLICT (conteudo_id) DO UPDATE SET
              classe_id = EXCLUDED.classe_id,
              topico_id = EXCLUDED.topico_id,
              demanda = EXCLUDED.demanda,
              origem = EXCLUDED.origem,
              source_hash = EXCLUDED.source_hash,
              versao = EXCLUDED.versao,
              gerado_em = now()
            WHERE public.conteudo_demanda_formato.origem <> 'professor'
            """
        ),
        {
            "classe_id": classe_id,
            "topico_id": topico_id,
            "conteudo_id": conteudo_id,
            "demanda": json.dumps(demanda, ensure_ascii=False),
            "origem": origem,
            "source_hash": source_hash,
            "versao": DEMANDA_FORMATO_VERSION,
        },
    )


# ---------------------------------------------------------------- orquestração


async def analisar_demanda_do_topico(
    *,
    session: AsyncSession,
    settings: Settings,
    topico_id: int,
    llm: JsonLLMService | None = None,
) -> ResultadoDemanda:
    if not await tabela_existe(session):
        # Código no ar antes da migração: nada a fazer, sem barulho.
        return ResultadoDemanda(status="sem_tabela")

    topico = await _topico(session, topico_id)
    conteudos = await ConteudoClasseRepository(session).buscar_conteudos_topico(topico_id) if topico else []
    if not topico or not conteudos:
        await session.rollback()
        return ResultadoDemanda(status="sem_conteudo")

    textos = await _textos_das_fontes(session, [int(c["id"]) for c in conteudos])
    conteudos = [{**c, "textos_fonte": textos.get(int(c["id"]), [])} for c in conteudos]
    source_hash = hash_do_topico(topico=topico, conteudos=conteudos)
    gravadas = await _gravadas(session, topico_id=topico_id)
    # Heurística não conta como atual: depois da pausa o modelo é tentado de novo.
    pendentes = [
        c
        for c in conteudos
        if (g := gravadas.get(int(c["id"]))) is None
        or (g["origem"] != "professor" and (g["origem"] != "modelo" or g["source_hash"] != source_hash))
    ]
    if not pendentes:
        await session.rollback()
        return ResultadoDemanda(status="atual")

    payload = montar_payload(topico=topico, conteudos=conteudos)
    # Encerra a leitura antes da chamada externa: não segura transação aberta durante a LLM.
    await session.rollback()

    servico = llm or JsonLLMService(settings)
    validas: dict[int, dict[str, Any]] = {}
    erro: str | None = None
    try:
        resposta = await asyncio.wait_for(
            servico.ainvoke_structured(prompt_name=PROMPT_NAME, payload=payload, schema=DemandaDoTopico),
            timeout=LLM_TIMEOUT_SEC,
        )
        esperados = {int(c["id"]) for c in pendentes}
        for item in resposta.conteudos:
            # O modelo não escolhe onde gravar.
            if item.conteudo_id in esperados and item.conteudo_id not in validas:
                validas[item.conteudo_id] = limpar_demanda(item)
    except Exception as exc:  # modelo fora, cota, timeout, schema: cai na regra fixa.
        erro = str(exc)[:300]
        logger.warning("Demanda de formato sem modelo: topico=%s erro=%s", topico_id, erro)

    gravados = 0
    for conteudo in pendentes:
        conteudo_id = int(conteudo["id"])
        if conteudo_id in validas:
            demanda, origem = validas[conteudo_id], "modelo"
        elif gravadas.get(conteudo_id, {}).get("origem") == "modelo":
            # Análise antiga do modelo vale mais que a regra fixa; fica até o modelo voltar.
            continue
        else:
            demanda, origem = demanda_heuristica(conteudo), "heuristica"
        await _gravar(
            session,
            classe_id=int(topico["classe_id"]),
            topico_id=topico_id,
            conteudo_id=conteudo_id,
            demanda=demanda,
            origem=origem,
            source_hash=source_hash,
        )
        gravados += 1
    await session.commit()

    if len(validas) == len(pendentes):
        return ResultadoDemanda(status="gerado", gravados=gravados)
    if validas:
        return ResultadoDemanda(status="parcial", gravados=gravados, erro=erro)
    return ResultadoDemanda(status="heuristica", gravados=gravados, erro=erro)
