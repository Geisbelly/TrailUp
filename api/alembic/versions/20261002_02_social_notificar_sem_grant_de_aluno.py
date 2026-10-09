"""tira de `authenticated` o EXECUTE de social_notificar_evento

`social_notificar_evento(p_aluno_id, p_titulo, p_corpo, p_tipo, p_dedupe_key,
p_dados)` e' SECURITY DEFINER, insere em `notificacoes` com destinatario, titulo
e corpo VINDOS DO CHAMADOR, e em seguida chama `notificacoes_enviar_push` com os
mesmos valores. Nenhuma linha dela consulta `auth.uid()`.

Com EXECUTE concedido a `authenticated`, qualquer aluno logado entrega um push
de texto arbitrario no celular de qualquer outro aluno, aparentando vir do
TrailUp. Os alunos sao menores. Ver issue #317.

POR QUE REVOGAR E' SEGURO AQUI, e nao nas outras tres da mesma issue:

- nenhum codigo de cliente ou da API a chama (`git grep` em frontend/src,
  mobile/src, api/app e microservice: zero);
- os dois chamadores internos, `social_aceitar_convite` e
  `social_enviar_convite`, sao SECURITY DEFINER -- dentro deles o usuario
  efetivo e' o DONO da funcao, nao quem chamou, entao eles continuam
  enxergando-a depois do REVOKE.

As outras tres NAO entram aqui de proposito:
`provisionar_estrutura_aluno_classe` e' chamada por
`trg_classe_aluno_after_insert`, que NAO e' SECURITY DEFINER -- revogar
quebraria a matricula. As duas de guilda precisam de checagem de professor, nao
de revogacao. Cada uma tem seu proprio conserto na #317.

`notificacoes_enviar_push` entra junto, mas por precaucao e nao por correcao:
conferido em producao, `authenticated` JA' nao a executa. O statement e'
idempotente e cobre o caso de alguem reconceder sem perceber -- ela e' quem de
fato entrega no aparelho.

Conferido em producao antes de escrever: as duas assinaturas batem com as do
REVOKE. Se nao batessem, o DO/EXCEPTION engoliria o erro e esta migracao seria
uma correcao que nao corrige.

Revision ID: 20261002_02
Revises: 20260930_01

Parenteada na cabeca da MAIN, nao na pilha da issue #1 (#310..#315), para poder
entrar sozinha: correcao de seguranca nao deve esperar seis PRs de feature.
A `20261002_01` (tabela de medida do perfil) vive naquela pilha e, quando ela
entrar, precisa ser reparenteada para esta -- senao a main fica com duas
cabecas de novo, o mesmo problema do #303.
Create Date: 2026-10-02
"""

from alembic import op

revision = "20261002_02"
down_revision = "20260930_01"
branch_labels = None
depends_on = None

_ASSINATURAS = (
    "public.social_notificar_evento(uuid, text, text, text, text, jsonb)",
    "public.notificacoes_enviar_push(uuid, bigint, text, text, jsonb, integer)",
)


def upgrade() -> None:
    for assinatura in _ASSINATURAS:
        # `IF EXISTS` nao existe para REVOKE; o DO/EXCEPTION cobre ambiente onde
        # a assinatura difere, para a migracao nao travar o deploy inteiro por
        # causa de uma funcao ausente.
        op.execute(
            f"""
            DO $$
            BEGIN
              EXECUTE 'REVOKE EXECUTE ON FUNCTION {assinatura} FROM PUBLIC, anon, authenticated';
            EXCEPTION WHEN undefined_function THEN
              RAISE NOTICE 'funcao ausente, nada a revogar: {assinatura}';
            END $$
            """
        )


def downgrade() -> None:
    # Reconceder e' reabrir o buraco. Fica explicito em vez de automatico: quem
    # precisar reverter concede a mao, sabendo o que esta' fazendo.
    raise RuntimeError(
        "downgrade reabriria o envio de push arbitrario entre alunos (issue #317); "
        "conceda o EXECUTE manualmente se for mesmo necessario"
    )
