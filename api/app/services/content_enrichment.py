from __future__ import annotations

import json
import math
import re
import time
from typing import Any

from openai import AsyncOpenAI

from app.core.settings import Settings
from app.services.media_contract import CONTENT_ENRICHMENT_PROVIDER

try:
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:  # pragma: no cover
    ChatGoogleGenerativeAI = None
    HumanMessage = None
    SystemMessage = None

_MAX_BLOCKS = 24
_MAX_SEGMENT_CHARS = 4_000
_MIN_EXPANSION_CHARS = 80
_MIN_EXPANSION_RATIO = 0.15
_SCHEMA_VERSION = "trailup.content-blocks.v2"
_DEFAULT_BATCH_SIZE = 1
_DEFAULT_MAX_ATTEMPTS = 3
_DEFAULT_MAX_OUTPUT_TOKENS = 8_192
_DEFAULT_QUOTA_COOLDOWN_SEC = 300
_DEFAULT_GEMINI_QUOTA_COOLDOWN_SEC = 300
_DEFAULT_OPENAI_SPEND_CAP_USD = 1.0

# gpt-4o-mini, preco por token em USD (conferir preco atual antes de confiar
# cegamente — isso e so uma estimativa best-effort, nao a fonte de verdade).
_OPENAI_PRICE_PER_INPUT_TOKEN_USD = 0.15 / 1_000_000
_OPENAI_PRICE_PER_OUTPUT_TOKEN_USD = 0.60 / 1_000_000

# Circuito de indisponibilidade: "insufficient_quota" e um erro permanente (a
# conta ficou sem credito), nao transitorio — retry imediato so desperdica
# chamadas identicas a cada poll do worker de jobs. Espelha o circuito de
# billing hard-limit do microservice (openaiImageService.ts).
_openai_enrichment_unavailable_until: float = 0.0

# Gemini e o provedor PRINCIPAL de enriquecimento (gratuito, sem cobranca —
# ver enrich_content_blocks). Este circuito protege contra rate-limit do
# proprio Gemini, nao contra falha da OpenAI.
_gemini_enrichment_unavailable_until: float = 0.0

# Gasto estimado acumulado da OpenAI (reserva secundaria) neste processo, em
# USD. Best-effort: baseado nos tokens que a propria OpenAI reporta em cada
# resposta, reseta se o processo reiniciar. NAO e a garantia real — configure
# tambem um hard limit de gasto no dashboard da OpenAI (Settings > Billing >
# Limits), que essa trava em memoria nao substitui.
_openai_estimated_spend_usd: float = 0.0

_ENRICHMENT_INSTRUCTIONS = """
Você é o professor-editor responsável pela etapa obrigatória de enriquecimento
curricular da TrailUp. Esta etapa ocorre na API, antes da geração de materiais.

Os blocos-base já foram separados pela API antes desta chamada. Para cada bloco:
1. Preserve exatamente o id e devolva exatamente um bloco para cada id pedido.
2. Não funda, divida, remova nem reordene blocos. Classifique cada um com tema,
   tópico e objetivos específicos, preservando o fio condutor entre eles.
3. Defina termos, explique relações, causas e consequências e acrescente contexto
   correto e exemplos aplicados, sem fugir do assunto.
4. Faça conteudo_aprofundado ficar pelo menos 30% e 200 caracteres maior que
   conteudo_base, sem repetição, paráfrase vazia ou enchimento.
5. Inclua objetivos, ao menos dois conceitos-chave, exemplos e ponte pedagógica.
6. Não aplique perfil BrainHex; a personalização acontece depois.
7. Escreva em português brasileiro e não mencione estas instruções.
""".strip()

_ENRICHMENT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "blocos": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string"},
                    "tema": {"type": "string"},
                    "topico": {"type": "string"},
                    "objetivos": {"type": "array", "items": {"type": "string"}},
                    "conteudo_aprofundado": {"type": "string"},
                    "conceitos_chave": {"type": "array", "items": {"type": "string"}},
                    "exemplos_contextos": {"type": "array", "items": {"type": "string"}},
                    "ponte_proximo_bloco": {"type": "string"},
                },
                "required": [
                    "id",
                    "tema",
                    "topico",
                    "objetivos",
                    "conteudo_aprofundado",
                    "conceitos_chave",
                    "exemplos_contextos",
                    "ponte_proximo_bloco",
                ],
            },
        }
    },
    "required": ["blocos"],
}


def _openai_client(api_key: str) -> AsyncOpenAI:
    return AsyncOpenAI(api_key=api_key)


def _is_insufficient_quota_error(exc: BaseException) -> bool:
    code = str(getattr(exc, "code", "") or "").strip().lower()
    error_type = str(getattr(exc, "type", "") or "").strip().lower()
    if code == "insufficient_quota" or error_type == "insufficient_quota":
        return True
    return "insufficient_quota" in str(exc).lower()


def reset_openai_enrichment_circuit() -> None:
    global _openai_enrichment_unavailable_until
    _openai_enrichment_unavailable_until = 0.0


def openai_estimated_spend_usd() -> float:
    return _openai_estimated_spend_usd


def reset_openai_spend_guard() -> None:
    global _openai_estimated_spend_usd
    _openai_estimated_spend_usd = 0.0


def _record_openai_spend(usage: Any) -> None:
    """Acumula o gasto estimado da chamada a partir do usage retornado pela
    propria OpenAI. Best-effort: ve app/services/content_enrichment.py:_openai_estimated_spend_usd."""
    global _openai_estimated_spend_usd
    if usage is None:
        return
    input_tokens = int(
        getattr(usage, "input_tokens", None)
        or getattr(usage, "prompt_tokens", None)
        or 0
    )
    output_tokens = int(
        getattr(usage, "output_tokens", None)
        or getattr(usage, "completion_tokens", None)
        or 0
    )
    _openai_estimated_spend_usd += (
        input_tokens * _OPENAI_PRICE_PER_INPUT_TOKEN_USD
        + output_tokens * _OPENAI_PRICE_PER_OUTPUT_TOKEN_USD
    )


def _gemini_client(api_key: str, model: str) -> Any:
    if ChatGoogleGenerativeAI is None:
        return None
    return ChatGoogleGenerativeAI(model=model, temperature=0, google_api_key=api_key)


def _is_gemini_quota_error(exc: BaseException) -> bool:
    status = str(getattr(exc, "status_code", "") or getattr(exc, "code", "") or "").strip()
    text = str(exc).lower()
    if status in {"429", "RESOURCE_EXHAUSTED"}:
        return True
    return "resource_exhausted" in text or "quota" in text


def reset_gemini_enrichment_circuit() -> None:
    global _gemini_enrichment_unavailable_until
    _gemini_enrichment_unavailable_until = 0.0


class ContentEnrichmentError(RuntimeError):
    """Falha que deve interromper a geração de mídia, nunca produzir fallback raso."""


def _text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _join_fields(*values: tuple[str, Any]) -> str:
    """Combina todos os campos informativos sem descartar os campos secundários."""
    parts: list[str] = []
    seen: set[str] = set()
    for label, value in values:
        normalized = str(value or "").strip()
        signature = _text(normalized).casefold()
        if not normalized or signature in seen:
            continue
        seen.add(signature)
        parts.append(f"{label}:\n{normalized}" if label else normalized)
    return "\n\n".join(parts)


def _chunk_without_truncation(value: str) -> list[str]:
    """Divide um trecho grande em limites naturais sem omitir caracteres."""
    remaining = value.strip()
    chunks: list[str] = []
    while len(remaining) > _MAX_SEGMENT_CHARS:
        boundary = remaining.rfind(" ", 0, _MAX_SEGMENT_CHARS + 1)
        if boundary < (_MAX_SEGMENT_CHARS // 2):
            boundary = _MAX_SEGMENT_CHARS
        chunk = remaining[:boundary].strip()
        if chunk:
            chunks.append(chunk)
        remaining = remaining[boundary:].strip()
    if remaining:
        chunks.append(remaining)
    return chunks


def _split_sections(value: Any) -> list[str]:
    raw = str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not raw:
        return []
    sections = [
        part.strip() for part in re.split(r"\n[ \t]*\n|(?=^#{1,4}[ \t]+)", raw, flags=re.MULTILINE) if part.strip()
    ]
    chunks: list[str] = []
    for section in sections:
        chunks.extend(_chunk_without_truncation(section))
    return chunks


def _source_segments(context: dict[str, Any]) -> list[dict[str, Any]]:
    class_content = context.get("conteudo_classe") if isinstance(context.get("conteudo_classe"), dict) else {}
    topic = class_content.get("topico") if isinstance(class_content.get("topico"), dict) else {}
    contents = class_content.get("conteudos") if isinstance(class_content.get("conteudos"), list) else []
    activities = class_content.get("atividades") if isinstance(class_content.get("atividades"), list) else []
    sources = context.get("fontes_contexto") if isinstance(context.get("fontes_contexto"), list) else []

    segments: list[dict[str, Any]] = []

    def append(*, source_id: str, title: str, body: Any, kind: str) -> None:
        sections = _split_sections(body)
        for order, section in enumerate(sections, start=1):
            segments.append(
                {
                    "segment_id": f"segmento-{len(segments) + 1:04d}",
                    "source_id": source_id,
                    "source_kind": kind,
                    "source_title": title or source_id,
                    "source_order": order,
                    "text": section,
                }
            )

    append(
        source_id=f"topico:{context.get('topico_id') or 0}",
        title=_text(topic.get("nome") or topic.get("titulo")) or "Tema",
        body=_join_fields(
            ("Descrição", topic.get("descricao")),
            ("Objetivo", topic.get("objetivo")),
        ),
        kind="topic",
    )
    for item in contents:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id") or len(segments) + 1
        append(
            source_id=f"conteudo:{item_id}",
            title=_text(item.get("titulo") or item.get("nome")) or f"Conteúdo {item_id}",
            body=_join_fields(
                ("Conteúdo", item.get("conteudo")),
                ("Texto extraído", item.get("texto_extraido")),
                ("Descrição", item.get("descricao")),
                ("Resumo", item.get("resumo")),
            ),
            kind="content",
        )
    for item in activities:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id") or len(segments) + 1
        append(
            source_id=f"atividade:{item_id}",
            title=_text(item.get("titulo")) or f"Atividade {item_id}",
            body=_join_fields(
                ("Enunciado", item.get("enunciado")),
                ("Descrição", item.get("descricao")),
                ("Orientações", item.get("orientacoes")),
            ),
            kind="activity",
        )
    for item in sources:
        if not isinstance(item, dict):
            continue
        source_id = _text(item.get("source_id") or f"fonte:{item.get('id') or len(segments) + 1}")
        append(
            source_id=source_id,
            title=_text(item.get("titulo") or item.get("nome_arquivo")) or "Fonte complementar",
            body=_join_fields(
                ("Texto extraído", item.get("texto_extraido")),
                ("Texto-base", item.get("texto_base")),
                ("Descrição", item.get("descricao")),
            ),
            kind=_text(item.get("tipo")) or "source",
        )

    return segments


def _unique_texts(values: list[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = _text(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _group_segments(
    context: dict[str, Any],
    segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Agrupa sequencialmente em no máximo 24 blocos, mantendo todos os segmentos."""
    if not segments:
        raise ContentEnrichmentError("Nenhum texto-base foi encontrado para decompor e aprofundar.")

    group_count = min(_MAX_BLOCKS, len(segments))
    groups: list[list[dict[str, Any]]] = []
    cursor = 0
    for group_index in range(group_count):
        remaining_groups = group_count - group_index
        remaining = segments[cursor:]
        remaining_chars = sum(len(str(item.get("text") or "")) for item in remaining)
        target_chars = max(1, math.ceil(remaining_chars / remaining_groups))
        group: list[dict[str, Any]] = []
        group_chars = 0

        while cursor < len(segments):
            segments_after = len(segments) - (cursor + 1)
            groups_after = remaining_groups - 1
            if group and group_chars >= target_chars:
                break
            if group and segments_after < groups_after:
                break
            segment = segments[cursor]
            group.append(segment)
            group_chars += len(str(segment.get("text") or ""))
            cursor += 1

        groups.append(group)

    if cursor != len(segments) or any(not group for group in groups):
        raise ContentEnrichmentError("Falha interna ao agrupar todos os segmentos de origem.")

    class_content = context.get("conteudo_classe") if isinstance(context.get("conteudo_classe"), dict) else {}
    topic = class_content.get("topico") if isinstance(class_content.get("topico"), dict) else {}
    theme = _text(topic.get("nome") or topic.get("titulo")) or "Conteúdo de estudo"
    objective = _text(topic.get("objetivo"))

    blocks: list[dict[str, Any]] = []
    for index, group in enumerate(groups, start=1):
        titles = _unique_texts([item.get("source_title") for item in group])
        source_ids = _unique_texts([item.get("source_id") for item in group])
        base_parts: list[str] = []
        for segment in group:
            label = _text(segment.get("source_title"))
            order = int(segment.get("source_order") or 1)
            base_parts.append(f"[{label} — trecho {order}]\n{str(segment.get('text') or '').strip()}")
        blocks.append(
            {
                "id": f"bloco-{index:02d}",
                "ordem": index,
                "tema": theme,
                "topico": " + ".join(titles) or f"Bloco {index}",
                "objetivos": [objective] if objective else [],
                "conteudo_base": "\n\n".join(base_parts),
                "source_ids": source_ids,
                "segment_ids": [str(item["segment_id"]) for item in group],
            }
        )
    return blocks


def _normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return _unique_texts(value)


def _nonnegative_int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _minimum_expanded_length(base: str) -> int:
    return len(base) + max(
        _MIN_EXPANSION_CHARS,
        math.ceil(len(base) * _MIN_EXPANSION_RATIO),
    )


def _validate_enrichment_response(
    *,
    raw: Any,
    base_blocks: list[dict[str, Any]],
    source_hash: str,
) -> list[dict[str, Any]]:
    if not isinstance(raw, dict):
        raise ContentEnrichmentError("OpenAI retornou enriquecimento fora do formato JSON.")
    if raw.get("schema_version") != _SCHEMA_VERSION:
        raise ContentEnrichmentError("OpenAI retornou versão inválida do enriquecimento.")
    if str(raw.get("source_hash") or "") != source_hash:
        raise ContentEnrichmentError("OpenAI retornou enriquecimento de outra fonte.")
    metadata = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
    if metadata.get("fallback") is not False:
        raise ContentEnrichmentError("A API não confirmou enriquecimento real via OpenAI.")
    if metadata.get("provider") != CONTENT_ENRICHMENT_PROVIDER:
        raise ContentEnrichmentError(
            "Enriquecimento incompatível: era esperado o provedor OpenAI."
        )

    candidates = raw.get("blocos")
    if not isinstance(candidates, list) or len(candidates) != len(base_blocks):
        raise ContentEnrichmentError("Enriquecimento não preservou todos os blocos de conteúdo.")

    by_id: dict[str, dict[str, Any]] = {}
    for item in candidates:
        if not isinstance(item, dict):
            raise ContentEnrichmentError("Enriquecimento contém bloco inválido.")
        item_id = _text(item.get("id"))
        if not item_id or item_id in by_id:
            raise ContentEnrichmentError("Enriquecimento contém bloco sem identidade única.")
        by_id[item_id] = item

    normalized: list[dict[str, Any]] = []
    covered_sources: set[str] = set()
    expected_sources: set[str] = set()
    for index, base_block in enumerate(base_blocks, start=1):
        block_id = str(base_block["id"])
        item = by_id.get(block_id)
        if item is None:
            raise ContentEnrichmentError(f"Enriquecimento omitiu o bloco {block_id}.")

        base = _text(base_block.get("conteudo_base"))
        response_base = _text(item.get("conteudo_base"))
        expanded = _text(item.get("conteudo_aprofundado"))
        conceitos = _normalize_string_list(item.get("conceitos_chave"))
        exemplos = _normalize_string_list(item.get("exemplos_contextos"))
        objetivos = _normalize_string_list(item.get("objetivos"))
        expected_block_sources = set(_normalize_string_list(base_block.get("source_ids")))
        returned_sources = set(_normalize_string_list(item.get("source_ids")))

        if response_base != base:
            raise ContentEnrichmentError(f"Enriquecimento alterou o conteúdo-base do bloco {block_id}.")
        if returned_sources != expected_block_sources:
            raise ContentEnrichmentError(f"Enriquecimento perdeu a rastreabilidade do bloco {block_id}.")
        if expanded.casefold() == base.casefold():
            raise ContentEnrichmentError(f"Enriquecimento raso: o bloco {block_id} apenas repetiu o original.")
        if len(expanded) < _minimum_expanded_length(base):
            raise ContentEnrichmentError(f"Enriquecimento insuficiente no bloco {block_id}: conteúdo não foi ampliado.")
        if len(conceitos) < 2 or not exemplos or not objetivos:
            raise ContentEnrichmentError(
                f"Enriquecimento insuficiente no bloco {block_id}: faltam conceitos, objetivos ou exemplos."
            )

        expected_sources.update(expected_block_sources)
        covered_sources.update(returned_sources)
        normalized.append(
            {
                "id": block_id,
                "ordem": index,
                "tema": _text(item.get("tema")) or str(base_block.get("tema") or ""),
                "topico": _text(item.get("topico")) or str(base_block.get("topico") or f"Bloco {index}"),
                "objetivos": objetivos,
                "conteudo_base": base,
                "conteudo_aprofundado": expanded,
                "conceitos_chave": conceitos,
                "exemplos_contextos": exemplos,
                "ponte_proximo_bloco": _text(item.get("ponte_proximo_bloco")),
                "source_ids": _normalize_string_list(base_block.get("source_ids")),
            }
        )

    if covered_sources != expected_sources:
        raise ContentEnrichmentError("Enriquecimento não cobre todas as fontes usadas na decomposição.")
    return normalized


def _bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return min(maximum, max(minimum, parsed))


def _bounded_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return min(maximum, max(minimum, parsed))


async def _generate_openai_batch(
    *,
    client: AsyncOpenAI,
    model: str,
    topic: dict[str, Any],
    blocks: list[dict[str, Any]],
    attempt: int,
    feedback: str,
    max_output_tokens: int,
    quota_cooldown_sec: int,
    spend_cap_usd: float,
) -> tuple[dict[str, Any], str]:
    global _openai_enrichment_unavailable_until
    if time.time() < _openai_enrichment_unavailable_until:
        raise ContentEnrichmentError(
            "OpenAI em circuito de indisponibilidade: cota insuficiente "
            "detectada recentemente, aguardando cooldown antes de tentar "
            "novamente."
        )
    if _openai_estimated_spend_usd >= spend_cap_usd:
        raise ContentEnrichmentError(
            "OpenAI em circuito de indisponibilidade: gasto estimado "
            f"(${_openai_estimated_spend_usd:.4f}) atingiu o teto configurado "
            f"(${spend_cap_usd:.2f}). Configure um hard limit de billing na "
            "OpenAI e ajuste OPENAI_SPEND_CAP_USD se isso for esperado."
        )
    correction = (
        f"\n\nCORREÇÕES OBRIGATÓRIAS DA TENTATIVA ANTERIOR:\n{feedback}"
        if feedback
        else ""
    )
    input_text = (
        f"TEMA:\n{json.dumps(topic, ensure_ascii=False, indent=2)}\n\n"
        f"BLOCOS-BASE:\n{json.dumps(blocks, ensure_ascii=False, indent=2)}"
        f"{correction}"
    )
    try:
        response = await client.responses.create(
            model=model,
            instructions=_ENRICHMENT_INSTRUCTIONS,
            input=input_text,
            max_output_tokens=max_output_tokens,
            reasoning={"effort": "medium"},
            store=False,
            text={
                "verbosity": "high",
                "format": {
                    "type": "json_schema",
                    "name": "trailup_content_enrichment",
                    "description": "Blocos curriculares aprofundados e rastreáveis.",
                    "strict": True,
                    "schema": _ENRICHMENT_SCHEMA,
                },
            },
        )
    except Exception as exc:
        if _is_insufficient_quota_error(exc):
            _openai_enrichment_unavailable_until = time.time() + quota_cooldown_sec
        raise ContentEnrichmentError(
            f"OpenAI falhou ao aprofundar o lote na tentativa {attempt}: {exc}"
        ) from exc

    _record_openai_spend(getattr(response, "usage", None))

    output_text = str(getattr(response, "output_text", "") or "").strip()
    if not output_text:
        raise ContentEnrichmentError(
            f"OpenAI retornou enriquecimento vazio na tentativa {attempt}."
        )
    try:
        raw = json.loads(output_text)
    except json.JSONDecodeError as exc:
        raise ContentEnrichmentError(
            f"OpenAI retornou JSON inválido na tentativa {attempt}."
        ) from exc
    if not isinstance(raw, dict):
        raise ContentEnrichmentError("OpenAI retornou enriquecimento fora do formato JSON.")
    return raw, str(getattr(response, "model", "") or model)


def _validate_generated_candidate(
    *,
    candidate: Any,
    base_block: dict[str, Any],
    source_hash: str,
) -> dict[str, Any]:
    if not isinstance(candidate, dict):
        raise ContentEnrichmentError(
            f"OpenAI retornou candidato inválido para {base_block['id']}."
        )
    decorated = {
        **candidate,
        "conteudo_base": _text(base_block.get("conteudo_base")),
        "source_ids": list(base_block.get("source_ids") or []),
    }
    result = _validate_enrichment_response(
        raw={
            "schema_version": _SCHEMA_VERSION,
            "source_hash": source_hash,
            "blocos": [decorated],
            "metadata": {
                "provider": CONTENT_ENRICHMENT_PROVIDER,
                "fallback": False,
            },
        },
        base_blocks=[base_block],
        source_hash=source_hash,
    )
    return {
        **result[0],
        "ordem": int(base_block.get("ordem") or 1),
    }


async def _enrich_base_blocks_with_openai(
    *,
    base_blocks: list[dict[str, Any]],
    topic: dict[str, Any],
    source_hash: str,
    settings: Settings,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    api_key = str(getattr(settings, "openai_api_key", "") or "").strip()
    if not api_key:
        raise ContentEnrichmentError(
            "OPENAI_API_KEY ausente: a API não pode dividir e aprofundar o conteúdo."
        )
    model = (
        str(getattr(settings, "openai_content_enrichment_model", "") or "").strip()
        or "gpt-4o-mini"
    )
    # Um bloco por chamada reduz omissões, permite correção localizada e evita
    # gastar tokens regenerando blocos que já passaram pela validação.
    configured_batch_size = _bounded_int(
        getattr(settings, "content_enrichment_batch_size", _DEFAULT_BATCH_SIZE),
        _DEFAULT_BATCH_SIZE,
        1,
        8,
    )
    batch_size = min(configured_batch_size, _DEFAULT_BATCH_SIZE)
    max_attempts = _bounded_int(
        getattr(settings, "content_enrichment_max_attempts", _DEFAULT_MAX_ATTEMPTS),
        _DEFAULT_MAX_ATTEMPTS,
        1,
        4,
    )
    max_output_tokens = _bounded_int(
        getattr(
            settings,
            "openai_content_enrichment_max_output_tokens",
            _DEFAULT_MAX_OUTPUT_TOKENS,
        ),
        _DEFAULT_MAX_OUTPUT_TOKENS,
        8_192,
        16_384,
    )
    quota_cooldown_sec = _bounded_int(
        getattr(
            settings,
            "content_enrichment_quota_cooldown_sec",
            _DEFAULT_QUOTA_COOLDOWN_SEC,
        ),
        _DEFAULT_QUOTA_COOLDOWN_SEC,
        1,
        3_600,
    )
    spend_cap_usd = _bounded_float(
        getattr(settings, "openai_spend_cap_usd", _DEFAULT_OPENAI_SPEND_CAP_USD),
        _DEFAULT_OPENAI_SPEND_CAP_USD,
        0.0,
        1_000.0,
    )
    client = _openai_client(api_key)
    enriched_by_id: dict[str, dict[str, Any]] = {}
    calls = 0
    models: set[str] = set()

    for start in range(0, len(base_blocks), batch_size):
        pending = list(base_blocks[start : start + batch_size])
        feedback = ""
        for attempt in range(1, max_attempts + 1):
            raw, used_model = await _generate_openai_batch(
                client=client,
                model=model,
                topic=topic,
                blocks=pending,
                attempt=attempt,
                feedback=feedback,
                max_output_tokens=max_output_tokens,
                quota_cooldown_sec=quota_cooldown_sec,
                spend_cap_usd=spend_cap_usd,
            )
            calls += 1
            models.add(used_model)
            candidates = raw.get("blocos")
            indexed = {
                _text(item.get("id")): item
                for item in candidates
                if isinstance(item, dict) and _text(item.get("id"))
            } if isinstance(candidates, list) else {}
            failures: list[tuple[dict[str, Any], str]] = []
            for block in pending:
                block_id = str(block["id"])
                candidate = indexed.get(block_id)
                try:
                    enriched_by_id[block_id] = _validate_generated_candidate(
                        candidate=candidate,
                        base_block=block,
                        source_hash=source_hash,
                    )
                except ContentEnrichmentError as exc:
                    base_length = len(_text(block.get("conteudo_base")))
                    received_length = len(
                        _text(candidate.get("conteudo_aprofundado"))
                        if isinstance(candidate, dict)
                        else ""
                    )
                    target = max(base_length + 200, math.ceil(base_length * 1.3))
                    failures.append(
                        (
                            block,
                            f"{block_id}: {exc} Base={base_length}, resposta="
                            f"{received_length}; reescreva com no mínimo {target} "
                            "caracteres, definições, causas, consequências e exemplo.",
                        )
                    )
            pending = [block for block, _message in failures]
            feedback = "\n".join(message for _block, message in failures)
            if not pending:
                break
            if attempt == max_attempts:
                raise ContentEnrichmentError(
                    "OpenAI não aprofundou todos os blocos após "
                    f"{max_attempts} tentativas: {feedback}"
                )

    return (
        [enriched_by_id[str(block["id"])] for block in base_blocks],
        {
            "model": model,
            "models": sorted(models),
            "lotes_gerados": math.ceil(len(base_blocks) / batch_size),
            "chamadas_realizadas": calls,
        },
    )


async def _generate_gemini_batch(
    *,
    client: Any,
    model: str,
    topic: dict[str, Any],
    blocks: list[dict[str, Any]],
    attempt: int,
    feedback: str,
    quota_cooldown_sec: int,
) -> tuple[dict[str, Any], str]:
    global _gemini_enrichment_unavailable_until
    if time.time() < _gemini_enrichment_unavailable_until:
        raise ContentEnrichmentError(
            "Gemini em circuito de indisponibilidade: cota insuficiente "
            "detectada recentemente, aguardando cooldown antes de tentar "
            "novamente."
        )
    correction = (
        f"\n\nCORREÇÕES OBRIGATÓRIAS DA TENTATIVA ANTERIOR:\n{feedback}"
        if feedback
        else ""
    )
    input_text = (
        f"TEMA:\n{json.dumps(topic, ensure_ascii=False, indent=2)}\n\n"
        f"BLOCOS-BASE:\n{json.dumps(blocks, ensure_ascii=False, indent=2)}"
        f"{correction}"
    )
    try:
        # with_structured_output aceita o mesmo JSON Schema usado pela OpenAI
        # (text.format.json_schema) e devolve o dict ja parseado — sem
        # output_text/json.loads manual como no caminho OpenAI.
        structured_client = client.with_structured_output(_ENRICHMENT_SCHEMA)
        raw = await structured_client.ainvoke(
            [
                SystemMessage(content=_ENRICHMENT_INSTRUCTIONS),
                HumanMessage(content=input_text),
            ]
        )
    except Exception as exc:
        if _is_gemini_quota_error(exc):
            _gemini_enrichment_unavailable_until = time.time() + quota_cooldown_sec
        raise ContentEnrichmentError(
            f"Gemini falhou ao aprofundar o lote na tentativa {attempt}: {exc}"
        ) from exc

    if not isinstance(raw, dict):
        raise ContentEnrichmentError(
            f"Gemini retornou enriquecimento fora do formato JSON na tentativa {attempt}."
        )
    return raw, model


async def _enrich_base_blocks_with_gemini(
    *,
    base_blocks: list[dict[str, Any]],
    topic: dict[str, Any],
    source_hash: str,
    settings: Settings,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    api_key = str(getattr(settings, "gemini_api_key", "") or "").strip()
    if not api_key:
        raise ContentEnrichmentError(
            "GEMINI_API_KEY ausente: a API não pode aprofundar o conteúdo via Gemini."
        )
    model = (
        str(getattr(settings, "content_enrichment_gemini_model", "") or "").strip()
        or "gemini-2.5-flash"
    )
    configured_batch_size = _bounded_int(
        getattr(settings, "content_enrichment_batch_size", _DEFAULT_BATCH_SIZE),
        _DEFAULT_BATCH_SIZE,
        1,
        8,
    )
    batch_size = min(configured_batch_size, _DEFAULT_BATCH_SIZE)
    max_attempts = _bounded_int(
        getattr(settings, "content_enrichment_max_attempts", _DEFAULT_MAX_ATTEMPTS),
        _DEFAULT_MAX_ATTEMPTS,
        1,
        4,
    )
    quota_cooldown_sec = _bounded_int(
        getattr(
            settings,
            "content_enrichment_gemini_quota_cooldown_sec",
            _DEFAULT_GEMINI_QUOTA_COOLDOWN_SEC,
        ),
        _DEFAULT_GEMINI_QUOTA_COOLDOWN_SEC,
        1,
        3_600,
    )
    client = _gemini_client(api_key, model)
    if client is None:
        raise ContentEnrichmentError(
            "langchain-google-genai não está instalado: a API não pode "
            "aprofundar o conteúdo via Gemini."
        )
    enriched_by_id: dict[str, dict[str, Any]] = {}
    calls = 0
    models: set[str] = set()

    # Duplica deliberadamente o loop de lotes/retry de _enrich_base_blocks_with_openai
    # (mesma logica, provedor diferente) — evita acoplar os dois caminhos, ja
    # bem cobertos por teste, a uma abstracao compartilhada e mais fragil.
    for start in range(0, len(base_blocks), batch_size):
        pending = list(base_blocks[start : start + batch_size])
        feedback = ""
        for attempt in range(1, max_attempts + 1):
            raw, used_model = await _generate_gemini_batch(
                client=client,
                model=model,
                topic=topic,
                blocks=pending,
                attempt=attempt,
                feedback=feedback,
                quota_cooldown_sec=quota_cooldown_sec,
            )
            calls += 1
            models.add(used_model)
            candidates = raw.get("blocos")
            indexed = {
                _text(item.get("id")): item
                for item in candidates
                if isinstance(item, dict) and _text(item.get("id"))
            } if isinstance(candidates, list) else {}
            failures: list[tuple[dict[str, Any], str]] = []
            for block in pending:
                block_id = str(block["id"])
                candidate = indexed.get(block_id)
                try:
                    enriched_by_id[block_id] = _validate_generated_candidate(
                        candidate=candidate,
                        base_block=block,
                        source_hash=source_hash,
                    )
                except ContentEnrichmentError as exc:
                    base_length = len(_text(block.get("conteudo_base")))
                    received_length = len(
                        _text(candidate.get("conteudo_aprofundado"))
                        if isinstance(candidate, dict)
                        else ""
                    )
                    target = max(base_length + 200, math.ceil(base_length * 1.3))
                    failures.append(
                        (
                            block,
                            f"{block_id}: {exc} Base={base_length}, resposta="
                            f"{received_length}; reescreva com no mínimo {target} "
                            "caracteres, definições, causas, consequências e exemplo.",
                        )
                    )
            pending = [block for block, _message in failures]
            feedback = "\n".join(message for _block, message in failures)
            if not pending:
                break
            if attempt == max_attempts:
                raise ContentEnrichmentError(
                    "Gemini não aprofundou todos os blocos após "
                    f"{max_attempts} tentativas: {feedback}"
                )

    return (
        [enriched_by_id[str(block["id"])] for block in base_blocks],
        {
            "model": model,
            "models": sorted(models),
            "lotes_gerados": math.ceil(len(base_blocks) / batch_size),
            "chamadas_realizadas": calls,
        },
    )


async def enrich_content_blocks(
    *,
    context: dict[str, Any],
    settings: Settings,
) -> dict[str, Any]:
    """Separa, aprofunda e só então libera blocos neutros para personalização."""
    # Etapa 1: separação neutra e rastreável. Nenhum perfil BrainHex participa
    # do agrupamento; assim os mesmos blocos-base atendem aos sete perfis.
    segments = _source_segments(context)
    base_blocks = _group_segments(context, segments)
    class_content = context.get("conteudo_classe") if isinstance(context.get("conteudo_classe"), dict) else {}
    topic = class_content.get("topico") if isinstance(class_content.get("topico"), dict) else {}
    source_hash = str(context.get("source_hash") or "")
    topic_payload = {
        "titulo": _text(topic.get("nome") or topic.get("titulo")),
        "descricao": _text(topic.get("descricao")),
        "objetivo": _text(topic.get("objetivo")),
    }
    # Etapa 2: aprofundamento curricular neutro. Gemini é o provedor PRINCIPAL
    # (gratuito no tier atual, sem risco de cobrança) com fallback automático
    # pra OpenAI só quando o Gemini falhar (rate-limit, circuito de
    # indisponibilidade ou qualquer outro erro após esgotar as tentativas).
    # A OpenAI usa um modelo barato (gpt-4o-mini) e tem trava de gasto
    # estimado (ver openai_spend_cap_usd) — nunca é o caminho principal
    # justamente pra minimizar o uso de um provedor pago. A personalização
    # editorial acontece somente depois, ao enviar estes blocos ao microserviço.
    openai_key = str(getattr(settings, "openai_api_key", "") or "").strip()
    gemini_key = str(getattr(settings, "gemini_api_key", "") or "").strip()
    if not openai_key and not gemini_key:
        raise ContentEnrichmentError(
            "GEMINI_API_KEY ausente: a API não pode dividir e aprofundar o conteúdo."
        )

    llm_provider = "gemini"
    gemini_error: ContentEnrichmentError | None = None
    blocks: list[dict[str, Any]] | None = None
    provider_metadata: dict[str, Any] = {}

    if gemini_key:
        try:
            blocks, provider_metadata = await _enrich_base_blocks_with_gemini(
                base_blocks=base_blocks,
                topic=topic_payload,
                source_hash=source_hash,
                settings=settings,
            )
        except ContentEnrichmentError as exc:
            gemini_error = exc
            if not openai_key:
                raise
    else:
        gemini_error = ContentEnrichmentError(
            "GEMINI_API_KEY ausente: usando OpenAI como único provedor configurado."
        )

    if blocks is None:
        try:
            blocks, provider_metadata = await _enrich_base_blocks_with_openai(
                base_blocks=base_blocks,
                topic=topic_payload,
                source_hash=source_hash,
                settings=settings,
            )
            llm_provider = "openai"
        except ContentEnrichmentError as openai_error:
            raise ContentEnrichmentError(
                "Gemini e OpenAI falharam ao aprofundar o conteúdo. "
                f"Gemini: {gemini_error}. OpenAI: {openai_error}"
            ) from openai_error

    return {
        "schema_version": _SCHEMA_VERSION,
        "source_hash": source_hash,
        "tema": _text(topic.get("nome") or topic.get("titulo")) or "Conteúdo de estudo",
        "blocos": blocks,
        "metadata": {
            "segmentos_origem": len(segments),
            "blocos_gerados": len(blocks),
            "fontes_cobertas": len({source_id for block in base_blocks for source_id in block.get("source_ids") or []}),
            "fallback": False,
            "provider": CONTENT_ENRICHMENT_PROVIDER,
            "division_provider": "api-deterministic",
            "enrichment_provider": CONTENT_ENRICHMENT_PROVIDER,
            # Provedor de LLM que efetivamente respondeu esta chamada — "provider"/
            # "enrichment_provider" acima são o contrato de versão fixo (sempre
            # "openai", ver media_contract.py), não quem gerou o texto de fato.
            "enrichment_llm_provider": llm_provider,
            "openai_fallback_used": llm_provider == "openai",
            "gemini_failure_reason": (
                _text(str(gemini_error)) if llm_provider == "openai" and gemini_error else ""
            ),
            "personalization_applied": False,
            "pipeline_order": [
                "content_decomposition",
                "gemini_enrichment" if llm_provider == "gemini" else "openai_enrichment",
                "brainhex_personalization",
            ],
            "provider_model": _text(provider_metadata.get("model")),
            "models": list(provider_metadata.get("models") or []),
            "lotes_gerados": _nonnegative_int(
                provider_metadata.get("lotes_gerados")
            ),
            "chamadas_realizadas": _nonnegative_int(
                provider_metadata.get("chamadas_realizadas")
            ),
        },
    }
