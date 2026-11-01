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

from app.services.evidencias_pedagogicas import CATALOGO_VERSAO, evidencia

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


# A API grava o Socializador com a grafia britanica ("Socialiser") em vários
# pontos (``context.py``, ``agente_perfil.py``), enquanto a fonte oficial dos
# perfis usa "socializer". Sem o alias, o perfil cairia fora do vetor de
# afinidades em silêncio — justamente o perfil cuja preferência por áudio é a
# mais marcada de todos.
_ALIAS_PERFIL = {"socialiser": "socializer"}


def _normalizar_perfil(nome: Any) -> str:
    chave = str(nome or "").strip().lower()
    return _ALIAS_PERFIL.get(chave, chave)


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

    Cada item leva ``evidencias``: a regra do catálogo que o moveu e os números
    do aluno que ela viu. O peso por perfil sai marcado como hipótese, porque é
    o que a base de evidências diz dele (ver ``evidencias_pedagogicas``).
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
        evidencias: list[dict[str, Any]] = []
        afinidades_que_contam: dict[str, int] = {}

        for perfil, peso_perfil in afinidades:
            contribuicao = _PESOS_POR_PERFIL[perfil].get(formato, 0.0) * peso_perfil
            score += contribuicao
            if contribuicao >= _PESO_MINIMO_PARA_MOTIVO:
                detalhe = _MOTIVO_POR_PERFIL_FORMATO.get((perfil, formato))
                rotulo = _ROTULO_PERFIL[perfil]
                motivos.append(f"{rotulo}: {detalhe}" if detalhe else f"afinidade {rotulo}")
                afinidades_que_contam[perfil] = round(peso_perfil * 100)

        if afinidades_que_contam:
            evidencias.append(
                evidencia(
                    "perfil_formato",
                    afinidades=afinidades_que_contam,
                    contribuicao=round(score, 4),
                )
            )

        ajuste = ajuste_modo.get(formato, 0.0)
        if ajuste:
            score += ajuste
            if ajuste > 0 and modo in _MOTIVO_POR_MODO:
                motivos.append(_MOTIVO_POR_MODO[modo])
            evidencias.append(evidencia("modo_operacao", modo=modo, ajuste=ajuste))

        itens.append(
            {
                "formato": formato,
                "score": round(score, 4),
                "motivos": motivos,
                "evidencias": evidencias,
            }
        )

    # Desempate pela ordem canônica (índice), nunca pela ordem de iteração de
    # dicionário — é o que garante reprodutibilidade.
    itens.sort(key=lambda item: (-item["score"], FORMATOS_CANONICOS.index(item["formato"])))

    for posicao, item in enumerate(itens, start=1):
        item["posicao"] = posicao

    return {"formato_inicial": itens[0]["formato"], "ordem": itens}


# ---------------------------------------------------------------------------
# Revisão (fase 2): ajustar a ordem com o que a telemetria mostrou
# ---------------------------------------------------------------------------

# Ajustes de score por sinal. Valores pequenos de propósito: a revisão corrige
# a sugestão, não a substitui — o perfil do aluno continua sendo a base.
_PENALIDADE_SKIMMING = 0.5
_PENALIDADE_LEITURA_LENTA_COM_ERRO = 0.25
_PENALIDADE_ABANDONO = 0.6
_BONUS_ACERTO_ALTO = 0.4
_BONUS_ENGAJAMENTO = 0.3
# Piso do bônus de reexposição, acima do limiar de mudança de propósito: a
# dificuldade no tópico é o sinal com a evidência mais forte do catálogo
# (DAT-21), e um bônus abaixo do limiar nunca mudaria a ordem. O bônus real é o
# que leva os cards ao topo (ver ``revisar_ordem_material``).
_BONUS_REEXPOSICAO = 0.5
_MARGEM_REEXPOSICAO = 0.05

# Limiares de leitura dos sinais.
_ACERTO_ALTO = 75.0
_ACERTO_SUFICIENTE = 60.0
_PERCENTUAL_ABANDONO = 40.0
_TEMPO_MIN_ABANDONO = 3.0
# Dificuldade no tópico exige mais de um item com acerto: uma questão errada é
# tropeço, não dificuldade.
_MINIMO_ITENS_DIFICULDADE = 2
_FORMATO_DE_REEXPOSICAO = "cards"

MINIMO_EVIDENCIA_PADRAO = 2
LIMIAR_MUDANCA_PADRAO = 0.35


def _tem_evidencia(sinal: dict[str, Any]) -> bool:
    """Formato sobre o qual a telemetria disse algo utilizável."""
    if sinal.get("skimming") or sinal.get("leitura_lenta"):
        return True
    if sinal.get("acertos") is not None or sinal.get("percentual") is not None:
        return True
    return float(sinal.get("active_sec") or 0) > 0


def _ajuste_por_sinal(
    sinal: dict[str, Any], active_sec_medio: float
) -> tuple[float, list[str], list[dict[str, Any]]]:
    """Ajuste de score, motivos legíveis e as evidências que moveram o score.

    Só vira evidência o que mexeu no score: "leitura lenta, mas com bom
    desempenho" é motivo (explica por que NÃO desceu), não evidência.
    """
    ajuste = 0.0
    motivos: list[str] = []
    engajamento = False
    desempenho = False

    acertos = sinal.get("acertos")
    acertos_valor = float(acertos) if acertos is not None else None

    if sinal.get("skimming"):
        ajuste -= _PENALIDADE_SKIMMING
        motivos.append("passou os olhos sem ler")
        engajamento = True

    if sinal.get("leitura_lenta"):
        # Leitura lenta COM bom desempenho não é problema: o formato funciona,
        # o aluno só leva mais tempo. Penalizar aqui empurraria para baixo
        # justamente o material que está dando resultado.
        if acertos_valor is not None and acertos_valor >= _ACERTO_SUFICIENTE:
            motivos.append("leitura lenta, mas com bom desempenho")
        else:
            ajuste -= _PENALIDADE_LEITURA_LENTA_COM_ERRO
            motivos.append("leitura lenta sem desempenho")
            engajamento = True

    percentual = sinal.get("percentual")
    tempo_min = sinal.get("tempo_min")
    if (
        percentual is not None
        and float(percentual) < _PERCENTUAL_ABANDONO
        and tempo_min is not None
        and float(tempo_min) >= _TEMPO_MIN_ABANDONO
    ):
        # Tempo gasto sem avançar é abandono, não dificuldade momentânea.
        ajuste -= _PENALIDADE_ABANDONO
        motivos.append("abandonado no meio")
        engajamento = True

    if acertos_valor is not None and acertos_valor >= _ACERTO_ALTO:
        ajuste += _BONUS_ACERTO_ALTO
        motivos.append("desempenho alto depois deste formato")
        desempenho = True

    active_sec = float(sinal.get("active_sec") or 0)
    if active_sec_medio > 0 and active_sec > active_sec_medio * 1.25:
        ajuste += _BONUS_ENGAJAMENTO
        motivos.append("tempo ativo acima da média")
        engajamento = True

    evidencias: list[dict[str, Any]] = []
    if engajamento:
        evidencias.append(
            evidencia(
                "engajamento_comportamental",
                skimming=True if sinal.get("skimming") else None,
                leitura_lenta=True if sinal.get("leitura_lenta") else None,
                active_sec=round(active_sec, 1),
                active_sec_medio=round(active_sec_medio, 1),
                percentual=_arredondado(percentual),
                tempo_min=_arredondado(tempo_min),
            )
        )
    if desempenho:
        evidencias.append(evidencia("desempenho_do_aluno", acertos=acertos_valor))

    return ajuste, motivos, evidencias


def _arredondado(valor: Any) -> float | None:
    return round(float(valor), 2) if valor is not None else None


def _em_dificuldade(desempenho_topico: dict[str, Any] | None) -> bool:
    """O aluno está com dificuldade no tópico? Acerto médio baixo em itens suficientes."""
    if not desempenho_topico:
        return False
    media = desempenho_topico.get("media_acertos")
    itens = int(desempenho_topico.get("itens") or 0)
    return (
        media is not None
        and itens >= _MINIMO_ITENS_DIFICULDADE
        and float(media) < _ACERTO_SUFICIENTE
    )


def _ja_reexposto(item: dict[str, Any]) -> bool:
    """O bônus de reexposição já entrou neste item numa revisão anterior?

    Os ajustes da revisão são somados ao score anterior. Sem esta guarda, cada
    ciclo com o aluno ainda em dificuldade empurraria os cards mais para cima
    sem nenhuma informação nova.
    """
    return any(
        isinstance(ev, dict) and ev.get("regra") == "reexposicao_quiz"
        for ev in item.get("evidencias") or []
    )


def revisar_ordem_material(
    *,
    ordem_atual: list[dict[str, Any]],
    sinais_por_formato: dict[str, dict[str, Any]],
    minimo_evidencia: int = MINIMO_EVIDENCIA_PADRAO,
    limiar_mudanca: float = LIMIAR_MUDANCA_PADRAO,
    desempenho_topico: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Decide se a ordem muda, e devolve a decisão pronta para o log.

    Sempre devolve uma decisão — inclusive ``mantida``. O log registra as três
    ações (``criada``/``revisada``/``mantida``) porque "o sistema olhou e
    decidiu não mexer" é informação: sem isso, não há como distinguir um motor
    estável de um motor que nunca rodou.

    Dois freios, que são o que evita reordenar por ruído:

    * **mínimo de evidência** — com telemetria de menos formatos que
      ``minimo_evidencia``, não revisa;
    * **limiar de mudança** — mesmo com nova ordem, só aceita se algum score
      mudou acima de ``limiar_mudanca``.

    ``desempenho_topico`` (``{"media_acertos", "itens"}``) é o sinal de
    dificuldade no tópico. Ele não passa pelo mínimo de evidência por formato:
    é desempenho do tópico, não atribuição a um formato, e é o sinal com a
    evidência mais forte do catálogo (reexposição). Com dificuldade, os cards
    vão para o topo, uma vez só.
    """
    if not ordem_atual:
        return {
            "acao": "mantida",
            "ordem": [],
            "motivos": ["sem sugestão anterior para revisar"],
            "evidencia": {"formatos_com_evidencia": 0, "catalogo_versao": CATALOGO_VERSAO},
        }

    com_evidencia = {
        formato: sinal
        for formato, sinal in (sinais_por_formato or {}).items()
        if _tem_evidencia(sinal)
    }

    evidencia_snapshot: dict[str, Any] = {
        "formatos_com_evidencia": len(com_evidencia),
        "minimo_evidencia": minimo_evidencia,
        "limiar_mudanca": limiar_mudanca,
        "sinais": com_evidencia,
        "catalogo_versao": CATALOGO_VERSAO,
    }
    if desempenho_topico:
        evidencia_snapshot["desempenho_topico"] = desempenho_topico

    usar_sinais = len(com_evidencia) >= minimo_evidencia
    reexpor = _em_dificuldade(desempenho_topico) and any(
        item.get("formato") == _FORMATO_DE_REEXPOSICAO and not _ja_reexposto(item)
        for item in ordem_atual
    )

    if not usar_sinais and not reexpor:
        return {
            "acao": "mantida",
            "ordem": ordem_atual,
            "motivos": [
                f"evidência insuficiente: {len(com_evidencia)} de {minimo_evidencia} formatos"
            ],
            "evidencia": evidencia_snapshot,
        }

    valores_active = [float(s.get("active_sec") or 0) for s in com_evidencia.values()]
    active_sec_medio = sum(valores_active) / len(valores_active) if valores_active else 0.0

    nova_ordem: list[dict[str, Any]] = []
    maior_delta = 0.0
    motivos_da_revisao: list[str] = []
    reexposto: dict[str, Any] = {}

    for item in ordem_atual:
        formato = item.get("formato")
        score_anterior = float(item.get("score") or 0)
        sinal = com_evidencia.get(formato) if usar_sinais else None
        reexpor_este = (
            reexpor and formato == _FORMATO_DE_REEXPOSICAO and not _ja_reexposto(item)
        )

        if sinal is None and not reexpor_este:
            nova_ordem.append({**item, "score": round(score_anterior, 4)})
            continue

        ajuste, motivos, evidencias = (
            _ajuste_por_sinal(sinal, active_sec_medio) if sinal is not None else (0.0, [], [])
        )
        if reexpor_este:
            # O bônus entra depois do laço, quando os scores dos outros formatos
            # já estão ajustados: ele depende do líder.
            motivos.append("dificuldade no tópico: praticar com cards")
            evidencias.append(
                evidencia(
                    "reexposicao_quiz",
                    media_acertos=_arredondado((desempenho_topico or {}).get("media_acertos")),
                    itens=int((desempenho_topico or {}).get("itens") or 0),
                )
            )
            reexposto = {"ajuste": ajuste}
        else:
            maior_delta = max(maior_delta, abs(ajuste))
        if motivos:
            motivos_da_revisao.extend(f"{formato}: {motivo}" for motivo in motivos)

        novo_item = {
            **item,
            "score": round(score_anterior + ajuste, 4),
            # Os motivos da revisão ficam SOMADOS aos originais: o log tem
            # que mostrar tanto por que o formato entrou quanto por que
            # subiu ou desceu depois.
            "motivos": list(item.get("motivos") or []) + motivos,
            "evidencias": list(item.get("evidencias") or []) + evidencias,
        }
        if reexpor_este:
            reexposto["item"] = novo_item
        nova_ordem.append(novo_item)

    if reexposto:
        # Com dificuldade no tópico os cards vão para o TOPO, não só "sobem um
        # pouco": um bônus fixo some contra o vetor de afinidades (um aluno com
        # três perfis soma score acima de 1) e a regra de evidência mais forte
        # do catálogo viraria um empate desfeito pela ordem canônica.
        item_cards = reexposto["item"]
        lider = max(
            (float(i.get("score") or 0) for i in nova_ordem if i is not item_cards),
            default=0.0,
        )
        bonus = max(
            _BONUS_REEXPOSICAO,
            round(lider - float(item_cards["score"]) + _MARGEM_REEXPOSICAO, 4),
        )
        item_cards["score"] = round(float(item_cards["score"]) + bonus, 4)
        maior_delta = max(maior_delta, abs(reexposto["ajuste"] + bonus))

    nova_ordem.sort(
        key=lambda item: (
            -float(item.get("score") or 0),
            FORMATOS_CANONICOS.index(item["formato"])
            if item.get("formato") in FORMATOS_CANONICOS
            else len(FORMATOS_CANONICOS),
        )
    )
    for posicao, item in enumerate(nova_ordem, start=1):
        item["posicao"] = posicao

    ordem_mudou = [i.get("formato") for i in nova_ordem] != [
        i.get("formato") for i in ordem_atual
    ]
    evidencia_snapshot["maior_delta"] = round(maior_delta, 4)
    evidencia_snapshot["ordem_mudou"] = ordem_mudou

    if not ordem_mudou:
        return {
            "acao": "mantida",
            "ordem": nova_ordem,
            "motivos": motivos_da_revisao or ["sinais não alteraram a ordem"],
            "evidencia": evidencia_snapshot,
        }

    if maior_delta < limiar_mudanca:
        # Reordenar por diferença mínima confunde o aluno (o material "pula de
        # lugar" sem motivo perceptível) e polui a métrica de efetividade com
        # revisões que não significam nada.
        return {
            "acao": "mantida",
            "ordem": ordem_atual,
            "motivos": [
                f"mudança abaixo do limiar ({round(maior_delta, 2)} < {limiar_mudanca})"
            ],
            "evidencia": evidencia_snapshot,
        }

    return {
        "acao": "revisada",
        "ordem": nova_ordem,
        "motivos": motivos_da_revisao,
        "evidencia": evidencia_snapshot,
    }
