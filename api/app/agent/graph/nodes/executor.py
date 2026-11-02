import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.repositories.evento import EventoRepository
from app.repositories.ia_descricao import IADescricaoRepository
from app.repositories.intervencao import IntervencaoRepository
from app.repositories.materiais import MateriaisRepository
from app.repositories.notificacao import NotificacaoRepository
from app.repositories.tentativas import TentativasRepository
from app.repositories.trilha import TrilhaRepository
from app.schemas.intervencao import IntervencaoPayload
from app.schemas.notificacao import NotificacaoPayload
from app.schemas.perfil import PerfilUpdate
from app.schemas.texto_gerado import TextoGerado
from app.schemas.trilha_config import TrilhaConfig
from app.services.tentativas_atividade import CronometroDecisao, texto_para_o_professor

logger = logging.getLogger(__name__)


async def _aplicar(
    session: AsyncSession,
    acoes: list[str],
    acao: str | None,
    passo: Callable[[], Awaitable[None]],
    *,
    nome_da_falha: str | None = None,
) -> bool:
    """Uma escrita do ciclo num SAVEPOINT proprio. Se ela falhar, so ela volta: o resto do ciclo
    (estado de estudo, sugestao, memoria, as outras escritas) segue, e o lote nao vai para a fila.

    Antes era tudo ou nada, e uma consulta quebrada na gravacao de perfil (`modoresposta`)
    derrubou todo ciclo de analise depois do #805 sem gravar nada. A falha fica no log e em
    `acoes` (`falhou:<acao>`), que vai para `ia_decision_logs`."""
    try:
        if callable(getattr(session, "begin_nested", None)):
            async with session.begin_nested():
                await passo()
        else:
            await passo()
    except Exception as exc:  # noqa: BLE001 - uma escrita ruim nao derruba o ciclo
        nome = acao or nome_da_falha or "escrita"
        # Só a primeira linha: o erro do SQLAlchemy traz depois o SQL e os `[parameters: ...]`, com o
        # id do aluno e o texto da notificação, que não vão para o log do container.
        resumo = (str(exc).splitlines() or [""])[0][:300]
        logger.warning("executor.escrita_falhou: acao=%s erro=%s: %s", nome, type(exc).__name__, resumo)
        acoes.append(f"falhou:{nome}")
        return False
    if acao:
        acoes.append(acao)
    return True


def _aviso_do_cronometro(decisao: CronometroDecisao) -> IntervencaoPayload:
    """O professor fica sabendo por `intervencoes`, como na recorrencia de alerta de estudo (#64).
    `kind` proprio: a deduplicacao de 7 dias e por kind, e nao pode engolir o aviso de dificuldade."""
    return IntervencaoPayload(
        tipo="engajamento",
        kind="cronometro_desligado",
        ocorrencias=decisao.ocorrencias,
        janela=decisao.janela,
        texto=texto_para_o_professor(decisao),
        base=f"Cronômetro desligado pela IA: {decisao.motivo}.",
        acao="acompanhar",
        origem="regra",
    )


async def executor(
    state: dict[str, Any],
    session_factory: async_sessionmaker[AsyncSession],
) -> dict[str, Any]:
    if state.get("review_decision") == "rejected":
        return {
            "acoes_aplicadas": ["revisao_rejeitada"],
            "completed_nodes": ["executor"],
            "messages": ["executor finalizado sem aplicar mudancas"],
        }

    async with session_factory() as session:
        trilha_repo = TrilhaRepository(session)
        notificacao_repo = NotificacaoRepository(session)
        ia_repo = IADescricaoRepository(session)
        materiais_repo = MateriaisRepository(session)
        evento_repo = EventoRepository(session)
        intervencao_repo = IntervencaoRepository(session)
        acoes: list[str] = []

        try:
            # O `perfil_update` fica no estado (agente_trilha e o resumo em `iaDescricao` o leem), mas
            # o executor NAO grava `aluno_perfil` nem o modo do aluno. A regra de reserva do
            # agente_perfil so soma (Seeker com acerto baixo vira Survivor em 3 ciclos e nao volta), e
            # `aluno_perfil` decide a missao do dia, as coortes por perfil do estudo (#13) e os alvos
            # da personalizacao; o modo `imediato` trocaria a ordem da trilha do aluno. Antes do #805
            # o executor nunca rodava em producao: a ultima escrita de perfil por aqui e de 28/08.
            perfil_update = None
            if state.get("perfil_update"):
                perfil_update = PerfilUpdate.model_validate(state["perfil_update"])

            recomendacao_trilha = None
            if state.get("trilha_config"):
                trilha_config = TrilhaConfig.model_validate(state["trilha_config"])

                async def _trilha() -> None:
                    await trilha_repo.aplicar_config(state["aluno_id"], trilha_config)

                if await _aplicar(session, acoes, "trilha_reconfigurada", _trilha):
                    recomendacao_trilha = trilha_config.justificativa

            if state.get("notificacao_payload"):
                notificacao = NotificacaoPayload.model_validate(state["notificacao_payload"])
                texto = None
                if state.get("textos_gerados"):
                    texto = TextoGerado.model_validate(state["textos_gerados"][0])

                async def _notificacao() -> None:
                    await notificacao_repo.enfileirar(state["aluno_id"], notificacao, texto)

                await _aplicar(session, acoes, "notificacao_enfileirada", _notificacao)

            if state.get("intervencao_payload") and state.get("classe_id"):
                intervencao = IntervencaoPayload.model_validate(state["intervencao_payload"])
                registro: dict[str, str | None] = {}

                async def _intervencao() -> None:
                    registro["id"] = await intervencao_repo.registrar_do_aluno(
                        aluno_id=state["aluno_id"],
                        classe_id=int(state["classe_id"]),
                        intervencao=intervencao,
                        ciclo_id=state.get("ciclo_id"),
                    )

                if await _aplicar(session, acoes, None, _intervencao, nome_da_falha="intervencao_registrada"):
                    intervencao_id = registro.get("id")
                    if intervencao_id is None:
                        acoes.append("intervencao_ja_pendente")
                    else:
                        acoes.append("intervencao_registrada")
                        # Uma notificacao por ciclo: se o agente_notificacao ja mandou a
                        # dele (valencia negativa agora), a intervencao nao manda outra. Turma
                        # retida pelo estudo (#13): o professor fica sabendo, o aluno nao recebe.
                        if (
                            intervencao.acao == "notificacao"
                            and not state.get("notificacao_payload")
                            and not state.get("personalizacao_retida")
                        ):

                            async def _aviso_ao_aluno() -> None:
                                await notificacao_repo.enfileirar(
                                    state["aluno_id"],
                                    NotificacaoPayload(
                                        tipo="suporte",
                                        titulo=intervencao.notificacao_titulo or "",
                                        corpo=intervencao.notificacao_corpo or "",
                                        horario=datetime.now(UTC) + timedelta(minutes=5),
                                        prioridade=2,
                                        contexto={
                                            "motivo": "intervencao",
                                            "intervencao_id": intervencao_id,
                                            "kind": intervencao.kind,
                                        },
                                    ),
                                )

                            await _aplicar(session, acoes, "intervencao_notificada", _aviso_ao_aluno)

            if state.get("cronometro_payload") and state.get("classe_id"):
                decisao = CronometroDecisao.model_validate(state["cronometro_payload"])

                # O UPSERT confere de novo: se o aluno mexeu no interruptor desde a leitura do
                # contexto, a escolha dele vence e nada e gravado nem avisado. Desligar e avisar o
                # professor vao no mesmo savepoint: um sem o outro deixaria o professor sem saber.
                async def _cronometro() -> None:
                    if await TentativasRepository(session).desligar_cronometro_pela_ia(state["aluno_id"], decisao.motivo):
                        await intervencao_repo.registrar_do_aluno(
                            aluno_id=state["aluno_id"],
                            classe_id=int(state["classe_id"]),
                            intervencao=_aviso_do_cronometro(decisao),
                            ciclo_id=state.get("ciclo_id"),
                        )
                        acoes.append("cronometro_desligado")
                    else:
                        acoes.append("cronometro_mantido")

                await _aplicar(session, acoes, None, _cronometro, nome_da_falha="cronometro_desligado")

            if state.get("materiais_gerados"):
                if state.get("materiais_cache_hit"):
                    acoes.append("materiais_reutilizados")
                else:
                    # Fora de savepoint: `MateriaisRepository.salvar` da `commit()` no fim, e um commit
                    # dentro do savepoint fecharia a transacao de fora. Falha aqui derruba o ciclo,
                    # como antes.
                    await materiais_repo.salvar(
                        aluno_id=state["aluno_id"],
                        conteudo_id=state.get("conteudo_foco_id") or (state.get("conteudo_adaptado") or {}).get("conteudo_id"),
                        materiais=state["materiais_gerados"],
                    )
                    acoes.append("materiais_gerados")

            if any(
                state.get(key)
                for key in ["perfil_update", "trilha_config", "ui_config", "conteudo_adaptado", "emocao_atual"]
            ):

                async def _resumo() -> None:
                    await ia_repo.upsert_cycle_summary(
                        aluno_id=state["aluno_id"],
                        perfil_update=perfil_update,
                        recomendacao_trilha=recomendacao_trilha,
                        insights={
                            "ciclo_id": state["ciclo_id"],
                            "emocao_atual": state.get("emocao_atual"),
                            "ui_config": state.get("ui_config"),
                            "conteudo_adaptado": state.get("conteudo_adaptado"),
                            "review_decision": state.get("review_decision"),
                            "review_feedback": state.get("review_feedback"),
                        },
                    )

                await _aplicar(session, acoes, "ia_descricao_atualizada", _resumo)

            await evento_repo.log(
                aluno_id=state["aluno_id"],
                tipo="ciclo_executado",
                referencia=state["ciclo_id"],
                valor=float(len(acoes)),
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    return {
        "acoes_aplicadas": acoes,
        "completed_nodes": ["executor"],
        "messages": [f"executor aplicou {len(acoes)} acoes"],
    }
