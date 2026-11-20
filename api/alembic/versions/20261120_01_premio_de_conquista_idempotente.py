"""Prêmio de conquista idempotente: pagar de novo não aborta o evento que disparou a avaliação

## O defeito

`trg_eventos_aluno_after_iud` (AFTER INSERT em `eventos_aluno`) reavalia as conquistas a cada evento
do aluno. Quando uma conquista vira concluída, ele paga o prêmio com

    INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)
    VALUES (v_aluno_id, 'conquista_desbloqueada', 'conquista:' || v_conquista.id::text, ...);

sem `ON CONFLICT`. Esse tipo está no índice único parcial `eventos_aluno_creditado_unico
(aluno_id, tipo, referencia)` (`20260909_03`, refeito na `20261016_03`). Se o prêmio daquela conquista
**já está no razão**, o INSERT estoura `23505` dentro do gatilho e aborta o evento de fora, qualquer
que seja ele.

Visto em produção em 20/11, no app do aluno ("Leitura adaptativa"): a análise da telemetria falhou em
`INSERT INTO eventos_aluno ... 'ciclo_iniciado'` com `duplicate key value violates unique constraint
"eventos_aluno_creditado_unico"`. O `ciclo_iniciado` não está no índice; quem colidiu foi o prêmio que
o gatilho tentou gravar por causa dele.

O gatilho decide pagar quando `conquistas_aluno` não tem a linha ou ela não está concluída. O razão,
porém, é outra tabela, e os dois saem de acordo de mais de um jeito:

- a linha de `conquistas_aluno` some (exclusão de conquista/registro, como os `DELETE` das
  `20261103_09` e `20261105_24`) e o prêmio fica. É o estado que a invariante **I13** ("conquista
  pontuada sem registro", `20261029_03`) já procura;
- dois eventos do mesmo aluno ao mesmo tempo (lote de telemetria e ciclo de análise, por exemplo):
  `conquistas_aluno` não tem unicidade em `(aluno_id, conquista_id)`, os dois não veem a linha, os dois
  pagam, e o segundo espera o primeiro e estoura.

Nos dois casos o estrago não para no evento: enquanto o estado não muda, **todo** evento seguinte do
aluno reavalia, tenta pagar de novo e aborta. Para a API isso é análise que nunca roda
(`ciclo_iniciado`) e ciclo cujas ações são desfeitas (`ciclo_executado` grava na mesma transação).

## O que muda

O INSERT do prêmio ganha `ON CONFLICT DO NOTHING`. Prêmio já pago fica como está (o valor de quem já
viu não muda), o evento de fora segue, e `conquistas_aluno` volta a dizer "concluída" na mesma
avaliação, o que tira o aluno do laço.

**Sem alvo de propósito.** `ON CONFLICT (aluno_id, tipo, referencia) WHERE tipo IN (...)` exigiria
repetir o predicado do índice, que é lista literal e já foi refeito duas vezes. O plpgsql só resolve a
inferência ao executar: se o índice de produção um dia não casar com o predicado escrito aqui, o erro
("no unique or exclusion constraint matching") sairia em todo evento de todo aluno, não nesta
migration. Sem alvo não há inferência para errar. A tabela não tem outra unicidade que um prêmio possa
violar (a `id` é identidade), então não se engole nada além do pagamento repetido.

A notificação "Nova conquista desbloqueada!" continua saindo quando o gatilho decide pagar. No caso da
linha apagada, o aluno a recebe de novo uma vez, junto com a conquista que volta a aparecer no perfil.

## Corpo de partida

Troca de texto no corpo vivo (`pg_get_functiondef`), no padrão da `20261117_01`, porque o gatilho já
passou por trocas no banco (`20261101_08`, `20261103_07`, `20261117_01`, `20261117_02`) e reescrevê-lo
apagaria essas trocas. A âncora é o fim do `VALUES` do prêmio, longe do texto da notificação (que a
`20261101_08` trocou só em produção). Ela é conferida na importação contra o texto da cadeia do git, é
idempotente pela marca e recusa âncora ausente ou repetida.

## Downgrade

Tira o `ON CONFLICT` pela troca inversa. Volta ao defeito descrito acima.

Revision ID: 20261120_01
Revises: 20261118_01
Create Date: 2026-11-20
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261120_01"
down_revision = "20261118_01"
branch_labels = None
depends_on = None

MARCA = "20261120_01"


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}_para_20_01", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M1701 = _modulo("20261117_01_premio_de_missao_na_turma.py")

PREMIO_ANTES = (
    "            v_conquista.pontos_recompensa,\n"
    "            now()\n"
    "          );\n"
)
PREMIO_DEPOIS = (
    "            v_conquista.pontos_recompensa,\n"
    "            now()\n"
    "          )\n"
    "          -- Premio ja pago nao aborta o evento que disparou a avaliacao (20261120_01).\n"
    "          ON CONFLICT DO NOTHING;\n"
)
TROCAS_GATILHO = ((PREMIO_ANTES, PREMIO_DEPOIS),)


def _trocas_no_banco(trocas, aplicar: bool) -> str:
    """Igual ao da `20261117_01`, com a marca desta migration."""
    pares = [(a, d) if aplicar else (d, a) for a, d in trocas]
    if not aplicar:
        pares.reverse()
    ja_feito = "> 0" if aplicar else "= 0"
    passos = "".join(
        f"""
  IF (length(v_def) - length(replace(v_def, $a${origem}$a$, ''))) / length($a${origem}$a$) <> 1 THEN
    RAISE EXCEPTION 'ancora {n} ausente ou repetida em trg_eventos_aluno_after_iud';
  END IF;
  v_def := replace(v_def, $a${origem}$a$, $r${destino}$r$);
"""
        for n, (origem, destino) in enumerate(pares, start=1)
    )
    return f"""
DO $migracao$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.trg_eventos_aluno_after_iud()'::regprocedure) INTO v_def;
  IF position($m${MARCA}$m$ IN v_def) {ja_feito} THEN
    RETURN;
  END IF;
{passos}
  EXECUTE v_def;
END;
$migracao$;
"""


def gatilho(aplicar: bool = True) -> str:
    return _trocas_no_banco(TROCAS_GATILHO, aplicar)


def gatilho_de_eventos_do_git() -> str:
    """O gatilho de eventos pela cadeia do git, já com as trocas da `20261117_01`."""
    texto = M1701.gatilho_de_eventos_do_git()
    for antes, depois in M1701.TROCAS_GATILHO:
        texto = M1701._trocar(texto, antes, depois)
    return texto


# Calculado na importação: âncora que sumir derruba a migration antes de ela tocar no banco.
for _antes, _ in TROCAS_GATILHO:
    M1701._trocar(gatilho_de_eventos_do_git(), _antes, _antes)


def upgrade() -> None:
    op.execute(gatilho())


def downgrade() -> None:
    op.execute(gatilho(aplicar=False))
