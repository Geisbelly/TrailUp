"""Quatro helpers de guilda saem do alcance do aluno (um deles vazava bloqueio alheio)

Achado da segunda revisão desta leva, e ele existe porque a `20261021_23` fez o certo: ao
registrar no Alembic os GRANT que só existiam no banco, ela colocou quatro funções sob o olhar de
`test_definer_exposto_sem_sessao` — que até aqui as **pulava**, porque o corpo delas vive num
`.sql` de `docs/mobile/sql/` e aquele portão só lia os `.py`. Com a visão corrigida, três
reprovaram.

## O que foi medido, função por função (produção, 2026-10-21)

As quatro são `SECURITY DEFINER` com EXECUTE para `authenticated`, e **nenhuma é chamada por
cliente nenhum** — conferido com o parser do portão de RPC e por busca direta em `mobile/src` e
`frontend/src`. As únicas ocorrências nos clientes são `types.ts` (gerado) e
`frontend/.../guildas/formacao.ts`, que **espelha** a regra da janela em TypeScript em vez de
chamar a função.

| função | confere a sessão? | o que entrega a quem chamar direto |
| --- | --- | --- |
| `guilda_bloqueio_ativo(uuid, uuid)` | **não** | se DUAS pessoas quaisquer se bloquearam |
| `guilda_janela_aberta(bigint)` | **não** | se a janela de formação de qualquer turma está aberta |
| `guilda_congelar_composicao(text, bigint)` | sim, por delegação | nada: `app_classes_do_professor()` é a 1ª instrução |
| `guilda_classe_atual(bigint)` | sim, `auth.uid()` | nada |

`guilda_bloqueio_ativo` é o problema de verdade. O corpo é

    SELECT EXISTS (SELECT 1 FROM public.social_relacionamentos
      WHERE aluno_a_id = LEAST(p_one,p_two) AND aluno_b_id = GREATEST(p_one,p_two)
        AND status = 'blocked')

sem nenhuma referência a `auth.uid()`. Qualquer aluno autenticado pergunta por **qualquer par** e
recebe a resposta — e os uuid dos colegas saem de `social_listar_pessoas()`, que ele pode chamar.
Pior: `social_relacionamentos` teve `REVOKE ALL ... FROM authenticated` em
`docs/mobile/sql/20260912_02_social_amizades.sql` justamente para o aluno não ler bloqueio alheio.
A tabela estava fechada e esta função era a porta aberta ao lado dela.

## Por que revogar é seguro

Os chamadores internos são todos `SECURITY DEFINER` de `postgres` — medido em `pg_proc`, sem
trigger no caminho: `guilda_convidar` e `arena_desafio_criar` (bloqueio), `guilda_criar`,
`_convidar`, `_entrar`, `_aceitar_convite`, `_formacao_da_turma`, `_janela_da_turma` (janela),
`evento_classe_abrir` (congelar) e `guilda_criar` (classe atual). Chamada de dentro de função
`DEFINER` roda com o privilégio do dono, não do aluno, então tirar o EXECUTE de `authenticated`
não afeta nenhum caminho real.

`guilda_janela_da_turma(bigint)` — essa **é** chamada pelo console e **continua** com EXECUTE.
Ela é a porta oficial da janela, com permissão de professor; não confundir com
`guilda_janela_aberta`.

## Por que as quatro, e não só a que vazava

Mesmo critério que a `20261018_04` aplicou a `guilda_e_colega` e `social_sao_colegas`:
helper interno, zero chamador de cliente, chamadores `DEFINER` — então o EXECUTE de
`authenticated` é superfície sem uso. As duas que conferem a sessão não vazam nada hoje; perdem o
EXECUTE por menor privilégio, não por suspeita. `guilda_congelar_composicao` ainda **escreve**
(`guilda_evento_snapshot`), e função de escrita ao alcance de quem não precisa dela é a pior
combinação para deixar passar por hábito.

## Por que uma migration nova e não editar a `_23`

A `_23` espelhou a produção, e isso estava certo para o que ela se propunha: versionar o estado
real. Estreitar é **decisão nova**, com medição própria — e a `_23` já está aplicada. Editá-la
apagaria o raciocínio e descolaria o arquivo do que foi aplicado. A sequência honesta é esta:
espelhar primeiro, estreitar depois, com a evidência escrita.

## Downgrade

Reconcede o EXECUTE a `authenticated` nas quatro, voltando ao estado que a `_23` deixou. É o
único downgrade desta leva que desfaz de verdade, e pode: ele reabre uma superfície que existia
até aqui, não cria uma nova. Quem reverter fica com o vazamento de `guilda_bloqueio_ativo` de
volta — está dito em voz alta, de propósito.

Revision ID: 20261021_25
Revises: 20261021_24
Create Date: 2026-10-21
"""

from alembic import op

revision = "20261021_25"
down_revision = "20261021_24"
branch_labels = None
depends_on = None


ASSINATURAS = (
    "public.guilda_bloqueio_ativo(uuid, uuid)",
    "public.guilda_janela_aberta(bigint)",
    "public.guilda_congelar_composicao(text, bigint)",
    "public.guilda_classe_atual(bigint)",
)

# Literais de propósito: varredura que lê o texto das migrations para saber quem termina exposto
# não vê comando montado em laço. Foi o defeito que o teste de cobertura da `_23` pegou.
ESTREITA = """
REVOKE EXECUTE ON FUNCTION public.guilda_bloqueio_ativo(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guilda_janela_aberta(bigint) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guilda_congelar_composicao(text, bigint) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guilda_classe_atual(bigint) FROM authenticated;

NOTIFY pgrst, 'reload schema';
"""

def upgrade() -> None:
    op.execute(ESTREITA)


def downgrade() -> None:
    # O SQL da reversão vive AQUI DENTRO, e não numa constante no topo, de propósito.
    #
    # Dois portões decidem "quem termina exposto" lendo o TEXTO das migrations e cortando em
    # `def downgrade` — `test_definer_exposto_sem_sessao` e, por `_texto_emitido`,
    # `test_rpc_chamada_tem_migracao`. Constante no topo cai do lado do upgrade: a primeira
    # versão deste arquivo tinha um `RECONCEDE = """GRANT ..."""` antes de `def upgrade`, e os
    # dois portões leram o GRANT de reversão como estado final — concluindo que esta migration
    # não revoga nada. Passou verde no que importava e errado no que media.
    op.execute(
        """
        GRANT EXECUTE ON FUNCTION public.guilda_bloqueio_ativo(uuid, uuid) TO authenticated;
        GRANT EXECUTE ON FUNCTION public.guilda_janela_aberta(bigint) TO authenticated;
        GRANT EXECUTE ON FUNCTION public.guilda_congelar_composicao(text, bigint) TO authenticated;
        GRANT EXECUTE ON FUNCTION public.guilda_classe_atual(bigint) TO authenticated;

        NOTIFY pgrst, 'reload schema';
        """
    )
