"""O que o Guia aprende sobre o aluno para ensinar com o que ele gosta (`20261124_04`).

Três coisas, uma linha por aluno em `aluno_preferencias_guia`:

- **gostos**, de um catálogo fixo (`GOSTOS`), para a analogia e a ponte saírem do mundo do aluno;
- **resumo** livre, curto, sobre do que ele gosta e como gosta de aprender, passado pelo mascarador
  do chat antes de gravar;
- **postura** que está funcionando com ele (`instigar`, `acolher`, `pragmatico`).

O modelo devolve isso **na mesma chamada que responde** (`registro.preferencias`), só quando a
mensagem revela algo novo: nenhuma chamada a mais. A API filtra pelo catálogo, mascara e grava.
O aluno vê e apaga no Perfil, e pode desligar a coleta; desligada, a API não lê nem grava.

**Ler e gravar nunca derrubam o chat.** Cada um roda num SAVEPOINT: tabela ausente ou erro só
desfazem a própria operação, e o Guia responde como se a coleta estivesse vazia.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.mascaramento_chat import _limpo

logger = logging.getLogger(__name__)

# A mesma lista da migration `20261124_04` (CHECK) e do app; o teste confere as três.
GOSTOS: dict[str, str] = {
    "games": "games",
    "futebol": "futebol",
    "outros_esportes": "outros esportes",
    "musica": "música",
    "filmes_series": "filmes e séries",
    "anime_quadrinhos": "anime e quadrinhos",
    "tecnologia": "tecnologia",
    "ciencia_espaco": "ciência e espaço",
    "natureza_animais": "natureza e animais",
    "culinaria": "culinária",
    "arte_desenho": "arte e desenho",
    "moda": "moda",
    "viagens": "viagens",
    "historia_mitologia": "história e mitologia",
    "carros_motos": "carros e motos",
    "livros": "livros",
}
POSTURAS = ("instigar", "acolher", "pragmatico")
MAX_GOSTOS = 8
MAX_RESUMO = 400


@dataclass(frozen=True)
class PreferenciasDoGuia:
    gostos: list[str] = field(default_factory=list)
    resumo: str | None = None
    postura: str | None = None


def _dados(bruto: Any) -> Mapping[str, Any]:
    if hasattr(bruto, "model_dump"):
        return bruto.model_dump()
    return bruto if isinstance(bruto, Mapping) else {}


def normalizar_preferencias(bruto: Any, nomes: Iterable[str] = ()) -> PreferenciasDoGuia | None:
    """O que o modelo devolveu em `registro.preferencias`, ou `None` quando não há o que gravar.

    Gosto fora do catálogo sai calado, postura fora da lista vira `None` e o resumo passa pelo
    mascarador: um campo ruim não pode custar a resposta que o aluno já recebeu."""
    dados = _dados(bruto)
    if not dados.get("atualizar"):
        return None

    gostos: list[str] = []
    brutos = dados.get("gostos") if isinstance(dados.get("gostos"), list) else []
    for item in brutos:
        codigo = str(item or "").strip().lower()
        if codigo in GOSTOS and codigo not in gostos:
            gostos.append(codigo)
        if len(gostos) == MAX_GOSTOS:
            break

    postura = str(dados.get("postura") or "").strip().lower()
    return PreferenciasDoGuia(
        gostos=gostos,
        resumo=_limpo(dados.get("resumo"), set(nomes), MAX_RESUMO),
        postura=postura if postura in POSTURAS else None,
    )


def bloco_para_o_guia(linha: Mapping[str, Any] | None) -> dict[str, Any]:
    """O bloco `preferencias_do_aluno` do payload. Sem linha, vazio: o Guia sabe que pode coletar."""
    linha = linha or {}
    gostos = [g for g in (linha.get("gostos") or []) if g in GOSTOS]
    return {
        "gostos": gostos,
        "gostos_por_extenso": [GOSTOS[g] for g in gostos],
        "resumo": linha.get("resumo") or None,
        "postura_que_funciona": linha.get("postura") or None,
    }


class PreferenciasDoGuiaRepository:
    def __init__(self, session: AsyncSession | None) -> None:
        self.session = session

    async def ler(self, aluno_id: Any) -> tuple[dict[str, Any] | None, bool]:
        """(linha, coleta_ligada). Sem linha, a coleta vale ligada (o padrão da tabela).

        Falha de leitura devolve `(None, False)`: sem saber se o aluno desligou, não coletar é o
        lado seguro."""
        if self.session is None or not aluno_id:
            return None, False
        try:
            async with self.session.begin_nested():
                linha = (
                    await self.session.execute(
                        text(
                            """
                            SELECT gostos, resumo, postura, coleta_ligada
                              FROM public.aluno_preferencias_guia
                             WHERE aluno_id = CAST(:aluno AS uuid)
                            """
                        ),
                        {"aluno": str(aluno_id)},
                    )
                ).mappings().first()
        except Exception as exc:  # tabela ausente, banco fora
            logger.warning("preferencias_do_guia.leitura_falhou: %s", type(exc).__name__)
            return None, False
        if not linha:
            return None, True
        linha = dict(linha)
        if not linha.get("coleta_ligada"):
            return None, False
        return linha, True

    async def gravar(self, aluno_id: Any, preferencias: PreferenciasDoGuia) -> None:
        """UPSERT que nunca toca a linha de quem desligou a coleta. Sem commit: quem chama decide."""
        await self.session.execute(
            text(
                """
                INSERT INTO public.aluno_preferencias_guia (aluno_id, gostos, resumo, postura, atualizado_em)
                VALUES (CAST(:aluno AS uuid), CAST(:gostos AS text[]), :resumo, :postura, now())
                ON CONFLICT (aluno_id) DO UPDATE
                   SET gostos = EXCLUDED.gostos,
                       resumo = EXCLUDED.resumo,
                       postura = EXCLUDED.postura,
                       atualizado_em = now()
                 WHERE aluno_preferencias_guia.coleta_ligada
                """
            ),
            {
                "aluno": str(aluno_id),
                "gostos": list(preferencias.gostos),
                "resumo": preferencias.resumo,
                "postura": preferencias.postura,
            },
        )
