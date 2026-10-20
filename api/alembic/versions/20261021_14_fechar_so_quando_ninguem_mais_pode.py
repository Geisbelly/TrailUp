"""Conserto: a primeira resposta errada fechava o desafio, e a 2ª tentativa era recusada

Defeito meu da fase 8 (`20261021_09`), achado ao construir a tela de jogo — o primeiro cliente
a percorrer o caminho de resposta de ponta a ponta.

## O que acontecia

O fechamento automático conta **pares (participante aceito × questão) sem linha de resposta**:

    AND NOT EXISTS (SELECT 1 FROM guilda_desafio_respostas r WHERE ... )

Então, num desafio solo de uma questão, a PRIMEIRA resposta zera a conta e o desafio fecha —
mesmo errada, mesmo com tentativa sobrando. A tentativa seguinte bate na guarda de desafio
encerrado:

    NORMAL, 2 tentativas
      1a resposta (errada) -> restantes=1, mas o desafio FECHOU
      2a resposta          -> 22023 guilda_desafio_encerrado

Resultado: **ninguém nunca teve uma segunda tentativa, em nenhum modo.** O preset
`desafio_tentativas_normal = 2` não valia nada, e `desafio_tentativas_dificil = 1` — a aposta
do "menos tentativas" — era indistinguível dele. As duas fases que construíram isso (8 e 9)
mediram o limite de tentativa **isoladamente**, respondendo duas vezes a mesma questão de um
desafio com mais de um participante, onde a conta de `faltam` ainda era maior que zero. O caso
de um participante só nunca foi exercitado.

## O conserto

A pergunta certa não é "todos já responderam?", é **"alguém ainda pode responder?"**. Um par
continua aberto quando não tem resposta **ou** quando a resposta está errada e ainda há
tentativa:

    r.questao_id IS NULL
    OR (NOT r.correta AND COALESCE(r.tentativas, 0) < GREATEST(v_limite, 1))

Acerto fecha o par na hora — não faz sentido manter o desafio aberto por quem já acertou e
tem tentativa sobrando. E `v_limite` é o limite da dificuldade DESTE desafio, o mesmo que a
guarda de tentativa usa duas linhas acima: a conta de quem pode responder e a recusa de quem
não pode passam a sair do mesmo número.

> A varredura de abandonados (`fn_desafio_varrer_abandonados`, a cada 5 min) continua sendo a
> rede: desafio em que alguém erra e some fica aberto até `desafio_encerra_apos_min`, e
> fecha pagando quem jogou. Esse é exatamente o papel dela, e é por isso que ela existe desde
> a fase 8.

## Como o corpo é montado

Recortado de `20261021_12`, que por sua vez recorta de `20261021_09`. Cada migração continua
sendo a única fonte da sua própria mudança: esta não repete a troca de guarda da `_12`, pede a
ela o texto já com a guarda certa e só troca a conta de `faltam`.

Revision ID: 20261021_14
Revises: 20261021_13
Create Date: 2026-10-19
"""

from alembic import op

revision = "20261021_14"
down_revision = "20261021_13"
branch_labels = None
depends_on = None


FALTAM_SO_SEM_RESPOSTA = """  SELECT count(*) INTO v_faltam
    FROM public.desafio_participantes dp
    CROSS JOIN public.guilda_desafio_questoes dq
   WHERE dp.desafio_id = p_desafio_id
     AND dq.desafio_id = p_desafio_id
     AND dp.estado = 'aceito'
     AND NOT EXISTS (
       SELECT 1 FROM public.guilda_desafio_respostas r
        WHERE r.desafio_id = p_desafio_id
          AND r.questao_id = dq.questao_id
          AND r.aluno_id = dp.aluno_id
     );"""

FALTAM_QUEM_AINDA_PODE = """  -- Quem ainda PODE responder, nao quem ainda nao respondeu: a versao anterior fechava o
  -- desafio na primeira resposta de cada um, mesmo errada e com tentativa sobrando, e a
  -- tentativa seguinte batia em `guilda_desafio_encerrado`. Acerto fecha o par na hora.
  SELECT count(*) INTO v_faltam
    FROM public.desafio_participantes dp
    CROSS JOIN public.guilda_desafio_questoes dq
    LEFT JOIN public.guilda_desafio_respostas r
           ON r.desafio_id = p_desafio_id
          AND r.questao_id = dq.questao_id
          AND r.aluno_id = dp.aluno_id
   WHERE dp.desafio_id = p_desafio_id
     AND dq.desafio_id = p_desafio_id
     AND dp.estado = 'aceito'
     AND (
       r.questao_id IS NULL
       -- `v_limite` e o mesmo numero que recusa a tentativa a mais, 20 linhas acima.
       OR (NOT r.correta AND COALESCE(r.tentativas, 0) < GREATEST(v_limite, 1))
     );"""


def _responder(faltam: str) -> str:
    """O corpo de `20261021_12` (que já traz a guarda por participação), trocando só `faltam`."""
    import importlib.util
    from pathlib import Path

    caminho = Path(__file__).with_name("20261021_12_responder_checa_participacao.py")
    spec = importlib.util.spec_from_file_location("_fase_12", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError("não consegui carregar 20261021_12; revise a 20261021_14")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)

    sql = modulo._responder(modulo.GUARDA_POR_PARTICIPACAO)

    if FALTAM_SO_SEM_RESPOSTA not in sql:
        raise RuntimeError("a conta de `faltam` da fase 8 mudou de forma; revise a 20261021_14")
    return sql.replace(FALTAM_SO_SEM_RESPOSTA, faltam, 1)


RELOAD = "\nNOTIFY pgrst, 'reload schema';\n"


def upgrade() -> None:
    op.execute(_responder(FALTAM_QUEM_AINDA_PODE))
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(_responder(FALTAM_SO_SEM_RESPOSTA))
    op.execute(RELOAD)
