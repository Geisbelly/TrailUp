from sqlalchemy import String, bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession


class EventoRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _infer_reference_prefix(tipo: str) -> str | None:
        normalized = str(tipo or "").strip().lower()
        if normalized.startswith("topico_"):
            return "topico"
        if normalized.startswith("conteudo_"):
            return "conteudo"
        if normalized.startswith("atividade_"):
            return "atividade"
        return None

    # Vocabulario -> entidade. O cliente manda `content:`/`activity:`/`topic:`
    # em alguns caminhos e `conteudo:`/`atividade:`/`topico:` em outros; as duas
    # grafias apontam para a mesma tabela.
    _PREFIXOS_CONHECIDOS = {
        "topic": "topico",
        "topico": "topico",
        "content": "conteudo",
        "conteudo": "conteudo",
        "activity": "atividade",
        "atividade": "atividade",
        "classe": "classe",
        "class": "classe",
        "conquista": "conquista",
    }

    @classmethod
    def _explicit_reference_prefix(cls, referencia: str) -> str | None:
        """O prefixo que a PROPRIA referencia declara, se declarar algum.

        Existe porque confiar no tipo do evento fabricava referencia orfa: um
        `content:174` num `atividade_concluida` virava `atividade:174`, e nao
        existe atividade 174 -- a view do rank nunca resolvia a classe e os
        pontos morriam ali. Medido em producao: 66 ids orfaos, e 4 deles eram
        conteudo do proprio aluno com o prefixo trocado.

        O id e' a parte confiavel da referencia; o prefixo do tipo e' palpite. Na
        duvida, quem manda e' o que a referencia diz de si.
        """
        if ":" not in referencia:
            return None
        candidato = referencia.split(":", 1)[0].strip().lower()
        return cls._PREFIXOS_CONHECIDOS.get(candidato)

    @staticmethod
    def _extract_numeric_reference(referencia: str | int | None) -> str | None:
        if referencia is None:
            return None
        normalized = str(referencia).strip()
        if not normalized:
            return None
        numeric_match = normalized.rsplit(":", 1)
        if len(numeric_match) == 2 and numeric_match[1].isdigit():
            return numeric_match[1]
        if normalized.isdigit():
            return normalized
        return None

    @classmethod
    def _sanitize_reference(cls, tipo: str, referencia: str | int | None) -> str | None:
        if referencia is None:
            return None
        normalized = str(referencia).strip()
        if not normalized:
            return None

        # A referencia declarada vence o palpite do tipo. Trocar `content:174`
        # por `atividade:174` num evento de atividade nao "corrigia" nada:
        # inventava uma atividade que nao existe e a view perdia a classe.
        prefix = cls._explicit_reference_prefix(normalized) or cls._infer_reference_prefix(tipo)
        numeric_reference = cls._extract_numeric_reference(normalized)

        if prefix is not None:
            if numeric_reference is not None:
                return f"{prefix}:{numeric_reference}"
            # Sem id numerico a referencia NAO e descartada. Descartar era pior
            # que guardar: a view do rank falha em resolver a classe nos dois
            # casos, mas o `None` apagava tambem a identidade do evento -- ficava
            # uma linha em `eventos_aluno` sem nenhuma pista do que ela marcou.
            #
            # Medido em producao: 13 de 15 `conteudo_concluido` e 9 de 9
            # `conteudo_aberto` gravados com referencia nula, sem como saber a
            # que conteudo se referiam.
            return normalized

        if numeric_reference is not None:
            return numeric_reference

        return normalized

    async def log(
        self,
        aluno_id: str,
        tipo: str,
        referencia: str | int | None = None,
        valor: float | None = None,
    ) -> None:
        sanitized_reference = self._sanitize_reference(tipo, referencia)
        if sanitized_reference is not None:
            sanitized_reference = str(sanitized_reference)
        await self.session.execute(
            text(
                """
                INSERT INTO eventos_aluno (aluno_id, tipo, referencia, valor)
                VALUES (:aluno_id, :tipo, :referencia, :valor)
                """
            ).bindparams(bindparam("referencia", type_=String)),
            {
                "aluno_id": aluno_id,
                "tipo": tipo,
                "referencia": sanitized_reference,
                "valor": valor,
            },
        )
