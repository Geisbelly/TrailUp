"""Fase 6: reescreve o texto da missão diária por coorte, com Gemini, sem tocar no que ela mede.

A missão já existe quando este código roda: a fase 5b a gravou às 0h de Brasília com texto de
molde (`fn_missao_diaria_gerar`). Aqui só se troca **título e descrição**, e só quando o texto
novo passa nas checagens abaixo. Qualquer falha — LLM fora, cota, resposta fora do formato,
texto que muda a meta — deixa o molde no lugar. O aluno nunca fica sem missão por causa da LLM.

O banco é quem garante a parte que importa: `fn_missao_diaria_reescrever_texto` só altera
título/descrição (a guarda de `missoes` congela critério, recompensa e janela também nesse
caminho), uma vez por missão, e só enquanto o dia não acabou. Este módulo é a segunda trava:
não manda para o banco um texto que diga outra coisa que não a meta.
"""

from __future__ import annotations

import asyncio
import logging
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.services.llm import JsonLLMService

logger = logging.getLogger(__name__)

JOB_KIND_MISSAO_DIARIA = "missao_diaria"
PROMPT_NAME = "missao_diaria_texto.txt"
# O worker é sequencial: uma chamada pendurada travaria a fila inteira de personalização.
LLM_TIMEOUT_SEC = 90.0

TITULO_MIN, TITULO_MAX = 3, 60
DESCRICAO_MIN, DESCRICAO_MAX = 10, 200

# Tom por perfil BrainHex. O vocabulário vem do mesmo recorte que o material base usa.
TOM_DO_PERFIL: dict[str, str] = {
    "seeker": "curiosidade e descoberta: explorar, encontrar algo novo",
    "survivor": "superar a tensão: encarar o que parece difícil e seguir em frente",
    "daredevil": "energia e ritmo: ir rápido, aceitar o desafio do dia",
    "mastermind": "estratégia: planejar o estudo e resolver com método",
    "conqueror": "superação: vencer um obstáculo e provar a si mesmo",
    "socializer": "pertencimento: fazer parte do ritmo da turma (a missão continua sendo individual)",
    "achiever": "completar e colecionar: fechar a meta do dia e ver o progresso",
}

# Unidade que a descrição TEM de citar, por (métrica, filtro de evento). Sem ela, um texto
# bonito pode pedir "10 exercícios" numa missão que conta minutos.
_UNIDADES: dict[tuple[str, str | None], tuple[str, tuple[str, ...]]] = {
    ("minutos_no_dia", None): ("minutos de estudo hoje", ("minuto",)),
    ("eventos_no_dia", "atividade_concluida"): ("atividades concluidas hoje", ("atividade",)),
    ("eventos_no_dia", "conteudo_concluido"): ("conteudos concluidos hoje", ("conteudo",)),
    ("eventos_no_dia", None): ("acoes na trilha hoje", ("acao", "acoes", "trilha")),
}

# Número por extenso que contradiria o alvo em algarismos. "um/uma" ficam de fora: são artigo.
_NUMEROS_POR_EXTENSO = re.compile(
    r"\b(dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|"
    r"quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|"
    r"cem|cento|mil|dobro|triplo|metade)\b"
)
_PROIBIDO = re.compile(r"[<>{}`*#\[\]]|https?://|www\.")
_RECOMPENSA = re.compile(r"\b(moedas?|pontos?|xp|premios?|ranking)\b")


class TextoMissao(BaseModel):
    slot: int
    titulo: str
    descricao: str


class TextoMissoesDiarias(BaseModel):
    missoes: list[TextoMissao]


@dataclass
class ResultadoCoorte:
    status: str  # "completed" | "failed"
    lidas: int = 0
    reescritas: int = 0
    mantidas: dict[int, str] = field(default_factory=dict)  # slot -> motivo
    erro: str | None = None

    def last_error(self) -> str | None:
        if self.erro:
            return self.erro
        if self.mantidas:
            motivos = "; ".join(f"slot {slot}: {motivo}" for slot, motivo in sorted(self.mantidas.items()))
            return f"{len(self.mantidas)} de {self.lidas} no texto do molde ({motivos})"
        return None


def _sem_acento(valor: str) -> str:
    normalizado = unicodedata.normalize("NFKD", valor)
    return "".join(c for c in normalizado if not unicodedata.combining(c)).lower()


def _limpar(valor: Any) -> str:
    return re.sub(r"\s+", " ", str(valor or "")).strip()


def alvo_e_unidade(criterio: dict[str, Any]) -> tuple[int, str, tuple[str, ...]] | None:
    """O número e a unidade que a missão mede, lidos do critério — nunca do texto do molde."""
    metrica = str(criterio.get("metrica") or "")
    evento = criterio.get("evento") or None
    chave = "minutos" if metrica == "minutos_no_dia" else "minimo"
    unidade = _UNIDADES.get((metrica, evento))
    if unidade is None:
        return None
    try:
        alvo = int(str(criterio.get(chave)))
    except (TypeError, ValueError):
        return None
    if alvo <= 0:
        return None
    return alvo, unidade[0], unidade[1]


def validar_texto(titulo: Any, descricao: Any, criterio: dict[str, Any]) -> tuple[str, str] | str:
    """Devolve (título, descrição) limpos, ou o motivo de recusa. Recusar é manter o molde."""
    meta = alvo_e_unidade(criterio)
    if meta is None:
        return "metrica_sem_alvo_conhecido"
    alvo, _, radicais = meta

    titulo_limpo = _limpar(titulo)
    descricao_limpa = _limpar(descricao)
    if not TITULO_MIN <= len(titulo_limpo) <= TITULO_MAX:
        return "titulo_fora_do_tamanho"
    if not DESCRICAO_MIN <= len(descricao_limpa) <= DESCRICAO_MAX:
        return "descricao_fora_do_tamanho"

    junto = f"{titulo_limpo} {descricao_limpa}"
    plano = _sem_acento(junto)
    if _PROIBIDO.search(junto):
        return "marcacao_ou_link"
    if _RECOMPENSA.search(plano):
        return "fala_de_recompensa"

    numeros = re.findall(r"\d+(?:[.,]\d+)?", junto)
    if any(numero != str(alvo) for numero in numeros):
        return "numero_diferente_do_alvo"
    if str(alvo) not in re.findall(r"\d+", descricao_limpa):
        return "descricao_sem_o_alvo"
    if _NUMEROS_POR_EXTENSO.search(plano):
        return "numero_por_extenso"
    if not any(radical in _sem_acento(descricao_limpa) for radical in radicais):
        return "descricao_sem_a_unidade"

    return titulo_limpo, descricao_limpa


def montar_payload(*, materia: str | None, perfil: str, missoes: list[dict[str, Any]]) -> dict[str, Any]:
    itens = []
    for missao in missoes:
        meta = alvo_e_unidade(missao["criterio"])
        if meta is None:
            continue
        alvo, unidade, _ = meta
        itens.append(
            {
                "slot": int(missao["slot"]),
                "titulo": missao["titulo"],
                "descricao": missao["descricao"],
                "meta": f"{alvo} {unidade}",
                "alvo": alvo,
                "unidade": unidade,
            }
        )
    return {
        "turma": {"materia": materia or "estudos"},
        "perfil": {"chave": perfil or "geral", "tom": TOM_DO_PERFIL.get(perfil, "encorajador e direto")},
        "missoes": itens,
    }


async def _missoes_da_coorte(session: AsyncSession, *, classe_id: int, perfil: str, dia: date) -> list[dict[str, Any]]:
    result = await session.execute(
        text(
            """
            SELECT m.id, m.slot, m.titulo, m.descricao, m.criterio
              FROM public.missoes m
             WHERE m.classe_id = :classe_id
               AND COALESCE(m.perfil_alvo, '') = :perfil
               AND m.dia = :dia
               AND m.origem = 'sistema'
               AND m.ativa
               AND m.texto_enriquecido_em IS NULL
               AND (m.janela_fim IS NULL OR m.janela_fim > now())
             ORDER BY m.slot
            """
        ),
        {"classe_id": classe_id, "perfil": perfil, "dia": dia},
    )
    return [dict(row) for row in result.mappings()]


async def _materia_da_turma(session: AsyncSession, classe_id: int) -> str | None:
    result = await session.execute(
        text(
            """
            SELECT m.nome
              FROM public.classe c
              LEFT JOIN public.materia m ON m.id = c.materia_id
             WHERE c.id = :classe_id
            """
        ),
        {"classe_id": classe_id},
    )
    return result.scalar_one_or_none()


async def _reescrever(session: AsyncSession, *, missao_id: int, titulo: str, descricao: str, modelo: str) -> bool:
    result = await session.execute(
        text("SELECT public.fn_missao_diaria_reescrever_texto(:id, :titulo, :descricao, :modelo)"),
        {"id": missao_id, "titulo": titulo, "descricao": descricao, "modelo": modelo},
    )
    return bool(result.scalar_one())


async def enriquecer_coorte(
    *,
    session: AsyncSession,
    settings: Settings,
    classe_id: int,
    perfil: str,
    dia: date,
    llm: JsonLLMService | None = None,
) -> ResultadoCoorte:
    missoes = await _missoes_da_coorte(session, classe_id=classe_id, perfil=perfil, dia=dia)
    if not missoes:
        # Dia que já acabou, coorte já reescrita, ou geração que não rodou: nada a fazer, e o
        # que o aluno vê (se vê algo) é o molde.
        return ResultadoCoorte(status="completed")

    resultado = ResultadoCoorte(status="completed", lidas=len(missoes))
    payload = montar_payload(materia=await _materia_da_turma(session, classe_id), perfil=perfil, missoes=missoes)
    # Encerra a leitura antes da chamada externa: não segura transação aberta durante a LLM.
    await session.rollback()

    servico = llm or JsonLLMService(settings)
    try:
        resposta = await asyncio.wait_for(
            servico.ainvoke_structured(
                prompt_name=PROMPT_NAME,
                payload=payload,
                schema=TextoMissoesDiarias,
                provider="gemini",
            ),
            timeout=LLM_TIMEOUT_SEC,
        )
    except Exception as exc:  # LLM fora, cota, timeout, schema: o molde fica, sem exceção.
        logger.warning(
            "Missao diaria fica no texto do molde: classe=%s perfil=%s dia=%s erro=%s",
            classe_id,
            perfil,
            dia,
            str(exc)[:300],
        )
        resultado.status = "failed"
        resultado.erro = f"llm_indisponivel, texto do molde mantido: {str(exc)[:300]}"
        return resultado

    por_slot: dict[int, TextoMissao] = {}
    for item in resposta.missoes:
        por_slot.setdefault(int(item.slot), item)

    modelo = f"gemini/{getattr(settings, 'gemini_model_default', '') or 'desconhecido'}"
    for missao in missoes:
        slot = int(missao["slot"])
        item = por_slot.get(slot)
        if item is None:
            resultado.mantidas[slot] = "slot_ausente_na_resposta"
            continue
        validado = validar_texto(item.titulo, item.descricao, missao["criterio"])
        if isinstance(validado, str):
            resultado.mantidas[slot] = validado
            continue
        titulo, descricao = validado
        if await _reescrever(session, missao_id=int(missao["id"]), titulo=titulo, descricao=descricao, modelo=modelo):
            resultado.reescritas += 1
        else:
            # Entre a leitura e a escrita o dia virou, ou outro job reescreveu: não é sucesso.
            resultado.mantidas[slot] = "banco_recusou_a_reescrita"
    await session.commit()
    return resultado


def _dia_do_payload(payload: dict[str, Any]) -> date:
    return date.fromisoformat(str(payload.get("dia") or ""))


async def processar_job_missao_diaria(
    *,
    session: AsyncSession,
    settings: Settings,
    job: dict[str, Any],
    llm: JsonLLMService | None = None,
) -> ResultadoCoorte:
    payload = job.get("payload") or {}
    try:
        dia = _dia_do_payload(payload)
    except ValueError:
        return ResultadoCoorte(status="failed", erro="payload sem dia valido")
    return await enriquecer_coorte(
        session=session,
        settings=settings,
        classe_id=int(job["classe_id"]),
        perfil=str(payload.get("perfil") or ""),
        dia=dia,
        llm=llm,
    )
