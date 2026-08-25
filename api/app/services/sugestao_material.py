"""Motor determinístico de sugestão de material por aluno.

Decide **quais formatos** usar e **em que ordem**, para um aluno específico,
entre os que realmente existem para aquele conteúdo. Ver
``docs/superpowers/specs/2026-08-25-sugestao-de-material-por-aluno-design.md``.

Por que determinístico e não LLM (decisão validada em 2026-08-25):

* **explicável** — cada posição carrega os motivos que a sustentam, e é isso que
  torna o log de sugestões auditável;
* **reprodutível** — mesma entrada, mesma saída. Sem isso não há como medir
  efetividade: a comparação entre versões viraria comparação entre sorteios;
* **sem cota** — a geração de conteúdo já disputa a cota do Gemini; ordenar
  material não precisa disputar também.

Os pesos por perfil NÃO foram inventados aqui: são a tradução das "pistas de
entrega" que o próprio sistema já declara em
``api/app/agent/prompts/planejador_conteudo.txt``, para que motor e prompt
concordem em vez de divergirem.
"""

from __future__ import annotations

from typing import Any, Iterable

# Ordem canônica: usada como critério de desempate estável. Sem ela, formatos
# empatados sairiam em ordem arbitrária de dicionário e a sugestão deixaria de
# ser reprodutível — quebrando a métrica de efetividade.
FORMATOS_CANONICOS: tuple[str, ...] = ("markdown", "audio", "apresentacao", "cards", "pdf")

# Peso por perfil BrainHex, derivado das pistas de entrega do prompt:
#   Achiever   — metas claras, progresso, consolidação, desafio mensurável
#   Conqueror  — confronto, domínio, pressão saudável, feedback direto
#   Socializer — narrativa, contexto humano, cooperação, personagens
#   Daredevil  — ritmo rápido, surpresa, mudança de estímulo
#   Mastermind — lógica, estrutura, relações causais, profundidade
#   Seeker     — curiosidade, conexões inesperadas, exploração
#   Survivor   — segurança, passo a passo, apoio, redução de fricção
_PESOS_POR_PERFIL: dict[str, dict[str, float]] = {
    "achiever": {"cards": 1.0, "markdown": 0.7, "apresentacao": 0.6, "audio": 0.3, "pdf": 0.3},
    "conqueror": {"cards": 1.0, "markdown": 0.6, "apresentacao": 0.5, "audio": 0.3, "pdf": 0.3},
    # O áudio do Socializador é diálogo entre DOIS guardiões (é o único perfil
    # com secondaryGuideName) — narrativa com personagens é literalmente o
    # formato dele, não uma preferência estimada.
    "socializer": {"audio": 1.0, "markdown": 0.6, "apresentacao": 0.6, "cards": 0.4, "pdf": 0.2},
    "daredevil": {"apresentacao": 1.0, "cards": 0.8, "audio": 0.5, "markdown": 0.4, "pdf": 0.2},
    "mastermind": {"markdown": 1.0, "apresentacao": 0.7, "pdf": 0.5, "cards": 0.5, "audio": 0.3},
    "seeker": {"apresentacao": 0.9, "markdown": 0.8, "audio": 0.5, "cards": 0.5, "pdf": 0.4},
    # Survivor: passo a passo escrito e áudio (baixa fricção — dá para ouvir
    # sem sustentar leitura).
    "survivor": {"markdown": 1.0, "audio": 0.8, "apresentacao": 0.5, "cards": 0.4, "pdf": 0.3},
}

# Ajuste pelo modo de operação declarado pelo aluno (o "preferência" que o
# sistema realmente guarda), também vindo do prompt:
#   imediato     — curto, direto, rápida assimilação
#   analitico    — profundidade, sequência guiada, consolidação
#   exploratorio — variedade de mídia, conexões, apresentação mais aberta
_AJUSTE_POR_MODO: dict[str, dict[str, float]] = {
    "imediato": {"cards": 0.3, "audio": 0.2, "markdown": -0.2, "pdf": -0.2},
    "analitico": {"markdown": 0.3, "pdf": 0.2, "cards": -0.1},
    "exploratorio": {"apresentacao": 0.3, "audio": 0.1},
}

_ROTULO_PERFIL = {
    "achiever": "Realizador",
    "conqueror": "Conquistador",
    "socializer": "Socializador",
    "daredevil": "Aventureiro",
    "mastermind": "Estrategista",
    "seeker": "Explorador",
    "survivor": "Sobrevivente",
}

_MOTIVO_POR_PERFIL_FORMATO = {
    ("achiever", "cards"): "progresso mensurável",
    ("conqueror", "cards"): "desafio direto",
    ("socializer", "audio"): "narrativa em diálogo",
    ("daredevil", "apresentacao"): "ritmo e estímulo visual",
    ("mastermind", "markdown"): "profundidade e estrutura",
    ("seeker", "apresentacao"): "exploração visual",
    ("survivor", "markdown"): "passo a passo",
    ("survivor", "audio"): "menos fricção",
}

_MOTIVO_POR_MODO = {
    "imediato": "modo imediato: curto e direto",
    "analitico": "modo analítico: sequência guiada",
    "exploratorio": "modo exploratório: variedade de mídia",
}

_PESO_MINIMO_PARA_MOTIVO = 0.15


def _normalizar_perfil(nome: Any) -> str:
    return str(nome or "").strip().lower()


def _afinidades(perfis: Iterable[Any]) -> list[tuple[str, float]]:
    """Normaliza o vetor de afinidades para (perfil, peso 0..1).

    Usa o vetor INTEIRO, não só o dominante: um aluno 70% Estrategista e 60%
    Socializador não é a mesma coisa que um 70% Estrategista puro, e a ordem do
    material deveria refletir isso.
    """
    resultado: list[tuple[str, float]] = []
    for item in perfis or []:
        if isinstance(item, dict):
            nome = _normalizar_perfil(
                item.get("perfil") or item.get("nome") or item.get("perfil_nome")
            )
            bruto = item.get("afinidade", item.get("score", 0))
        else:
            nome = _normalizar_perfil(item)
            bruto = 100
        if nome not in _PESOS_POR_PERFIL:
            continue
        try:
            afinidade = float(bruto)
        except (TypeError, ValueError):
            afinidade = 0.0
        # Afinidade vem 0..100 no banco; valores fora da faixa são aparados em
        # vez de virarem peso negativo ou dominante absoluto.
        peso = max(0.0, min(100.0, afinidade)) / 100.0
        if peso > 0:
            resultado.append((nome, peso))
    return resultado


def sugerir_ordem_material(
    *,
    perfis: Iterable[Any],
    formatos_disponiveis: Iterable[str],
    modo_operacao: str | None = None,
) -> dict[str, Any]:
    """Devolve a ordem sugerida e o formato inicial, com os motivos de cada um.

    Só considera formato que existe de fato: sugerir áudio para um tópico sem
    áudio gerado mandaria o aluno num beco sem saída.
    """
    disponiveis = [
        formato
        for formato in FORMATOS_CANONICOS
        if formato in {str(f).strip().lower() for f in (formatos_disponiveis or [])}
    ]
    if not disponiveis:
        return {"formato_inicial": None, "ordem": []}

    modo = str(modo_operacao or "").strip().lower()
    ajuste_modo = _AJUSTE_POR_MODO.get(modo, {})
    afinidades = _afinidades(perfis)

    itens: list[dict[str, Any]] = []
    for formato in disponiveis:
        score = 0.0
        motivos: list[str] = []

        for perfil, peso_perfil in afinidades:
            contribuicao = _PESOS_POR_PERFIL[perfil].get(formato, 0.0) * peso_perfil
            score += contribuicao
            if contribuicao >= _PESO_MINIMO_PARA_MOTIVO:
                detalhe = _MOTIVO_POR_PERFIL_FORMATO.get((perfil, formato))
                rotulo = _ROTULO_PERFIL[perfil]
                motivos.append(f"{rotulo}: {detalhe}" if detalhe else f"afinidade {rotulo}")

        ajuste = ajuste_modo.get(formato, 0.0)
        if ajuste:
            score += ajuste
            if ajuste > 0 and modo in _MOTIVO_POR_MODO:
                motivos.append(_MOTIVO_POR_MODO[modo])

        itens.append({"formato": formato, "score": round(score, 4), "motivos": motivos})

    # Desempate pela ordem canônica (índice), nunca pela ordem de iteração de
    # dicionário — é o que garante reprodutibilidade.
    itens.sort(key=lambda item: (-item["score"], FORMATOS_CANONICOS.index(item["formato"])))

    for posicao, item in enumerate(itens, start=1):
        item["posicao"] = posicao

    return {"formato_inicial": itens[0]["formato"], "ordem": itens}
