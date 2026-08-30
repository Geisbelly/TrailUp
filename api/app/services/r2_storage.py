"""Escrita de objetos no Cloudflare R2, assinada com SigV4.

Existe para tirar do Postgres o que nao precisa estar la. O primeiro uso e o
payload bruto de telemetria: ele e ~96% do tamanho da linha (5,67 kB de 5,9 kB
medidos) e **nada le esse campo de volta** - o unico SELECT sobre
`telemetria_lotes` pega `id, sessao_id, analysis_ciclo_id`, e nao ha view nem
funcao que use a tabela. As outras 20 colunas ja carregam o que as consultas
precisam.

Terceira copia da assinatura SigV4 no monorepo (as outras estao na Edge
Function e no microservice). Nao e preguica: cada servico e' empacotado
sozinho - o Dockerfile de cada um so enxerga a propria pasta - e nao ha pacote
compartilhado entre Python e TypeScript. As tres tem teste contra o vetor de
assinatura publicado pela AWS, que e o que impede qualquer uma de se degradar em
silencio: assinatura errada so apareceria como 403 do R2, em producao.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import quote

import httpx

_ALGORITMO = "AWS4-HMAC-SHA256"
_REGIAO = "auto"  # R2 usa sempre "auto"
_SERVICO = "s3"


@dataclass(frozen=True)
class ConfigR2:
    account_id: str
    access_key_id: str
    secret_access_key: str
    bucket: str


def ler_config_r2(settings: object) -> ConfigR2 | None:
    """Config do R2, ou None se estiver incompleta.

    Exige as quatro: configuracao pela metade nao pode virar escrita pela
    metade. Sem R2, quem chama mantem o comportamento antigo.
    """
    valores = [
        (getattr(settings, "r2_account_id", None) or "").strip(),
        (getattr(settings, "r2_access_key_id", None) or "").strip(),
        (getattr(settings, "r2_secret_access_key", None) or "").strip(),
        (getattr(settings, "r2_bucket", None) or "").strip(),
    ]
    if not all(valores):
        return None
    return ConfigR2(*valores)


def _hmac(chave: bytes, mensagem: str) -> bytes:
    return hmac.new(chave, mensagem.encode("utf-8"), hashlib.sha256).digest()


def derivar_chave_de_assinatura(
    secret_access_key: str, data_curta: str, regiao: str, servico: str
) -> bytes:
    """Cadeia de derivacao do SigV4.

    Exportada porque e a parte que erra em silencio; o teste a confere contra o
    vetor publicado pela AWS.
    """
    k_data = _hmac(f"AWS4{secret_access_key}".encode(), data_curta)
    k_region = _hmac(k_data, regiao)
    k_service = _hmac(k_region, servico)
    return _hmac(k_service, "aws4_request")


def _codificar_key(key: str) -> str:
    """Percent-encode por segmento, preservando as barras (igual ao S3)."""
    return "/".join(quote(seg, safe="") for seg in key.split("/"))


def presign_r2(
    cfg: ConfigR2,
    key: str,
    metodo: str = "GET",
    *,
    agora: datetime | None = None,
    validade_segundos: int = 900,
) -> str:
    """URL assinada para o objeto. O metodo entra na requisicao canonica."""
    momento = agora or datetime.now(UTC)
    amz_date = momento.strftime("%Y%m%dT%H%M%SZ")
    data_curta = amz_date[:8]

    host = f"{cfg.account_id}.r2.cloudflarestorage.com"
    caminho = f"/{cfg.bucket}/{_codificar_key(key)}"
    escopo = f"{data_curta}/{_REGIAO}/{_SERVICO}/aws4_request"

    query = sorted(
        [
            ("X-Amz-Algorithm", _ALGORITMO),
            ("X-Amz-Credential", f"{cfg.access_key_id}/{escopo}"),
            ("X-Amz-Date", amz_date),
            ("X-Amz-Expires", str(validade_segundos)),
            ("X-Amz-SignedHeaders", "host"),
        ]
    )
    query_canonica = "&".join(f"{quote(k, safe='')}={quote(v, safe='')}" for k, v in query)

    requisicao_canonica = "\n".join(
        [metodo, caminho, query_canonica, f"host:{host}", "", "host", "UNSIGNED-PAYLOAD"]
    )
    string_to_sign = "\n".join(
        [
            _ALGORITMO,
            amz_date,
            escopo,
            hashlib.sha256(requisicao_canonica.encode("utf-8")).hexdigest(),
        ]
    )

    chave = derivar_chave_de_assinatura(cfg.secret_access_key, data_curta, _REGIAO, _SERVICO)
    assinatura = hmac.new(chave, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    return f"https://{host}{caminho}?{query_canonica}&X-Amz-Signature={assinatura}"


async def enviar_para_r2(
    cfg: ConfigR2,
    key: str,
    corpo: bytes,
    content_type: str,
    *,
    client: httpx.AsyncClient | None = None,
    timeout_sec: float = 10.0,
) -> None:
    """Sobe o objeto. Lanca em falha - quem chama decide se tolera.

    Para telemetria, quem chama TOLERA: perder o arquivo bruto e melhor que
    recusar o lote e perder tambem as metricas estruturadas, que sao o que as
    consultas usam.
    """
    url = presign_r2(cfg, key, "PUT")
    if client is not None:
        resposta = await client.put(url, content=corpo, headers={"Content-Type": content_type})
    else:
        async with httpx.AsyncClient(timeout=timeout_sec) as http:
            resposta = await http.put(url, content=corpo, headers={"Content-Type": content_type})

    if resposta.status_code >= 400:
        raise RuntimeError(
            f"[r2] upload falhou ({key}): {resposta.status_code} {resposta.text[:200]}"
        )
