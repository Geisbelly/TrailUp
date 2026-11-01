"""Aluno sem nota sai da faixa "baixa", e a notificação de conquista ganha acento

## Distribuição de notas

`vw_metricas_distribuicao_turma_classe` fazia `COALESCE("notaMedia", 0)`: aluno sem nota nenhuma
entrava na faixa `baixa`. Na turma de teste de 01/11, os dois alunos apareciam como "Baixa" na rosca
do console enquanto a média da turma dizia "Sem dados ainda".

Agora a nota segue a regra que o risco já usa (`notaParaRisco` no console e a entrada de nota do
modelo em `vw_metricas_engajamento_aluno_classe`): NULL, ou 0 sem progresso nenhum (o `classe_aluno`
grava 0 antes de qualquer correção), é `sem_dado`. É o mesmo rótulo que a faixa de `tempo_ativo` já
usa. As colunas da view não mudam, então o `CREATE OR REPLACE` mantém os GRANTs. As outras faixas
(`tempo_uso`, `tempo_ativo`, `progresso`) ficam como estão.

## Acento

O gatilho `trg_eventos_aluno_after_iud` grava a notificação "Parabens! Voce desbloqueou a conquista".
Só essa frase muda: o texto atual da função é lido do catálogo e reescrito com `replace`, para não
recolar à mão um gatilho de ~10 mil caracteres. As migrations antigas que definem o gatilho
(`20260909_01`, `20261021_03`, `20261021_04`) continuam com a frase sem acento; quem recriar o
gatilho a partir delas precisa trazer esta correção junto. Notificações já entregues não mudam.

Revision ID: 20261101_08
Revises: 20261101_07
Create Date: 2026-11-01
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261101_08"
down_revision = "20261101_07"
branch_labels = None
depends_on = None

SEM_ACENTO = "Parabens! Voce desbloqueou"
COM_ACENTO = "Parabéns! Você desbloqueou"


def _anterior() -> str:
    caminho = Path(__file__).with_name("20261101_01_colunas_antigas_e_modelo_so_com_evento.py")
    spec = importlib.util.spec_from_file_location("colunas_antigas_20261101_01", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo.DISTRIBUICAO.replace("CREATE VIEW", "CREATE OR REPLACE VIEW", 1)


def _trocar(texto: str, de: str, para: str) -> str:
    assert texto.count(de) == 1, f"trecho esperado uma vez: {de!r}"
    return texto.replace(de, para)


def _distribuicao() -> str:
    sql = _anterior()
    sql = _trocar(sql, 'COALESCE(ca."notaMedia", 0::numeric) AS nota_media', 'ca."notaMedia" AS nota_media')
    return _trocar(
        sql,
        "CASE WHEN base.nota_media < 5::numeric THEN 'baixa'::text",
        "-- Sem nota não é nota baixa: NULL, ou 0 sem progresso (default do classe_aluno), é sem_dado.\n"
        "         CASE WHEN base.nota_media IS NULL\n"
        "                OR (base.nota_media = 0::numeric AND base.progresso_pct = 0::numeric) THEN 'sem_dado'::text\n"
        "              WHEN base.nota_media < 5::numeric THEN 'baixa'::text",
    )


DISTRIBUICAO = _distribuicao()


def _acento(de: str, para: str) -> str:
    # `replace` sobre o texto vivo; sem o trecho (já trocado, ou banco sem o gatilho) não faz nada.
    return f"""
DO $acento$
DECLARE
  v_fn regprocedure := to_regprocedure('public.trg_eventos_aluno_after_iud()');
  v_def text;
BEGIN
  IF v_fn IS NULL THEN RETURN; END IF;
  v_def := pg_get_functiondef(v_fn);
  IF strpos(v_def, '{de}') = 0 THEN RETURN; END IF;
  EXECUTE replace(v_def, '{de}', '{para}');
END
$acento$;
"""


def upgrade() -> None:
    op.execute(DISTRIBUICAO)
    op.execute(_acento(SEM_ACENTO, COM_ACENTO))
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(_anterior())
    op.execute(_acento(COM_ACENTO, SEM_ACENTO))
    op.execute("NOTIFY pgrst, 'reload schema'")
