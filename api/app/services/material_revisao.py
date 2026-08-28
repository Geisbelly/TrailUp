"""Contador de revisao por material.

Existe porque o cache do mobile e' chaveado pela URL, e a regeracao faz
UPDATE in place sem trocar `source_hash` -- entao o caminho no Storage
(que embute `generation-<source_hash>`) continua o mesmo e o arquivo local
nunca e' rebaixado. `revisao` da ao cliente um sinal de mudanca que NAO
depende de mexer no source_hash, que governa a dedup de geracao e nao pode
virar gatilho de cache.

Vive dentro do JSONB `materiais.<tipo>`, ao lado de `payload`/`metadata`,
e e' por MATERIAL: regerar o texto nao pode invalidar audio e apresentacao.
"""

from typing import Any

_REVISAO_INICIAL = 1


def revisao_atual(material: dict[str, Any] | None) -> int:
    """Revisao do material, com 1 para o que foi gerado antes deste campo.

    Ausencia conta como 1, nao 0: se contasse 0, a primeira regeracao
    gravaria 1 -- que e' exatamente o que o cliente ja teria assumido para
    o material antigo, e o cache nao invalidaria.
    """
    if not isinstance(material, dict):
        return _REVISAO_INICIAL
    valor = material.get("revisao")
    # `True` e' int em Python e passa em `>= 1`; sem este guard um
    # `revisao: true` no JSONB entraria como revisao 1.
    if isinstance(valor, bool) or not isinstance(valor, int) or valor < 1:
        return _REVISAO_INICIAL
    return valor


def incrementar_revisao(material: dict[str, Any] | None) -> dict[str, Any]:
    """Devolve uma COPIA do material com a revisao seguinte."""
    base = dict(material) if isinstance(material, dict) else {}
    base["revisao"] = revisao_atual(material) + 1
    return base
