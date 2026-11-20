"""Laço dos desafios de lógica e cruzadinha gerados automaticamente (`20261120_03`).

Spec: `docs/superpowers/specs/2026-11-20-desafios-gerados-automaticamente-design.md`.

Regra de fronteira: quem entra, a reivindicação, o teto do dia, a gravação como `pendente`, o aviso ao
professor e as tentativas moram no banco. Este laço só faz a parte que precisa de modelo: pede ao banco
o material de um conteúdo parado, chama a edge `generate-content-ai` (`mode: "desafios"`) com a chave
de serviço e devolve a resposta ao banco. A API não escreve em tabela nenhuma e não decide nada sobre
os desafios: a lista da edge vai inteira a `fn_missao_desafio_registrar_auto`, mesmo vazia (o banco
decide `sem_desafio`).

Com erro, o banco recebe só `"<status> <code>"`, nunca o material, e quanto esperar:
- limite por minuto: 15 minutos, sem contar tentativa, e a passada para;
- cota do dia (402 ou `quotaId` com `PerDay`): até a virada do Pacífico, e o laço dorme até lá;
- edge que não aceita o servidor ou não responde (401, 403, 404, 503 ou nenhuma resposta: timeout e
  rede): `desafios_auto_espera_indisponivel_min` (60), sem contar tentativa, e a passada para. O
  defeito é de configuração ou de deploy, não do conteúdo: a API publica pelo sync do espelho e a edge
  só ganha deploy manual depois, e nessa janela a edge antiga responde 401 a todo pedido do servidor.
  Contar tentativa ali tiraria todo conteúdo da lista para sempre na terceira passada;
- o resto (500, 502, 504, 546...): `NULL`, e o banco conta a tentativa (2^n horas; na terceira, para).

Ao modelo vai o assunto do conteúdo (o que `fn_desafios_auto_contexto` monta). Nenhum dado de aluno.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import re
from datetime import UTC, datetime, time, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import text

logger = logging.getLogger(__name__)

RESULTADOS = ("gerado", "sem_desafio", "ja_tinha", "falhou", "esperando", "sumiu")
ESPERA_POR_MINUTO_MIN = 15
_PACIFICO = ZoneInfo("America/Los_Angeles")
_CONFIG_PADRAO: dict[str, Any] = {
    "ligado": True,
    "por_passada": 2,
    "intervalo_seg": 600,
    "por_dia": 20,
    "carencia_min": 60,
}
_CAMPOS_INTERNOS = ("tipoConteudo", "corpoConteudo")

_CONFIG = text("SELECT public.fn_desafios_auto_config()")
_REIVINDICAR = text(
    "SELECT * FROM public.fn_desafios_auto_reivindicar("
    "CAST(:limite AS integer), CAST(:trava AS integer), CAST(:classes AS bigint[]))"
)
_CONTEXTO = text("SELECT public.fn_desafios_auto_contexto(CAST(:id AS bigint))")
_REGISTRAR = text("SELECT public.fn_missao_desafio_registrar_auto(CAST(:id AS bigint), CAST(:desafios AS jsonb))")
_FALHOU = text(
    "SELECT public.fn_desafios_auto_falhou(CAST(:id AS bigint), CAST(:erro AS text), CAST(:espera AS integer))"
)

Classe = Literal["cota_do_dia", "por_minuto", "indisponivel", "outro"]

# Status em que a edge não chegou a atender o pedido: credencial, rota, função sem configurar ou
# nenhuma resposta (0 = exceção do httpx antes de qualquer resposta).
_INDISPONIVEL = frozenset({0, 401, 403, 404, 503})


def _json(bruto: Any) -> Any:
    """Sem codec de JSON no asyncpg, o `jsonb` chega como texto."""
    if isinstance(bruto, str):
        try:
            return json.loads(bruto)
        except ValueError:
            return None
    return bruto


def _agora() -> datetime:
    return datetime.now(UTC)


# ------------------------------------------------------------------------------------ classificação
def _violacoes(corpo: Any) -> list[dict[str, Any]]:
    """`details.response.error.details[].violations[]` da resposta crua do Gemini, quando existir."""
    if not isinstance(corpo, dict):
        return []
    detalhes = corpo.get("details")
    resposta = detalhes.get("response") if isinstance(detalhes, dict) else None
    erro = resposta.get("error") if isinstance(resposta, dict) else None
    itens = erro.get("details") if isinstance(erro, dict) else None
    violacoes: list[dict[str, Any]] = []
    for item in itens if isinstance(itens, list) else []:
        lista = item.get("violations") if isinstance(item, dict) else None
        violacoes.extend(v for v in (lista if isinstance(lista, list) else []) if isinstance(v, dict))
    return violacoes


def classificar_erro(status: int, corpo: Any) -> Classe:
    """O que um erro da edge pede. A edge devolve 429 `gemini_rate_limit` tanto para o 429 quanto
    para o 402 do Gemini, então quem distingue é `details`. Sem como distinguir, é por minuto: a espera
    curta não conta tentativa, e o erro do lado seguro é não queimar o conteúdo.

    `indisponivel` é a edge que não aceitou o servidor ou não respondeu (401, 403, 404, 503, ou 0 para
    timeout e rede do cliente): o conteúdo não tem culpa e também não pode perder tentativa."""
    if int(status) in _INDISPONIVEL:
        return "indisponivel"
    if int(status) != 429:
        return "outro"
    detalhes = corpo.get("details") if isinstance(corpo, dict) else None
    if isinstance(detalhes, dict) and str(detalhes.get("upstream_status")) == "402":
        return "cota_do_dia"
    if any("PerDay" in str(v.get("quotaId") or "") for v in _violacoes(corpo)):
        return "cota_do_dia"
    return "por_minuto"


def proxima_virada_do_pacifico(agora: datetime) -> datetime:
    """A próxima meia-noite de `America/Los_Angeles` (a virada da cota do Gemini), em UTC."""
    if agora.tzinfo is None:
        agora = agora.replace(tzinfo=UTC)
    local = agora.astimezone(_PACIFICO)
    virada = datetime.combine(local.date() + timedelta(days=1), time(0), tzinfo=_PACIFICO)
    return virada.astimezone(UTC)


# ------------------------------------------------------------------------------------------ o corpo
# Porte de `frontend/src/components/console/trilha/videoDoConteudo.ts` (`YOUTUBE`, `SRC_DO_IFRAME`,
# `enderecoDoCampo`, `idDoYouTube`) e de `enderecosDoConteudo` em `materialDoConteudoParaIa.ts`, para o
# pedido do servidor levar os mesmos `videoUrl`/`linkUrl` que o console levaria.
_YOUTUBE = re.compile(
    r"(?:youtube(?:-nocookie)?\.com/(?:watch\?(?:[^#]*&)?v=|embed/|shorts/|live/|v/)|youtu\.be/)([a-zA-Z0-9_-]{11})"
)
_SRC_DO_IFRAME = re.compile(r"""<iframe\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))""", re.IGNORECASE)
_LINK = re.compile(r"https?://\S+", re.IGNORECASE)


def _desfaz_entidades(valor: str) -> str:
    return valor.replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'")


def _endereco_do_campo(valor: str) -> str | None:
    """O endereço que o campo aponta: o `src` do iframe colado, ou o texto como veio."""
    texto = valor.strip()
    if not texto:
        return None
    if "<iframe" in texto.lower():
        m = _SRC_DO_IFRAME.search(texto)
        src = (m.group(1) or m.group(2) or m.group(3)) if m else None
        if not src:
            return None
        return re.sub(r"^//", "https://", _desfaz_entidades(src.strip()))
    if texto.startswith("<"):
        return None
    return texto


def enderecos(tipo: str, corpo: str) -> dict[str, str]:
    """Vídeo do YouTube vira `videoUrl` canônico; `link` com uma URL só vira `linkUrl`; o resto, nada."""
    texto = str(corpo or "").strip()
    if tipo == "video":
        endereco = _endereco_do_campo(texto)
        m = _YOUTUBE.search(endereco) if endereco else None
        return {"videoUrl": f"https://www.youtube.com/watch?v={m.group(1)}"} if m else {}
    if tipo == "link" and _LINK.fullmatch(texto):
        return {"linkUrl": texto}
    return {}


def corpo_do_pedido(contexto: dict[str, Any]) -> dict[str, Any]:
    """O corpo da edge: o contexto do banco sem os campos internos, com os endereços e sem nulos."""
    corpo = {k: v for k, v in contexto.items() if k not in _CAMPOS_INTERNOS}
    corpo.update(enderecos(str(contexto.get("tipoConteudo") or ""), str(contexto.get("corpoConteudo") or "")))
    corpo["mode"] = "desafios"
    return {k: v for k, v in corpo.items() if v is not None}


# ------------------------------------------------------------------------------------------ a edge
def _credenciais(settings: Any) -> tuple[str, str] | None:
    url = str(getattr(settings, "supabase_url", None) or "").strip()
    chave = str(getattr(settings, "supabase_service_key", None) or "").strip()
    return (url, chave) if url and chave else None


async def _pedir_a_edge(
    cliente: httpx.AsyncClient, url: str, chave: str, corpo: dict[str, Any], timeout: float
) -> tuple[int, Any]:
    """POST na edge. Devolve `(status, corpo)`; falha de rede ou timeout do cliente vira status 0."""
    try:
        resposta = await cliente.post(
            f"{url.rstrip('/')}/functions/v1/generate-content-ai",
            json=corpo,
            headers={"Authorization": f"Bearer {chave}", "apikey": chave, "Content-Type": "application/json"},
            timeout=timeout,
        )
    except httpx.HTTPError as exc:
        return 0, {"code": type(exc).__name__}
    try:
        dados = resposta.json() if resposta.content else None
    except ValueError:
        dados = None
    return resposta.status_code, dados


def _erro(status: int, corpo: Any) -> str:
    """Só `"<status> <code>"`: nada do material nem da mensagem livre da edge chega ao banco."""
    code = corpo.get("code") if isinstance(corpo, dict) else None
    code = re.sub(r"[^A-Za-z0-9_.-]", "", str(code or ""))[:60] or "sem_codigo"
    return f"{int(status)} {code}"


# ------------------------------------------------------------------------------------------ passada
def _origem_das_turmas(settings: Any) -> str:
    if list(getattr(settings, "desafios_auto_classe_ids", None) or []):
        return "desafios_auto_classe_ids"
    if list(getattr(settings, "personalizacao_jobs_classe_ids", None) or []):
        return "personalizacao_jobs_classe_ids (recuo)"
    return "nenhuma lista"


def _turmas(settings: Any) -> list[int] | None:
    """A guarda do #652: a lista própria, ou, vazia, a dos jobs de personalização; as duas vazias, todas."""
    turmas = list(getattr(settings, "desafios_auto_classe_ids", None) or []) or list(
        getattr(settings, "personalizacao_jobs_classe_ids", None) or []
    )
    return [int(t) for t in turmas] or None


async def _ler_config(app: Any) -> dict[str, Any]:
    async with app.state.session_factory() as session:
        bruto = (await session.execute(_CONFIG)).scalar()
    lido = _json(bruto)
    return {**_CONFIG_PADRAO, **(lido if isinstance(lido, dict) else {})}


async def _falhou(app: Any, conteudo_id: int, erro: str, espera: int | None) -> None:
    try:
        async with app.state.session_factory() as session:
            await session.execute(_FALHOU, {"id": conteudo_id, "erro": erro, "espera": espera})
            await session.commit()
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 - banco fora: a trava vence e o conteúdo volta
        logger.warning("[desafios_auto] falha nao registrada (%s): %s", conteudo_id, type(exc).__name__)


async def processar_uma_vez(
    app: Any, cliente: httpx.AsyncClient | None = None, *, config: dict[str, Any] | None = None
) -> dict[str, int]:
    """Uma passada: até `por_passada` conteúdos, reivindicados um por vez.

    Devolve a contagem por resultado e, quando a cota do dia acabou, `pausa_ate` (epoch da virada)."""
    contagem: dict[str, int] = dict.fromkeys(RESULTADOS, 0)
    settings = app.state.settings
    credenciais = _credenciais(settings)
    if credenciais is None:
        return contagem
    config = config if config is not None else await _ler_config(app)
    if not config.get("ligado", True):
        return contagem
    if cliente is None:
        async with httpx.AsyncClient() as proprio:
            return await processar_uma_vez(app, proprio, config=config)

    url, chave = credenciais
    limite = max(1, int(config.get("por_passada") or 1))
    trava = int(getattr(settings, "desafios_auto_trava_seconds", 600))
    espera_indisponivel = max(1, int(getattr(settings, "desafios_auto_espera_indisponivel_min", 60)))
    timeout = float(getattr(settings, "desafios_auto_timeout_seconds", 150))
    turmas = _turmas(settings)

    for _ in range(limite):
        async with app.state.session_factory() as session:
            ids = list(
                (await session.execute(_REIVINDICAR, {"limite": 1, "trava": trava, "classes": turmas})).scalars().all()
            )
            await session.commit()
        if not ids:
            break
        conteudo_id = int(ids[0])
        try:
            async with app.state.session_factory() as session:
                contexto = _json((await session.execute(_CONTEXTO, {"id": conteudo_id})).scalar())
            if not isinstance(contexto, dict):
                contagem["sumiu"] += 1
                continue
            status, corpo = await _pedir_a_edge(cliente, url, chave, corpo_do_pedido(contexto), timeout)
            if status == 200 and isinstance(corpo, dict) and isinstance(corpo.get("desafios"), list):
                async with app.state.session_factory() as session:
                    bruto = (
                        await session.execute(
                            _REGISTRAR, {"id": conteudo_id, "desafios": json.dumps(corpo["desafios"])}
                        )
                    ).scalar()
                    await session.commit()
                registro = _json(bruto)
                estado = registro.get("estado") if isinstance(registro, dict) else None
                contagem[estado if estado in ("gerado", "sem_desafio", "ja_tinha") else "sumiu"] += 1
                continue
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - um conteúdo não derruba a passada
            logger.warning("[desafios_auto] conteudo %s: %s", conteudo_id, type(exc).__name__)
            await _falhou(app, conteudo_id, f"banco {type(exc).__name__}", None)
            contagem["falhou"] += 1
            continue

        if status == 200:
            # 200 sem `desafios` em lista: resposta que não segue o contrato.
            status, corpo = 200, {"code": "sem_lista"}
        erro = _erro(status, corpo)
        classe = classificar_erro(status, corpo)
        if classe != "indisponivel":
            logger.warning("[desafios_auto] conteudo %s: %s (%s)", conteudo_id, erro, classe)
        if classe == "indisponivel":
            logger.warning(
                "[desafios_auto] a edge nao aceitou o servidor ou nao respondeu (%s): confira o deploy da "
                "generate-content-ai e SUPABASE_URL/SUPABASE_SERVICE_KEY; conteudo volta em %s min",
                erro,
                espera_indisponivel,
            )
            await _falhou(app, conteudo_id, erro, espera_indisponivel)
            contagem["esperando"] += 1
            break
        if classe == "por_minuto":
            await _falhou(app, conteudo_id, erro, ESPERA_POR_MINUTO_MIN)
            contagem["esperando"] += 1
            break
        if classe == "cota_do_dia":
            agora = _agora()
            virada = proxima_virada_do_pacifico(agora)
            minutos = max(1, math.ceil((virada - agora).total_seconds() / 60))
            await _falhou(app, conteudo_id, erro, minutos)
            contagem["esperando"] += 1
            contagem["pausa_ate"] = int(virada.timestamp())
            break
        await _falhou(app, conteudo_id, erro, None)
        contagem["falhou"] += 1
    return contagem


async def desafios_auto_loop(app: Any) -> None:
    """Uma passada a cada `intervalo_seg` (do banco); com a cota do dia esgotada, dorme até a virada."""
    settings = app.state.settings
    avisou_sem_credencial = False
    turmas = _turmas(settings)
    logger.info(
        "[desafios_auto] laço ligado; turmas: %s (de %s)",
        ", ".join(str(t) for t in turmas) if turmas else "todas",
        _origem_das_turmas(settings),
    )
    intervalo = int(_CONFIG_PADRAO["intervalo_seg"])
    async with httpx.AsyncClient() as cliente:
        while True:
            espera = intervalo
            try:
                if _credenciais(settings) is None:
                    if not avisou_sem_credencial:
                        logger.warning(
                            "[desafios_auto] sem SUPABASE_URL ou SUPABASE_SERVICE_KEY: laço parado até configurar"
                        )
                        avisou_sem_credencial = True
                else:
                    config = await _ler_config(app)
                    intervalo = max(1, int(config.get("intervalo_seg") or intervalo))
                    espera = intervalo
                    if config.get("ligado", True):
                        contagem = await processar_uma_vez(app, cliente, config=config)
                        if any(v for k, v in contagem.items() if k != "pausa_ate"):
                            logger.info("[desafios_auto] passada: %s", contagem)
                        pausa_ate = contagem.get("pausa_ate")
                        if pausa_ate:
                            espera = max(1, int(pausa_ate - _agora().timestamp()))
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - o laço não pode morrer
                logger.warning("[desafios_auto] passada falhou: %s", type(exc).__name__)
            await asyncio.sleep(espera)


__all__ = [
    "classificar_erro",
    "corpo_do_pedido",
    "desafios_auto_loop",
    "enderecos",
    "processar_uma_vez",
    "proxima_virada_do_pacifico",
]
