"""Duelo contra adversário sai do XP: recusar batalha não custa rank, faixa nem nota (#154)

Fase 1 de `docs/superpowers/specs/2026-11-03-inscricao-em-evento-e-rank-do-evento-design.md`,
decisões D1 e D2 de 03/11.

## O que estava errado

A #154 pede que recusar batalha não reduza XP nem posição. Mas o XP é a soma de
`eventos_aluno.valor` sem olhar o tipo, e o duelo escreve ali (`desafio_vencido`, `_empate`,
`_participou`, `_derrota`). Quem batalhava ganhava vantagem em cinco contas: critério `pontuacao` do
rank, apuração do evento, faixas de XP, `nota_final` das turmas com peso e o XP do CSV do professor.

## O que muda

`eventos_aluno.fora_do_xp`, carimbada na escrita, e as cinco contas passam a ignorar a linha. O
duelo continua valendo no critério `ranqueada` (que lê `eventos_aluno` por conta própria), no Elo e
nas moedas.

**Por que uma coluna, e não uma função dentro das somas.** A view do ranking é lida pelo cliente, e
função chamada nela precisa de EXECUTE para ele: foi assim que o ranking deu 42501 em 29/10. Essa
função teria de ser SECURITY DEFINER, porque `guilda_desafios` não tem policy, e rodaria por linha.

**O que é duelo.** Existir equipe 2, a mesma pergunta de `fn_desafio_encerrar` para "não é
cooperativo". O `consequencia` sozinho não serve: o default é `ranqueada`, inclusive no desafio
cooperativo de guilda, que continua no XP. Ele não pede inscrição nem põe um aluno contra outro.

**O piso da aposta passa a olhar o saldo de duelos.** Antes comparava a derrota com o acumulado
inteiro da turma, e quem tinha XP de estudo perdia ponto sem limite. Com a derrota fora do XP, isso
deixaria o critério `ranqueada` negativo. Agora o piso protege exatamente o que a derrota afeta.

`participou` da apuração continua contando duelo, de propósito: a medalha de participação não premia
quem batalha sobre quem estuda, e tirar a linha faria quem só duelou deixar de participar.

## Efeito em dado existente

O backfill marca os duelos já gravados, e rank, faixa e CSV mudam na hora, porque são calculados na
leitura. `nota_final` é gravada: é recalculada aqui, e **pode descer** em turma com peso ligado.
Evento já encerrado não muda: `eventos_classe_resultado` é o que foi apurado.

O UPDATE do backfill não refaz o valor: `trg_eventos_aluno_valor_upd` só dispara em `UPDATE OF valor,
tipo`.

## Downgrade

Volta as cinco contas e o piso, tira gatilho, função e coluna e recalcula as notas.

Revision ID: 20261103_15
Revises: 20261103_14
Create Date: 2026-11-03
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261103_15"
down_revision = "20261103_14"
branch_labels = None
depends_on = None


def _load(nome: str):
    path = Path(__file__).with_name(nome)
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _troca(texto: str, antigo: str, novo: str, onde: str, vezes: int = 1) -> str:
    if texto.count(antigo) != vezes:
        raise RuntimeError(f"{onde}: esperava {vezes} ocorrência(s), achei {texto.count(antigo)}")
    return texto.replace(antigo, novo)


COLUNA = r"""
ALTER TABLE public.eventos_aluno
  ADD COLUMN IF NOT EXISTS fora_do_xp boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.eventos_aluno.fora_do_xp IS
  'Duelo contra adversário: vale no rank ranqueada, não no XP. Só o gatilho escreve.';
"""

MARCA = r"""
CREATE OR REPLACE FUNCTION public.fn_evento_e_duelo(p_tipo text, p_referencia text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
  -- Texto, e não cast para uuid: o recorte por regexp pode não formar um uuid válido.
  SELECT starts_with(COALESCE(p_tipo, ''), 'desafio_') AND EXISTS (
    SELECT 1 FROM public.desafio_participantes dp
     WHERE dp.equipe = 2
       AND dp.desafio_id::text = lower(substring(btrim(COALESCE(p_referencia, '')) from 'desafio:([0-9a-fA-F-]{36})$'))
  );
$fn$;

CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_fora_do_xp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  -- O valor de quem escreve nunca sobrevive: o cliente tem INSERT nesta tabela.
  NEW.fora_do_xp := public.fn_evento_e_duelo(NEW.tipo, NEW.referencia);
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_evento_e_duelo(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_eventos_aluno_fora_do_xp() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_evento_e_duelo(text, text) TO service_role;

DROP TRIGGER IF EXISTS trg_eventos_aluno_fora_do_xp ON public.eventos_aluno;
CREATE TRIGGER trg_eventos_aluno_fora_do_xp
  BEFORE INSERT OR UPDATE OF tipo, referencia, fora_do_xp ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trg_eventos_aluno_fora_do_xp();
"""

MARCA_O_QUE_JA_EXISTE = r"""
UPDATE public.eventos_aluno e
   SET fora_do_xp = true
 WHERE starts_with(e.tipo, 'desafio_')
   AND public.fn_evento_e_duelo(e.tipo, e.referencia);
"""

RECALCULA_NOTAS = r"""
SELECT public.fn_recalcular_nota_final(d.aluno_id, d.classe_id)
  FROM (
    SELECT DISTINCT e.aluno_id,
           COALESCE(e.classe_id, public.fn_eventos_aluno_resolve_classe_id(e.tipo, e.referencia)) AS classe_id
      FROM public.eventos_aluno e
     WHERE starts_with(e.tipo, 'desafio_')
  ) d;
"""

XP_ANTIGO = r"""
CREATE OR REPLACE FUNCTION public.fn_xp_da_matricula(p_aluno uuid, p_classe bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
  -- A mesma conta do rank, do CSV e de `aluno_faixa_xp`, sem janela de período.
  SELECT GREATEST(COALESCE(sum(ea.valor), 0), 0)
    FROM public.eventos_aluno ea
   WHERE ea.aluno_id = p_aluno
     AND COALESCE(ea.classe_id, public.fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia)) = p_classe
$fn$;
"""

XP_NOVO = _troca(
    XP_ANTIGO,
    "   WHERE ea.aluno_id = p_aluno\n",
    "   WHERE ea.aluno_id = p_aluno\n     AND NOT ea.fora_do_xp\n",
    "fn_xp_da_matricula",
)


def faixa_antiga() -> str:
    return _load("20261102_10_faixas_de_xp.py").FUNCOES


def faixa_nova() -> str:
    return _troca(
        faixa_antiga(),
        "   WHERE ea.aluno_id = v_aluno\n",
        "   WHERE ea.aluno_id = v_aluno\n     AND NOT ea.fora_do_xp\n",
        "aluno_faixa_xp",
    )


def notas_antigas() -> str:
    return _load("20261102_13_peso_do_xp_na_nota.py").NOTAS_DA_TURMA


def notas_novas() -> str:
    return _troca(
        notas_antigas(),
        "     WHERE ea.aluno_id IN (SELECT m.aluno_id FROM matriculas m)\n",
        "     WHERE ea.aluno_id IN (SELECT m.aluno_id FROM matriculas m)\n       AND NOT ea.fora_do_xp\n",
        "professor_notas_da_turma",
    )


def apuracao_antiga() -> str:
    return _load("20261025_03_guilda_mantem_quem_saiu_da_turma.py").apuracao_guilda_mantem_quem_saiu()


def apuracao_nova() -> str:
    sql = _troca(
        apuracao_antiga(),
        "COALESCE(SUM(ea.valor), 0) AS pontos,",
        "COALESCE(SUM(ea.valor) FILTER (WHERE NOT ea.fora_do_xp), 0) AS pontos,",
        "soma do aluno na apuração",
    )
    return _troca(
        sql,
        "SELECT SUM(ea.valor) AS pontos",
        "SELECT SUM(ea.valor) FILTER (WHERE NOT ea.fora_do_xp) AS pontos",
        "soma de quem saiu da turma",
    )


def view_antiga() -> str:
    return _load("20261029_04_ranking_le_config_por_wrapper.py").view_nova()


def view_nova() -> str:
    sql = _troca(
        view_antiga(),
        "            e.criado_em,\n            COALESCE(e.valor, 0::numeric) AS valor,\n",
        "            e.criado_em,\n            e.fora_do_xp,\n            COALESCE(e.valor, 0::numeric) AS valor,\n",
        "referencias_normalizadas",
    )
    sql = _troca(
        sql,
        "            e.criado_em,\n            e.valor\n           FROM referencias_normalizadas e\n",
        "            e.criado_em,\n            e.fora_do_xp,\n            e.valor\n           FROM referencias_normalizadas e\n",
        "eventos_resolvidos",
    )
    return _troca(
        sql,
        "          WHERE e.criado_em >= rj.inicio_utc AND (rj.fim_utc IS NULL OR e.criado_em < rj.fim_utc)\n"
        "          GROUP BY rj.rank_id, e.aluno_id\n"
        "        ), ranqueada_por_rank AS (",
        "          WHERE e.criado_em >= rj.inicio_utc AND (rj.fim_utc IS NULL OR e.criado_em < rj.fim_utc)\n"
        "            AND NOT e.fora_do_xp\n"
        "          GROUP BY rj.rank_id, e.aluno_id\n"
        "        ), ranqueada_por_rank AS (",
        "eventos_por_rank",
    )


def gatilho_antigo() -> str:
    return _load("20261021_06_aposta_e_pontuacao_ranqueada.py").GATILHO


def gatilho_novo() -> str:
    sql = _troca(
        gatilho_antigo(),
        "       WHERE e.aluno_id = NEW.aluno_id\n"
        "         AND e.classe_id = NEW.classe_id\n"
        "         AND e.id <> NEW.id;\n",
        "       WHERE e.aluno_id = NEW.aluno_id\n"
        "         AND e.classe_id = NEW.classe_id\n"
        "         AND e.fora_do_xp\n"
        "         AND e.id <> NEW.id;\n",
        "piso da aposta",
    )
    return _troca(
        sql,
        "  -- PISO -- so' para negativo, contra o acumulado do aluno NAQUELA turma, que e' o que o\n"
        "  -- rank mostra. Sem ele",
        "  -- PISO -- so' para negativo, contra o saldo de DUELOS do aluno naquela turma: e' o que a\n"
        "  -- derrota afeta, desde que o duelo saiu do XP (`20261103_15`). Sem ele",
        "comentário do piso",
    )


DESFAZ = r"""
DROP TRIGGER IF EXISTS trg_eventos_aluno_fora_do_xp ON public.eventos_aluno;
DROP FUNCTION IF EXISTS public.trg_eventos_aluno_fora_do_xp();
DROP FUNCTION IF EXISTS public.fn_evento_e_duelo(text, text);
ALTER TABLE public.eventos_aluno DROP COLUMN IF EXISTS fora_do_xp;
"""


def upgrade() -> None:
    op.execute(COLUNA)
    op.execute(MARCA)
    op.execute(MARCA_O_QUE_JA_EXISTE)
    op.execute(XP_NOVO)
    op.execute(faixa_nova())
    op.execute(notas_novas())
    op.execute(apuracao_nova())
    op.execute(view_nova())
    op.execute(gatilho_novo())
    op.execute(RECALCULA_NOTAS)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(gatilho_antigo())
    op.execute(view_antiga())
    op.execute(apuracao_antiga())
    op.execute(notas_antigas())
    op.execute(faixa_antiga())
    op.execute(XP_ANTIGO)
    op.execute(DESFAZ)
    op.execute(RECALCULA_NOTAS)
    op.execute("NOTIFY pgrst, 'reload schema'")
