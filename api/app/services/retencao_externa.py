"""Worker da fila externa de retencao (#195, `20261024_03`).

O Postgres apaga o que e dele; o que mora fora (objeto no R2, arquivo no
Supabase Storage, arquivo na OpenAI, usuario do Auth) os triggers poem em
`retencao_fila_externa`, e este loop apaga.

Desligado por padrao (`RETENCAO_EXTERNA_ENABLED=false`). Cuidados:

- espera `retencao_externa_idade_minima_segundos` antes de mexer no item: uma
  transacao que apagou e depois voltou atras nao deixa item na fila, mas um
  reenvio logo depois de apagar poderia recriar o mesmo caminho;
- confere que NADA no banco ainda aponta para o objeto antes de apagar
  (o mesmo `storage_path` pode estar em outra linha);
- `404` conta como apagado; erro volta para a fila com espera exponencial;
- conta do Auth so e apagada se o aluno continua sem entrar desde o aviso.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
from sqlalchemy import text

from app.services.r2_storage import ConfigR2, ler_config_r2, presign_r2

logger = logging.getLogger(__name__)

MAX_TENTATIVAS = 8
ERRO_MAX = 300


class Apagador(Protocol):
    async def r2(self, bucket: str, chave: str) -> str: ...
    async def storage(self, bucket: str, caminho: str) -> str: ...
    async def openai(self, vector_store_id: str, file_id: str) -> str: ...
    async def auth_user(self, user_id: str) -> str: ...


class ConfiguracaoAusente(RuntimeError):
    """Falta credencial para o destino: o item fica na fila, sem gastar tentativa a toa."""


def _ok(resp: httpx.Response) -> str:
    if resp.status_code == 404:
        return "ausente"
    resp.raise_for_status()
    return "apagado"


@dataclass
class ApagadorHttp:
    settings: Any
    timeout: float = 30.0

    def _r2(self) -> ConfigR2:
        cfg = ler_config_r2(self.settings)
        if cfg is None:
            raise ConfiguracaoAusente("R2 nao configurado")
        return cfg

    def _supabase(self) -> tuple[str, dict[str, str]]:
        url = (getattr(self.settings, "supabase_url", None) or "").rstrip("/")
        chave = getattr(self.settings, "supabase_service_key", None) or ""
        if not url or not chave:
            raise ConfiguracaoAusente("Supabase service key nao configurada")
        return url, {"apikey": chave, "Authorization": f"Bearer {chave}"}

    async def r2(self, bucket: str, chave: str) -> str:
        cfg = self._r2()
        # So apaga no bucket que a API usa: ponteiro para outro bucket e dado
        # que nao e nosso (ou erro), e fica para alguem olhar.
        if bucket and bucket != cfg.bucket:
            raise ValueError(f"bucket do R2 inesperado: {bucket}")
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            return _ok(await client.delete(presign_r2(cfg, chave, "DELETE")))

    async def storage(self, bucket: str, caminho: str) -> str:
        base, headers = self._supabase()
        caminho = caminho.lstrip("/")
        if caminho.startswith(f"{bucket}/"):
            caminho = caminho[len(bucket) + 1 :]
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.request(
                "DELETE",
                f"{base}/storage/v1/object/{bucket}",
                headers=headers,
                json={"prefixes": [caminho]},
            )
            return _ok(resp)

    async def openai(self, vector_store_id: str, file_id: str) -> str:
        chave = getattr(self.settings, "openai_api_key", None) or ""
        if not chave:
            raise ConfiguracaoAusente("OpenAI nao configurada")
        headers = {"Authorization": f"Bearer {chave}"}
        async with httpx.AsyncClient(timeout=self.timeout, base_url="https://api.openai.com/v1") as client:
            if vector_store_id:
                _ok(await client.delete(f"/vector_stores/{vector_store_id}/files/{file_id}", headers=headers))
            return _ok(await client.delete(f"/files/{file_id}", headers=headers))

    async def auth_user(self, user_id: str) -> str:
        base, headers = self._supabase()
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            return _ok(await client.delete(f"{base}/auth/v1/admin/users/{user_id}", headers=headers))


CLAIM_SQL = text(
    """
    UPDATE public.retencao_fila_externa f
       SET tentativas = f.tentativas + 1,
           proxima_tentativa_em = now() + interval '15 minutes'
     WHERE f.id IN (
       SELECT id FROM public.retencao_fila_externa
        WHERE processado_em IS NULL
          AND proxima_tentativa_em <= now()
          AND criado_em <= now() - make_interval(secs => :idade)
          AND tentativas < :max_tentativas
        ORDER BY id
        LIMIT :lote
        FOR UPDATE SKIP LOCKED)
    RETURNING f.id, f.destino, f.bucket, f.caminho, f.ref, f.tentativas
    """
)

# Ainda referenciado? Entao nao apaga. Cada consulta usa indice
# (sessao_id, storage_path via view, openai_file_id).
AINDA_USADO_SQL = {
    "r2_telemetria": text(
        """
        SELECT EXISTS (SELECT 1 FROM public.telemetria_lotes
                        WHERE sessao_id = CAST(:sessao AS uuid) AND payload ->> '_r2' = :caminho)
            OR EXISTS (SELECT 1 FROM public.telemetria_eventos_app
                        WHERE sessao_id = CAST(:sessao AS uuid) AND payload ->> '_r2' = :caminho)
        """
    ),
    "material": text(
        "SELECT EXISTS (SELECT 1 FROM public.vw_material_storage_paths WHERE storage_path = :caminho)"
        " OR EXISTS (SELECT 1 FROM public.materiais_gerados WHERE storage_path = :caminho)"
        " OR EXISTS (SELECT 1 FROM public.fontes_personalizacao WHERE storage_path = :caminho)"
    ),
    "openai": text("SELECT EXISTS (SELECT 1 FROM public.rag_openai_files WHERE openai_file_id = :caminho)"),
    "auth_user": text(
        """
        SELECT NOT EXISTS (
          SELECT 1 FROM public.retencao_avisos_inatividade v
            JOIN auth.users u ON u.id = v.aluno_id
           WHERE v.aluno_id = CAST(:caminho AS uuid)
             AND v.exclusao_enfileirada_em IS NOT NULL
             AND coalesce(u.last_sign_in_at, u.created_at) <= v.avisado_em)
        """
    ),
}

CONCLUI_SQL = text(
    "UPDATE public.retencao_fila_externa SET processado_em = now(), resultado = :resultado,"
    " ultimo_erro = NULL WHERE id = :id"
)
FALHA_SQL = text(
    "UPDATE public.retencao_fila_externa SET ultimo_erro = :erro,"
    " proxima_tentativa_em = now() + make_interval(secs => :espera) WHERE id = :id"
)


def _ref(item: dict[str, Any]) -> dict[str, Any]:
    ref = item.get("ref") or {}
    # asyncpg devolve jsonb como texto.
    return json.loads(ref) if isinstance(ref, str) else dict(ref)


def _chave_de_uso(item: dict[str, Any]) -> str | None:
    destino = item["destino"]
    ref = _ref(item)
    if destino == "r2" and ref.get("sessao_id"):
        return "r2_telemetria"
    if destino in ("r2", "storage"):
        return "material"
    if destino in ("openai", "auth_user"):
        return destino
    return None


def _espera(tentativas: int) -> int:
    return min(60 * (2 ** max(tentativas - 1, 0)), 86400)


async def _ainda_usado(session: Any, item: dict[str, Any]) -> bool:
    chave = _chave_de_uso(item)
    if chave is None:
        return False
    params: dict[str, Any] = {"caminho": item["caminho"]}
    if chave == "r2_telemetria":
        params["sessao"] = _ref(item).get("sessao_id")
    return bool((await session.execute(AINDA_USADO_SQL[chave], params)).scalar())


async def _apagar(apagador: Apagador, item: dict[str, Any]) -> str:
    destino, bucket, caminho = item["destino"], item["bucket"] or "", item["caminho"]
    if destino == "r2":
        return await apagador.r2(bucket, caminho)
    if destino == "storage":
        return await apagador.storage(bucket, caminho)
    if destino == "openai":
        return await apagador.openai(bucket, caminho)
    if destino == "auth_user":
        return await apagador.auth_user(caminho)
    raise ValueError(f"destino desconhecido: {destino}")


async def processar_fila_uma_vez(session_factory: Any, apagador: Apagador, settings: Any) -> dict[str, int]:
    contagem = {"apagado": 0, "ausente": 0, "ainda_referenciado": 0, "cancelado": 0, "erro": 0}
    async with session_factory() as session:
        async with session.begin():
            linhas = (
                (
                    await session.execute(
                        CLAIM_SQL,
                        {
                            "idade": int(settings.retencao_externa_idade_minima_segundos),
                            "max_tentativas": MAX_TENTATIVAS,
                            "lote": int(settings.retencao_externa_lote),
                        },
                    )
                )
                .mappings()
                .all()
            )
        itens = [dict(linha) for linha in linhas]

    for item in itens:
        try:
            async with session_factory() as session:
                usado = await _ainda_usado(session, item)
            if usado:
                # Conta que voltou a entrar nao e "referenciada", e cancelada.
                resultado = "cancelado" if item["destino"] == "auth_user" else "ainda_referenciado"
            else:
                resultado = await _apagar(apagador, item)
        except Exception as exc:  # noqa: BLE001 - item volta para a fila
            contagem["erro"] += 1
            # So o tipo e o comeco da mensagem: nada de URL assinada nem cabecalho.
            erro = f"{type(exc).__name__}: {str(exc).split('?')[0]}"[:ERRO_MAX]
            async with session_factory() as session:
                async with session.begin():
                    await session.execute(
                        FALHA_SQL, {"id": item["id"], "erro": erro, "espera": _espera(item["tentativas"])}
                    )
            logger.warning("[retencao] item %s (%s) falhou: %s", item["id"], item["destino"], erro)
            continue
        contagem[resultado] += 1
        async with session_factory() as session:
            async with session.begin():
                await session.execute(CONCLUI_SQL, {"id": item["id"], "resultado": resultado})
    return contagem


async def retencao_externa_loop(app: Any, apagador: Apagador | None = None) -> None:
    settings = app.state.settings
    apagador = apagador or ApagadorHttp(settings)
    intervalo = max(30, int(settings.retencao_externa_interval_seconds))
    while True:
        try:
            contagem = await processar_fila_uma_vez(app.state.session_factory, apagador, settings)
            if any(contagem.values()):
                logger.info("[retencao] fila externa: %s", contagem)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - o loop nao pode morrer
            logger.warning("[retencao] fila externa falhou: %s", type(exc).__name__)
        await asyncio.sleep(intervalo)
