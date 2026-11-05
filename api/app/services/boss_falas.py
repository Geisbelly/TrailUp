"""Falas do boss geradas em lote: uma chamada ao modelo por tópico × perfil BrainHex.

Cada conteúdo do tópico ganha um boss com **nome** e **falas** para os momentos da batalha
do app (`mobile/src/context/IAContext.tsx`): entrada, derrota, provocação a cada dano, os
marcos de metade e de um quarto da vida, alerta de tempo, contra-ataque e a mensagem de
vitória do aluno. O resultado vai para `boss_falas` (migração `20261101_11`), que o mobile lê
direto do Supabase — a batalha fala com a API fora do ar, e sem linha valem as falas fixas.

É base por perfil: nada do aluno entra no prompt nem na linha (sem nome, sem desempenho), e a
mesma linha serve a turma inteira daquele perfil. Por isso não há pseudonimização aqui.

Qualquer falha — modelo fora, cota, timeout, resposta fora do formato — deixa o que já estava
gravado (ou nada) e não levanta: falas são enfeite da batalha e não podem custar o material.

Duas garantias que o prompt sozinho não dava (01/11: Conqueror e Daredevil receberam os dois
"Sentinela das Partes Fracionadas", e o Survivor "Guardião das Partes Fracionadas"):

- **Nome próprio por perfil.** Cada perfil é uma chamada, então o modelo só sabe o nome dos
  outros se a gente contar (`nomes_em_uso`). Quem garante é `nome_unico`, na gravação, sob trava
  do tópico: nome igual, ou que só troca o título ("Guardião" × "Sentinela" das mesmas partes),
  ganha o epíteto do perfil.
- **A assinatura editorial inteira no prompt** (`_assinatura`): abertura, convencimento,
  progressão e fechamento amarrados a momentos da batalha, o ritmo virado em tamanho de frase e
  a direção do nome. Antes iam só tom, ritmo e marcadores, e as falas dos três perfis saíam
  trocáveis entre si.

**Conteúdo idêntico copia, não chama o modelo** (`_copiar_falas_iguais`). `source_hash` inclui o
`conteudo_id`, então ele nunca bate entre turmas; quem compara é a `impressao_conteudo` (#955). O
nome e a descrição do tópico ficam fora, a mesma decisão do reuso de material. Só serve de origem
a linha que o modelo geraria igual hoje: versão atual, hash recalculado batendo e fala ligada. A
fala que um professor desligou não chega a outra turma.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.services.llm import JsonLLMService
from app.services.reuso_personalizacao import LeitorDeImpressoes, normalizar_texto, texto_comparavel

logger = logging.getLogger(__name__)

PROMPT_NAME = "boss_falas.txt"
# Própria, de propósito: subir `_PERSONALIZACAO_PIPELINE_VERSION` regeraria a mídia de todas as
# turmas. Suba esta quando o prompt ou os momentos mudarem.
BOSS_FALAS_VERSION = "2026-11-01.2"
# O worker é sequencial: uma chamada pendurada travaria a fila de personalização. 90 s não bastava:
# em 01/11 o `gemini-3.6-flash` levou 100 a 133 s para as falas de um tópico, e toda chamada caía
# no timeout. Depois de uma falha o (tópico, perfil) pausa 30 min no worker, então o teto só pesa
# uma vez por pausa.
LLM_TIMEOUT_SEC = 240.0
TRECHO_MAX = 800

PERFIS = ("seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever")
# Só estes perfis enfrentam boss no app (`BATTLE_PROFILES` em
# `mobile/src/utils/brainHexCapabilities.ts`; `test_boss_falas.py` confere a paridade). Gerar
# para os outros quatro seria pagar o modelo por falas que ninguém vê.
PERFIS_COM_BATALHA = frozenset({"survivor", "daredevil", "conqueror"})

# Momento -> (mínimo, máximo) de falas guardadas. Abaixo do mínimo o boss inteiro é descartado:
# metade de um conjunto de falas deixaria o app misturando a voz gerada com a fixa.
MOMENTOS: dict[str, tuple[int, int]] = {
    "entrada": (1, 3),
    "derrota": (1, 3),
    "dano": (2, 6),
    "metade_vida": (1, 3),
    "um_quarto_vida": (1, 3),
    "alerta_tempo": (1, 3),
    "contra_ataque": (1, 3),
    "vitoria": (1, 3),
}
NOME_MAX = 60
FALA_MIN, FALA_MAX = 6, 180

# Ritmo da assinatura -> tamanho das falas. "dinamico" dito em palavras não mudava nada: as falas
# do Daredevil e do Survivor saíam com o mesmo comprimento.
_RITMO_DAS_FALAS: dict[str, str] = {
    "dinamico": "frases curtas e secas, de 4 a 10 palavras; verbos no imperativo; pode usar exclamacao",
    "medio": "frases de 8 a 16 palavras, cadencia equilibrada",
    "medio-lento": "frases calmas e completas, de 10 a 20 palavras, sem exclamacao; uma ideia por vez",
}

# De onde sai o nome do boss em cada perfil. Os exemplos fogem de matemática de propósito: com
# exemplo do mesmo assunto do conteúdo, o modelo copia o exemplo.
_DIRECAO_DO_NOME: dict[str, str] = {
    "seeker": "evoca misterio, mapa, enigma ou territorio a explorar (ex.: Enigma da Rota Submersa)",
    "survivor": "evoca armadilha, fortaleza ou perigo a evitar (ex.: Armadilha do Atrito Oculto)",
    "daredevil": "evoca velocidade, risco ou adrenalina (ex.: Turbilhao da Celula Viva)",
    "mastermind": "evoca logica, sistema ou paradoxo (ex.: Paradoxo da Fotossintese)",
    "conqueror": "evoca dominio, trono ou rival a ser vencido (ex.: Soberano das Leis de Newton)",
    "socializer": "evoca grupo, conselho ou vinculo (ex.: Conselho dos Biomas)",
    "achiever": "evoca degrau, marco ou prova de evolucao (ex.: Ultimo Degrau da Gramatica)",
}

# Aposto acrescentado ao nome do modelo quando ele colide com o de outro perfil do mesmo
# conteúdo. Por perfil e sem repetir entre perfis: dois perfis que caiam no mesmo nome saem com
# apostos diferentes. Aposto (", Muralha Paciente") e não adjetivo para servir a boss de qualquer
# gênero ("Guardiã" ou "Guardião").
_EPITETOS: dict[str, tuple[str, ...]] = {
    "seeker": ("Mapa Secreto", "Bussola Errante"),
    "survivor": ("Muralha Paciente", "Abrigo de Pedra"),
    "daredevil": ("Furia Veloz", "Lamina do Risco"),
    "mastermind": ("Enigma Calculado", "Mente de Cristal"),
    "conqueror": ("Coroa Invicta", "Trono de Ferro"),
    "socializer": ("Voz da Arena", "Elo da Tribo"),
    "achiever": ("Marco Supremo", "Degrau Final"),
}
_PALAVRAS_VAZIAS = frozenset({"a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "um", "uma"})

_URL = re.compile(r"https?://|www\.", re.IGNORECASE)
_MARKDOWN = re.compile(r"[*_`#<>\[\]{}]")


def _momento(nome: str) -> Any:
    # O mínimo vai para o JSON Schema que o modelo recebe (minItems), não para a validação local:
    # a saída estruturada do Gemini omitia `derrota` (lista vazia), e o boss inteiro era descartado
    # em `limpar_falas` (01/11, nenhuma fala gravada). `limpar_falas` continua sendo o filtro.
    return Field(default_factory=list, json_schema_extra={"minItems": MOMENTOS[nome][0]})


def _todos_os_momentos_obrigatorios(schema: dict[str, Any]) -> None:
    schema["required"] = ["conteudo_id", "nome", *MOMENTOS]


class FalasDoBoss(BaseModel):
    model_config = ConfigDict(json_schema_extra=_todos_os_momentos_obrigatorios)

    conteudo_id: int
    nome: str
    entrada: list[str] = _momento("entrada")
    derrota: list[str] = _momento("derrota")
    dano: list[str] = _momento("dano")
    metade_vida: list[str] = _momento("metade_vida")
    um_quarto_vida: list[str] = _momento("um_quarto_vida")
    alerta_tempo: list[str] = _momento("alerta_tempo")
    contra_ataque: list[str] = _momento("contra_ataque")
    vitoria: list[str] = _momento("vitoria")


class FalasDoTopico(BaseModel):
    bosses: list[FalasDoBoss] = Field(default_factory=list)


@dataclass
class ResultadoFalas:
    # "atual" | "gerado" | "reaproveitado" | "parcial" | "failed" | "sem_conteudo" | "sem_tabela" | "sem_batalha"
    status: str
    gravados: int = 0
    erro: str | None = None


def _limpar_texto(valor: Any, maximo: int) -> str | None:
    texto = re.sub(r"\s+", " ", str(valor or "")).strip().strip('"').strip()
    if not texto or len(texto) > maximo or _URL.search(texto) or _MARKDOWN.search(texto):
        return None
    return texto


def limpar_falas(boss: FalasDoBoss) -> dict[str, Any] | None:
    """Falas que podem ir para o banco, ou None se o boss não tem o mínimo de cada momento."""

    nome = _limpar_texto(boss.nome, NOME_MAX)
    if not nome:
        return None
    falas: dict[str, list[str]] = {}
    for momento, (minimo, maximo) in MOMENTOS.items():
        vistas: list[str] = []
        for bruta in getattr(boss, momento):
            fala = _limpar_texto(bruta, FALA_MAX)
            if fala and len(fala) >= FALA_MIN and fala not in vistas:
                vistas.append(fala)
        if len(vistas) < minimo:
            return None
        falas[momento] = vistas[:maximo]
    return {"nome": nome, "falas": falas}


def _palavras(nome: str) -> list[str]:
    sem_acento = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode("ascii")
    return [p for p in re.findall(r"[a-z0-9]+", sem_acento.lower()) if p not in _PALAVRAS_VAZIAS]


def nomes_colidem(a: str, b: str) -> bool:
    """Mesmo nome, ou o mesmo nome com outro título na frente.

    "Sentinela das Partes Fracionadas" × "Guardião das Partes Fracionadas" colidem: para quem lê,
    é o mesmo boss. Caixa, acento e artigo não contam.
    """

    pa, pb = _palavras(a), _palavras(b)
    if not pa or not pb:
        return False
    if pa == pb:
        return True
    nucleo_a, nucleo_b = set(pa[1:]), set(pb[1:])
    return bool(nucleo_a) and nucleo_a == nucleo_b


def _com_epiteto(nome: str, epiteto: str) -> str:
    sufixo = f", {epiteto}"
    return nome[: NOME_MAX - len(sufixo)].rstrip(" ,") + sufixo


def nome_unico(nome: str, perfil: str, em_uso: Iterable[str]) -> str:
    """`nome`, ou `nome` com o epíteto do perfil se colidir com algum de `em_uso`.

    Termina sempre: `em_uso` é finito e o contador no fim gera candidatos que nenhum outro
    perfil tem. O nome do modelo continua no começo, então as falas em que o boss se apresenta
    pelo nome seguem fazendo sentido.
    """

    usados = [u for u in em_uso if u]

    def _livre(candidato: str) -> bool:
        return not any(nomes_colidem(candidato, u) for u in usados)

    if _livre(nome):
        return nome
    epitetos = _EPITETOS.get(perfil) or (perfil.capitalize(),)
    for epiteto in epitetos:
        candidato = _com_epiteto(nome, epiteto)
        if _livre(candidato):
            return candidato
    numero = 2
    while True:
        candidato = _com_epiteto(nome, f"{epitetos[0]} {numero}")
        if _livre(candidato):
            return candidato
        numero += 1


def _assinatura(perfil: str) -> dict[str, Any]:
    """A assinatura editorial do perfil (`_BRAINHEX_EDITORIAL_SIGNATURES`), pronta para o prompt."""

    # Import tardio: `personalizacao` é um módulo grande e só a assinatura editorial interessa.
    from app.services.personalizacao import _build_profile_editorial_context

    label = perfil.capitalize()
    editorial = _build_profile_editorial_context(label, [{"perfil": label, "afinidade": 1.0}])
    ritmo = str(editorial.get("ritmo") or "medio")
    return {
        "nome": editorial.get("perfil_dominante"),
        "tom_voz": editorial.get("tom_voz"),
        "ritmo": ritmo,
        "ritmo_das_falas": _RITMO_DAS_FALAS.get(ritmo, _RITMO_DAS_FALAS["medio"]),
        "abertura_estilo": editorial.get("abertura_estilo"),
        "convencimento_estilo": editorial.get("convencimento_estilo"),
        "progressao_narrativa": editorial.get("progressao_narrativa"),
        "fechamento_estilo": editorial.get("fechamento_estilo"),
        "narrativa_preferencial": editorial.get("narrativa_preferencial"),
        "framing_narrativo": editorial.get("framing_narrativo"),
        "marcadores_linguisticos": editorial.get("marcadores_linguisticos"),
        "proibicoes_estilo": editorial.get("proibicoes_estilo"),
        "direcao_do_nome": _DIRECAO_DO_NOME.get(perfil),
    }


def hash_do_topico(*, perfil: str, topico: dict[str, Any], conteudos: list[dict[str, Any]]) -> str:
    """Hash do que entra no prompt: igual, a geração é pulada.

    A assinatura entra: mudar a voz de um perfil em `personalizacao.py` regera as falas dele.
    `nomes_em_uso` não entra: o nome que outro perfil recebeu não é motivo para regerar este.
    """

    material = {
        "versao": BOSS_FALAS_VERSION,
        "perfil": perfil,
        "assinatura": _assinatura(perfil),
        "topico": [topico.get("nome"), topico.get("descricao")],
        "conteudos": [
            [int(c["id"]), c.get("titulo"), str(c.get("conteudo") or "")[:TRECHO_MAX]] for c in conteudos
        ],
    }
    bruto = json.dumps(material, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(bruto.encode("utf-8")).hexdigest()


def _chave_do_prompt(conteudo: dict[str, Any]) -> list[str]:
    """O que o modelo leu deste conteúdo, sem caminho de arquivo: mesmo arquivo, dois caminhos."""
    return [normalizar_texto(conteudo.get("titulo")), texto_comparavel(conteudo)[:TRECHO_MAX]]


def montar_payload(
    *,
    perfil: str,
    topico: dict[str, Any],
    conteudos: list[dict[str, Any]],
    nomes_em_uso: dict[int, list[str]] | None = None,
) -> dict[str, Any]:
    em_uso = nomes_em_uso or {}
    return {
        "perfil": _assinatura(perfil),
        "topico": {"nome": topico.get("nome"), "descricao": topico.get("descricao")},
        "conteudos": [
            {
                "conteudo_id": int(c["id"]),
                "titulo": c.get("titulo"),
                "trecho": str(c.get("conteudo") or "")[:TRECHO_MAX],
            }
            for c in conteudos
        ],
        "momentos": {momento: {"minimo": minimo, "maximo": maximo} for momento, (minimo, maximo) in MOMENTOS.items()},
        "nomes_em_uso": [
            {"conteudo_id": int(c["id"]), "nomes": list(em_uso[int(c["id"])])}
            for c in conteudos
            if em_uso.get(int(c["id"]))
        ],
    }


async def tabela_existe(session: AsyncSession) -> bool:
    result = await session.execute(text("SELECT to_regclass('public.boss_falas') IS NOT NULL"))
    return bool(result.scalar_one())


async def _topico(session: AsyncSession, topico_id: int) -> dict[str, Any] | None:
    result = await session.execute(
        text("SELECT id, nome, descricao, classe_id FROM topicos WHERE id = :id"),
        {"id": topico_id},
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def _hashes_gravados(session: AsyncSession, *, topico_id: int, perfil: str) -> dict[int, str]:
    result = await session.execute(
        text("SELECT conteudo_id, source_hash FROM public.boss_falas WHERE topico_id = :topico_id AND perfil = :perfil"),
        {"topico_id": topico_id, "perfil": perfil},
    )
    return {int(row.conteudo_id): str(row.source_hash) for row in result}


async def _nomes_de_outros_perfis(session: AsyncSession, *, topico_id: int, perfil: str) -> dict[int, list[str]]:
    result = await session.execute(
        text(
            "SELECT conteudo_id, nome FROM public.boss_falas "
            "WHERE topico_id = :topico_id AND perfil <> :perfil ORDER BY perfil"
        ),
        {"topico_id": topico_id, "perfil": perfil},
    )
    nomes: dict[int, list[str]] = {}
    for row in result:
        nomes.setdefault(int(row.conteudo_id), []).append(str(row.nome))
    return nomes


async def _nomes_do_topico(session: AsyncSession, *, topico_id: int) -> list[tuple[int, str, str]]:
    result = await session.execute(
        text("SELECT conteudo_id, perfil, nome FROM public.boss_falas WHERE topico_id = :topico_id"),
        {"topico_id": topico_id},
    )
    return [(int(row.conteudo_id), str(row.perfil), str(row.nome)) for row in result]


async def _falas_com_a_mesma_impressao(
    session: AsyncSession,
    *,
    impressoes: list[str],
    perfil: str,
    conteudo_ids: list[int],
) -> dict[str, list[dict[str, Any]]]:
    """Falas ligadas da versão atual em outros conteúdos com estas impressões, as mais novas antes.

    A impressão vive em `conteudo_personalizado` e é neutra de perfil: basta uma linha de base do
    conteúdo, de qualquer perfil, para ligar a impressão às falas dele.
    """
    result = await session.execute(
        text(
            """
            SELECT DISTINCT cp.impressao_conteudo AS impressao, b.id, b.topico_id, b.conteudo_id,
                   b.nome, b.falas, b.source_hash, b.gerado_em
              FROM public.conteudo_personalizado cp
              JOIN public.boss_falas b ON b.conteudo_id = cp.conteudo_id
             WHERE cp.aluno_id IS NULL
               AND cp.impressao_conteudo = ANY(CAST(:impressoes AS text[]))
               AND b.perfil = :perfil
               AND b.versao = :versao
               AND b.ativa
               AND b.conteudo_id <> ALL(CAST(:conteudo_ids AS bigint[]))
             ORDER BY b.gerado_em DESC, b.id DESC
             LIMIT 50
            """
        ),
        {"impressoes": impressoes, "perfil": perfil, "versao": BOSS_FALAS_VERSION, "conteudo_ids": conteudo_ids},
    )
    linhas: dict[str, list[dict[str, Any]]] = {}
    for row in result.mappings():
        linhas.setdefault(str(row["impressao"]), []).append(dict(row))
    return linhas


async def _falas_que_servem(
    session: AsyncSession,
    *,
    perfil: str,
    pendentes: list[dict[str, Any]],
    impressoes: dict[int, str],
) -> dict[int, dict[str, Any]]:
    """Falas prontas para cada conteúdo pendente que tem origem válida.

    A impressão gravada anda atrás do conteúdo: as falas regeram antes de o target da mídia passar.
    Por isso a origem também precisa ter sido gerada do conteúdo atual dela (o hash recalculado
    pega a assinatura do perfil mudada) e dizer o mesmo que este conteúdo.
    """
    candidatas = await _falas_com_a_mesma_impressao(
        session,
        impressoes=sorted(set(impressoes.values())),
        perfil=perfil,
        conteudo_ids=[int(c["id"]) for c in pendentes],
    )
    topicos: dict[int, tuple[dict[str, Any] | None, list[dict[str, Any]]]] = {}
    copias: dict[int, dict[str, Any]] = {}
    for conteudo in pendentes:
        for linha in candidatas.get(impressoes.get(int(conteudo["id"]), ""), []):
            topico_id = int(linha["topico_id"])
            if topico_id not in topicos:
                topicos[topico_id] = (
                    await _topico(session, topico_id),
                    await ConteudoClasseRepository(session).buscar_conteudos_topico(topico_id),
                )
            topico_origem, conteudos_origem = topicos[topico_id]
            origem = next((c for c in conteudos_origem if int(c["id"]) == int(linha["conteudo_id"])), None)
            if (
                topico_origem is not None
                and origem is not None
                and _chave_do_prompt(origem) == _chave_do_prompt(conteudo)
                and hash_do_topico(perfil=perfil, topico=topico_origem, conteudos=conteudos_origem) == linha["source_hash"]
            ):
                falas = linha["falas"]
                copias[int(conteudo["id"])] = {
                    "nome": str(linha["nome"]),
                    "falas": json.loads(falas) if isinstance(falas, str) else falas,
                }
                break
    return copias


def _chave_da_trava(topico_id: int) -> int:
    digest = hashlib.sha256(f"boss_falas:{topico_id}".encode()).digest()
    return int.from_bytes(digest[:8], "big", signed=True)


async def _travar_topico(session: AsyncSession, topico_id: int) -> None:
    # Dois perfis do mesmo tópico gravando ao mesmo tempo leriam os nomes um do outro antes de
    # qualquer gravação, e a checagem de `nome_unico` passaria nos dois. A trava é da transação:
    # sai no commit.
    await session.execute(text("SELECT pg_advisory_xact_lock(:chave)"), {"chave": _chave_da_trava(topico_id)})


async def _gravar(
    session: AsyncSession,
    *,
    classe_id: int,
    topico_id: int,
    conteudo_id: int,
    perfil: str,
    nome: str,
    falas: dict[str, Any],
    source_hash: str,
) -> None:
    await session.execute(
        text(
            """
            INSERT INTO public.boss_falas
              (classe_id, topico_id, conteudo_id, perfil, nome, falas, source_hash, versao, gerado_em)
            VALUES
              (:classe_id, :topico_id, :conteudo_id, :perfil, :nome, CAST(:falas AS jsonb),
               :source_hash, :versao, now())
            ON CONFLICT (conteudo_id, perfil) DO UPDATE SET
              classe_id = EXCLUDED.classe_id,
              topico_id = EXCLUDED.topico_id,
              nome = EXCLUDED.nome,
              falas = EXCLUDED.falas,
              source_hash = EXCLUDED.source_hash,
              versao = EXCLUDED.versao,
              gerado_em = now(),
              -- Texto novo é texto que ninguém leu: religa o que o professor tinha desligado
              -- (20261102_17). Sem mudança de conteúdo o modelo nem é chamado, e a decisão vale.
              -- A cópia de outra turma pode trazer o mesmo texto: aí ele já foi lido e desligado.
              ativa = public.boss_falas.ativa OR public.boss_falas.falas IS DISTINCT FROM EXCLUDED.falas
            """
        ),
        {
            "classe_id": classe_id,
            "topico_id": topico_id,
            "conteudo_id": conteudo_id,
            "perfil": perfil,
            "nome": nome,
            "falas": json.dumps(falas, ensure_ascii=False),
            "source_hash": source_hash,
            "versao": BOSS_FALAS_VERSION,
        },
    )


async def _copiar_falas_iguais(
    session: AsyncSession,
    *,
    topico: dict[str, Any],
    perfil: str,
    pendentes: list[dict[str, Any]],
    source_hash: str,
    ler_impressoes: LeitorDeImpressoes,
) -> set[int]:
    """Copia as falas de conteúdos idênticos e devolve quais conteúdos ficaram resolvidos.

    A linha copiada leva o `source_hash` deste tópico, senão pareceria desatualizada e iria ao
    modelo no próximo poll. Qualquer falha aqui só devolve vazio: o conteúdo segue para o modelo.
    """
    topico_id = int(topico["id"])
    try:
        # Montar o contexto pode baixar arquivo: a leitura não fica aberta enquanto isso.
        await session.rollback()
        impressoes = await ler_impressoes([int(c["id"]) for c in pendentes])
        copias = await _falas_que_servem(session, perfil=perfil, pendentes=pendentes, impressoes=impressoes) if impressoes else {}
        if not copias:
            await session.rollback()
            return set()

        await _travar_topico(session, topico_id)
        nomes = await _nomes_do_topico(session, topico_id=topico_id)
        for conteudo_id, copia in copias.items():
            outros = [item for item in nomes if item[:2] != (conteudo_id, perfil)]
            nome = nome_unico(copia["nome"], perfil, [item[2] for item in outros])
            await _gravar(
                session,
                classe_id=int(topico["classe_id"]),
                topico_id=topico_id,
                conteudo_id=conteudo_id,
                perfil=perfil,
                nome=nome,
                falas=copia["falas"],
                source_hash=source_hash,
            )
            nomes = [*outros, (conteudo_id, perfil, nome)]
        await session.commit()
    except Exception as exc:
        await session.rollback()
        logger.warning("Falas do boss nao reaproveitadas: topico=%s perfil=%s erro=%s", topico_id, perfil, str(exc)[:300])
        return set()
    logger.info("Falas do boss reaproveitadas sem modelo: topico=%s perfil=%s conteudos=%s", topico_id, perfil, sorted(copias))
    return set(copias)


async def gerar_falas_do_topico(
    *,
    session: AsyncSession,
    settings: Settings,
    topico_id: int,
    perfil: str,
    llm: JsonLLMService | None = None,
    ler_impressoes: LeitorDeImpressoes | None = None,
) -> ResultadoFalas:
    if perfil not in PERFIS:
        return ResultadoFalas(status="failed", erro=f"perfil desconhecido: {perfil}")
    if perfil not in PERFIS_COM_BATALHA:
        return ResultadoFalas(status="sem_batalha")
    if not await tabela_existe(session):
        # Código no ar antes da migração: nada a fazer, sem barulho.
        return ResultadoFalas(status="sem_tabela")

    topico = await _topico(session, topico_id)
    conteudos = await ConteudoClasseRepository(session).buscar_conteudos_topico(topico_id) if topico else []
    if not topico or not conteudos:
        await session.rollback()
        return ResultadoFalas(status="sem_conteudo")

    source_hash = hash_do_topico(perfil=perfil, topico=topico, conteudos=conteudos)
    gravados = await _hashes_gravados(session, topico_id=topico_id, perfil=perfil)
    pendentes = [c for c in conteudos if gravados.get(int(c["id"])) != source_hash]
    if not pendentes:
        await session.rollback()
        return ResultadoFalas(status="atual")

    copiados: set[int] = set()
    if ler_impressoes is not None:
        copiados = await _copiar_falas_iguais(
            session,
            topico=topico,
            perfil=perfil,
            pendentes=pendentes,
            source_hash=source_hash,
            ler_impressoes=ler_impressoes,
        )
        pendentes = [c for c in pendentes if int(c["id"]) not in copiados]
        if not pendentes:
            return ResultadoFalas(status="reaproveitado", gravados=len(copiados))

    nomes_em_uso = await _nomes_de_outros_perfis(session, topico_id=topico_id, perfil=perfil)
    payload = montar_payload(perfil=perfil, topico=topico, conteudos=pendentes, nomes_em_uso=nomes_em_uso)
    # Encerra a leitura antes da chamada externa: não segura transação aberta durante a LLM.
    await session.rollback()

    servico = llm or JsonLLMService(settings)
    try:
        resposta = await asyncio.wait_for(
            servico.ainvoke_structured(prompt_name=PROMPT_NAME, payload=payload, schema=FalasDoTopico),
            timeout=LLM_TIMEOUT_SEC,
        )
    except Exception as exc:  # modelo fora, cota, timeout, schema: o que estava gravado fica.
        logger.warning(
            "Falas do boss nao geradas: topico=%s perfil=%s erro=%s", topico_id, perfil, str(exc)[:300]
        )
        return ResultadoFalas(status="failed", erro=str(exc)[:300])

    esperados = {int(c["id"]) for c in pendentes}
    validos: dict[int, dict[str, Any]] = {}
    for boss in resposta.bosses:
        # Conteúdo que não estava no pedido não entra: o modelo não escolhe onde gravar.
        if boss.conteudo_id not in esperados or boss.conteudo_id in validos:
            continue
        limpo = limpar_falas(boss)
        if limpo:
            validos[boss.conteudo_id] = limpo

    # O pedido ao modelo é só um pedido: a garantia é aqui, relida sob trava, porque outro perfil
    # pode ter gravado durante a chamada.
    await _travar_topico(session, topico_id)
    nomes_em_uso = await _nomes_de_outros_perfis(session, topico_id=topico_id, perfil=perfil)
    for conteudo_id, limpo in validos.items():
        nome = nome_unico(limpo["nome"], perfil, nomes_em_uso.get(conteudo_id, []))
        if nome != limpo["nome"]:
            logger.info(
                "Falas do boss: nome repetido entre perfis, com epiteto: conteudo=%s perfil=%s nome=%r -> %r",
                conteudo_id,
                perfil,
                limpo["nome"],
                nome,
            )
        await _gravar(
            session,
            classe_id=int(topico["classe_id"]),
            topico_id=topico_id,
            conteudo_id=conteudo_id,
            perfil=perfil,
            nome=nome,
            falas=limpo["falas"],
            source_hash=source_hash,
        )
    await session.commit()

    if len(validos) < len(esperados):
        logger.warning(
            "Falas do boss parciais: topico=%s perfil=%s validos=%s de %s",
            topico_id,
            perfil,
            len(validos),
            len(esperados),
        )
        return ResultadoFalas(status="parcial" if validos else "failed", gravados=len(validos) + len(copiados))
    return ResultadoFalas(status="gerado", gravados=len(validos) + len(copiados))
