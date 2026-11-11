"""Regra única do vetor BrainHex na API — a mesma do app (`mobile/src/utils/brainHex.ts`) e do SQL.

Antes, cada módulo decidia o perfil do aluno do seu jeito:

* `max()` sobre a lista: empate ficava com o primeiro, e vetor zerado (o `context.py` manda os 7
  perfis com 0 para aluno sem `aluno_perfil`) virava "Seeker", enquanto o app e o SQL tratam esse
  aluno como mastermind;
* comparação com rótulo capitalizado ("Survivor") contra o nome do banco, que é minúsculo
  (`survivor`): o preset do boss e a pressão do cronômetro nunca usavam o perfil do aluno;
* listas de cronômetro e batalha diferentes das do app.

Aqui ficam a ordem (afinidade desc, desempate pelo nome), o dominante, o sinal de perfil
representativo e as listas. Os testes conferem a paridade lendo o código do app.
"""

from typing import Any, Iterable

# Chave do banco (`perfil.nome`) -> rótulo devolvido pela API.
PERFIS_CANONICOS: dict[str, str] = {
    "seeker": "Seeker",
    "survivor": "Survivor",
    "daredevil": "Daredevil",
    "mastermind": "Mastermind",
    "conqueror": "Conqueror",
    "socializer": "Socializer",
    "achiever": "Achiever",
}

# Grafia britânica usada em prompts e partes antigas da API.
_ALIAS_PERFIL = {"socialiser": "socializer"}

# `PERFIL_PADRAO` do app: o perfil assumido quando o aluno não tem afinidade nenhuma.
PERFIL_PADRAO = "mastermind"

# Perfil representativo: 1º ou 2º lugar com afinidade > 0, ou afinidade >= 20
# (`DEFAULT_SIGNAL_THRESHOLD` e `SECONDARY_SIGNAL_INDEX` do app).
LIMIAR_REPRESENTATIVO = 20
POSICAO_SECUNDARIA = 1

# `TIMER_PROFILES` e `BATTLE_PROFILES` de `mobile/src/utils/brainHexCapabilities.ts`.
PERFIS_COM_CRONOMETRO = frozenset({"survivor", "mastermind", "achiever", "conqueror", "daredevil"})
PERFIS_COM_BATALHA = frozenset({"survivor", "daredevil", "conqueror"})


def chave_do_perfil(nome: Any) -> str | None:
    """Nome em qualquer grafia -> chave do banco, ou None se não for um dos 7."""
    chave = str(nome or "").strip().lower()
    chave = _ALIAS_PERFIL.get(chave, chave)
    return chave if chave in PERFIS_CANONICOS else None


def rotulo(nome: Any) -> str | None:
    chave = chave_do_perfil(nome)
    return PERFIS_CANONICOS[chave] if chave else None


def _afinidade(bruto: Any) -> float:
    try:
        return max(0.0, float(bruto or 0.0))
    except (TypeError, ValueError):
        return 0.0


def ordenar(perfis: Iterable[Any] | None) -> list[tuple[str, float]]:
    """(chave, afinidade) por afinidade desc e nome asc. Nome inválido sai; repetido fica com o maior."""
    vetor: dict[str, float] = {}
    for item in perfis or []:
        if isinstance(item, dict):
            nome, bruto = item.get("perfil") or item.get("nome"), item.get("afinidade")
        else:
            nome, bruto = getattr(item, "perfil", None), getattr(item, "afinidade", None)
        chave = chave_do_perfil(nome)
        if chave is None:
            continue
        vetor[chave] = max(vetor.get(chave, 0.0), _afinidade(bruto))
    return sorted(vetor.items(), key=lambda par: (-par[1], par[0]))


def dominante(perfis: Iterable[Any] | None) -> str:
    """Chave do perfil de maior afinidade; sem afinidade positiva, o `PERFIL_PADRAO`."""
    ordem = ordenar(perfis)
    if not ordem or ordem[0][1] <= 0:
        return PERFIL_PADRAO
    return ordem[0][0]


def tem_sinal(perfis: Iterable[Any] | None, alvo: Any, *, limiar: float = LIMIAR_REPRESENTATIVO) -> bool:
    """O perfil é representativo do aluno (`hasBrainHexProfileSignal` do app)."""
    chave_alvo = chave_do_perfil(alvo)
    if chave_alvo is None:
        return False
    for posicao, (chave, afinidade) in enumerate(ordenar(perfis)):
        if chave == chave_alvo:
            return (posicao <= POSICAO_SECUNDARIA and afinidade > 0) or afinidade >= limiar
    return False


def tem_algum_sinal(perfis: Iterable[Any] | None, alvos: Iterable[Any], *, limiar: float = LIMIAR_REPRESENTATIVO) -> bool:
    lista = list(perfis or [])
    return any(tem_sinal(lista, alvo, limiar=limiar) for alvo in alvos)
