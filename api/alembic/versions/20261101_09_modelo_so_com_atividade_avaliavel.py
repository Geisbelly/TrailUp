"""O modelo de evasão só julga o aluno que tem atividade avaliável ao alcance (F5)

## Por quê

Na conferência de 01/11, o Aluno Demo concluiu 100% da turma de teste em 5 minutos e saiu
"Crítico — risco alto de abandono". Em produção, 3 dos 4 alunos com dado estavam em `alto`. Medido
na função do core: sem nota e sem entrega vencida, o aluno não tem os dois sinais que mais baixam o
risco (nota 80 leva o mesmo aluno de `alto` a `normal`; taxa de entrega é o preditor mais forte
depois dos cliques). Numa turma que não tem nada para avaliar, essa ausência não diz nada sobre o
aluno, e o modelo o julgava pela metade dos sinais.

Decisão de 01/11 (Geisbelly): **considerar o que a turma tem antes de julgar se o aluno tirou nota.**

- Sem atividade avaliável ao alcance, o modelo não decide: vale a regra de inatividade (30 dias =
  `alto`, 7 = `atencao`, senão `normal`), com `risco_abandono_origem = 'inatividade'`.
- Atividade avaliável = tem questões ou pontuação máxima (a entrega que o professor corrige por
  `avaliar_entrega` não tem questões).
- Ao alcance = num tópico que o aluno já começou (`topico_aluno` fora de `não iniciado`, ou com
  percentual) ou com prazo efetivo vencido. Atividade lá na frente da trilha ainda não é falta.
- Aluno que já tem nota (a mesma regra de "tem nota" da entrada do modelo) tem evidência, sempre.

A regra da `20261101_02` continua: semana sem evento e sem nada pendente também vai para a
inatividade.

## Como

`CREATE OR REPLACE` só da `vw_metricas_engajamento_aluno_classe`, a partir do texto da `_02`: entra o
CTE `avaliavel` e a condição dele nos dois `CASE` (faixa e origem). Nenhuma coluna muda, então as
views de turma e os GRANTs ficam como estão. O modelo do core não é alterado.

Revision ID: 20261101_09
Revises: 20261101_08
Create Date: 2026-11-01
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261101_09"
down_revision = "20261101_08"
branch_labels = None
depends_on = None


def _anterior() -> str:
    caminho = Path(__file__).with_name("20261101_02_modelo_roda_com_pendencia.py")
    spec = importlib.util.spec_from_file_location("modelo_roda_com_pendencia_20261101_02", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo.ENGAJAMENTO


AVALIAVEL = """         ) AS tem_pendencia
    FROM matriculas m
), avaliavel AS (
  -- O aluno tem como ser avaliado (decisão de 01/11): atividade com questões ou pontuação máxima,
  -- num tópico que ele já começou ou com prazo vencido; ou ele já tem nota. Sem isso, o modelo não
  -- tem nota nem entrega para pesar e não decide: vale a inatividade.
  SELECT m.aluno_id, m.classe_id,
         (
           NOT (m.nota_media IS NULL OR (m.nota_media = 0 AND COALESCE(m.progresso_pct, 0) = 0))
           OR EXISTS (
             SELECT 1 FROM public.topicos t
               JOIN public.atividades atv ON atv.topico_id = t.id
              WHERE t.classe_id = m.classe_id
                AND (COALESCE(atv.pontuacao_maxima, 0) > 0
                     OR EXISTS (SELECT 1 FROM public.questoes q WHERE q.atividade_id = atv.id))
                AND (EXISTS (
                       SELECT 1 FROM public.topico_aluno ta
                        WHERE ta.topico_id = t.id AND ta.aluno_id = m.aluno_id
                          AND (ta.status::text <> 'não iniciado' OR COALESCE(ta.percentual_concluido, 0) > 0))
                     OR public.fn_prazo_efetivo(m.aluno_id, atv.id) < now()))
         ) AS tem_avaliavel
    FROM matriculas m
)
SELECT m.aluno_id,"""

SEM_MODELO_ANTES = "WHEN COALESCE(cl.semana, 0) = 0 AND NOT COALESCE(pe.tem_pendencia, false) THEN"
SEM_MODELO = (
    "WHEN NOT COALESCE(av.tem_avaliavel, false)\n"
    "              OR (COALESCE(cl.semana, 0) = 0 AND NOT COALESCE(pe.tem_pendencia, false)) THEN"
)


def _trocar(texto: str, de: str, para: str, vezes: int = 1) -> str:
    assert texto.count(de) == vezes, f"trecho esperado {vezes}x: {de[:60]!r}"
    return texto.replace(de, para)


def _engajamento() -> str:
    sql = _anterior()
    sql = _trocar(sql, "         ) AS tem_pendencia\n    FROM matriculas m\n)\nSELECT m.aluno_id,", AVALIAVEL)
    sql = _trocar(
        sql,
        "         -- Semana sem evento E sem nada pendente: a faixa vem da inatividade (30 dias = alto, 7 = atenção).\n",
        "         -- Sem atividade avaliável ao alcance (20261101_09), ou semana sem evento E sem nada pendente\n"
        "         -- (20261101_02): a faixa vem da inatividade (30 dias = alto, 7 = atenção).\n",
    )
    sql = _trocar(sql, SEM_MODELO_ANTES, SEM_MODELO, vezes=2)
    return _trocar(
        sql,
        "  LEFT JOIN pendencias pe ON pe.aluno_id = m.aluno_id AND pe.classe_id = m.classe_id;",
        "  LEFT JOIN pendencias pe ON pe.aluno_id = m.aluno_id AND pe.classe_id = m.classe_id\n"
        "  LEFT JOIN avaliavel av ON av.aluno_id = m.aluno_id AND av.classe_id = m.classe_id;",
    )


ENGAJAMENTO = _engajamento()


def upgrade() -> None:
    op.execute(ENGAJAMENTO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(_anterior())
    op.execute("NOTIFY pgrst, 'reload schema'")
