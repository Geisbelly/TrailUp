"""Textos que o avaliador lê na turma de demonstração

Conferida logada como avaliadora em produção (24/11), a turma de exemplo mostrava três textos que só
fazem sentido para quem escreveu o código:

- **Título dos desafios de exemplo.** `missao_desafio_criar` monta o título com o nome do conteúdo
  (`Desafio de lógica: <conteúdo>`), e a semeadura usa o primeiro conteúdo da trilha. Na turma-modelo ele
  é "O que é um algoritmo", e as perguntas são sobre laço. A semeadura passa a dar o título pelo assunto
  do desafio, depois de gravar. O título continua editável pelo professor (`fn_missoes_guarda` só congela
  desafio, critério, escopo e turma), então o UPDATE não precisa do sinal `app.desafio_gravando`.
- **Nomes dos eventos na Economia.** A aba lê `eventos_pontuacao.descricao`, e as linhas semeadas em
  `20260909_05`, `20261021_02` e `20261101_13` estavam sem acento ou com nota interna ("Valor definido na
  fase 4", "(cumulativo, #136)"). Aqui elas viram o que o professor precisa ler. A descrição não entra
  em conta nenhuma: muda só o texto da tela.
- O rótulo do critério da meta e os avisos com "fase 5b" e "aluno de teste entra junto" são do console,
  e mudam no mesmo PR.

Backfill: os desafios de exemplo já gravados nas turmas dos avaliadores trocam de título. Eles são
reconhecidos pelo texto do próprio desafio, que só a semeadura escreve. Cada turma vai na própria
subtransação, e um erro vira `WARNING`. A API aplica esta migration ao subir, e um erro solto aqui a
derrubaria.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261124_03"
down_revision = "20261124_02"
branch_labels = None
depends_on = None


def _modulo(arquivo: str):
    caminho = Path(__file__).resolve().parent / arquivo
    spec = importlib.util.spec_from_file_location(f"m_{arquivo[:11]}", caminho)
    assert spec and spec.loader
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M02 = _modulo("20261124_02_pesquisa_exemplos_gravam_de_verdade.py")

TITULO_LOGICA = "Desafio de lógica: laços de repetição"
TITULO_CRUZADINHA = "Cruzadinha: termos de programação"

# Trechos que só os desafios da semeadura têm (enunciado da lógica e uma pista da cruzadinha).
MARCA_LOGICA = "Quantas vezes o bloco roda em"
MARCA_CRUZADINHA = "Reservar memória para uma variável"

_RENOMEAR = f"""
  UPDATE public.missoes m
     SET titulo = CASE m.recompensa_tipo
                    WHEN 'desafio_logica' THEN '{TITULO_LOGICA}'
                    ELSE '{TITULO_CRUZADINHA}'
                  END
   WHERE m.classe_id = {{classe}}
     AND m.desafio IS NOT NULL
     AND ((m.recompensa_tipo = 'desafio_logica' AND m.desafio::text LIKE '%{MARCA_LOGICA}%')
       OR (m.recompensa_tipo = 'desafio_cruzadinha' AND m.desafio::text LIKE '%{MARCA_CRUZADINHA}%'));
"""

_FEITO = "      v_feitos := array_append(v_feitos, 'desafios');"


def _com_titulos(sql: str) -> str:
    assert sql.count(_FEITO) == 1
    return sql.replace(
        _FEITO,
        "      -- O título sai do assunto do desafio, não do nome do conteúdo (20261124_03)."
        + _RENOMEAR.format(classe="p_classe_id").rstrip()
        + "\n"
        + _FEITO,
    )


SEMEAR = _com_titulos(M02.SEMEAR)

BACKFILL = f"""
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT pa.classe_id FROM public.pesquisa_avaliador pa WHERE pa.classe_id IS NOT NULL
  LOOP
    BEGIN
{_RENOMEAR.format(classe="r.classe_id").rstrip()}
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Títulos dos desafios da turma % não mudaram: %', r.classe_id, SQLERRM;
    END;
  END LOOP;
END;
$do$;
"""

# tipo -> (texto de antes, texto de agora). O downgrade devolve o de antes.
DESCRICOES: dict[str, tuple[str, str]] = {
    "conteudo_concluido": ("Concluiu um conteudo", "Concluiu um conteúdo"),
    "atividade_acertada": ("Acertou uma questao", "Acertou uma questão"),
    "atividade_errada": ("Errou uma questao", "Errou uma questão"),
    "topico_aberto": ("Abriu um topico", "Abriu um tópico"),
    "topico_iniciado": ("Comecou um topico", "Começou um tópico"),
    "topico_pular_conteudo": ("Pulou um conteudo", "Pulou um conteúdo"),
    "conteudo_aberto": ("Abriu um conteudo", "Abriu um conteúdo"),
    "atividade_iniciada": ("Comecou uma atividade", "Começou uma atividade"),
    "ciclo_iniciado": ("Ciclo de personalizacao iniciado", "Ciclo de personalização iniciado"),
    "ciclo_executado": ("Ciclo de personalizacao executado", "Ciclo de personalização executado"),
    "missao_concluida": ("Concluiu uma missao. Valor definido na fase 4.", "Concluiu uma missão."),
    **{
        f"atividade_no_tempo_{minimo}": (
            f"Atividade cronometrada dentro do tempo com {minimo}% ou mais de acerto (cumulativo, #136)",
            f"Terminou a atividade cronometrada no tempo, com {minimo}% ou mais de acerto. Soma com as faixas menores.",
        )
        for minimo in (70, 80, 90)
    },
}


def _atualizar(indice: int) -> str:
    linhas = ",\n".join(
        "  ('{}', '{}', '{}')".format(tipo, *(t.replace("'", "''") for t in textos))
        if indice == 1
        else "  ('{}', '{}', '{}')".format(tipo, *(t.replace("'", "''") for t in reversed(textos)))
        for tipo, textos in DESCRICOES.items()
    )
    # Só troca o que ainda tem o texto esperado: descrição que alguém já reescreveu fica como está.
    return f"""
UPDATE public.eventos_pontuacao e
   SET descricao = v.novo
  FROM (VALUES
{linhas}
  ) AS v(tipo, antigo, novo)
 WHERE e.tipo = v.tipo AND e.descricao = v.antigo;
"""


def upgrade() -> None:
    op.execute(SEMEAR)
    op.execute(BACKFILL)
    op.execute(_atualizar(1))


def downgrade() -> None:
    op.execute(_atualizar(0))
    op.execute(M02.SEMEAR)
