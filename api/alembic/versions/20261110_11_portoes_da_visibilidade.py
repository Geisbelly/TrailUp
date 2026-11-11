"""Visibilidade do tópico: os portões das RPCs `SECURITY DEFINER`

## Por quê

A `20261110_10` esconde do aluno o tópico em rascunho ou agendado por policies RESTRICTIVE de
SELECT. Função `SECURITY DEFINER` não passa pela RLS: roda como o dono e lê tudo. Auditoria em
produção (10/11/2026) das expostas a `authenticated` que leem material:

- arena, guilda e Bag já exigem que o aluno tenha começado ou visto o material, então o
  rascunho que nunca foi publicado não chega por elas. O furo é o tópico que VOLTOU a rascunho
  (ou foi agendado de novo) depois de o aluno ter aberto;
- as que recebem id (responder, iniciar tentativa) só precisavam de um id adivinhado, e
  responder errado fora do modo "pensante" devolve o gabarito;
- as demais são do professor (métricas, notas, duplicar, economia) ou só gravam telemetria.

Em vez de remendar uma a uma, a troca é nos portões por onde todas passam:

| Função                        | Quem passa por ela                       | Tópico oculto          |
| ----------------------------- | ---------------------------------------- | ---------------------- |
| `fn_questao_acesso`           | responder, conferência, correção por IA  | `topico_nao_publicado` |
| `atividade_iniciar_tentativa` | começar atividade                        | `topico_nao_publicado` |
| `fn_questao_liberada_para`    | arena, guilda, chat da guilda            | questão sai do filtro  |
| `bag_listar`                  | cards personalizados da Bag              | card sai; anotação fica |

O erro é `42501` com mensagem própria: o app distingue "ainda não publicado" de "sem matrícula".

## Como

Mesma troca no texto vivo das contas da `_10` (`pg_get_functiondef` + `replace`), e pelos
mesmos motivos: as quatro já têm várias versões, e reescrevê-las inteiras aqui copiaria um
texto que outra migration pode mudar amanhã.

- sem a âncora, o upgrade **aborta** — seguir sem o portão deixaria o furo aberto em silêncio;
- função que não existe é pulada. `fn_questao_liberada_para` é schema não versionado (está só
  em produção), e um banco montado só pelo Alembic não a tem;
- repetir não faz nada: a marca de cada portão já no texto encerra a troca;
- o downgrade tira o portão e devolve a função como estava. Sem o portão no texto, não faz nada.

Âncoras lidas de produção em 10/11/2026, com a `_10` já aplicada.

Por que outra migration, e não a `_10`: ela já estava em produção quando os portões ficaram
prontos, e onde rodou não roda de novo.

Revises: 20261110_10
Create Date: 2026-11-10
"""

from alembic import op

revision = "20261110_11"
down_revision = "20261110_10"
branch_labels = None
depends_on = None


MARCA_DOS_PORTOES = "topico_nao_publicado"

BLOQUEIO_DA_QUESTAO = (
    "  IF NOT EXISTS (\n"
    "    SELECT 1 FROM public.atividades a JOIN public.topicos t ON t.id = a.topico_id\n"
    "     WHERE a.id = v_q.atividade_id AND public.app_topico_liberado(t.publicacao, t.publicar_em)\n"
    "  ) THEN\n"
    "    RAISE EXCEPTION 'topico_nao_publicado' USING ERRCODE = '42501';\n"
    "  END IF;\n"
)
BLOQUEIO_DA_ATIVIDADE = (
    "  IF NOT EXISTS (\n"
    "    SELECT 1 FROM public.atividades a JOIN public.topicos t ON t.id = a.topico_id\n"
    "     WHERE a.id = p_atividade AND public.app_topico_liberado(t.publicacao, t.publicar_em)\n"
    "  ) THEN\n"
    "    RAISE EXCEPTION 'topico_nao_publicado' USING ERRCODE = '42501';\n"
    "  END IF;\n"
)

# (assinatura, âncora, troca, marca)
PORTOES = [
    # Responder, conferência no servidor e correção por IA passam aqui.
    (
        "public.fn_questao_acesso(uuid, bigint)",
        "  v_prazo := public.fn_prazo_efetivo(p_aluno, v_q.atividade_id);\n",
        BLOQUEIO_DA_QUESTAO + "  v_prazo := public.fn_prazo_efetivo(p_aluno, v_q.atividade_id);\n",
        MARCA_DOS_PORTOES,
    ),
    (
        "public.atividade_iniciar_tentativa(bigint)",
        "  v_prazo := public.fn_prazo_efetivo(v_aluno, p_atividade);\n",
        BLOQUEIO_DA_ATIVIDADE + "  v_prazo := public.fn_prazo_efetivo(v_aluno, p_atividade);\n",
        MARCA_DOS_PORTOES,
    ),
    # Arena, guilda e chat da guilda sorteiam e mostram questões por aqui.
    (
        "public.fn_questao_liberada_para(uuid, bigint)",
        "     WHERE q.id = p_questao_id\n",
        "     WHERE q.id = p_questao_id\n       AND public.app_topico_liberado(t.publicacao, t.publicar_em)\n",
        "app_topico_liberado",
    ),
    # Cards personalizados na Bag. As anotações do próprio aluno (`bag_itens`) ficam.
    (
        "public.bag_listar(text, text, bigint, bigint, text)",
        "         AND cp.ativo = TRUE\n",
        "         AND cp.ativo = TRUE\n"
        "         AND coalesce(cp.topico_id <> ALL (ARRAY(SELECT public.app_topicos_ocultos_para_mim())), true)\n",
        "app_topicos_ocultos_para_mim",
    ),
]


def troca_no_vivo(assinatura: str, de: str, para: str, *, ligar: bool, marca: str) -> str:
    """`replace` no texto vivo da função. Ligar sem a âncora falha alto; repetir não faz nada.

    Função que não existe no banco é pulada: não há o que proteger nela.
    """
    if not ligar:
        de, para = para, de
    pronto = "> 0" if ligar else "= 0"
    falta = f"RAISE EXCEPTION 'portao da visibilidade: {assinatura} sem a ancora esperada';" if ligar else "RETURN;"
    return f"""
DO $troca$
DECLARE
  v_fn regprocedure := to_regprocedure('{assinatura}');
  v_def text;
BEGIN
  IF v_fn IS NULL THEN RETURN; END IF;
  v_def := pg_get_functiondef(v_fn);
  IF strpos(v_def, $c${marca}$c$) {pronto} THEN RETURN; END IF;
  IF strpos(v_def, $c${de}$c$) = 0 THEN {falta} END IF;
  EXECUTE replace(v_def, $c${de}$c$, $c${para}$c$);
END
$troca$;
"""


def upgrade() -> None:
    for assinatura, de, para, marca in PORTOES:
        op.execute(troca_no_vivo(assinatura, de, para, ligar=True, marca=marca))


def downgrade() -> None:
    for assinatura, de, para, marca in PORTOES:
        op.execute(troca_no_vivo(assinatura, de, para, ligar=False, marca=marca))
