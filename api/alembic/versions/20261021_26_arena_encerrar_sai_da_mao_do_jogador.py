"""Decisão: `arena_encerrar` sai da mão do jogador (REVOKE, não "desistir")

Decisão que o plano deixou em aberto — `docs/superpowers/specs/2026-10-20-plano-depois-da-arena-design.md`
oferecia dois caminhos: `REVOKE` ou dar ao encerramento a semântica explícita de desistir.
**Escolhido o REVOKE**, com a medição abaixo.

## O que a função permite hoje

    IF NOT EXISTS (SELECT 1 FROM public.desafio_participantes
                    WHERE desafio_id = p_desafio_id AND aluno_id = auth.uid())
    THEN RAISE EXCEPTION 'arena_sem_permissao'; END IF;
    RETURN public.fn_desafio_encerrar(p_desafio_id);

A guarda é **participação**, e repare no que ela NÃO exige: `estado = 'aceito'`. Quem foi
convidado e nunca aceitou também encerra. E encerrar é unilateral: o adversário que já aceitou
perde a partida antes de jogar.

Isso **não é exploração de rating** — medido antes: fechar cedo resolve `sem_adversario`, porque
`fn_desafio_encerrar` só trata como competitivo quem tem `respondidas > 0` nas duas equipes, e
`sem_adversario` não move Elo por desenho da `_19`. O que sobra é poder tirar a partida do outro,
de graça. Soma negativa: não dá nada a quem usa, só tira de quem está do outro lado.

## Por que revogar não remove funcionalidade (medido em 2026-10-21)

1. **Nenhum cliente a chama.** Conferido com o parser de `test_rpc_chamada_tem_migracao` e por
   busca em `mobile/src`/`frontend/src`: a única ocorrência é um comentário em `arenaModel.ts`
   descrevendo a cadeia, e a única menção a "encerrar" na interface é o texto informativo
   *"Falta o resto da equipe para o desafio encerrar."* Não existe botão.
2. **O caminho competitivo fecha sozinho.** `arena_responder` chama `arena_encerrar`, e é
   `SECURITY DEFINER` de `postgres` — chamada de dentro dela roda com o privilégio do dono, não
   do aluno.
3. **Partida abandonada não trava.** `fn_desafio_varrer_abandonados` fecha pelo cron
   `trailup_desafio_varredura` (`*/5 * * * *`, ativo, 559 execuções bem-sucedidas, última em
   21/10 18:15), como `postgres`. Para desafio da arena a janela é
   `arena_convite_expira_min` = 1440 min, a mesma 24 h que a `_19` escolheu para o convite.
4. **É a única das sete `arena*` sem chamador de cliente.** As outras seis
   (`arena_convite_responder`, `arena_desafio`, `arena_desafio_criar`, `arena_listar`,
   `arena_professor_resumo`, `arena_responder`) são chamadas e continuam intactas. A assimetria
   aparece sozinha na medição; não é gosto.

`service_role` mantém o EXECUTE: se algum dia o encerramento precisar ser forçado por operação,
o caminho existe e passa por quem tem credencial de servidor.

## O que "desistir" precisaria — e por que não é agora

Virar isto em recurso não é trocar o nome do botão. Precisaria de três coisas que não existem:

- **consequência para quem desiste.** Hoje sair é grátis; com Elo valendo (`_19`), desistência
  grátis é rota de fuga de partida perdida.
- **o outro lado.** Desistência tem de dar algo ao adversário — a vitória, ou a partida de
  volta. Hoje ele só perde.
- **dado.** `ranqueada_elo_partida` e as partidas reais ainda não existem: ninguém jogou. Calibrar
  punição de desistência sem uma única partida jogada é adivinhar. A janela de 24 h da varredura
  é a resposta provisória, e ela já está de pé.

Então a decisão é **fechar agora e deixar o desenho escrito**, não ficar com uma capacidade de
soma negativa ligada enquanto se decide.

## Downgrade

Reconcede o EXECUTE a `authenticated`, voltando ao estado anterior — e com ele volta a
possibilidade de um participante encerrar a partida que o outro aceitou. Dito em voz alta.

Revision ID: 20261021_26
Revises: 20261021_25
Create Date: 2026-10-21
"""

from alembic import op

revision = "20261021_26"
down_revision = "20261021_25"
branch_labels = None
depends_on = None


ASSINATURA = "public.arena_encerrar(uuid)"

ESTREITA = """
REVOKE EXECUTE ON FUNCTION public.arena_encerrar(uuid) FROM authenticated;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(ESTREITA)


def downgrade() -> None:
    # Dentro da função de propósito: dois portões decidem "quem termina exposto" lendo o texto e
    # cortando em `def downgrade`, então GRANT em constante de módulo seria lido como estado
    # final. Ver o comentário equivalente na `20261021_25`.
    op.execute(
        """
        GRANT EXECUTE ON FUNCTION public.arena_encerrar(uuid) TO authenticated;

        NOTIFY pgrst, 'reload schema';
        """
    )
