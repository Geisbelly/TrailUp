"""Uso do modelo devolvido pelo microservice, para o custo por artefato do painel técnico (#21).

O microservice responde `/api/personalizar` com `uso_modelo` (ver `microservice/src/lib/usoDoModelo.ts`),
inclusive quando a geração falha. Aqui só se valida o formato: o que vier fora dele é descartado, e
a soma entre tentativas é do banco (`fn_personalizacao_uso_somar`, `20261103_14`).
"""

from __future__ import annotations

from typing import Any

CAMPOS = ("chamadas", "tokens_entrada", "tokens_saida", "caracteres")
_MAX_MODELOS = 20


def _inteiro(valor: Any) -> int:
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        return 0
    return max(0, round(valor))


def extrair_uso(payload: Any) -> dict[str, Any] | None:
    """O `uso_modelo` da resposta, limpo; `None` se não veio ou não houve chamada ao modelo."""
    if not isinstance(payload, dict):
        return None
    bruto = payload.get("uso_modelo")
    if not isinstance(bruto, dict):
        return None
    por_modelo: dict[str, dict[str, int]] = {}
    modelos = bruto.get("por_modelo")
    if isinstance(modelos, dict):
        for modelo, gasto in list(modelos.items())[:_MAX_MODELOS]:
            if not isinstance(gasto, dict):
                continue
            por_modelo[str(modelo)[:80]] = {campo: _inteiro(gasto.get(campo)) for campo in CAMPOS}
    uso = {campo: _inteiro(bruto.get(campo)) for campo in CAMPOS}
    uso["por_modelo"] = por_modelo
    if uso["chamadas"] == 0 and not por_modelo:
        return None
    return uso
