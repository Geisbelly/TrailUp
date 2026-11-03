"""Escrita e remocao de objetos no Cloudflare R2 SEM credencial do R2 na API (#76).

Existe para tirar do Postgres o que nao precisa estar la. O primeiro uso e o
payload bruto de telemetria: ele e ~96% do tamanho da linha (5,67 kB de 5,9 kB
medidos) e **nada le esse campo de volta** - o unico SELECT sobre
`telemetria_lotes` pega `id, sessao_id, analysis_ciclo_id`, e nao ha view nem
funcao que use a tabela. As outras 20 colunas ja carregam o que as consultas
precisam. O segundo e a retencao (`retencao_externa.py`), que apaga o que
expirou.

As credenciais do R2 ficam SO nos secrets das Edge Functions (decisao de 02/11).
A API pede a `storage-upload-url` uma URL assinada - de PUT para gravar, de
DELETE para apagar - com a chave de servico que ja usa, e fala direto com o R2:
o Supabase so ve o pedido, nunca o arquivo. E' o que `storage.py` faz para o
material e o microservice e o BrainHexPDF para os deles. Ate 03/11 este modulo
assinava sozinho com `R2_*` proprias (terceira copia do SigV4 no monorepo).
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.services.storage import FUNCAO_DE_UPLOAD


@dataclass(frozen=True)
class ConfigR2:
    """O que a API precisa para pedir URL assinada: o projeto e a chave de servico."""

    supabase_url: str
    service_key: str


@dataclass(frozen=True)
class UrlAssinada:
    url: str
    bucket: str


class FuncaoDeUploadNaoPublicada(RuntimeError):
    """A plataforma respondeu 404: a funcao ainda nao foi publicada (ela nunca responde 404)."""


def ler_config_r2(settings: object) -> ConfigR2 | None:
    """Config para chegar ao R2, ou None sem URL do projeto ou chave de servico.

    Sem ela, quem chama mantem o comportamento antigo (payload no Postgres).
    """
    url = (getattr(settings, "supabase_url", None) or "").strip().rstrip("/")
    chave = (getattr(settings, "supabase_service_key", None) or "").strip()
    if not url or not chave:
        return None
    return ConfigR2(url, chave)


async def pedir_url_assinada(
    cfg: ConfigR2, key: str, metodo: str, *, client: httpx.AsyncClient
) -> UrlAssinada:
    """Pede a URL a `storage-upload-url`. Lanca em qualquer falha.

    Confere o `metodo` devolvido: a versao da funcao anterior ao DELETE ignora
    o campo e devolve uma URL de PUT - e um PUT sem corpo no lugar de um DELETE
    sobrescreveria o objeto com um arquivo vazio. Tambem exige o `bucket`, que
    vai para o ponteiro (`_bucket`) e que a retencao confere antes de apagar.
    """
    chave = cfg.service_key
    pedido = await client.post(
        f"{cfg.supabase_url}/functions/v1/{FUNCAO_DE_UPLOAD}",
        json={"path": key, "metodo": metodo},
        headers={"Authorization": f"Bearer {chave}", "apikey": chave},
    )
    if pedido.status_code == 404:
        raise FuncaoDeUploadNaoPublicada(f"[r2] Edge Function {FUNCAO_DE_UPLOAD} nao publicada")
    if pedido.status_code >= 400:
        raise RuntimeError(f"[r2] URL recusada ({key}): {pedido.status_code} {pedido.text[:200]}")
    corpo = pedido.json() or {}
    url, bucket = str(corpo.get("url") or ""), str(corpo.get("bucket") or "")
    if corpo.get("metodo") != metodo:
        raise RuntimeError(
            f"[r2] {FUNCAO_DE_UPLOAD} publicada nao assina {metodo} (devolveu {corpo.get('metodo')})"
        )
    if not url or not bucket:
        raise RuntimeError(f"[r2] resposta sem url ou bucket ({key})")
    return UrlAssinada(url, bucket)


async def enviar_para_r2(
    cfg: ConfigR2,
    key: str,
    corpo: bytes,
    content_type: str,
    *,
    client: httpx.AsyncClient | None = None,
    timeout_sec: float = 10.0,
) -> str:
    """Sobe o objeto e devolve o bucket. Lanca em falha - quem chama decide se tolera.

    Para telemetria, quem chama TOLERA: perder o arquivo bruto e melhor que
    recusar o lote e perder tambem as metricas estruturadas, que sao o que as
    consultas usam.
    """
    if client is None:
        async with httpx.AsyncClient(timeout=timeout_sec) as http:
            return await enviar_para_r2(cfg, key, corpo, content_type, client=http)

    assinada = await pedir_url_assinada(cfg, key, "PUT", client=client)
    resposta = await client.put(assinada.url, content=corpo, headers={"Content-Type": content_type})
    if resposta.status_code >= 400:
        raise RuntimeError(
            f"[r2] upload falhou ({key}): {resposta.status_code} {resposta.text[:200]}"
        )
    return assinada.bucket
