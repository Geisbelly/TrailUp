import operator
from typing import Annotated, Any, TypedDict


class TrailUpState(TypedDict, total=False):
    workflow_kind: str
    aluno_id: str
    classe_id: int
    nome_aluno: str
    email_aluno: str
    modo_operacao: str
    modo_resposta: str
    perfil_brainhex: list[dict[str, Any]]
    historico_eventos: list[dict[str, Any]]
    progresso_trilha: dict[str, Any]
    desempenho_recente: dict[str, Any]
    trilha_atual: dict[str, Any] | None
    ia_descricao_atual: dict[str, Any] | None

    emocao_atual: dict[str, Any] | None
    emocao_historico: list[dict[str, Any]]
    frame_b64: str | None
    eventos_novos: list[dict[str, Any]]
    payload_topico_id: int | None
    payload_atividade_id: int | None
    payload_modo: str | None
    conteudo_foco_id: int | None

    perfil_update: dict[str, Any] | None
    trilha_config: dict[str, Any] | None
    conteudo_adaptado: dict[str, Any] | None
    materiais_gerados: dict[str, Any] | None
    gerar_materiais: bool
    materiais_cache_hit: bool
    plano_personalizacao: dict[str, Any] | None
    ai_patch: dict[str, Any] | None
    materiais_personalizados: dict[str, Any] | None
    midias_em_processamento: bool
    materiais_saved_ids: dict[str, int] | None
    media_pending_payload: dict[str, Any] | None
    media_status: dict[str, str] | None
    media_generation_warnings: list[str] | None
    media_render_job_id: str | None
    personalizacao_record: dict[str, Any] | None
    topico_contexto: dict[str, Any] | None
    conteudos_topico: list[dict[str, Any]]
    midias_topico: list[dict[str, Any]]
    atividades_topico: list[dict[str, Any]]
    questoes_topico: list[dict[str, Any]]
    cards_conteudo: list[dict[str, Any]]
    materiais_origem: list[dict[str, Any]]
    conteudo_boss_foco_id: int | None
    emit_legacy_topic_battle: bool
    notificacao_payload: dict[str, Any] | None
    ui_config: dict[str, Any] | None
    textos_gerados: Annotated[list[dict[str, Any]], operator.add]
    pipeline_stage_outputs: dict[str, Any] | None
    attention_snapshot: dict[str, Any] | None
    decision_snapshot: dict[str, Any] | None
    m2_overrides: dict[str, float] | None
    # Montada por `state_builder.build_initial_state` (`ler_memoria`). Sem estar
    # declarada aqui, o LangGraph descarta a chave na entrada do grafo e todo no
    # le `None` - a recorrencia do agente_ui nunca disparava (#64).
    memoria_aluno: dict[str, Any] | None
    # Tópico em andamento e próximo conteúdo, para o texto da notificação (#66).
    # Também montado por `build_initial_state`; mesma razão de estar declarado.
    foco_estudo: dict[str, Any] | None
    # Turma com a personalização retida pelo estudo (#13, 20261102_05): o grafo mede (emoção,
    # perfil, insight do professor) e não age no aluno. Montado por `build_initial_state`.
    personalizacao_retida: bool
    # Arco narrativo da turma, escrito pelo professor (#145, 20261102_16). Entra nos prompts de
    # geração do caminho Python. Montado por `build_initial_state`; mesma razão de estar declarado.
    arco_narrativo_turma: str | None
    intervencao_payload: dict[str, Any] | None
    # `CronometroDecisao` (#136): o executor desliga o cronometro e avisa o professor.
    cronometro_payload: dict[str, Any] | None

    next: list[str]
    ciclo_id: str
    acoes_aplicadas: Annotated[list[str], operator.add]
    completed_nodes: Annotated[list[str], operator.add]
    messages: Annotated[list[str], operator.add]
    erros: Annotated[list[str], operator.add]
    review_decision: str | None
    review_feedback: str | None
